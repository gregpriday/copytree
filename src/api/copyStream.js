import { scan } from './scan.js';
import { formatStream } from './formatStream.js';
import { ValidationError, ERROR_CODES } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { buildManifest } from '../utils/manifest.js';
import { buildEstimates } from '../utils/estimate.js';
import { versionFor } from '../utils/outputVersion.js';
import { summaryStats } from './resultStats.js';

/**
 * @typedef {import('./scan.js').ScanOptions} ScanOptions
 * @typedef {import('./format.js').FormatOptions} FormatOptions
 * @typedef {import('./copy.js').ManifestEntry} ManifestEntry
 */

/**
 * @typedef {Object} CopyStreamOptions
 * @property {'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif'} [format='xml'] - Output format
 * @property {boolean} [onlyTree=false] - Only include file tree, no content
 * @property {boolean} [addLineNumbers=false] - Add line numbers to file content
 * @property {string} [instructions] - Instructions to include in output
 * @property {boolean} [showSize=false] - Show file sizes in tree
 * @property {boolean} [prettyPrint=true] - Pretty print JSON output
 * @property {boolean} [dryRun=false] - Plan the run and report, emitting no chunks
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration
 * @property {Function} [onProgress] - Progress callback function
 * @property {Function} [onSummary] - Called once with the scan summary before the first chunk
 * @property {Function} [onComplete] - Called once after the last chunk with
 *   `{ stats, manifest, outputFormatVersion }`, the same numbers `copy()` returns
 */

/**
 * Stream a copy operation, yielding formatted output chunks incrementally.
 *
 * Takes the same options as `copy()` — including `scope`, `dryRun`, `signal`,
 * `onProgress` and `config` — so switching from `copy()` to `copyStream()` is a
 * change of consumption, not of behaviour.
 *
 * Guarantees:
 * - Output is yielded incrementally, so a consumer can start writing before the
 *   whole document exists and never holds the full output in memory
 * - Chunks never split a valid UTF-16 surrogate pair, so a chunk can be handed
 *   straight to a terminal, socket, or file without re-buffering
 * - Concatenated output equals `copy().output` for the same inputs
 * - `onComplete` delivers the stats and manifest a `copy()` caller would get,
 *   so choosing streaming does not mean giving up the numbers. It fires only on
 *   normal completion — not when the consumer breaks early or the run is aborted
 *
 * NOT guaranteed: bounded peak memory. File content is still loaded for the
 * whole selection before formatting begins, so a very large selection costs the
 * same working set as `copy()`. What streaming saves today is the output
 * buffer, not the input one. Bound the selection with `maxTotalSize` /
 * `sizeGate` if peak memory matters.
 *
 * @param {ScanOptions & CopyStreamOptions} [options={}] - Combined options
 * @param {string} basePath - Path to directory to copy
 * @returns {AsyncGenerator<string>} - Yields formatted output chunks
 * @throws {ValidationError} If parameters are invalid
 *
 * @example
 * // Stream to a PTY without re-buffering
 * for await (const chunk of copyStream('./src')) {
 *   pty.write(chunk);
 * }
 *
 * @example
 * // Stream and still report what happened
 * let final;
 * for await (const chunk of copyStream('./src', { onComplete: (r) => (final = r) })) {
 *   out.write(chunk);
 * }
 * console.log(`${final.stats.totalFiles} files, ~${final.stats.estimatedTokens} tokens`);
 */
