import { scan, pickForwardedStats } from './scan.js';
import { format } from './format.js';
import { ValidationError, ERROR_CODES, isAbortError } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { buildManifest } from '../utils/manifest.js';
import { buildEstimates } from '../utils/estimate.js';
import { versionFor } from '../utils/outputVersion.js';
import { PIPELINE_STAGES } from '../utils/ProgressTracker.js';
import fs from 'fs-extra';
import path from 'path';
import Clipboard from '../utils/clipboard.js';

/**
 * @typedef {import('./scan.js').ScanOptions} ScanOptions
 * @typedef {import('./format.js').FormatOptions} FormatOptions
 */

/**
 * @typedef {Object} CopyOptions
 * @property {string} [output] - Output file path (if specified, writes to file)
 * @property {boolean} [display=false] - Display output to console
 * @property {boolean} [clipboard=false] - Copy output to clipboard (programmatic default: false)
 * @property {boolean} [stream=false] - Stream output to stdout
 * @property {string} [secretsReport] - Path to write secrets report
 * @property {boolean} [info=false] - Include summary information
 * @property {boolean} [dryRun=false] - Plan the run without reading or formatting content.
 *   Every stat-based budget (`sizeGate`, `maxFileSize`, `maxFileCount`, `maxTotalSize`) applies
 *   exactly as in a real run, so the selection is identical. `charLimit` is planned from byte
 *   size, which matches character length for ASCII but overestimates for multi-byte text, and
 *   `dedupe` cannot run at all without content — with either option the preview is an estimate.
 * @property {boolean} [verbose=false] - Verbose error output
 * @property {number} [charLimit] - Character budget across all file content
 * @property {string} [instructions] - Instructions to include in output
 * @property {boolean} [explain=false] - Collect per-file exclusion detail in `stats.excluded.largest`
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration.
 *   If not provided, an isolated instance will be created. This enables concurrent
 *   copy operations with different configurations.
 * @property {Function} [onProgress] - Progress callback ({ percent, message }).
 *   Called periodically during copy with normalized progress updates (0-100%).
 *   Scan phase covers 0-80%, formatting 80-100%.
 * @property {number} [progressThrottleMs=100] - Minimum ms between progress emissions.
 */

/**
 * @typedef {Object} ManifestEntry
 * @property {string} path - Relative POSIX path to the file
 * @property {number} size - File size in bytes
 * @property {string} [modified] - ISO timestamp of last modification
 * @property {string} outcome - `included` | `structure-only` | `binary-placeholder` |
 *   `truncated` | `excluded:<reason>`
 */

/**
 * @typedef {Object} CopyStats
 * @property {number} totalFiles - Total number of files processed
 * @property {number} duration - Processing duration in milliseconds
 * @property {number} totalSize - Total size of files in bytes
 * @property {number} [outputSize] - Output size in bytes
 * @property {number} estimatedOutputChars - Output characters (measured on a real run,
 *   estimated on a dry run)
 * @property {number} estimatedTokens - Rough token count, chars/4. Accurate to about ±20%;
 *   no tokenizer dependency and no per-model accuracy claim.
 * @property {boolean} noFilesMatched - True when nothing matched. A valid outcome, not an error.
 * @property {Object} excluded - Exclusion accounting
 * @property {number} excluded.total - How many entries were excluded
 * @property {Object<string, number>} excluded.byReason - Counts keyed by stable reason
 * @property {Array<Object>} [excluded.largest] - Largest exclusions, only under `explain: true`
 * @property {boolean} [truncated] - Whether a budget dropped files
 * @property {number} [truncatedCount] - How many files a budget dropped
 * @property {string} [truncatedBy] - Which budget bit first
 * @property {Object} [secretsGuard] - Secrets detection summary (if enabled)
 */

/**
 * @typedef {Object} CopyResult
 * @property {string} output - Formatted output string
 * @property {string|null} outputFormatVersion - Version of the emitted format, e.g. `copytree-xml@1`
 * @property {Array<FileResult>} files - Full file results (includes content). Use `manifest` when you only need paths and sizes.
 * @property {Array<ManifestEntry>} manifest - Lightweight list of included files.
 *   Safe to retain in long-lived processes (e.g. Electron) without holding megabytes of file content in memory.
 *   Consistent shape across normal runs and dry runs — entries never include `content`.
 * @property {CopyStats} stats - Processing statistics
 */

