import { ValidationError } from '../utils/errors.js';
import { config, ConfigManager } from '../config/ConfigManager.js';
import path from 'path';
import {
  detectFenceLanguage,
  chooseFence,
  formatBeginMarker,
  formatEndMarker,
  escapeYamlScalar,
} from '../utils/markdown.js';
import { hashContent } from '../utils/fileHash.js';
import { sanitizeForComment, sanitizeForXml } from '../utils/helpers.js';

/**
 * @typedef {import('./format.js').FormatOptions} FormatOptions
 */

/**
 * @typedef {Object} FormatStreamOptions
 * @property {'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif'} [format='xml'] - Output format
 * @property {boolean} [onlyTree=false] - Only include file tree, no content
 * @property {boolean} [addLineNumbers=false] - Add line numbers to file content
 * @property {string} [basePath] - Base path for relative paths
 * @property {string} [instructions] - Instructions to include in output
 * @property {boolean} [showSize=false] - Show file sizes in tree
 * @property {boolean} [prettyPrint=true] - Pretty print JSON output
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration
 * @property {Function} [onProgress] - Progress callback function
 */

/**
 * Format a collection of files as a streaming async generator.
 * Yields formatted output chunks incrementally, enabling memory-efficient
 * processing of large file collections.
 *
 * IMPORTANT: For tree and SARIF formats, files must be buffered internally
 * before output can be generated (these formats require knowledge of all files).
 * For XML, JSON, Markdown, and NDJSON, output streams incrementally.
 *
 * @param {Array<FileResult> | AsyncIterable<FileResult>} files - Files to format
 * @param {FormatStreamOptions} [options={}] - Format options
 * @returns {AsyncGenerator<string>} Async generator yielding formatted chunks
 * @throws {ValidationError} If files or format is invalid
 *
 * @example
 * // Stream XML format
 * for await (const chunk of formatStream(scan('./src'), { format: 'xml' })) {
 *   process.stdout.write(chunk);
 * }
 *
 * @example
 * // Stream to file
 * import { createWriteStream } from 'fs';
 * const stream = createWriteStream('output.xml');
 * for await (const chunk of formatStream(files, { format: 'xml' })) {
 *   stream.write(chunk);
 * }
 */
export async function* formatStream(files, options = {}) {
  // Guard against null options
  options = options ?? {};

  // Validate files parameter
  if (!files) {
    throw new ValidationError('files parameter is required', 'formatStream', files);
  }

  // Normalize format option
  const rawFormat = (options.format || 'xml').toString().toLowerCase();
  const formatType = rawFormat === 'md' ? 'markdown' : rawFormat;

  // Validate format type
  const validFormats = ['xml', 'json', 'markdown', 'tree', 'ndjson', 'sarif'];
  if (!validFormats.includes(formatType)) {
    throw new ValidationError(
      `Invalid format: ${formatType}. Valid formats: ${validFormats.join(', ')}`,
      'formatStream',
      formatType,
    );
  }

  // Get config instance
  const cfg = options.config || config();

  // Create helper functions context
  const helpers = createHelpers(cfg, options);

  // Route to appropriate streaming formatter
  switch (formatType) {
    case 'xml':
      yield* streamXML(files, options, helpers);
      break;

    case 'json':
      yield* streamJSON(files, options, helpers);
      break;

    case 'markdown':
      yield* streamMarkdown(files, options, helpers);
      break;

    case 'ndjson':
      yield* streamNDJSON(files, options, helpers);
      break;

    case 'tree':
      // Tree format requires all files to build structure
      yield* streamTree(files, options, helpers);
      break;

    case 'sarif':
      // SARIF format requires all files upfront
      yield* streamSARIF(files, options, helpers);
      break;

    default:
      throw new ValidationError(`Unsupported format: ${formatType}`, 'formatStream', formatType);
  }
}

/**
 * Create helper functions for formatters
 * @private
 */
