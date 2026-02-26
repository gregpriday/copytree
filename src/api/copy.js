import { scan } from './scan.js';
import { format } from './format.js';
import { ValidationError } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
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
 * @property {boolean} [dryRun=false] - Preview without processing
 * @property {boolean} [verbose=false] - Verbose error output
 * @property {number} [charLimit] - Character limit per file
 * @property {string} [instructions] - Instructions to include in output
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration.
 *   If not provided, an isolated instance will be created. This enables concurrent
 *   copy operations with different configurations.
 * @property {Function} [onProgress] - Progress callback ({ percent, message }).
 *   Called periodically during copy with normalized progress updates (0-100%).
 *   Scan phase covers 0-80%, formatting 80-100%.
 * @property {number} [progressThrottleMs=100] - Minimum ms between progress emissions.
 */

/**
 * @typedef {Object} CopyResult
 * @property {string} output - Formatted output string
 * @property {Array<FileResult>} files - Array of file results
 * @property {Object} stats - Processing statistics
 * @property {number} stats.totalFiles - Total number of files processed
 * @property {number} stats.duration - Processing duration in milliseconds
 * @property {number} stats.totalSize - Total size of files in bytes
 * @property {Object} [stats.secretsGuard] - Secrets detection summary (if enabled)
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
 * // Copy with all options
 * const result = await copy('./src', {
 *   format: 'json',
 *   filter: ['**\/*.js'],
 *   exclude: ['**\/*.test.js'],
 *   modified: true,
 *   output: './output.json',
 *   clipboard: true,
 *   display: true
 * });
 *
 * @example
 * // Dry run to preview
 * const result = await copy('./src', {
 *   dryRun: true
 * });
 * console.log(`Would process ${result.stats.totalFiles} files`);
 */
export async function copy(basePath, options = {}) {
  const startTime = Date.now();

  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'copy', basePath);
  }

  // Create isolated config instance for this operation if not provided
  // This enables concurrent copy operations with different configurations
  const configInstance = options.config || (await ConfigManager.create());

  // Build progress wrapper: scan gets 0-80%, format gets 80-100%
  const { onProgress, progressThrottleMs } = options;
  let scanProgress = null;
  let lastEmittedPercent = -1;

  /**
   * Emit progress with a monotonic guard so percent never decreases.
   * Swallows exceptions so a buggy callback never breaks the operation.
   */
  const emitProgress = onProgress
    ? (percent, message) => {
        const clamped = Math.max(percent, lastEmittedPercent);
        lastEmittedPercent = clamped;
        try {
          onProgress({ percent: clamped, message });
        } catch {
          // Swallow callback exceptions
        }
      }
    : null;

  if (emitProgress) {
    emitProgress(0, 'Starting...');
    scanProgress = (progress) => {
      // Scale scan progress to 0-80%
      emitProgress(Math.round(progress.percent * 0.8), progress.message);
    };
  }

  // Handle dry run
  if (options.dryRun) {
    // For dry run, collect file list without content
    const files = [];
    for await (const file of scan(basePath, {
      ...options,
      config: configInstance,
      includeContent: false,
      transform: false,
      onProgress: scanProgress,
      progressThrottleMs,
    })) {
      files.push(file);
    }

    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    if (emitProgress) {
      emitProgress(100, 'Complete');
    }

    return {
      output: '',
      files: files,
      stats: {
        totalFiles: files.length,
        duration: Date.now() - startTime,
        totalSize: totalSize,
        dryRun: true,
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
    })) {
      files.push(file);
    }
  } catch (error) {
    // Collect scan errors but continue if we have some files
    scanErrors.push(error);
    if (files.length === 0) {
      throw error;
    }
  }

  // Calculate stats
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

  if (emitProgress) {
    emitProgress(80, 'Formatting output...');
  }

  // Format output
  const output = await format(files, {
    format: options.format,
    onlyTree: options.onlyTree,
    addLineNumbers: options.addLineNumbers || options.withLineNumbers,
    basePath: basePath,
    instructions: options.instructions,
    showSize: options.showSize,
    prettyPrint: options.prettyPrint,
  });

  if (emitProgress) {
    emitProgress(95, 'Finalizing...');
  }

  // Build result
  const result = {
    output,
    files,
    stats: {
      totalFiles: files.length,
      duration: Date.now() - startTime,
      totalSize,
      outputSize: Buffer.byteLength(output, 'utf8'),
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
      await Clipboard.copy(output);
    } catch (error) {
      // Don't fail the operation if clipboard copy fails
      result.stats.clipboardError = error.message;
    }
  }

  if (emitProgress) {
    emitProgress(100, 'Complete');
  }

  return result;
}

export default copy;
