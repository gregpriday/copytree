/**
 * The canonical document model every serializer renders.
 *
 * CopyTree used to carry three independent implementations of each output
 * format: the buffered formatters under `pipeline/formatters`, the generators
 * in `api/formatStream.js`, and the transform streams inside
 * `StreamingOutputStage`. They drifted, exactly as three copies of anything
 * drift. `metadata.directoryStructure` meant three different things — an array
 * of directory paths, the same paths comma-joined, and a rendered ASCII tree —
 * so a consumer reading the CLI's JSON and the SDK's JSON was reading two
 * different documents that both claimed to be `copytree-json@1`.
 *
 * There is now one serializer per format, and it is an async generator of
 * string chunks. Buffered output is `chunks.join('')`; streamed output is the
 * same chunks handed to a writable. Parity is structural rather than
 * aspirational: there is no second implementation left to disagree with.
 *
 * This module builds the model those serializers consume. Two properties make
 * that work:
 *
 * 1. **Every configuration lookup happens here, once.** A serializer never
 *    touches a `ConfigManager`, so it cannot read a different instance than the
 *    selection did, and rendering is a pure function of the document.
 * 2. **Every caller normalizes through `buildDocument`.** The CLI stages and the
 *    SDK entry points pass different-shaped inputs; they converge here.
 */

import { comparePlain } from '../utils/collation.js';

/**
 * @typedef {Object} DocumentOptions
 * @property {string} format - Canonical format name
 * @property {boolean} addLineNumbers - Prefix text content with line numbers
 * @property {boolean} onlyTree - Emit structure without file bodies
 * @property {boolean} includeMetadata - Emit optional per-entry metadata
 * @property {boolean} reproducible - Omit fields that vary between identical runs
 * @property {boolean} prettyPrint - Indent JSON and SARIF
 * @property {boolean} showSize - Annotate tree entries with sizes
 * @property {boolean} withGitStatus - Git status was requested
 * @property {boolean} charLimitApplied - A character budget truncated content
 * @property {string} lineNumberFormat - Line-number prefix template
 * @property {string} binaryFileAction - Default binary policy
 * @property {Object} binaryPolicy - Per-category binary policy overrides
 * @property {Object} binaryCommentTemplates - Comment templates per format
 * @property {string} binaryPlaceholderText - Placeholder body for binaries
 * @property {Object} treeConnectors - Tree drawing characters
 */

/**
 * @typedef {Object} CopyTreeDocument
 * @property {string} basePath - Root the paths are relative to
 * @property {Object[]} files - Selected files, nulls removed
 * @property {string|null} instructions - Instructions block, if loaded
 * @property {string|null} instructionsName - Name of the instructions block
 * @property {{name: string}|null} profile - Effective profile
 * @property {Object|null} gitMetadata - Branch, last commit, filter type
 * @property {string} version - CopyTree version, for tools that record it
 * @property {DocumentOptions} options - Fully resolved rendering options
 */

/** Formats CopyTree can serialize. */
export const FORMATS = Object.freeze(['xml', 'json', 'markdown', 'tree', 'ndjson', 'sarif']);

/**
 * Resolve a format alias to its canonical name.
 * @param {string} format - Requested format
 * @returns {string} Canonical format name
 */
export function canonicalFormat(format) {
  const lower = String(format ?? 'xml').toLowerCase();
  return lower === 'md' ? 'markdown' : lower;
}

/**
 * Read a dotted configuration key, tolerating a missing config.
 * @param {Object|null} config - ConfigManager instance
 * @param {string} key - Dotted key
 * @param {*} fallback - Value when unset
 * @returns {*} Configured value
 */
function read(config, key, fallback) {
  if (!config || typeof config.get !== 'function') return fallback;
  const value = config.get(key, fallback);
  return value === undefined ? fallback : value;
}

/**
 * Build the canonical document from a caller's input.
 *
 * @param {Object} input - Pipeline input or SDK input
 * @param {Object} [overrides={}] - Rendering options the caller states explicitly
 * @param {Object} [config=null] - The operation's ConfigManager
 * @returns {CopyTreeDocument} The document to serialize
 */
