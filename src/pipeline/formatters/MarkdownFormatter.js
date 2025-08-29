import path from 'path';
import {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
} from '../../utils/markdown.js';
import { hashFile, hashContent } from '../../utils/fileHash.js';

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
    lines.push('format: copytree-md@1');
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

      for (const file of files) {
        const relPath = `@${file.path}`;
        const modifiedISO = file.modified
          ? file.modified instanceof Date
            ? file.modified.toISOString()
            : new Date(file.modified).toISOString()
          : null;
        // Prefer hashing absolute file if available; fall back to content hash
        let sha = null;
        try {
          if (file.absolutePath) {
            sha = await hashFile(file.absolutePath, 'sha256');
          } else if (typeof file.content === 'string') {
            sha = hashContent(file.content, 'sha256');
          }
        } catch (_e) {
          // Silently ignore hash errors
        }
        const binaryAction = this.stage.config.get('copytree.binaryFileAction', 'placeholder');
        let binaryMode = undefined;
        if (file.isBinary) {
          if (binaryAction === 'base64' || file.encoding === 'base64') binaryMode = 'base64';
          else if (binaryAction === 'placeholder') binaryMode = 'placeholder';
          else if (binaryAction === 'skip') binaryMode = 'skip';
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
            lines.push(
              typeof content === 'string'
                ? content
                : this.stage.config.get(
                  'copytree.binaryPlaceholderText',
                  '[Binary file not included]',
                ) || '',
            );
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
