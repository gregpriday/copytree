import path from 'path';
import {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
} from '../../utils/markdown.js';
import { hashFile, hashContent } from '../../utils/fileHash.js';
import { sanitizeForComment } from '../../utils/helpers.js';
import { OUTPUT_FORMAT_VERSIONS } from '../../utils/outputVersion.js';

/**
 * How many files are hashed at once.
 *
 * Unbounded would issue one open per file in the selection simultaneously and
 * walk straight into the descriptor limit on a large export. Kept deliberately
 * modest: hashing concurrently is what made this fast, but each in-flight read
 * holds a buffer, and allocating them faster than the collector reclaims them
 * raises peak memory for a library that has to sit inside someone else's
 * Electron process. Past about this width the wall-clock gain flattens while
 * the memory cost keeps climbing.
 */
const HASH_CONCURRENCY = 8;

/**
 * Compute the `sha256` attribute for every file, concurrently.
 *
 * Hashes the content that is actually being emitted, and only falls back to
 * reading the file when there is no content in hand — `--only-tree`, or a file
 * the loader skipped.
 *
 * It used to be the other way round, which was both slower and wrong. Slower,
 * because every selected file had already been read into memory by
 * `FileLoadingStage` and this opened and read the whole selection a second time
 * purely to hash it. Wrong, because by this point the content in memory is no
 * longer necessarily the content on disk: `SecretsGuardStage` has redacted it
 * and transformers have rewritten it. So a redacted file was published
 * alongside the digest of its *unredacted* original — a hash that does not
 * describe the document it is attached to, and one that lets a reader confirm a
 * guess at the very bytes redaction removed.
 *
 * @param {Object[]} files - Files to hash
 * @returns {Promise<Map<Object, string|null>>} File entry -> hex digest
 */
async function hashAll(files) {
  const hashes = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        if (file.content != null) {
          hashes.set(file, hashContent(file.content, 'sha256'));
        } else if (file.absolutePath) {
          hashes.set(file, await hashFile(file.absolutePath, 'sha256', { size: file.size }));
        }
      } catch {
        // Ignore hash computation errors, exactly as the per-file path did.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(HASH_CONCURRENCY, files.length) }, () => worker()),
  );

  return hashes;
}

class MarkdownFormatter {
  constructor({ stage, addLineNumbers = false, onlyTree = false } = {}) {
    this.stage = stage; // Delegates helper methods and config
    this.addLineNumbers = addLineNumbers;
    this.onlyTree = onlyTree;
  }

