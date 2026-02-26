import { scan } from './scan.js';
import { formatStream } from './formatStream.js';
import { ValidationError } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * @typedef {import('./scan.js').ScanOptions} ScanOptions
 * @typedef {import('./format.js').FormatOptions} FormatOptions
 */

/**
 * @typedef {Object} CopyStreamOptions
 * @property {'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif'} [format='xml'] - Output format
 * @property {boolean} [onlyTree=false] - Only include file tree, no content
 * @property {boolean} [addLineNumbers=false] - Add line numbers to file content
 * @property {string} [instructions] - Instructions to include in output
 * @property {boolean} [showSize=false] - Show file sizes in tree
 * @property {boolean} [prettyPrint=true] - Pretty print JSON output
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration
 * @property {Function} [onProgress] - Progress callback function
 */

/**
 * Stream copy operation that yields formatted output chunks incrementally.
 * This prevents UI freezing in applications when processing large codebases
 * by yielding output as it's generated instead of buffering everything in memory.
 *
 * IMPORTANT: Unlike copy(), this function streams output incrementally.
 * - Memory efficient: Only one file's content in memory at a time
 * - Non-blocking: Yields chunks as they're ready
 * - Concatenated output equals copy() output for same inputs
 *
 * @param {string} basePath - Path to directory to copy
 * @param {ScanOptions & CopyStreamOptions} [options={}] - Combined options
 * @returns {AsyncGenerator<string>} - Yields formatted output chunks
 * @throws {ValidationError} If parameters are invalid
 *
 * @example
 * // Stream to file (Electron)
 * import { copyStream } from 'copytree';
 * import { createWriteStream } from 'fs';
 *
 * const stream = createWriteStream('output.xml');
 * for await (const chunk of copyStream('./src')) {
 *   stream.write(chunk);
 * }
 * stream.end();
 *
 * @example
 * // Stream to string with progress
 * let output = '';
 * for await (const chunk of copyStream('./large-repo', { format: 'json' })) {
 *   output += chunk;
 * }
 *
 * @example
 * // Early termination
 * for await (const chunk of copyStream('./src')) {
 *   if (output.length > 1000000) {
 *     break; // Stop streaming if output too large
 *   }
 *   process.stdout.write(chunk);
 * }
 */
export async function* copyStream(basePath, options = {}) {
  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'copyStream', basePath);
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
    );
  }

  // Create scan async generator with config for isolation
  const filesGenerator = scan(basePath, {
    ...options,
    config: configInstance,
  });

  // Stream formatted output
  yield* formatStream(filesGenerator, {
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
}

export default copyStream;