export function buildDocument(input, overrides = {}, config = null) {
  const files = (input.files || []).filter((file) => file !== null && file !== undefined);
  const format = canonicalFormat(overrides.format ?? input.options?.format);

  const addLineNumbers =
    overrides.addLineNumbers ??
    overrides.withLineNumbers ??
    input.options?.addLineNumbers ??
    input.options?.withLineNumbers ??
    read(config, 'copytree.addLineNumbers', false);

  const onlyTree = Boolean(overrides.onlyTree ?? input.options?.onlyTree ?? false);
  const includeMetadata = (overrides.includeMetadata ?? input.options?.includeMetadata) !== false;
  const reproducible = (overrides.reproducible ?? input.options?.reproducible) === true;

  // Truncation is a property of the document, not of the request: a character
  // budget that never bit did not truncate anything, and saying it did makes
  // two identical exports look different.
  const charLimitApplied = Boolean(
    input.stats?.truncatedFiles > 0 || files.some((file) => file?.truncated),
  );

  return {
    basePath: input.basePath ?? '.',
    files,
    instructions: input.options?.noInstructions ? null : (input.instructions ?? null),
    instructionsName: input.instructionsName ?? null,
    profile: input.profile ?? null,
    gitMetadata: input.gitMetadata ?? null,
    version: input.version ?? overrides.version ?? null,
    options: {
      format,
      addLineNumbers: Boolean(addLineNumbers),
      onlyTree,
      includeMetadata,
      reproducible,
      prettyPrint: overrides.prettyPrint ?? read(config, 'app.prettyPrint', true),
      showSize: Boolean(overrides.showSize ?? input.options?.showSize ?? includeMetadata),
      withGitStatus: Boolean(overrides.withGitStatus ?? input.options?.withGitStatus ?? false),
      charLimitApplied,
      lineNumberFormat: read(config, 'copytree.lineNumberFormat', '%4d: '),
      binaryFileAction: read(config, 'copytree.binaryFileAction', 'placeholder'),
      binaryPolicy: read(config, 'copytree.binaryPolicy', {}) || {},
      binaryCommentTemplates: {
        xml: read(
          config,
          'copytree.binaryCommentTemplates.xml',
          '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
        ),
        markdown: read(
          config,
          'copytree.binaryCommentTemplates.markdown',
          '<!-- {TYPE} File Excluded: {PATH} ({SIZE}) -->',
        ),
      },
      binaryPlaceholderText: read(
        config,
        'copytree.binaryPlaceholderText',
        '[Binary file not included]',
      ),
      treeConnectors: {
        last: read(config, 'copytree.treeConnectors.last', '└── '),
        middle: read(config, 'copytree.treeConnectors.middle', '├── '),
        empty: read(config, 'copytree.treeConnectors.empty', '    '),
        vertical: read(config, 'copytree.treeConnectors.vertical', '│   '),
      },
    },
  };
}

/**
 * The effective binary policy for one file.
 * @param {Object} file - File entry
 * @param {DocumentOptions} options - Resolved options
 * @returns {string} Policy name
 */
export function binaryPolicyFor(file, options) {
  return options.binaryPolicy[file.binaryCategory] || options.binaryFileAction;
}

/**
 * Whether a file is rendered as a comment rather than as content.
 * @param {Object} file - File entry
 * @param {DocumentOptions} options - Resolved options
 * @returns {boolean} True when the file becomes a comment
 */
export function rendersAsComment(file, options) {
  return Boolean(file.excluded || (file.isBinary && binaryPolicyFor(file, options) === 'comment'));
}

/**
 * Sum the byte sizes of a selection.
 * @param {Object[]} files - Files
 * @returns {number} Total bytes
 */
export function calculateTotalSize(files) {
  return files.reduce((total, file) => total + (file?.size || 0), 0);
}

/**
 * The modification timestamp for a file, when it should be emitted at all.
 *
 * `--no-metadata` drops it as optional metadata; `--reproducible` drops it
 * because it varies with the filesystem rather than with the content.
 *
 * @param {Object} file - File entry
 * @param {DocumentOptions} options - Resolved options
 * @returns {string|null} ISO timestamp, or null
 */
