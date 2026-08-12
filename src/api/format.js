/**
 * `format()` — render a collection of files into a CopyTree document.
 *
 * A thin adapter over `src/formatters`. It normalizes the caller's input into
 * the canonical document and joins the same chunks `formatStream()` yields, so
 * the two cannot produce different bytes.
 */

import path from 'path';
import { ValidationError, ERROR_CODES } from '../utils/errors.js';
import { assertFormat, buildDocument, render } from '../formatters/index.js';

/**
 * @typedef {Object} FormatOptions
 * @property {'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif'} [format='xml'] - Output format
 * @property {boolean} [onlyTree=false] - Only include the file tree, no content
 * @property {boolean} [addLineNumbers=false] - Add line numbers to file content
 * @property {string} [basePath] - Base path the file paths are relative to
 * @property {string} [instructions] - Instructions block to include
 * @property {boolean} [showSize=false] - Show file sizes in the tree view
 * @property {boolean} [prettyPrint=true] - Indent JSON and SARIF output
 * @property {boolean} [includeMetadata=true] - Emit optional per-entry metadata
 * @property {boolean} [reproducible=false] - Omit fields that vary between runs
 * @property {boolean} [allowEmpty=false] - Return a document for an empty selection
 * @property {ConfigManager} [config] - The operation's configuration. Pass the same
 *   instance used for selection so one operation cannot format its files under
 *   another operation's settings.
 */

/**
 * Collect an array, iterable or async iterable into an array.
 * @param {*} files - Input collection
 * @returns {Promise<Object[]>} Collected files
 * @throws {ValidationError} If the input is not iterable
 */
async function collect(files) {
  if (Array.isArray(files)) return files;

  if (files[Symbol.asyncIterator]) {
    const collected = [];
    for await (const file of files) collected.push(file);
    return collected;
  }

  if (files[Symbol.iterator]) return Array.from(files);

  throw new ValidationError('files must be an array, iterable, or async iterable', 'format', files);
}

/**
 * Infer the root the paths are relative to, from the first entry.
 * @param {Object[]} files - Selected files
 * @returns {string} Base path
 */
function inferBasePath(files) {
  const first = files[0];
  if (!first?.absolutePath || !first?.path) return '.';
  return path.resolve(first.absolutePath, ...first.path.split('/').map(() => '..'));
}

/**
 * Build the canonical document both `format()` and `formatStream()` render.
 *
 * Shared deliberately, and not only to avoid repetition. The two entry points
 * previously disagreed on which entries counted as valid — one required
 * `absolutePath`, the other did not — and on the default base path, so the same
 * call could produce documents that differed in their file list and in their
 * root before a single byte was serialized. Parity has to start here, at the
 * document, or no amount of serializer sharing can deliver it.
 *
 * @param {*} files - Input collection
 * @param {FormatOptions} options - Format options
 * @param {string} caller - Entry-point name, for error messages
 * @returns {Promise<import('../formatters/document.js').CopyTreeDocument>} Document
 * @throws {ValidationError} If the files or the format are invalid
 */
export async function prepareDocument(files, options, caller) {
  if (!files) {
    throw new ValidationError('files parameter is required', caller, files);
  }

  const requestedFormat = assertFormat(options.format ?? 'xml', caller);
  const collected = await collect(files);
  const valid = collected.filter((f) => f && typeof f === 'object' && f.path);

  // An empty selection is a valid outcome (an empty folder, a fully-ignored
  // scope), not a failure. Callers that want a document back rather than an
  // exception pass `allowEmpty`.
  if (valid.length === 0 && !options.allowEmpty) {
    throw new ValidationError('No valid files to format', caller, files, {
      code: ERROR_CODES.NO_FILES_MATCHED,
    });
  }

  return buildDocument(
    {
      basePath: options.basePath ?? inferBasePath(valid),
      files: valid,
      instructions: options.instructions,
      instructionsName: options.instructionsName,
      profile: options.profile,
      gitMetadata: options.gitMetadata,
    },
    { ...options, format: requestedFormat },
    options.config ?? null,
  );
}

/**
 * Format a collection of files into the requested output format.
 *
 * @param {Array<Object> | Iterable<Object> | AsyncIterable<Object>} files - Files to format
 * @param {FormatOptions} [options={}] - Format options
 * @returns {Promise<string>} The complete document
 * @throws {ValidationError} If the files or the format are invalid
 *
 * @example
 * const xml = await format(files, { format: 'xml' });
 *
 * @example
 * const tree = await format(files, { format: 'tree', onlyTree: true });
 */
export async function format(files, options = {}) {
  return render(await prepareDocument(files, options ?? {}, 'format'));
}

export default format;
