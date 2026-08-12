/**
 * The canonical `copytree-json@1` serializer.
 *
 * The buffered CLI document is the canonical one. The SDK previously emitted
 * `metadata.directoryStructure` as an array of directory paths and the
 * streaming path emitted the same paths comma-joined, neither of which matched
 * the CLI's rendered tree — three documents, one version string.
 *
 * JSON is emitted incrementally rather than by stringifying one object, so a
 * large export never materialises a second complete copy of every file body as
 * one contiguous string. The record shape is byte-identical to
 * `JSON.stringify(document, null, prettyPrint ? 2 : 0)`.
 */

import { OUTPUT_FORMAT_VERSIONS } from '../utils/outputVersion.js';
import { calculateTotalSize, contentFor, directoryStructure } from './document.js';

/**
 * Serialize a document as JSON.
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;
  const indent = options.prettyPrint ? 2 : 0;
  const nl = options.prettyPrint ? '\n' : '';
  const pad = (depth) => (options.prettyPrint ? ' '.repeat(depth * indent) : '');
  // `JSON.stringify(value, null, 0)` writes `"key":value` with no space.
  // Hard-coding `": "` here made compact output differ from the reference by
  // exactly three characters — invisible to a parser, and to a parity suite
  // that compares this serializer against itself.
  const colon = options.prettyPrint ? ': ' : ':';

  const metadata = {
    format: OUTPUT_FORMAT_VERSIONS.json,
    ...(options.reproducible ? {} : { generated: new Date().toISOString() }),
    fileCount: files.length,
    totalSize: calculateTotalSize(files),
    profile: doc.profile?.name || 'default',
    ...(options.includeMetadata ? { directoryStructure: directoryStructure(doc) } : {}),
    ...(doc.instructions ? { instructions: doc.instructions } : {}),
  };

  /**
   * Serialize a value at a given depth, matching `JSON.stringify` indentation.
   * @param {*} value - Value to serialize
   * @param {number} depth - Nesting depth
   * @returns {string} JSON text
   */
  const at = (value, depth) => {
    const text = JSON.stringify(value, null, indent);
    if (!options.prettyPrint || depth === 0) return text;
    return text.replaceAll('\n', '\n' + pad(depth));
  };

  yield `{${nl}${pad(1)}"directory"${colon}${at(doc.basePath, 1)},${nl}`;
  yield `${pad(1)}"metadata"${colon}${at(metadata, 1)},${nl}`;
  yield `${pad(1)}"files"${colon}[`;

  let first = true;
  for (const file of files) {
    const record = {
      path: file.path,
      size: file.size,
      ...(options.includeMetadata && !options.reproducible ? { modified: file.modified } : {}),
      isBinary: file.isBinary,
      ...(options.includeMetadata ? { encoding: file.encoding } : {}),
      ...(file.gitStatus ? { gitStatus: file.gitStatus } : {}),
    };

    // A file with no content at all — `--no-content`, or an entry the loader
    // skipped — omits the key rather than claiming an empty body.
    if (!options.onlyTree && file.content !== undefined) {
      record.content = contentFor(file, options);
    }

    yield `${first ? '' : ','}${nl}${pad(2)}${at(record, 2)}`;
    first = false;
  }

  yield `${first ? '' : nl + pad(1)}]${nl}}\n`;
}

export default chunks;
