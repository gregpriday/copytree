import os from 'os';
import path from 'path';
import fs from 'fs-extra';

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

export default { extensionForFormat, referenceFilePath, writeReferenceFile, resolveDestination };
