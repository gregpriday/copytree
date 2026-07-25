import {
  sanitizeForComment,
  sanitizeForXml,
  escapeXmlAttribute,
  escapeXmlText,
} from '../../utils/helpers.js';
import { OUTPUT_FORMAT_VERSIONS } from '../../utils/outputVersion.js';

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
    chunks.push(
      `<ct:directory xmlns:ct="urn:copytree" path="${escapeXmlAttribute(input.basePath)}">\n`,
    );

    // Add metadata
    chunks.push('  <ct:metadata>\n');
    // Versioned so downstream prompts written against this shape can detect a
    // change instead of silently regressing.
    chunks.push(`    <ct:format>${OUTPUT_FORMAT_VERSIONS.xml}</ct:format>\n`);
    chunks.push(`    <ct:generated>${generated}</ct:generated>\n`);
    chunks.push(`    <ct:fileCount>${fileCount}</ct:fileCount>\n`);
    chunks.push(`    <ct:totalSize>${totalSize}</ct:totalSize>\n`);

    if (input.profile) {
      chunks.push(
        `    <ct:profile>${escapeXmlText(input.profile.name || 'default')}</ct:profile>\n`,
      );
    }

    // Add git metadata if present
    if (input.gitMetadata) {
      chunks.push('    <ct:git>\n');
      if (input.gitMetadata.branch) {
        chunks.push(`      <ct:branch>${escapeXmlText(input.gitMetadata.branch)}</ct:branch>\n`);
      }
      if (input.gitMetadata.lastCommit) {
        const msg = this.escapeCdata(input.gitMetadata.lastCommit.message || '');
        chunks.push(
          `      <ct:lastCommit hash="${escapeXmlAttribute(input.gitMetadata.lastCommit.hash)}"><![CDATA[${msg}]]></ct:lastCommit>\n`,
        );
      }
      if (input.gitMetadata.filterType) {
        chunks.push(
          `      <ct:filterType>${escapeXmlText(input.gitMetadata.filterType)}</ct:filterType>\n`,
        );
      }
      chunks.push(
        `      <ct:hasUncommittedChanges>${input.gitMetadata.hasUncommittedChanges ? 'true' : 'false'}</ct:hasUncommittedChanges>\n`,
      );
      chunks.push('    </ct:git>\n');
    }

    // Add directory structure to metadata
    const directoryStructure = this.stage.generateDirectoryStructure(input.files);
    if (directoryStructure) {
      chunks.push(
        `    <ct:directoryStructure>${escapeXmlText(directoryStructure)}</ct:directoryStructure>\n`,
      );
    }

    // Add instructions if present (loaded by InstructionsStage)
    if (input.instructions) {
      const nameAttr = input.instructionsName
        ? ` name="${escapeXmlAttribute(input.instructionsName)}"`
        : '';
      const instr = this.escapeCdata(input.instructions);
      chunks.push(`    <ct:instructions${nameAttr}><![CDATA[${instr}]]></ct:instructions>\n`);
    }

    chunks.push('  </ct:metadata>\n');
    chunks.push('  <ct:files>\n');

    // Resolved once for the whole document. These were fetched per file, and a
    // config lookup walks a dotted path on every call.
    const binaryPolicies = this.stage.config.get('copytree.binaryPolicy', {}) || {};
    const binaryAction = this.stage.config.get('copytree.binaryFileAction', 'placeholder');
    const commentTemplate = this.stage.config.get(
      'copytree.binaryCommentTemplates.xml',
      '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
    );

    // Add files
    for (const file of input.files) {
      if (file === null) continue; // Skip files that were filtered out

      let fileHeader = `    <ct:file path="@${escapeXmlAttribute(file.path)}" size="${escapeXmlAttribute(file.size)}"`;

      if (file.modified) {
        const modifiedDate =
          file.modified instanceof Date ? file.modified : new Date(file.modified);
        fileHeader += ` modified="${modifiedDate.toISOString()}"`;
      }

      if (file.isBinary) {
        fileHeader += ' binary="true"';
        if (file.encoding) {
          fileHeader += ` encoding="${escapeXmlAttribute(file.encoding)}"`;
        }
      }

      if (file.binaryCategory) {
        fileHeader += ` binaryCategory="${escapeXmlAttribute(file.binaryCategory)}"`;
      }

      if (file.gitStatus) {
        fileHeader += ` gitStatus="${escapeXmlAttribute(file.gitStatus)}"`;
      }

      fileHeader += '>';
      chunks.push(fileHeader);

      // Add content directly to file element (unless --only-tree is set)
      if (!this.onlyTree) {
        // Check if this file should be rendered as a comment
        const policy = binaryPolicies[file.binaryCategory] || binaryAction;

        if (file.excluded || (file.isBinary && policy === 'comment')) {
          // Emit comment instead of CDATA
          const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
          const msg = commentTemplate
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
