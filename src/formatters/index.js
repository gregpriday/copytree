/**
 * The one place output is produced.
 *
 * Every destination — stdout, a file, the clipboard, a reference file, an SDK
 * return value, an SDK async iterable — consumes `serialize()`. Buffered output
 * is defined as the concatenation of the same chunks a streamed run writes, so
 * `copy().output` and the concatenation of `copyStream()` cannot disagree.
 */

import { ERROR_CODES, ValidationError } from '../utils/errors.js';
import { FORMATS, buildDocument, canonicalFormat } from './document.js';

export { FORMATS, buildDocument, canonicalFormat } from './document.js';

/**
 * Where each serializer lives, loaded when its format is chosen.
 *
 * A run produces exactly one format. Importing all six meant every XML copy —
 * the default, and so the overwhelming majority — also parsed the Markdown,
 * NDJSON and SARIF serializers and everything behind them, to use none of them.
 *
 * Null-prototype, so a format named after an inherited property —
 * `constructor`, `toString` — is unknown rather than resolving to something
 * truthy that is not a module loader.
 */
const SERIALIZERS = Object.assign(Object.create(null), {
  xml: () => import('./xml.js'),
  json: () => import('./json.js'),
  markdown: () => import('./markdown.js'),
  tree: () => import('./tree.js'),
  ndjson: () => import('./ndjson.js'),
  sarif: () => import('./sarif.js'),
});

/**
 * Assert that a format has a serializer.
 * @param {string} format - Requested format
 * @param {string} [field='format'] - Field name for the error
 * @returns {string} The canonical format name
 * @throws {ValidationError} When the format is unknown
 */
export function assertFormat(format, field = 'format') {
  const canonical = canonicalFormat(format);
  if (!SERIALIZERS[canonical]) {
    throw new ValidationError(
      `Invalid format: ${canonical}. Valid formats: ${FORMATS.join(', ')}`,
      field,
      canonical,
      { code: ERROR_CODES.INVALID_FORMAT, value: canonical },
    );
  }
  return canonical;
}

/**
 * Serialize a document into output chunks.
 *
 * Chunks never split a UTF-16 surrogate pair or a grapheme mid-escape: each is
 * a complete syntactic unit of its format, so a consumer may write them
 * straight to a socket or a PTY.
 *
 * @param {import('./document.js').CopyTreeDocument} doc - Document to render
 * @yields {string} Output chunks
 */
export async function* serialize(doc) {
  const format = assertFormat(doc.options.format);
  const { chunks } = await SERIALIZERS[format]();
  yield* chunks(doc);
}

/**
 * Render a document to one string.
 * @param {import('./document.js').CopyTreeDocument} doc - Document to render
 * @returns {Promise<string>} The complete document
 */
export async function render(doc) {
  const parts = [];
  for await (const chunk of serialize(doc)) parts.push(chunk);
  return parts.join('');
}

/**
 * Build a document and render it in one step.
 * @param {Object} input - Pipeline or SDK input
 * @param {Object} [overrides={}] - Explicit rendering options
 * @param {Object} [config=null] - The operation's ConfigManager
 * @returns {Promise<string>} The complete document
 */
export async function renderInput(input, overrides = {}, config = null) {
  return render(buildDocument(input, overrides, config));
}