function createHelpers(cfg, options) {
  return {
    config: cfg,
    options: options,

    calculateTotalSize(files) {
      return files.reduce((sum, file) => sum + (file?.size || 0), 0);
    },

    addLineNumbersToContent(content) {
      if (!content) return content;
      const lines = content.split('\n');
      const format = cfg.get('copytree.lineNumberFormat', '%4d: ');
      return lines
        .map((line, index) => {
          const lineNum = (index + 1).toString().padStart(4, ' ');
          return format.replace('%4d', lineNum) + line;
        })
        .join('\n');
    },

    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    },

    buildTreeStructure(files) {
      const tree = {};
      for (const file of files) {
        if (!file) continue;
        const parts = file.path.split('/');
        let current = tree;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === parts.length - 1) {
            current[part] = { _file: file };
          } else {
            if (!current[part]) {
              current[part] = {};
            }
            current = current[part];
          }
        }
      }
      return tree;
    },

    renderTree(node, lines, prefix = '', isLast = true) {
      const entries = Object.entries(node).sort(([a], [b]) => {
        const aIsFile = node[a]?._file;
        const bIsFile = node[b]?._file;
        if (aIsFile && !bIsFile) return 1;
        if (!aIsFile && bIsFile) return -1;
        return a.localeCompare(b);
      });

      entries.forEach(([name, value], index) => {
        const isLastEntry = index === entries.length - 1;
        const connector = isLastEntry ? '└── ' : '├── ';
        const extension = isLastEntry ? '    ' : '│   ';

        if (value._file) {
          const file = value._file;
          let line = prefix + connector + name;
          if (options.showSize) {
            line += ` (${this.formatBytes(file.size)})`;
          }
          lines.push(line);
        } else {
          lines.push(prefix + connector + name + '/');
          this.renderTree(value, lines, prefix + extension, isLastEntry);
        }
      });
    },

    escapeCdata(content) {
      const sanitized = sanitizeForXml(content.toString());
      return sanitized.replaceAll(']]>', ']]]]><![CDATA[>');
    },

    generateDirectoryStructure(files) {
      const dirs = new Set();
      for (const file of files) {
        if (!file) continue;
        const parts = file.path.split('/');
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join('/'));
        }
      }
      return Array.from(dirs).sort().join(',');
    },
  };
}

/**
 * Collect files from iterable (handles arrays and async iterables)
 * @private
 */
async function collectFiles(files) {
  if (Array.isArray(files)) {
    return files.filter((f) => f && typeof f === 'object' && f.path);
  }

  const collected = [];
  for await (const file of files) {
    if (file && typeof file === 'object' && file.path) {
      collected.push(file);
    }
  }
  return collected;
}

/**
 * Stream XML format
 * @private
 */
