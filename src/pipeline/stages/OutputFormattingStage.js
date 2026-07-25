import Stage from '../Stage.js';
import XMLFormatter from '../formatters/XMLFormatter.js';
import MarkdownFormatter from '../formatters/MarkdownFormatter.js';
import NDJSONFormatter from '../formatters/NDJSONFormatter.js';
import SARIFFormatter from '../formatters/SARIFFormatter.js';
import { OUTPUT_FORMAT_VERSIONS } from '../../utils/outputVersion.js';

/** Matches bare `localeCompare(other)`, built once instead of per comparison. */
const NAME_COLLATOR = new Intl.Collator();

class OutputFormattingStage extends Stage {
  constructor(options = {}) {
    super(options);
    // A caller that asked for XML must not silently receive something else.
    this.fatal = true;
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
   * Formatting failures are fatal; there is no safe fallback.
   *
   * This used to answer a failed format request with a JSON blob containing the
   * raw file array. Three things were wrong with that. The caller asked for XML
   * and received JSON, so their parser fails on output that reported success.
   * The raw array bypasses every formatter policy, so binary placeholders and
   * comment templates do not apply. And it serialises file content that the
   * chosen format may have been about to omit entirely.
   *
   * @param {Error} error - The formatting failure
   * @param {*} _input - Unused
   * @throws {Error} Always
   */
  async handleError(error, _input) {
    this.log(`Output formatting failed: ${error.message}`, 'error');
    throw error;
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
      case 'ndjson': {
        const formatter = new NDJSONFormatter({
          stage: this,
          addLineNumbers: this.addLineNumbers,
          onlyTree: this.onlyTree,
        });
        output = await formatter.format(input);
        break;
      }
      case 'sarif': {
        const formatter = new SARIFFormatter({
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
        // Must match the SDK's `format()`. Without it the CLI's JSON was a
        // different document from the SDK's: a consumer checking
        // `metadata.format` to detect a schema change read `undefined` and
        // concluded nothing had changed.
        format: OUTPUT_FORMAT_VERSIONS.json,
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

      const parts = file.path.split('/');
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

  /**
   * Resolve the tree drawing characters once per render.
   *
   * These were fetched from config at every node, so a 10,000-file tree with a
   * few thousand directories performed tens of thousands of dotted-path config
   * lookups to obtain four constants.
   *
   * @returns {{last: string, middle: string, empty: string, vertical: string}} Connectors
   */
  treeConnectors() {
    return {
      last: this.config.get('copytree.treeConnectors.last', '└── '),
      middle: this.config.get('copytree.treeConnectors.middle', '├── '),
      empty: this.config.get('copytree.treeConnectors.empty', '    '),
      vertical: this.config.get('copytree.treeConnectors.vertical', '│   '),
    };
  }

  renderTree(node, lines, prefix, _isLast, showSizes = true, connectors = null) {
    const marks = connectors ?? this.treeConnectors();

    const entries = Object.entries(node).sort(([a], [b]) => {
      // Directories first, then files
      const aIsFile = node[a].isFile;
      const bIsFile = node[b].isFile;

      if (aIsFile && !bIsFile) return 1;
      if (!aIsFile && bIsFile) return -1;

      return NAME_COLLATOR.compare(a, b);
    });

    entries.forEach(([name, value], index) => {
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? marks.last : marks.middle;

      if (value.isFile) {
        const sizeStr = showSizes ? ` (${this.formatBytes(value.size)})` : '';
        lines.push(`${prefix}${connector}${name}${sizeStr}`);
      } else {
        lines.push(`${prefix}${connector}${name}/`);

        const extension = isLastEntry ? marks.empty : marks.vertical;

        this.renderTree(value, lines, prefix + extension, false, showSizes, marks);
      }
    });
  }

  addLineNumbersToContent(content) {
    if (!content) return content;

    // The format string is fixed for the run, so which placeholder it uses is
    // decided once rather than by running two substring replacements against
    // every line of every file.
    const format = this.lineNumberFormat;
    const padIndex = format.indexOf('%4d');
    const plainIndex = padIndex === -1 ? format.indexOf('%d') : -1;

    const lines = content.split('\n');
    const out = new Array(lines.length);

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = (i + 1).toString();
      let prefix;
      if (padIndex !== -1) {
        prefix = format.slice(0, padIndex) + lineNumber.padStart(4) + format.slice(padIndex + 3);
      } else if (plainIndex !== -1) {
        prefix = format.slice(0, plainIndex) + lineNumber + format.slice(plainIndex + 2);
      } else {
        prefix = format;
      }
      out[i] = prefix + lines[i];
    }

    return out.join('\n');
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