/**
 * Complete end-to-end copy operation combining scan and format.
 * This is the programmatic equivalent of the CLI command.
 *
 * IMPORTANT: Unlike the CLI, programmatic API defaults to NO side effects:
 * - clipboard: false (CLI default: true)
 * - display: false (CLI default: false, but primary output method)
 * - output: undefined (no file written unless specified)
 *
 * @param {string} basePath - Path to directory to copy
 * @param {ScanOptions & FormatOptions & CopyOptions} [options={}] - Combined options
 * @returns {Promise<CopyResult>} Copy result with output and stats
 * @throws {ValidationError} If parameters are invalid
 *
 * @example
 * // Simple copy (returns formatted string)
 * const result = await copy('./src');
 * console.log(result.output);
 *
 * @example
 * // Scope to a folder the user right-clicked. Literal paths, no glob escaping;
 * // ignore rules and output paths still resolve from the repository root.
 * const result = await copy(repoRoot, {
 *   scope: ['src/panels/file-browser'],
 * });
 *
 * @example
 * // Bound the context, and find out what that cost
 * const result = await copy('./src', {
 *   maxTotalSize: 2_000_000,
 *   charLimit: 400_000,
 *   explain: true,
 * });
 * if (result.stats.truncated) {
 *   console.log(`Dropped ${result.stats.truncatedCount} files (${result.stats.truncatedBy})`);
 * }
 * console.log(result.stats.excluded.byReason);
 *
 * @example
 * // Dry run to preview. Selects the same files, in the same order, under the
 * // same stat-based budgets as the real run. `charLimit` and `dedupe` are
 * // planned rather than measured — see the dryRun option docs.
 * const result = await copy('./src', { dryRun: true });
 * console.log(`Would process ${result.stats.totalFiles} files (~${result.stats.estimatedTokens} tokens)`);
 * result.manifest.forEach(({ path, outcome }) => console.log(outcome, path));
 */