async function* streamXML(files, options, helpers) {
  const basePath = options.basePath || '.';
  const addLineNumbers = options.addLineNumbers || options.withLineNumbers || false;
  const onlyTree = options.onlyTree || false;

  // For XML, we need to collect files first to get metadata
  const fileArray = await collectFiles(files);
  const totalSize = helpers.calculateTotalSize(fileArray);
  const fileCount = fileArray.length;
  const generated = new Date().toISOString();

  // Header
  yield '<?xml version="1.0" encoding="UTF-8"?>\n';
  yield `<ct:directory xmlns:ct="urn:copytree" path="${basePath}">\n`;

  // Metadata
  yield '  <ct:metadata>\n';
  yield `    <ct:generated>${generated}</ct:generated>\n`;
  yield `    <ct:fileCount>${fileCount}</ct:fileCount>\n`;
  yield `    <ct:totalSize>${totalSize}</ct:totalSize>\n`;

  // Instructions if present
  if (options.instructions) {
    const instr = helpers.escapeCdata(options.instructions);
    yield `    <ct:instructions><![CDATA[${instr}]]></ct:instructions>\n`;
  }

  // Directory structure
  const dirStructure = helpers.generateDirectoryStructure(fileArray);
  if (dirStructure) {
    yield `    <ct:directoryStructure>${dirStructure}</ct:directoryStructure>\n`;
  }

  yield '  </ct:metadata>\n';
  yield '  <ct:files>\n';

  // Stream each file
  for (const file of fileArray) {
    if (!file) continue;

    let fileHeader = `    <ct:file path="@${file.path}" size="${file.size}"`;

    if (file.modified) {
      const modifiedDate = file.modified instanceof Date ? file.modified : new Date(file.modified);
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
    yield fileHeader;

    // Content (unless --only-tree)
    if (!onlyTree) {
      const binaryAction = helpers.config.get('copytree.binaryFileAction', 'placeholder');
      const policy =
        helpers.config.get('copytree.binaryPolicy', {})[file.binaryCategory] || binaryAction;

      if (file.excluded || (file.isBinary && policy === 'comment')) {
        const tpl = helpers.config.get(
          'copytree.binaryCommentTemplates.xml',
          '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
        );
        const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
        const msg = tpl
          .replace('{TYPE}', sanitizeForComment(categoryName))
          .replace('{PATH}', sanitizeForComment(`@${file.path}`))
          .replace('{SIZE}', helpers.formatBytes(file.size || 0));
        yield msg;
      } else {
        let content = file.content || '';
        if (addLineNumbers && !file.isBinary) {
          content = helpers.addLineNumbersToContent(content);
        }
        const c = helpers.escapeCdata(content);
        yield `<![CDATA[${c}]]>`;
      }
    }

    yield '</ct:file>\n';
  }

  // Footer
  yield '  </ct:files>\n';
  yield '</ct:directory>\n';
}

/**
 * Stream JSON format
 * @private
 */
async function* streamJSON(files, options, helpers) {
  const basePath = options.basePath || '.';
  const addLineNumbers = options.addLineNumbers || options.withLineNumbers || false;
  const onlyTree = options.onlyTree || false;
  const prettyPrint = options.prettyPrint ?? true;

  // Collect files for metadata
  const fileArray = await collectFiles(files);
  const totalSize = helpers.calculateTotalSize(fileArray);
  const generated = new Date().toISOString();

  // Header
  yield '{\n';
  yield `  "directory": "${basePath}",\n`;
  yield '  "metadata": {\n';
  yield `    "generated": "${generated}",\n`;
  yield `    "fileCount": ${fileArray.length},\n`;
  yield `    "totalSize": ${totalSize},\n`;
  yield `    "profile": "default",\n`;
  yield `    "directoryStructure": ${JSON.stringify(helpers.generateDirectoryStructure(fileArray))}`;

  if (options.instructions) {
    yield ',\n';
    yield `    "instructions": ${JSON.stringify(options.instructions)}`;
  }

  yield '\n  },\n';
  yield '  "files": [\n';

  // Stream each file
  let isFirst = true;
  for (const file of fileArray) {
    if (!file) continue;

    if (!isFirst) {
      yield ',\n';
    }
    isFirst = false;

    const fileObj = {
      path: file.path,
      size: file.size,
      modified: file.modified,
      isBinary: file.isBinary,
      encoding: file.encoding,
    };

    if (file.gitStatus) {
      fileObj.gitStatus = file.gitStatus;
    }

    if (!onlyTree && file.content !== undefined) {
      fileObj.content =
        addLineNumbers && !file.isBinary
          ? helpers.addLineNumbersToContent(file.content)
          : file.content;
    }

    const json = JSON.stringify(fileObj, null, prettyPrint ? 2 : 0)
      .split('\n')
      .map((line, i) => (i === 0 ? '    ' + line : '    ' + line))
      .join('\n');

    yield json;
  }

  // Footer
  yield '\n  ]\n';
  yield '}\n';
}

/**
 * Stream Markdown format
 * @private
 */
async function* streamMarkdown(files, options, helpers) {
  const basePath = options.basePath || '.';
  const addLineNumbers = options.addLineNumbers || options.withLineNumbers || false;
  const onlyTree = options.onlyTree || false;
  const includeGitStatus = options.withGitStatus || false;

  // Collect files for tree structure
  const fileArray = await collectFiles(files);
  const totalSize = helpers.calculateTotalSize(fileArray);
  const generated = new Date().toISOString();
  const charLimitApplied = fileArray.some((f) => f?.truncated);

  // YAML front matter
  yield '---\n';
  yield 'format: copytree-md@1\n';
  yield 'tool: copytree\n';
  yield `generated: ${escapeYamlScalar(generated)}\n`;
  yield `base_path: ${escapeYamlScalar(basePath)}\n`;
  yield `profile: ${escapeYamlScalar('default')}\n`;
  yield `file_count: ${fileArray.length}\n`;
  yield `total_size_bytes: ${totalSize}\n`;
  yield `char_limit_applied: ${charLimitApplied ? 'true' : 'false'}\n`;
  yield `only_tree: ${onlyTree ? 'true' : 'false'}\n`;
  yield `include_git_status: ${includeGitStatus ? 'true' : 'false'}\n`;
  yield `include_line_numbers: ${addLineNumbers ? 'true' : 'false'}\n`;

  const instrIncluded = !!options.instructions;
  yield 'instructions:\n';
  yield `  name: null\n`;
  yield `  included: ${instrIncluded ? 'true' : 'false'}\n`;
  yield '---\n\n';

  // Title
  yield `# CopyTree Export — ${path.basename(basePath)}\n\n`;

  // Directory Tree
  yield '## Directory Tree\n';
  const tree = helpers.buildTreeStructure(fileArray);
  const treeLines = [];
  helpers.renderTree(tree, treeLines, '', true);
  yield '```text\n';
  yield treeLines.join('\n');
  yield '\n```\n\n';

  // Instructions
  if (instrIncluded) {
    yield '## Instructions\n\n';
    yield `<!-- copytree:instructions-begin name="default" -->\n`;
    const instrFence = chooseFence(options.instructions || '');
    yield `${instrFence}text\n`;
    yield options.instructions.toString();
    yield `\n${instrFence}\n\n`;
    yield `<!-- copytree:instructions-end name="default" -->\n\n`;
  }

  // Files section
  if (!onlyTree) {
    yield '## Files\n\n';

    for (const file of fileArray) {
      if (!file) continue;

      const relPath = `@${file.path}`;
      const binaryAction = helpers.config.get('copytree.binaryFileAction', 'placeholder');
      const policy =
        helpers.config.get('copytree.binaryPolicy', {})[file.binaryCategory] || binaryAction;

      // Check if file should be rendered as a comment
      if (file.excluded || (file.isBinary && policy === 'comment')) {
        const tpl = helpers.config.get(
          'copytree.binaryCommentTemplates.markdown',
          '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
        );
        const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
        const msg = tpl
          .replace('{TYPE}', sanitizeForComment(categoryName))
          .replace('{PATH}', sanitizeForComment(relPath))
          .replace('{SIZE}', helpers.formatBytes(file.size || 0));
        yield msg + '\n\n';
        continue;
      }

      const modifiedISO = file.modified
        ? file.modified instanceof Date
          ? file.modified.toISOString()
          : new Date(file.modified).toISOString()
        : null;

      // Compute hash from content if available
      let sha = null;
      try {
        if (typeof file.content === 'string') {
          sha = hashContent(file.content, 'sha256');
        }
      } catch {
        // Ignore hash computation errors
      }

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

      yield formatBeginMarker(attrs) + '\n\n';
      yield `### ${relPath}\n\n`;

      // Code fence
      const lang = file.isBinary ? 'text' : detectFenceLanguage(file.path);
      const content = file.content || '';
      const fence = chooseFence(typeof content === 'string' ? content : '');
      yield `${fence}${lang ? lang : ''}`.trim() + '\n';

      if (file.isBinary) {
        if (binaryAction === 'base64' || file.encoding === 'base64') {
          yield 'Content-Transfer: base64\n';
          yield (typeof content === 'string' ? content : '') + '\n';
        } else if (binaryAction === 'placeholder') {
          yield (typeof content === 'string'
            ? content
            : helpers.config.get('copytree.binaryPlaceholderText', '[Binary file not included]') ||
              '') + '\n';
        }
      } else {
        const text = addLineNumbers ? helpers.addLineNumbersToContent(content) : content;
        yield text + '\n';
      }

      yield fence + '\n';

      // Truncation marker
      if (file.truncated) {
        const remaining =
          typeof file.originalLength === 'number'
            ? Math.max(0, file.originalLength - (file.content?.length || 0))
            : undefined;
        const remAttr = remaining !== undefined ? ` remaining="${remaining}"` : '';
        yield `\n<!-- copytree:truncated reason="char-limit"${remAttr} -->\n`;
      }

      yield '\n' + formatEndMarker(relPath) + '\n\n';
    }
  }
}

/**
 * Stream NDJSON format
 * @private
 */
async function* streamNDJSON(files, options, helpers) {
  const basePath = options.basePath || '.';
  const addLineNumbers = options.addLineNumbers || options.withLineNumbers || false;
  const onlyTree = options.onlyTree || false;

  // For NDJSON we need to collect to get accurate counts
  const fileArray = await collectFiles(files);
  const totalSize = helpers.calculateTotalSize(fileArray);
  const generated = new Date().toISOString();

  // Metadata record
  const metadata = {
    type: 'metadata',
    directory: basePath,
    generated: generated,
    fileCount: fileArray.length,
    totalSize: totalSize,
    profile: 'default',
  };

  if (options.instructions) {
    metadata.instructions = {
      name: 'default',
      content: options.instructions,
    };
  }

  yield JSON.stringify(metadata) + '\n';

  // File records
  for (const file of fileArray) {
    if (!file) continue;

    const record = {
      type: 'file',
      path: file.path,
      size: file.size,
      modified: file.modified,
      isBinary: !!file.isBinary,
    };

    if (file.encoding) record.encoding = file.encoding;
    if (file.binaryCategory) record.binaryCategory = file.binaryCategory;
    if (file.gitStatus) record.gitStatus = file.gitStatus;

    if (file.truncated) {
      record.truncated = true;
      if (file.originalLength !== undefined) {
        record.originalLength = file.originalLength;
      }
    }

    if (!onlyTree && !file.excluded) {
      const binaryAction = helpers.config.get('copytree.binaryFileAction', 'placeholder');
      const policy =
        helpers.config.get('copytree.binaryPolicy', {})[file.binaryCategory] || binaryAction;

      if (file.isBinary && policy === 'comment') {
        record.excluded = true;
        record.excludeReason = 'binary-comment-policy';
      } else if (typeof file.content === 'string') {
        let content = file.content;
        if (addLineNumbers && !file.isBinary) {
          content = helpers.addLineNumbersToContent(content);
        }
        record.content = content;
      }
    }

    yield JSON.stringify(record) + '\n';
  }

  // Summary record
  const summary = {
    type: 'summary',
    fileCount: fileArray.length,
    totalSize: totalSize,
    processedAt: new Date().toISOString(),
  };

  yield JSON.stringify(summary) + '\n';
}

/**
 * Stream tree format (requires buffering all files)
 * @private
 */
async function* streamTree(files, options, helpers) {
  const basePath = options.basePath || '.';

  // Tree requires all files to build structure
  const fileArray = await collectFiles(files);

  yield basePath + '\n\n';

  const tree = helpers.buildTreeStructure(fileArray);
  const treeLines = [];
  helpers.renderTree(tree, treeLines, '', true);

  yield treeLines.join('\n') + '\n';
}

/**
 * Stream SARIF format (requires buffering all files)
 * @private
 */
async function* streamSARIF(files, options, helpers) {
  const basePath = options.basePath || '.';

  // SARIF requires all files
  const fileArray = await collectFiles(files);
  const totalSize = helpers.calculateTotalSize(fileArray);
  const generated = new Date().toISOString();
  const prettyPrint = options.prettyPrint ?? true;

  const results = fileArray.map((file) => {
    const totalLines =
      typeof file.content === 'string' && !file.isBinary ? file.content.split('\n').length : 0;

    const result = {
      ruleId: 'file-discovered',
      level: 'note',
      message: { text: `File discovered: ${file.path}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: file.path,
              uriBaseId: '%SRCROOT%',
            },
          },
        },
      ],
      properties: {
        size: file.size || 0,
        modified: file.modified || null,
        isBinary: !!file.isBinary,
      },
    };

    if (totalLines > 0) {
      result.locations[0].physicalLocation.region = {
        startLine: 1,
        endLine: Math.max(1, totalLines),
      };
    }

    if (file.encoding) result.properties.encoding = file.encoding;
    if (file.binaryCategory) result.properties.binaryCategory = file.binaryCategory;
    if (file.gitStatus) result.properties.gitStatus = file.gitStatus;

    return result;
  });

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CopyTree',
            version: '0.0.0',
            informationUri: 'https://copytree.dev',
            rules: [
              {
                id: 'file-discovered',
                name: 'FileDiscovered',
                shortDescription: { text: 'A file was discovered by CopyTree.' },
                fullDescription: {
                  text: 'CopyTree enumerated this file in the selected scope.',
                },
                helpUri: 'https://copytree.dev',
                defaultConfiguration: { level: 'note' },
                properties: { category: 'file-discovery', tags: ['discovery'] },
              },
            ],
          },
        },
        results: results,
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: generated,
            workingDirectory: { uri: basePath },
          },
        ],
        properties: {
          profile: 'default',
          fileCount: fileArray.length,
          totalSize: totalSize,
        },
      },
    ],
  };

  yield prettyPrint ? JSON.stringify(sarif, null, 2) : JSON.stringify(sarif);
}

export default formatStream;
