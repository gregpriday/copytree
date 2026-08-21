import { scan } from './scan.js';
import { formatStream } from './formatStream.js';
import { ValidationError, ERROR_CODES } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { buildManifest } from '../utils/manifest.js';
import { buildEstimates } from '../utils/estimate.js';
import { versionFor } from '../utils/outputVersion.js';
import { summaryStats } from './resultStats.js';
import { notify } from './callbacks.js';
import { createProgressCoordinator } from './progress.js';
import { resolveOperationConfig } from './operationConfig.js';

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
  const configInstance = await resolveOperationConfig(options);

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

  // The same bands `copy()` reports. Previously the caller's callback went
  // straight into `scan()`, which reports its own work as 0–100%, so a
  // streaming consumer was told the operation was finished before the first
  // chunk existed — and then heard nothing again, because `formatStream()`
  // accepted an `onProgress` it never called.
  const progress = createProgressCoordinator(options.onProgress);

  const scanOptions = {
    ...options,
    config: configInstance,
    onProgress: progress ? (update) => progress.scan(update) : undefined,
    onSummary: (value) => {
      summary = value;
      notify('onSummary', options.onSummary, value);
    },
  };

  progress?.start();

  const finish = () => {
    if (!options.onComplete) {
      progress?.complete();
      return;
    }

    const manifest = buildManifest(seen, manifestOptions);
    const totalSize = seen.reduce((sum, file) => sum + (file.size || 0), 0);

    notify('onComplete', options.onComplete, {
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

    // Last. Reached only by the natural end of the generator — a consumer who
    // breaks out of the loop, or cancels, never gets here — and only once the
    // manifest and estimates above have been built, because a throw in that
    // bookkeeping would otherwise reject a run that had already reported 100%.
    progress?.complete();
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

    // Here, not before `formatStream()` is called. `tapped()` is lazy: nothing
    // runs until the formatter pulls the first file, so announcing the render
    // phase at the call site would report 80% before the scan had started — and
    // the coordinator is monotonic, so every scan update after it would be
    // clamped flat. Exhausting this generator is the moment rendering begins.
    progress?.rendering();
  }

  const chunks = formatStream(tapped(), {
    format: formatType,
    onlyTree: options.onlyTree,
    addLineNumbers: options.addLineNumbers || options.withLineNumbers,
    basePath: basePath,
    instructions: options.instructions,
    showSize: options.showSize,
    prettyPrint: options.prettyPrint,
    includeMetadata: options.includeMetadata,
    reproducible: options.reproducible,
    withGitStatus: options.withGitStatus,
    // Exactly what `copy()` passes. An empty selection produces an empty
    // document rather than an exception: "nothing to copy here" is an outcome,
    // not a failure — and it has to be the same outcome in both APIs, or the
    // parity guarantee holds only for non-empty projects.
    allowEmpty: true,
    config: configInstance,
  });

  // `onComplete` reports a finished run. It must not fire when the consumer
  // breaks out of the loop or the run is cancelled — those are not completions,
  // and a caller that renders "47 files copied" from a half-written stream is
  // reporting something that did not happen.
  for await (const chunk of surrogateSafe(chunks)) {
    // Checked per chunk. Cancellation was only observed inside the scan, so a
    // consumer who aborted while the document was being rendered received the
    // rest of it and then a completion.
    options.signal?.throwIfAborted();
    outputChars += chunk.length;
    yield chunk;
  }

  options.signal?.throwIfAborted();

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
