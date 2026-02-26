import { ValidationError } from '../utils/errors.js';
import XMLFormatter from '../pipeline/formatters/XMLFormatter.js';
import MarkdownFormatter from '../pipeline/formatters/MarkdownFormatter.js';
import NDJSONFormatter from '../pipeline/formatters/NDJSONFormatter.js';
import SARIFFormatter from '../pipeline/formatters/SARIFFormatter.js';
import path from 'path';
import { config } from '../config/ConfigManager.js';

/**
 * @typedef {Object} FormatOptions
 * @property {'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif'} [format='xml'] - Output format
 * @property {boolean} [onlyTree=false] - Only include file tree, no content
 * @property {boolean} [addLineNumbers=false] - Add line numbers to file content
 * @property {string} [basePath] - Base path for relative paths
 * @property {string} [instructions] - Instructions to include in output
 * @property {boolean} [showSize=false] - Show file sizes in tree
 * @property {boolean} [prettyPrint=true] - Pretty print JSON output
 */

/**
 * Format a collection of files into the specified output format.
 * Accepts arrays, iterables, or async iterables for flexible input.
 *
 * @param {Array<FileResult> | Iterable<FileResult> | AsyncIterable<FileResult>} files - Files to format
 * @param {FormatOptions} [options={}] - Format options
 * @returns {Promise<string>} Formatted output string
 * @throws {ValidationError} If files or format is invalid
 *
 * @example
 * // Format files as JSON
 * const files = [...fileArray];
 * const json = await format(files, { format: 'json' });
 *
 * @example
 * // Format async iterable as XML
 * const xml = await format(scan('./src'), { format: 'xml' });
 *
 * @example
 * // Tree view only (no content)
 * const tree = await format(files, {
 *   format: 'tree',
 *   onlyTree: true
 * });
 */
export async function format(files, options = {}) {
  // Guard against null options
  options = options ?? {};

  // Validate files parameter
  if (!files) {
    throw new ValidationError('files parameter is required', 'format', files);
  }

  // Normalize format option
  const rawFormat = (options.format || 'xml').toString().toLowerCase();
  const formatType = rawFormat === 'md' ? 'markdown' : rawFormat;

  // Validate format type
  const validFormats = ['xml', 'json', 'markdown', 'tree', 'ndjson', 'sarif'];
  if (!validFormats.includes(formatType)) {
    throw new ValidationError(
      `Invalid format: ${formatType}. Valid formats: ${validFormats.join(', ')}`,
      'format',
      formatType,
    );
  }

  // Collect files from various input types
  let fileArray;
  if (Array.isArray(files)) {
    fileArray = files;
  } else if (Symbol.asyncIterator && files[Symbol.asyncIterator]) {
    // Async iterable
    fileArray = [];
    for await (const file of files) {
      fileArray.push(file);
    }
  } else if (Symbol.iterator && files[Symbol.iterator]) {
    // Regular iterable
    fileArray = Array.from(files);
  } else {
    throw new ValidationError(
      'files must be an array, iterable, or async iterable',
      'format',
      files,
    );
  }

  // Filter out null/undefined files and validate required fields
  const validFiles = fileArray.filter(
    (f) => f && typeof f === 'object' && f.path && f.absolutePath,
  );

  if (validFiles.length === 0) {
    throw new ValidationError('No valid files to format', 'format', files);
  }

  // Build input object for formatters
  // Derive basePath from first file's absolute and relative paths
  const basePath =
    options.basePath ??
    (validFiles[0]?.absolutePath && validFiles[0]?.path
      ? path.resolve(validFiles[0].absolutePath, ...validFiles[0].path.split('/').map(() => '..'))
      : '.');
  const input = {
    basePath,
    files: validFiles,
    options: options,
    instructions: options.instructions,
  };

  // Format based on type
  let output;
  switch (formatType) {
    case 'xml': {
      const formatter = new XMLFormatter({
        stage: {
          config: config(),
          calculateTotalSize,
          generateDirectoryStructure,
          addLineNumbersToContent,
          buildTreeStructure,
          renderTree,
          formatBytes,
        },
        addLineNumbers: options.addLineNumbers ?? false,
        onlyTree: options.onlyTree ?? false,
      });
      output = await formatter.format(input);
      break;
    }

    case 'json':
      output = formatAsJSON(input, options);
      break;

    case 'tree':
      output = formatAsTree(input, options);
      break;

    case 'markdown': {
      const formatter = new MarkdownFormatter({
        stage: {
          config: config(),
          calculateTotalSize,
          generateDirectoryStructure,
          addLineNumbersToContent,
          buildTreeStructure,
          renderTree,
          formatBytes,
        },
        addLineNumbers: options.addLineNumbers ?? false,
        onlyTree: options.onlyTree ?? false,
      });
      output = await formatter.format(input);
      break;
    }

    case 'ndjson': {
      const formatter = new NDJSONFormatter({
        stage: {
          config: config(),
          calculateTotalSize,
          generateDirectoryStructure,
          addLineNumbersToContent,
          buildTreeStructure,
          renderTree,
          formatBytes,
        },
        addLineNumbers: options.addLineNumbers ?? false,
        onlyTree: options.onlyTree ?? false,
      });
      output = await formatter.format(input);
      break;
    }

    case 'sarif': {
      const formatter = new SARIFFormatter({
        stage: {
          config: config(),
          calculateTotalSize,
          generateDirectoryStructure,
          addLineNumbersToContent,
          buildTreeStructure,
          renderTree,
          formatBytes,
        },
        addLineNumbers: options.addLineNumbers ?? false,
        onlyTree: options.onlyTree ?? false,
      });
      output = await formatter.format(input);
      break;
    }

    default:
      throw new ValidationError(`Unsupported format: ${formatType}`, 'format', formatType);
  }

  return output;
}

