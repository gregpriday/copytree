import { sanitizeForComment, sanitizeForXml } from '../../utils/helpers.js';

class XMLFormatter {
  constructor({ stage, addLineNumbers = false, onlyTree = false } = {}) {
    this.stage = stage;
    this.addLineNumbers = addLineNumbers;
    this.onlyTree = onlyTree;
  }

  /**
   * Properly escape and sanitize content for CDATA sections.
   * 1. Removes invalid XML control characters (0x00-0x1F except tab, LF, CR)
   * 2. Replaces occurrences of ']]>' with the correct escape sequence
   * @param {string} content - Content to escape
   * @returns {string} Escaped content safe for CDATA
   */
  escapeCdata(content) {
    // First sanitize to remove invalid XML control characters
    const sanitized = sanitizeForXml(content.toString());
    // Then escape the ]]> sequence
    return sanitized.replaceAll(']]>', ']]]]><![CDATA[>');
  }

  async format(input) {
    const chunks = [];
    const generated = new Date().toISOString();
    const totalSize = this.stage.calculateTotalSize(input.files);
    const fileCount = input.files.filter((f) => f !== null).length;

    // Manual XML construction to avoid any escaping
    chunks.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    chunks.push(`<ct:directory xmlns:ct="urn:copytree" path="${input.basePath}">\n`);

    // Add metadata
    chunks.push('  <ct:metadata>\n');
    chunks.push(`    <ct:generated>${generated}</ct:generated>\n`);
    chunks.push(`    <ct:fileCount>${fileCount}</ct:fileCount>\n`);
    chunks.push(`    <ct:totalSize>${totalSize}</ct:totalSize>\n`);

    if (input.profile) {
      chunks.push(`    <ct:profile>${input.profile.name || 'default'}</ct:profile>\n`);
    }

    // Add git metadata if present
    if (input.gitMetadata) {
      chunks.push('    <ct:git>\n');
      if (input.gitMetadata.branch) {
        chunks.push(`      <ct:branch>${input.gitMetadata.branch}</ct:branch>\n`);
      }
      if (input.gitMetadata.lastCommit) {
        const msg = this.escapeCdata(input.gitMetadata.lastCommit.message || '');
        chunks.push(
          `      <ct:lastCommit hash="${input.gitMetadata.lastCommit.hash}"><![CDATA[${msg}]]></ct:lastCommit>\n`,
        );
      }
      if (input.gitMetadata.filterType) {
        chunks.push(`      <ct:filterType>${input.gitMetadata.filterType}</ct:filterType>\n`);
      }
      chunks.push(
        `      <ct:hasUncommittedChanges>${input.gitMetadata.hasUncommittedChanges ? 'true' : 'false'}</ct:hasUncommittedChanges>\n`,
      );
      chunks.push('    </ct:git>\n');
    }

    // Add directory structure to metadata
    const directoryStructure = this.stage.generateDirectoryStructure(input.files);
    if (directoryStructure) {
      chunks.push(`    <ct:directoryStructure>${directoryStructure}</ct:directoryStructure>\n`);
    }

    // Add instructions if present (loaded by InstructionsStage)
    if (input.instructions) {
      const nameAttr = input.instructionsName ? ` name="${input.instructionsName}"` : '';
      const instr = this.escapeCdata(input.instructions);
      chunks.push(`    <ct:instructions${nameAttr}><![CDATA[${instr}]]></ct:instructions>\n`);
    }

    chunks.push('  </ct:metadata>\n');
    chunks.push('  <ct:files>\n');

    // Add files
    for (const file of input.files) {
      if (file === null) continue; // Skip files that were filtered out

      let fileHeader = `    <ct:file path="@${file.path}" size="${file.size}"`;

      if (file.modified) {
        const modifiedDate =
          file.modified instanceof Date ? file.modified : new Date(file.modified);
        fileHeader += ` modified="${modifiedDate.toISOString()}"`;
      }

      if (file.isBinary) {
        fileHeader += ' binary="true"';
        if (file.encoding) {
          fileHeader += ` encoding="${file.encoding}"`;
        }
      }

      if (file.binaryCategory) {
        fileHeader += ` binaryCategory="${file.binaryCategory}"`;
      }

      if (file.gitStatus) {
        fileHeader += ` gitStatus="${file.gitStatus}"`;
      }

      fileHeader += '>';
      chunks.push(fileHeader);

      // Add content directly to file element (unless --only-tree is set)
      if (!this.onlyTree) {
        // Check if this file should be rendered as a comment
        const policy =
          this.stage.config.get('copytree.binaryPolicy', {})[file.binaryCategory] ||
          this.stage.config.get('copytree.binaryFileAction', 'placeholder');

        if (file.excluded || (file.isBinary && policy === 'comment')) {
          // Emit comment instead of CDATA
          const tpl = this.stage.config.get(
            'copytree.binaryCommentTemplates.xml',
            '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
          );
          const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
          const msg = tpl
            .replace('{TYPE}', sanitizeForComment(categoryName))
            .replace('{PATH}', sanitizeForComment(`@${file.path}`))
            .replace('{SIZE}', this.stage.formatBytes(file.size || 0));
          chunks.push(msg);
        } else {
          // Regular content handling
          let content = file.content || '';

          if (this.addLineNumbers && !file.isBinary) {
            content = this.stage.addLineNumbersToContent(content);
          }

          // Wrap content in CDATA to ensure well-formed XML
          const c = this.escapeCdata(content);
          chunks.push(`<![CDATA[${c}]]>`);
        }
      }

      chunks.push('</ct:file>\n');
    }

    chunks.push('  </ct:files>\n');
    chunks.push('</ct:directory>\n');

    return chunks.join('');
  }
}

export default XMLFormatter;
