import { sanitizeForComment, isImageExtension } from '../../utils/helpers.js';

class XMLFormatter {
  constructor({ stage, addLineNumbers = false, onlyTree = false } = {}) {
    this.stage = stage;
    this.addLineNumbers = addLineNumbers;
    this.onlyTree = onlyTree;
  }

  /**
   * Properly escape content for CDATA sections.
   * Splits on ']]>' and rejoins with the correct escape sequence.
   * @param {string} content - Content to escape
   * @returns {string} Escaped content safe for CDATA
   */
  escapeCdata(content) {
    return content.toString().split(']]>').join(']]]]><![CDATA[>');
  }

  async format(input) {
    // Manual XML construction to avoid any escaping
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<ct:directory xmlns:ct="urn:copytree" path="${input.basePath}">\n`;

    // Add metadata
    xml += '  <ct:metadata>\n';
    xml += `    <ct:generated>${new Date().toISOString()}</ct:generated>\n`;
    xml += `    <ct:fileCount>${input.files.filter(f => f !== null).length}</ct:fileCount>\n`;
    xml += `    <ct:totalSize>${this.stage.calculateTotalSize(input.files)}</ct:totalSize>\n`;

    if (input.profile) {
      xml += `    <ct:profile>${input.profile.name || 'default'}</ct:profile>\n`;
    }

    // Add git metadata if present
    if (input.gitMetadata) {
      xml += '    <ct:git>\n';
      if (input.gitMetadata.branch) {
        xml += `      <ct:branch>${input.gitMetadata.branch}</ct:branch>\n`;
      }
      if (input.gitMetadata.lastCommit) {
        const msg = this.escapeCdata(input.gitMetadata.lastCommit.message || '');
        xml += `      <ct:lastCommit hash="${input.gitMetadata.lastCommit.hash}"><![CDATA[${msg}]]></ct:lastCommit>\n`;
      }
      if (input.gitMetadata.filterType) {
        xml += `      <ct:filterType>${input.gitMetadata.filterType}</ct:filterType>\n`;
      }
      xml += `      <ct:hasUncommittedChanges>${input.gitMetadata.hasUncommittedChanges ? 'true' : 'false'}</ct:hasUncommittedChanges>\n`;
      xml += '    </ct:git>\n';
    }

    // Add directory structure to metadata
    const directoryStructure = this.stage.generateDirectoryStructure(input.files);
    if (directoryStructure) {
      xml += `    <ct:directoryStructure>${directoryStructure}</ct:directoryStructure>\n`;
    }

    // Add instructions if present (loaded by InstructionsStage)
    if (input.instructions) {
      const nameAttr = input.instructionsName ? ` name="${input.instructionsName}"` : '';
      const instr = this.escapeCdata(input.instructions);
      xml += `    <ct:instructions${nameAttr}><![CDATA[${instr}]]></ct:instructions>\n`;
    }

    xml += '  </ct:metadata>\n';
    xml += '  <ct:files>\n';

    // Add files
    for (const file of input.files) {
      if (file === null) continue; // Skip files that were filtered out

      xml += `    <ct:file path="@${file.path}" size="${file.size}"`;

      if (file.modified) {
        const modifiedDate =
          file.modified instanceof Date ? file.modified : new Date(file.modified);
        xml += ` modified="${modifiedDate.toISOString()}"`;
      }

      if (file.isBinary) {
        xml += ' binary="true"';
        if (file.encoding) {
          xml += ` encoding="${file.encoding}"`;
        }
      }

      if (file.binaryCategory) {
        xml += ` binaryCategory="${file.binaryCategory}"`;
      }

      if (file.gitStatus) {
        xml += ` gitStatus="${file.gitStatus}"`;
      }

      xml += '>';

      // Add content directly to file element (unless --only-tree is set)
      if (!this.onlyTree) {
        // Check if this file should be rendered as a comment
        const policy = this.stage.config.get('copytree.binaryPolicy', {})[file.binaryCategory] ||
                       this.stage.config.get('copytree.binaryFileAction', 'placeholder');

        if (file.excluded || (file.isBinary && policy === 'comment')) {
          // Emit comment instead of CDATA
          const tpl = this.stage.config.get('copytree.binaryCommentTemplates.xml',
            '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->');
          const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
          const msg = tpl
            .replace('{TYPE}', sanitizeForComment(categoryName))
            .replace('{PATH}', sanitizeForComment(`@${file.path}`))
            .replace('{SIZE}', this.stage.formatBytes(file.size || 0));
          xml += msg;
        } else {
          // Regular content handling
          let content = file.content || '';

          if (this.addLineNumbers && !file.isBinary) {
            content = this.stage.addLineNumbersToContent(content);
          }

          // Wrap content in CDATA to ensure well-formed XML
          const c = this.escapeCdata(content);
          xml += `<![CDATA[${c}]]>`;
        }
      }

      xml += '</ct:file>\n';
    }

    xml += '  </ct:files>\n';
    xml += '</ct:directory>\n';

    return xml;
  }
}

export default XMLFormatter;