export function modifiedTimestamp(file, options) {
  if (!options.includeMetadata || options.reproducible || !file.modified) return null;
  return file.modified instanceof Date
    ? file.modified.toISOString()
    : new Date(file.modified).toISOString();
}

/**
 * Prefix each line of content with its line number.
 * @param {string} content - File content
 * @param {DocumentOptions} options - Resolved options
 * @returns {string} Numbered content
 */
export function addLineNumbersToContent(content, options) {
  if (!content) return content;

  // The format string is fixed for the run, so which placeholder it uses is
  // decided once rather than by running two substring replacements against
  // every line of every file.
  const format = options.lineNumberFormat;
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

/**
 * The text body for a file, with line numbers applied when requested.
 * @param {Object} file - File entry
 * @param {DocumentOptions} options - Resolved options
 * @returns {string} Content to emit
 */
export function contentFor(file, options) {
  const content = typeof file.content === 'string' ? file.content : '';
  if (!options.addLineNumbers || file.isBinary) return content;
  return addLineNumbersToContent(content, options);
}

/**
 * Render a binary comment from the configured template.
 * @param {Object} file - File entry
 * @param {string} template - Comment template
 * @param {Function} sanitize - Comment sanitizer
 * @returns {string} Rendered comment
 */
export function renderBinaryComment(file, template, sanitize) {
  const categoryName = (file.binaryCategory || 'Binary').toUpperCase();
  return template
    .replace('{TYPE}', sanitize(categoryName))
    .replace('{PATH}', sanitize(`@${file.path}`))
    .replace('{SIZE}', formatBytes(file.size || 0));
}

/**
 * Format a byte count for human display.
 * @param {number} bytes - Byte count
 * @returns {string} Rendered size
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Build a nested tree from POSIX file paths.
 * @param {Object[]} files - Files
 * @returns {Object} Tree node
 */
export function buildTreeStructure(files) {
  const tree = {};

  for (const file of files) {
    const parts = file.path.split('/');
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = { isFile: true, size: file.size, file };
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }

  return tree;
}

/**
 * Render a tree node as indented lines.
 *
 * Directories sort before files, then by the shared plain collation, which
 * keeps ICU off the startup path.
 *
 * @param {Object} node - Tree node
 * @param {string[]} lines - Accumulator
 * @param {string} prefix - Current indent
 * @param {boolean} showSizes - Annotate files with their size
 * @param {Object} connectors - Drawing characters
 * @returns {string[]} The accumulator
 */
export function renderTree(node, lines, prefix, showSizes, connectors) {
  const entries = Object.entries(node).sort(([a], [b]) => {
    const aIsFile = node[a].isFile;
    const bIsFile = node[b].isFile;
    if (aIsFile && !bIsFile) return 1;
    if (!aIsFile && bIsFile) return -1;
    return comparePlain(a, b);
  });

  entries.forEach(([name, value], index) => {
    const isLastEntry = index === entries.length - 1;
    const connector = isLastEntry ? connectors.last : connectors.middle;

    if (value.isFile) {
      const sizeStr = showSizes ? ` (${formatBytes(value.size)})` : '';
      lines.push(`${prefix}${connector}${name}${sizeStr}`);
    } else {
      lines.push(`${prefix}${connector}${name}/`);
      const extension = isLastEntry ? connectors.empty : connectors.vertical;
      renderTree(value, lines, prefix + extension, showSizes, connectors);
    }
  });

  return lines;
}

/**
 * The rendered directory structure carried in document metadata.
 *
 * One meaning, everywhere: the ASCII tree without sizes. It previously meant
 * an array of directory paths in the SDK, those paths comma-joined in the
 * streaming SDK, and this tree in the CLI.
 *
 * @param {CopyTreeDocument} doc - Document
 * @returns {string} Rendered tree, or an empty string for an empty selection
 */
export function directoryStructure(doc) {
  if (doc.files.length === 0) return '';
  const tree = buildTreeStructure(doc.files);
  return renderTree(tree, [], '', false, doc.options.treeConnectors).join('\n');
}
