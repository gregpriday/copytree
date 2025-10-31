import Stage from '../Stage.js';
import path from 'path';
import XMLFormatter from '../formatters/XMLFormatter.js';
import MarkdownFormatter from '../formatters/MarkdownFormatter.js';

class OutputFormattingStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Normalize and default format (xml is default)
    const raw = (options.format || 'xml').toString().toLowerCase();
    this.format = raw === 'md' ? 'markdown' : raw;
    this.addLineNumbers =
      options.addLineNumbers ??
      options.withLineNumbers ??
      this.config.get('copytree.addLineNumbers', false);
    this.lineNumberFormat = this.config.get('copytree.lineNumberFormat', '%4d: ');
    this.onlyTree = options.onlyTree || false;
  }

  /**
   * Handle errors during output formatting - return raw input
   */
  async handleError(error, input) {
    this.log(`Output formatting failed: ${error.message}, returning raw data`, 'warn');
    // Return a minimal valid output structure
    return {
      ...input,
      output: JSON.stringify({ error: error.message, files: input.files || [] }),
      outputFormat: 'json',
      outputSize: 0,
    };
  }

  async process(input) {
    this.log(`Formatting output as ${this.format}`, 'debug');
    const startTime = Date.now();

    let output;
    switch (this.format) {
    case 'xml': {
      const formatter = new XMLFormatter({
        stage: this,
        addLineNumbers: this.addLineNumbers,
        onlyTree: this.onlyTree,
      });
      output = await formatter.format(input);
      break;
    }
    case 'json':
      output = this.formatAsJSON(input);
      break;
    case 'tree':
      output = this.formatAsTree(input);
      break;
    case 'markdown': {
      const formatter = new MarkdownFormatter({
        stage: this,
        addLineNumbers: this.addLineNumbers,
        onlyTree: this.onlyTree,
      });
      output = await formatter.format(input);
      break;
    }
    default:
      throw new Error(`Unknown output format: ${this.format}`);
    }

    this.log(`Formatted output in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      output,
      outputFormat: this.format,
      outputSize: Buffer.byteLength(output, 'utf8'),
    };
  }

  formatAsJSON(input) {
    const output = {
      directory: input.basePath,
      metadata: {
        generated: new Date().toISOString(),
        fileCount: input.files.filter((f) => f !== null).length,
        totalSize: this.calculateTotalSize(input.files),
        profile: input.profile?.name || 'default',
        directoryStructure: this.generateDirectoryStructure(input.files),
        ...(input.instructions && {
          instructions: input.instructions,
        }),
      },
      files: input.files
        .filter((f) => f !== null)
        .map((file) => {
          const fileObj = {
            path: file.path,
            size: file.size,
            modified: file.modified,
            isBinary: file.isBinary,
            encoding: file.encoding,
          };

          // Add content unless --only-tree is set
          if (!this.onlyTree) {
            fileObj.content =
              this.addLineNumbers && !file.isBinary
                ? this.addLineNumbersToContent(file.content)
                : file.content;
          }

          return fileObj;
        }),
    };

    const prettyPrint = this.config.get('app.prettyPrint', true);
    return JSON.stringify(output, null, prettyPrint ? 2 : 0);
  }

  formatAsTree(input) {
    const lines = [];
    // Tree formatting options (currently using defaults)
    // const indent = this.config.get('copytree.treeIndent', '  ');
    // const connectors = this.config.get('copytree.treeConnectors');

    lines.push(input.basePath);
    lines.push('');

    // Build tree structure
    const tree = this.buildTreeStructure(input.files);

    // Render tree
    this.renderTree(tree, lines, '', true);

    // Add summary
    lines.push('');
    lines.push(
      `${input.files.filter((f) => f !== null).length} files, ${this.formatBytes(this.calculateTotalSize(input.files))}`,
    );

    return lines.join('\n');
  }

  buildTreeStructure(files) {
    const tree = {};

    for (const file of files) {
      if (file === null) continue;

      const parts = file.path.split(path.sep);
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (i === parts.length - 1) {
          // It's a file
          current[part] = {
            isFile: true,
            size: file.size,
            content: file.content,
          };
        } else {
          // It's a directory
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      }
    }

    return tree;
  }

  renderTree(node, lines, prefix, _isLast, showSizes = true) {
    const entries = Object.entries(node).sort(([a], [b]) => {
      // Directories first, then files
      const aIsFile = node[a].isFile;
      const bIsFile = node[b].isFile;

      if (aIsFile && !bIsFile) return 1;
      if (!aIsFile && bIsFile) return -1;

      return a.localeCompare(b);
    });

    entries.forEach(([name, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry
        ? this.config.get('copytree.treeConnectors.last', '└── ')
        : this.config.get('copytree.treeConnectors.middle', '├── ');

      if (value.isFile) {
        const sizeStr = showSizes ? ` (${this.formatBytes(value.size)})` : '';
        lines.push(`${prefix}${connector}${name}${sizeStr}`);
      } else {
        lines.push(`${prefix}${connector}${name}/`);

        const extension = isLastEntry
          ? this.config.get('copytree.treeConnectors.empty', '    ')
          : this.config.get('copytree.treeConnectors.vertical', '│   ');

        this.renderTree(value, lines, prefix + extension, false, showSizes);
      }
    });
  }

  addLineNumbersToContent(content) {
    if (!content) return content;

    const lines = content.split('\n');
    return lines
      .map((line, index) => {
        const lineNumber = (index + 1).toString();
        const formatted = this.lineNumberFormat
          .replace('%d', lineNumber)
          .replace('%4d', lineNumber.padStart(4));
        return formatted + line;
      })
      .join('\n');
  }

  calculateTotalSize(files) {
    return files.reduce((total, file) => {
      return total + (file ? file.size : 0);
    }, 0);
  }

  generateDirectoryStructure(files) {
    const validFiles = files.filter((f) => f !== null);
    if (validFiles.length === 0) return '';

    // Build tree structure
    const tree = this.buildTreeStructure(validFiles);

    // Render tree to string (reuse renderTree with showSizes=false)
    const lines = [];
    this.renderTree(tree, lines, '', true, false);

    return lines.join('\n');
  }
}

export default OutputFormattingStage;