  async format(input) {
    const lines = [];
    const files = (input.files || []).filter((f) => f !== null);
    const fileCount = files.length;
    const totalSize = this.stage.calculateTotalSize(files);
    const profileName = input.profile?.name || 'default';
    const includeGitStatus = !!input.options?.withGitStatus;
    const includeLineNumbers = !!(this.addLineNumbers || input.options?.withLineNumbers);
    const onlyTree = !!(this.onlyTree || input.options?.onlyTree);
    const charLimitApplied = !!(
      input.options?.charLimit ||
      input.stats?.truncatedFiles > 0 ||
      files.some((f) => f?.truncated)
    );

    // YAML front matter
    lines.push('---');
    lines.push(`format: ${OUTPUT_FORMAT_VERSIONS.markdown}`);
    lines.push('tool: copytree');
    lines.push(`generated: ${escapeYamlScalar(new Date().toISOString())}`);
    lines.push(`base_path: ${escapeYamlScalar(input.basePath)}`);
    lines.push(`profile: ${escapeYamlScalar(profileName)}`);
    lines.push(`file_count: ${fileCount}`);
    lines.push(`total_size_bytes: ${totalSize}`);
    lines.push(`char_limit_applied: ${charLimitApplied ? 'true' : 'false'}`);
    lines.push(`only_tree: ${onlyTree ? 'true' : 'false'}`);
    lines.push(`include_git_status: ${includeGitStatus ? 'true' : 'false'}`);
    lines.push(`include_line_numbers: ${includeLineNumbers ? 'true' : 'false'}`);
    const instrIncluded = !!(input.instructions && !input.options?.noInstructions);
    const instrName = input.instructionsName || null;
    lines.push('instructions:');
    lines.push(`  name: ${instrName ? escapeYamlScalar(instrName) : 'null'}`);
    lines.push(`  included: ${instrIncluded ? 'true' : 'false'}`);
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# CopyTree Export — ${path.basename(input.basePath)}`);
    lines.push('');

    // Directory Tree
    lines.push('## Directory Tree');
    const treeLines = [];
    const tree = this.stage.buildTreeStructure(files);
    this.stage.renderTree(tree, treeLines, '', true);
    const treeFence = '```';
    lines.push('```text');
    lines.push(treeLines.join('\n'));
    lines.push(treeFence);
    lines.push('');

    // Instructions (if available)
    if (instrIncluded) {
      lines.push('## Instructions');
      lines.push('');
      lines.push(
        `<!-- copytree:instructions-begin name=${escapeYamlScalar(instrName || 'default')} -->`,
      );
      const instrFence = chooseFence(input.instructions || '');
      lines.push(`${instrFence}text`);
      lines.push(input.instructions.toString());
      lines.push(instrFence);
      lines.push('');
      lines.push(
        `<!-- copytree:instructions-end name=${escapeYamlScalar(instrName || 'default')} -->`,
      );
      lines.push('');
    }

    // Files section (omit when onlyTree)
    if (!onlyTree) {
      lines.push('## Files');
      lines.push('');

      // Resolved once rather than per file: these answers do not vary across the
      // selection, and `config.get` walks a dotted path on every call.
      const binaryAction = this.stage.config.get('copytree.binaryFileAction', 'placeholder');
      const binaryPolicies = this.stage.config.get('copytree.binaryPolicy', {}) || {};
      const commentTemplate = this.stage.config.get(
        'copytree.binaryCommentTemplates.markdown',
        '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
      );
      const placeholderText = this.stage.config.get(
        'copytree.binaryPlaceholderText',
        '[Binary file not included]',
      );

      // Every file's hash was computed inside the loop, each awaited before the
      // next began, and each opening its own read stream. That serialized one
      // full re-read of the entire selection from disk, in a formatter whose
      // input is already in memory. Hashing every file concurrently up front
      // produces the same digests without the serialization.
      const hashes = await hashAll(files);

      for (const file of files) {
        const relPath = `@${file.path}`;
        const policy = binaryPolicies[file.binaryCategory] || binaryAction;

        // Check if file should be rendered as a comment
        if (file.excluded || (file.isBinary && policy === 'comment')) {
          const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
          const msg = commentTemplate
            .replace('{TYPE}', sanitizeForComment(categoryName))
            .replace('{PATH}', sanitizeForComment(relPath))
            .replace('{SIZE}', this.stage.formatBytes(file.size || 0));
          lines.push(msg);
          lines.push('');
          continue;
        }

        const modifiedISO = file.modified
          ? file.modified instanceof Date
            ? file.modified.toISOString()
            : new Date(file.modified).toISOString()
          : null;
        const sha = hashes.get(file) ?? null;
        let binaryMode = undefined;
        if (file.isBinary) {
          if (binaryAction === 'base64' || file.encoding === 'base64') binaryMode = 'base64';
          else if (binaryAction === 'placeholder') binaryMode = 'placeholder';
          else if (binaryAction === 'skip') binaryMode = 'skip';
          else if (binaryAction === 'comment' || policy === 'comment') binaryMode = 'comment';
        }
        const attrs = {
          path: relPath,
          size: file.size ?? 0,
          modified: modifiedISO || undefined,
          hash: sha ? `sha256:${sha}` : undefined,
          git: includeGitStatus && file.gitStatus ? file.gitStatus : undefined,
          binary: file.isBinary ? true : false,
          encoding: file.encoding || undefined,
          binaryMode,
          binaryCategory: file.binaryCategory || undefined,
          truncated: file.truncated ? true : false,
          truncatedAt: file.truncated ? (file.content?.length ?? 0) : undefined,
        };
        lines.push(formatBeginMarker(attrs));
        lines.push('');
        lines.push(`### ${relPath}`);
        lines.push('');

        // Code fence
        const lang = file.isBinary
          ? binaryAction === 'base64' || file.encoding === 'base64'
            ? 'text'
            : 'text'
          : detectFenceLanguage(file.path);
        const content = file.content || '';
        const fence = chooseFence(typeof content === 'string' ? content : '');
        lines.push(`${fence}${lang ? lang : ''}`.trim());

        if (file.isBinary) {
          if (binaryAction === 'base64' || file.encoding === 'base64') {
            lines.push('Content-Transfer: base64');
            lines.push(typeof content === 'string' ? content : '');
          } else if (binaryAction === 'placeholder') {
            lines.push(typeof content === 'string' ? content : placeholderText || '');
          } else {
            // skip mode: emit empty block
          }
        } else {
          const text = this.addLineNumbers ? this.stage.addLineNumbersToContent(content) : content;
          lines.push(text);
        }
        lines.push(fence);

        // Truncation marker (per-file)
        if (file.truncated) {
          const remaining =
            typeof file.originalLength === 'number'
              ? Math.max(0, file.originalLength - (file.content?.length || 0))
              : undefined;
          const remAttr = remaining !== undefined ? ` remaining="${remaining}"` : '';
          lines.push('');
          lines.push(`<!-- copytree:truncated reason="char-limit"${remAttr} -->`);
        }

        lines.push('');
        lines.push(formatEndMarker(relPath));
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

export default MarkdownFormatter;