/**
 * Format files as JSON
 * @private
 */
function formatAsJSON(input, options) {
  const output = {
    directory: input.basePath,
    metadata: {
      generated: new Date().toISOString(),
      fileCount: input.files.length,
      totalSize: calculateTotalSize(input.files),
      directoryStructure: generateDirectoryStructure(input.files),
      ...(input.instructions && {
        instructions: input.instructions,
      }),
    },
    files: input.files.map((file) => {
      const fileObj = {
        path: file.path,
        size: file.size,
        modified: file.modified,
        isBinary: file.isBinary,
        encoding: file.encoding,
      };

      // Add git status if available
      if (file.gitStatus) {
        fileObj.gitStatus = file.gitStatus;
      }

      // Add content unless --only-tree is set
      if (!options.onlyTree && file.content !== undefined) {
        fileObj.content =
          options.addLineNumbers && !file.isBinary
            ? addLineNumbersToContent(file.content)
            : file.content;
      }

      return fileObj;
    }),
  };

  const prettyPrint = options.prettyPrint ?? config().get('app.prettyPrint', true);
  return JSON.stringify(output, null, prettyPrint ? 2 : 0);
}

/**
 * Format files as tree view
 * @private
 */
function formatAsTree(input, options) {
  const lines = [];

  lines.push(input.basePath);
  lines.push('');

  // Build tree structure
  const tree = buildTreeStructure(input.files);

  // Render tree
  renderTree(tree, lines, '', true, options);

  return lines.join('\n');
}

/**
 * Calculate total size of files
 * @private
 */
function calculateTotalSize(files) {
  return files.reduce((sum, file) => sum + (file.size || 0), 0);
}

/**
 * Generate directory structure summary
 * @private
 */
function generateDirectoryStructure(files) {
  const dirs = new Set();

  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }

  return Array.from(dirs).sort();
}

/**
 * Add line numbers to content
 * @private
 */
function addLineNumbersToContent(content) {
  if (!content) return content;

  const lines = content.split('\n');
  const format = config().get('copytree.lineNumberFormat', '%4d: ');

  return lines
    .map((line, index) => {
      const lineNum = (index + 1).toString().padStart(4, ' ');
      return format.replace('%4d', lineNum) + line;
    })
    .join('\n');
}

/**
 * Build tree structure from files
 * @private
 */
function buildTreeStructure(files) {
  const tree = {};

  for (const file of files) {
    const parts = file.path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Leaf node (file)
        current[part] = { _file: file };
      } else {
        // Directory node
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
 * Render tree structure recursively
 * @private
 */
function renderTree(node, lines, prefix = '', isLast = true, options = {}) {
  const entries = Object.entries(node).sort(([a], [b]) => {
    // Directories first, then files
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
      // File
      const file = value._file;
      let line = prefix + connector + name;

      if (options.showSize) {
        const sizeStr = formatBytes(file.size);
        line += ` (${sizeStr})`;
      }

      lines.push(line);
    } else {
      // Directory
      lines.push(prefix + connector + name + '/');
      renderTree(value, lines, prefix + extension, isLastEntry, options);
    }
  });
}

/**
 * Format bytes to human-readable string
 * @private
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default format;
