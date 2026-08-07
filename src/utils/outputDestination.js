import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { ERROR_CODES, ValidationError } from './errors.js';

/**
 * File extension for each output format.
 *
 * Shared because it was written out twice, as a nested ternary, and the two
 * copies had already drifted: the Ink UI knew nothing about `ndjson` or
 * `sarif`, so `--format ndjson` through that path wrote a file named `.xml`.
 */
const FORMAT_EXTENSIONS = Object.freeze({
  xml: 'xml',
  json: 'json',
  markdown: 'md',
  tree: 'txt',
  ndjson: 'ndjson',
  sarif: 'sarif',
});

/**
 * Normalize a format name, resolving the `md` alias.
 * @param {string} [format] - Raw format option
 * @returns {string} Canonical format name
 */
export function normalizeFormat(format) {
  const raw = (format || 'xml').toString().toLowerCase();
  return raw === 'md' ? 'markdown' : raw;
}

/**
 * File extension for an output format.
 * @param {string} [format] - Raw format option
 * @returns {string} Extension without a leading dot
 */
export function extensionForFormat(format) {
  return FORMAT_EXTENSIONS[normalizeFormat(format)] ?? 'xml';
}

/**
 * Build the temp-file path a reference will point at.
 *
 * Named after the directory being copied, because these accumulate in the
 * system temp directory and `copytree-1738xxxxxxx.xml` tells you nothing about
 * which project it came from.
 *
 * @param {string} [basePath] - Directory being copied
 * @param {string} [format] - Output format
 * @returns {string} Absolute temp file path
 */
export function referenceFilePath(basePath, format) {
  const dirName = basePath ? path.basename(basePath) : 'copytree';
  const safeName = dirName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const prefix = safeName || 'copytree';
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}.${extensionForFormat(format)}`);
}

/**
 * Write the output to a temp file so its path can be put on the clipboard.
 * @param {string} output - Formatted output
 * @param {string} [basePath] - Directory being copied
 * @param {string} [format] - Output format
 * @returns {Promise<string>} The temp file path
 */
export async function writeReferenceFile(output, basePath, format) {
  const tempFile = referenceFilePath(basePath, format);
  await fs.writeFile(tempFile, output, 'utf8');
  return tempFile;
}

/**
 * Resolve where output should go.
 *
 * The default is `reference`: write a temp file and put its path on the
 * clipboard, so that pasting into an agent hands over a file to read rather
 * than a few hundred kilobytes of inline context. Copying the text itself is
 * still available, but has to be asked for with `--clipboard`.
 *
 * @param {Object} options - CLI options
 * @returns {'file'|'display'|'stream'|'clipboard'|'reference'} Destination
 */
export function resolveDestination(options = {}) {
  if (options.output) return 'file';
  if (options.display) return 'display';
  if (options.stream) return 'stream';
  if (options.clipboard) return 'clipboard';
  return 'reference';
}

/**
 * Flags that each name a destination, in the order precedence used to apply.
 * `--stream --output file` is not a conflict: streaming is *how* the file is
 * written, not a second place to put it.
 */
const DESTINATION_FLAGS = Object.freeze([
  ['output', '--output'],
  ['display', '--display'],
  ['clipboard', '--clipboard'],
]);

/**
 * Destinations `--stream` cannot deliver to.
 *
 * Streaming writes as it goes, to stdout or to a file. There is no way to
 * stream to a clipboard, and `resolveDestination` resolved the pair in favour
 * of the stream — so `--stream --clipboard` succeeded, said nothing, and left
 * the clipboard untouched.
 */
const STREAM_INCOMPATIBLE = Object.freeze([['clipboard', '--clipboard']]);

/**
 * Reject a command that names more than one destination.
 *
 * `resolveDestination` picks the first match, which meant `--display --clipboard`
 * silently did one of the two things asked for and never mentioned the other.
 * Silent precedence is the wrong answer to a contradiction: the user has stated
 * two intentions and only they can say which one they meant.
 *
 * @param {Object} [options] - CLI options
 * @throws {ValidationError} When two or more destinations are requested
 * @returns {true} When the options name at most one destination
 */
export function validateDestinationOptions(options = {}) {
  if (options.stream) {
    const incompatible = STREAM_INCOMPATIBLE.filter(([key]) => options[key]).map(([, f]) => f);
    if (incompatible.length > 0) {
      throw new ValidationError(
        `--stream cannot be combined with ${incompatible.join(' or ')}`,
        'destination',
        incompatible,
        {
          code: ERROR_CODES.INVALID_OPTION,
          field: 'output destination',
          suggestion: 'Stream to stdout or to --output, or drop --stream',
        },
      );
    }
  }

  const named = DESTINATION_FLAGS.filter(([key]) => options[key]).map(([, flag]) => flag);

  if (named.length > 1) {
    throw new ValidationError(
      `Choose one output destination — ${named.join(' and ')} were both given`,
      'destination',
      named,
      {
        code: ERROR_CODES.INVALID_OPTION,
        field: 'output destination',
        suggestion: 'Use only one of --output, --display, --stream or --clipboard',
      },
    );
  }

  return true;
}

/**
 * Describe a destination for the reporter and for delivery.
 *
 * @param {string} destination - A value from {@link resolveDestination}
 * @returns {{type: string, label: string, writesPayloadToStdout: boolean, supportsProgress: boolean}}
 *   Destination descriptor
 */
export function describeDestination(destination) {
  const descriptors = {
    reference: { label: 'file reference', writesPayloadToStdout: false, supportsProgress: true },
    clipboard: { label: 'clipboard', writesPayloadToStdout: false, supportsProgress: true },
    file: { label: 'file', writesPayloadToStdout: false, supportsProgress: true },
    display: { label: 'terminal', writesPayloadToStdout: true, supportsProgress: true },
    stream: { label: 'stream', writesPayloadToStdout: true, supportsProgress: true },
  };
  const descriptor = descriptors[destination] ?? descriptors.reference;
  return { type: destination, ...descriptor };
}

export default {
  extensionForFormat,
  referenceFilePath,
  writeReferenceFile,
  resolveDestination,
  validateDestinationOptions,
  describeDestination,
};
