/**
 * `formatStream()` — render a collection of files as output chunks.
 *
 * This is `format()` without the final join. It yields exactly the chunks
 * `format()` concatenates, which is the whole point: the two used to be
 * separate implementations of each format and had drifted in ways that changed
 * the document — `metadata.directoryStructure` was an array in one and a
 * comma-joined string in the other, and streamed SARIF reported the tool
 * version as `0.0.0`.
 *
 * **What this does and does not bound.** The input collection is drained before
 * the first chunk, because the document header carries a file count and a total
 * size. Peak memory is therefore still proportional to the selection. What
 * chunking buys is that the formatted document is never assembled as a second
 * contiguous copy in memory, and that output can begin reaching a socket, a
 * PTY or a file before the last file is rendered. It is not a bounded-memory
 * pipeline, and nothing here should be read as promising one.
 */

import { serialize } from '../formatters/index.js';
import { prepareDocument } from './format.js';

/**
 * @typedef {import('./format.js').FormatOptions} FormatOptions
 */

/**
 * Format a collection of files, yielding the document in chunks.
 *
 * @param {Array<Object> | AsyncIterable<Object>} files - Files to format
 * @param {FormatOptions} [options={}] - Format options
 * @yields {string} Output chunks; concatenating them equals `format()`'s result
 * @throws {ValidationError} If the files or the format are invalid
 *
 * @example
 * for await (const chunk of formatStream(files, { format: 'xml' })) {
 *   process.stdout.write(chunk);
 * }
 */
export async function* formatStream(files, options = {}) {
  yield* serialize(await prepareDocument(files, options ?? {}, 'formatStream'));
}

export default formatStream;