export async function copy(basePath, options = {}) {
  const startTime = Date.now();

  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'copy', basePath, {
      code: ERROR_CODES.INVALID_OPTION,
    });
  }

  // Create isolated config instance for this operation if not provided
  // This enables concurrent copy operations with different configurations
  const configInstance = options.config || (await ConfigManager.create());

  const manifestOptions = {
    structureOnlyPatterns: configInstance.get('copytree.structureOnlyPatterns', []),
    binaryExtensions: configInstance.get('copytree.binaryExtensions', undefined),
  };

  // Build progress wrapper: scan gets 0-80%, format gets 80-100%
  const { onProgress, progressThrottleMs } = options;
  let scanProgress = null;
  let lastEmittedPercent = -1;

  /**
   * Emit progress with a monotonic guard so percent never decreases.
   *
   * Every field the scan reported is carried through. Rebuilding the object
   * from `percent` and `message` alone dropped `stage`, so the stable stage id
   * that `PIPELINE_STAGES` exists to publish was invisible to exactly the
   * callers most likely to render it.
   *
   * Swallows exceptions so a buggy callback never breaks the operation.
   *
   * @param {number} percent - Progress 0-100
   * @param {string} message - Human-readable status
   * @param {Object} [source] - Underlying progress object to carry through
   */
  const emitProgress = onProgress
    ? (percent, message, source = {}) => {
        const clamped = Math.max(percent, lastEmittedPercent);
        lastEmittedPercent = clamped;
        try {
          onProgress({ ...source, percent: clamped, message });
        } catch {
          // Swallow callback exceptions
        }
      }
    : null;

  if (emitProgress) {
    emitProgress(0, 'Starting...', { stage: PIPELINE_STAGES.UNKNOWN });
    scanProgress = (progress) => {
      // Scale scan progress to 0-80%
      emitProgress(Math.round(progress.percent * 0.8), progress.message, progress);
    };
  }

  let summary = null;
  const captureSummary = (value) => {
    summary = value;
    // `...options` is spread into the scan options below, so assigning
    // `onSummary` there replaces whatever the caller passed. Chain instead: a
    // caller who asks for the summary and also reads `result.stats` should get
    // both.
    if (typeof options.onSummary === 'function') {
      try {
        options.onSummary(value);
      } catch {
        // A buggy summary callback must not fail the copy.
      }
    }
  };

  // Handle dry run
  if (options.dryRun) {
    // Plan the run without reading content. Every stat-based budget
    // (sizeGate, maxFileSize, maxFileCount, maxTotalSize) applies exactly as it
    // would in the real run; charLimit is planned from byte size.
    const files = [];
    for await (const file of scan(basePath, {
      ...options,
      config: configInstance,
      includeContent: false,
      transform: false,
      onProgress: scanProgress,
      progressThrottleMs,
      onSummary: captureSummary,
    })) {
      files.push(file);
    }

    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const manifest = buildManifest(files, manifestOptions);

    if (emitProgress) {
      emitProgress(100, 'Complete', { stage: PIPELINE_STAGES.UNKNOWN });
    }

    return {
      output: '',
      outputFormatVersion: versionFor(options.format || 'xml'),
      files,
      manifest,
      stats: {
        totalFiles: files.length,
        duration: Date.now() - startTime,
        totalSize,
        dryRun: true,
        ...buildEstimates(files, {
          format: options.format,
          onlyTree: options.onlyTree,
          addLineNumbers: options.addLineNumbers || options.withLineNumbers,
        }),
        ...summaryStats(summary, files),
      },
    };
  }

  // Scan files with options (pass config for isolation)
  const files = [];
  const scanErrors = [];

  try {
    for await (const file of scan(basePath, {
      ...options,
      config: configInstance,
      onProgress: scanProgress,
      progressThrottleMs,
      onSummary: captureSummary,
    })) {
      files.push(file);
    }
  } catch (error) {
    // A cancelled run never degrades into a partial success: the caller asked
    // for it to stop, and a truncated context that looks complete is worse than
    // no context at all.
    if (isAbortError(error)) {
      throw error;
    }

    // Collect scan errors but continue if we have some files
    scanErrors.push(error);
    if (files.length === 0) {
      throw error;
    }
  }

  // Calculate stats
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

  if (emitProgress) {
    emitProgress(80, 'Formatting output...', { stage: PIPELINE_STAGES.FORMAT });
  }

  // Format output. An empty selection produces an empty document rather than an
  // exception: "nothing to copy here" is an outcome, not a failure.
  const output = await format(files, {
    format: options.format,
    onlyTree: options.onlyTree,
    addLineNumbers: options.addLineNumbers || options.withLineNumbers,
    basePath: basePath,
    instructions: options.instructions,
    showSize: options.showSize,
    prettyPrint: options.prettyPrint,
    allowEmpty: true,
    // Same instance the selection ran under, so a concurrent operation cannot
    // format these files with its own settings.
    config: configInstance,
  });

  const manifest = buildManifest(files, manifestOptions);

  if (emitProgress) {
    emitProgress(95, 'Finalizing...', { stage: PIPELINE_STAGES.FORMAT });
  }

  // Build result
  const result = {
    output,
    outputFormatVersion: versionFor(options.format || 'xml'),
    files,
    manifest,
    stats: {
      totalFiles: files.length,
      duration: Date.now() - startTime,
      totalSize,
      outputSize: Buffer.byteLength(output, 'utf8'),
      ...buildEstimates(files, { actualChars: output.length }),
      ...summaryStats(summary, files),
      ...(scanErrors.length > 0 && { scanErrors: scanErrors.map((e) => e.message) }),
    },
  };

  // Handle side effects (only if explicitly requested in programmatic mode)

  // Write to file if output path specified
  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, 'utf8');
    result.outputPath = outputPath;
  }

  // Display to console if requested
  if (options.display) {
    console.log(output);
  }

  // Stream to stdout if requested
  if (options.stream) {
    process.stdout.write(output);
  }

  // Copy to clipboard if explicitly requested
  if (options.clipboard) {
    try {
      await Clipboard.copyText(output);
    } catch (error) {
      // Don't fail the operation if clipboard copy fails
      result.stats.clipboardError = error.message;
    }
  }

  if (emitProgress) {
    emitProgress(100, 'Complete', { stage: PIPELINE_STAGES.UNKNOWN });
  }

  return result;
}

/**
 * Fold the scan summary into the shape `result.stats` exposes.
 *
 * Shared with `copyStream()` so the two entry points cannot drift on which
 * numbers they surface.
 *
 * @param {Object|null} summary - Summary emitted by the scan, if any
 * @param {Array<Object>} files - Selected files
 * @returns {Object} Stats fragment
 */
export function summaryStats(summary, files) {
  if (!summary) {
    return {
      noFilesMatched: files.length === 0,
      excluded: { total: 0, byReason: {} },
    };
  }

  return {
    noFilesMatched: summary.noFilesMatched,
    excluded: summary.excluded,
    ...(summary.truncated
      ? {
          truncated: true,
          truncatedCount: summary.truncatedCount,
          truncatedBy: summary.truncatedBy,
        }
      : { truncated: false }),
    ...(summary.budgetExceeded ? { budgetExceeded: true } : {}),
    ...(summary.scope ? { scope: summary.scope } : {}),
    ...pickForwardedStats(summary),
  };
}

export default copy;
