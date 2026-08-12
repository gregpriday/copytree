/**
 * The canonical `copytree-md@1` serializer.
 *
 * YAML front matter, a directory tree, an optional instructions block, then one
 * delimited section per file. The begin/end markers are a compatibility
 * surface: agents are prompted against them, so they are versioned with the
 * format.
 */

import path from 'path';
import {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
} from '../utils/markdown.js';
import { hashFile, hashContent } from '../utils/fileHash.js';
import { sanitizeForComment } from '../utils/helpers.js';
import { OUTPUT_FORMAT_VERSIONS } from '../utils/outputVersion.js';
import {
  binaryPolicyFor,
  buildTreeStructure,
  calculateTotalSize,
  contentFor,
  modifiedTimestamp,
  renderBinaryComment,
  renderTree,
  rendersAsComment,
} from './document.js';

/**
 * How many files are hashed at once.
 *
 * Unbounded would issue one open per file in the selection simultaneously and
 * walk straight into the descriptor limit on a large export. Kept deliberately
 * modest: hashing concurrently is what made this fast, but each in-flight read
 * holds a buffer, and allocating them faster than the collector reclaims them
 * raises peak memory for a library that has to sit inside someone else's
 * Electron process.
 */
const HASH_CONCURRENCY = 8;

/**
 * Compute the `sha256` attribute for every file, concurrently.
 *
 * Hashes the content actually being emitted, falling back to reading the file
 * only when there is no content in hand — `--only-tree`, or a file the loader
 * skipped. Hashing the file on disk instead would publish a redacted body
 * beside the digest of its unredacted original, which both fails to describe
 * the document it is attached to and lets a reader confirm a guess at the very
 * bytes redaction removed.
 *
 * @param {Object[]} files - Files to hash
 * @returns {Promise<Map<Object, string>>} File entry -> hex digest
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
        // A file we cannot hash simply carries no digest.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(HASH_CONCURRENCY, files.length) }, () => worker()),
  );

  return hashes;
}

/**
 * Serialize a document as Markdown.
 *
 * The document is emitted line by line, with the separator written *before*
 * each line rather than after. That is exactly `lines.join('\n')` — the shape
 * the buffered formatter produced — expressed as a stream: no trailing newline
 * is invented at the end of a section, and blank lines between blocks stay
 * where they were. Emitting `line + '\n'` instead would append one newline per
 * section and quietly change every Markdown export.
 *
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;
  const instructionsIncluded = Boolean(doc.instructions);
  const instructionsName = doc.instructionsName || null;

  let started = false;
  /**
   * Emit lines as `join('\n')` would.
   * @param {...string} lines - Lines to emit
   * @yields {string} One chunk per line
   */
  function* emit(...lines) {
    for (const line of lines) {
      yield started ? `\n${line}` : line;
      started = true;
    }
  }

  const front = ['---', `format: ${OUTPUT_FORMAT_VERSIONS.markdown}`, 'tool: copytree'];
  // Omitted under `--reproducible`: the one field guaranteed to differ between
  // two runs over an identical tree.
  if (!options.reproducible) {
    front.push(`generated: ${escapeYamlScalar(new Date().toISOString())}`);
  }
  front.push(
    `base_path: ${escapeYamlScalar(doc.basePath)}`,
    `profile: ${escapeYamlScalar(doc.profile?.name || 'default')}`,
    `file_count: ${files.length}`,
    `total_size_bytes: ${calculateTotalSize(files)}`,
    `char_limit_applied: ${options.charLimitApplied ? 'true' : 'false'}`,
    `only_tree: ${options.onlyTree ? 'true' : 'false'}`,
    `include_git_status: ${options.withGitStatus ? 'true' : 'false'}`,
    `include_line_numbers: ${options.addLineNumbers ? 'true' : 'false'}`,
    'instructions:',
    `  name: ${instructionsName ? escapeYamlScalar(instructionsName) : 'null'}`,
    `  included: ${instructionsIncluded ? 'true' : 'false'}`,
    '---',
    '',
  );
  yield* emit(...front);

  yield* emit(`# CopyTree Export — ${path.basename(doc.basePath)}`, '');

  // The Markdown tree carries per-file sizes. The tree embedded in XML and JSON
  // metadata does not — it is a structural index there, not the payload.
  const treeLines = renderTree(buildTreeStructure(files), [], '', true, options.treeConnectors);
  yield* emit('## Directory Tree', '```text', treeLines.join('\n'), '```', '');

  if (instructionsIncluded) {
    const name = escapeYamlScalar(instructionsName || 'default');
    const fence = chooseFence(doc.instructions);
    yield* emit(
      '## Instructions',
      '',
      `<!-- copytree:instructions-begin name=${name} -->`,
      `${fence}text`,
      String(doc.instructions),
      fence,
      '',
      `<!-- copytree:instructions-end name=${name} -->`,
      '',
    );
  }

  if (options.onlyTree) return;

  yield* emit('## Files', '');

  // Hashing re-reads any file with no content in hand, so it is skipped
  // entirely when the caller has asked for no optional metadata: the digest is
  // the metadata.
  const hashes = options.includeMetadata ? await hashAll(files) : new Map();

  for (const file of files) {
    const relPath = `@${file.path}`;

    if (rendersAsComment(file, options)) {
      yield* emit(
        renderBinaryComment(file, options.binaryCommentTemplates.markdown, sanitizeForComment),
        '',
      );
      continue;
    }

    const policy = binaryPolicyFor(file, options);
    const isBase64 = options.binaryFileAction === 'base64' || file.encoding === 'base64';

    let binaryMode;
    if (file.isBinary) {
      if (isBase64) binaryMode = 'base64';
      else if (options.binaryFileAction === 'placeholder') binaryMode = 'placeholder';
      else if (options.binaryFileAction === 'skip') binaryMode = 'skip';
      else if (options.binaryFileAction === 'comment' || policy === 'comment') {
        binaryMode = 'comment';
      }
    }

    const digest = hashes.get(file);
    const attrs = {
      path: relPath,
      size: file.size ?? 0,
      modified: modifiedTimestamp(file, options) || undefined,
      hash: digest ? `sha256:${digest}` : undefined,
      git: options.withGitStatus && file.gitStatus ? file.gitStatus : undefined,
      binary: Boolean(file.isBinary),
      encoding: file.encoding || undefined,
      binaryMode,
      binaryCategory: options.includeMetadata ? file.binaryCategory || undefined : undefined,
      truncated: Boolean(file.truncated),
      truncatedAt: file.truncated ? (file.content?.length ?? 0) : undefined,
    };

    yield* emit(formatBeginMarker(attrs), '', `### ${relPath}`, '');

    const rawContent = typeof file.content === 'string' ? file.content : '';
    const fence = chooseFence(rawContent);
    const lang = file.isBinary ? 'text' : detectFenceLanguage(file.path);
    yield* emit(`${fence}${lang || ''}`.trim());

    if (file.isBinary) {
      if (isBase64) {
        yield* emit('Content-Transfer: base64', rawContent);
      } else if (options.binaryFileAction === 'placeholder') {
        yield* emit(rawContent || options.binaryPlaceholderText || '');
      }
      // `skip` emits an empty block.
    } else {
      yield* emit(contentFor(file, options));
    }

    yield* emit(fence);

    if (file.truncated) {
      const remaining =
        typeof file.originalLength === 'number'
          ? Math.max(0, file.originalLength - (file.content?.length || 0))
          : undefined;
      const remainingAttr = remaining !== undefined ? ` remaining="${remaining}"` : '';
      yield* emit('', `<!-- copytree:truncated reason="char-limit"${remainingAttr} -->`);
    }

    yield* emit('', formatEndMarker(relPath), '');
  }
}

export default chunks;