export async function* copyStream(basePath, options = {}) {
  const startTime = Date.now();

  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'copyStream', basePath, {
      code: ERROR_CODES.INVALID_OPTION,
    });
  }

  // Create isolated config instance for this operation if not provided
  const configInstance = options.config || (await ConfigManager.create());

  // Normalize format option
  const rawFormat = (options.format || 'xml').toString().toLowerCase();
  const formatType = rawFormat === 'md' ? 'markdown' : rawFormat;

  // Validate format type
  const validFormats = ['xml', 'json', 'markdown', 'tree', 'ndjson', 'sarif'];
  if (!validFormats.includes(formatType)) {
    throw new ValidationError(
      `Invalid format: ${formatType}. Valid formats: ${validFormats.join(', ')}`,
      'copyStream',
      formatType,
      { code: ERROR_CODES.INVALID_FORMAT },
    );
  }

  const manifestOptions = {
    structureOnlyPatterns: configInstance.get('copytree.structureOnlyPatterns', []),
    binaryExtensions: configInstance.get('copytree.binaryExtensions', undefined),
  };

  let summary = null;
  const seen = [];
  let outputChars = 0;

  const scanOptions = {
    ...options,
    config: configInstance,
    onSummary: (value) => {
      summary = value;
      if (options.onSummary) {
        try {
          options.onSummary(value);
        } catch {
          // A buggy summary callback must not fail the stream.
        }
      }
    },
  };

  const finish = () => {
    if (!options.onComplete) return;

    const manifest = buildManifest(seen, manifestOptions);
    const totalSize = seen.reduce((sum, file) => sum + (file.size || 0), 0);

    try {
      options.onComplete({
        outputFormatVersion: versionFor(formatType),
        manifest,
        stats: {
          totalFiles: seen.length,
          duration: Date.now() - startTime,
          totalSize,
          ...buildEstimates(seen, {
            format: formatType,
            onlyTree: options.onlyTree,
            addLineNumbers: options.addLineNumbers || options.withLineNumbers,
            ...(options.dryRun ? {} : { actualChars: outputChars }),
          }),
          ...(options.dryRun ? { dryRun: true } : {}),
          ...summaryStats(summary, seen),
        },
      });
    } catch {
      // A buggy completion callback must not fail the stream.
    }
  };

  // A dry run plans the selection and reports it; there is nothing to stream.
  if (options.dryRun) {
    for await (const file of scan(basePath, {
      ...scanOptions,
      includeContent: false,
      transform: false,
    })) {
      seen.push(file);
    }
    finish();
    return;
  }

  // Tap the scan so the manifest can be built without holding output in memory.
  async function* tapped() {
    for await (const file of scan(basePath, scanOptions)) {
      seen.push(stripContent(file));
      yield file;
    }
  }

  const chunks = formatStream(tapped(), {
    format: formatType,
    onlyTree: options.onlyTree,
    addLineNumbers: options.addLineNumbers || options.withLineNumbers,
    basePath: basePath,
    instructions: options.instructions,
    showSize: options.showSize,
    prettyPrint: options.prettyPrint,
    config: configInstance,
    onProgress: options.onProgress,
  });

  // `onComplete` reports a finished run. It must not fire when the consumer
  // breaks out of the loop or the run is cancelled — those are not completions,
  // and a caller that renders "47 files copied" from a half-written stream is
  // reporting something that did not happen.
  for await (const chunk of surrogateSafe(chunks)) {
    outputChars += chunk.length;
    yield chunk;
  }

  finish();
}

/**
 * Keep a file's metadata and outcome flags but drop its content.
 *
 * The manifest must be safe to retain in a long-lived process; holding the
 * loaded content would defeat the point of streaming.
 *
 * @param {Object} file - Loaded file entry
 * @returns {Object} Entry without content
 */
function stripContent(file) {
  if (!file) return file;
  const { content, ...rest } = file;
  return rest;
}

/**
 * Re-chunk a string stream so no chunk ends mid-code-point.
 *
 * A trailing high surrogate is held back and prepended to the next chunk, so a
 * consumer can write chunks straight through without decoding damage.
 *
 * @param {AsyncIterable<string>} source - Chunk source
 * @yields {string} Surrogate-safe chunks
 */
async function* surrogateSafe(source) {
  let carry = '';

  for await (const raw of source) {
    const chunk = carry + raw;
    carry = '';

    if (chunk.length === 0) continue;

    const last = chunk.charCodeAt(chunk.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      // Unpaired high surrogate: hold it for the next chunk
      carry = chunk.slice(-1);
      const body = chunk.slice(0, -1);
      if (body.length > 0) yield body;
      continue;
    }

    yield chunk;
  }

  // A dangling surrogate at end of stream is emitted rather than dropped:
  // losing a character silently is worse than passing through what we were given.
  if (carry.length > 0) yield carry;
}

export default copyStream;
