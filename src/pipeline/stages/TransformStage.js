import Stage from '../Stage.js';
import { CacheService } from '../../services/CacheService.js';
import { generateTransformCacheKey } from '../../utils/fileHash.js';
import { TransformError } from '../../utils/errors.js';
import path from 'path';
import appConfig from '../../../config/app.js';
import { logger } from '../../utils/logger.js';

class TransformStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.registry = options.registry;
    this.transformerConfig = options.transformers || {};
    this.maxConcurrency = options.maxConcurrency || appConfig.maxConcurrency || 5;
    this.noCache = options.noCache;

    // Initialize cache for transformations (disabled if noCache is true)
    // Only create cache if not disabled
    this.cache = options.noCache
      ? null
      : options.cache ||
        CacheService.create('transformations', {
          enabled: options.cacheEnabled ?? true,
          defaultTtl: 86400, // 24 hours
        });
  }

  async process(input) {
    this.log(`Transforming ${input.files.length} files`, 'debug');
    return this.processWithDisplay(input);
  }

  // New method that handles display of active transformations
  async processWithDisplay(input) {
    const { files } = input;
    const startTime = Date.now();
    let transformCount = 0;
    let errorCount = 0;
    // logger is already imported at the top

    // Import p-limit dynamically (v7+ uses default export)
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(this.maxConcurrency);

    // First pass: identify files that need transformation
    const filesToTransform = [];
    const cachedResults = new Map();
    let hasHeavyTransformers = false;

    for (const file of files) {
      const transformer = this.getTransformerForFile(file);
      if (!transformer) continue;

      const transformerName = transformer.constructor.name;
      const cacheKey = generateTransformCacheKey(
        file,
        transformerName,
        this.transformerConfig[transformerName],
      );

      // Only check cache for heavy transformers
      if (transformer.isHeavy && this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          cachedResults.set(file, cached);
          if (cached.transformed) transformCount++;
          continue;
        }
      }

      filesToTransform.push({ file, transformer, cacheKey });
      // Check if any transformer is heavy
      if (transformer.isHeavy) {
        hasHeavyTransformers = true;
      }
    }

    // Show multi-line display if we have heavy transformers
    const activeTransforms = filesToTransform.length;
    const showMultiLine = hasHeavyTransformers && activeTransforms > 0;
    let activeFiles = [];
    let completedCount = 0;

    // Pre-index filesToTransform by file for O(1) lookup instead of O(n)
    const transformMap = new Map(filesToTransform.map((info) => [info.file, info]));

    // Process files with active transform display
    const transformPromises = files.map((file) =>
      limit(async () => {
        // Check if this file is cached
        if (cachedResults.has(file)) {
          return cachedResults.get(file);
        }

        // Find the transform info for this file using O(1) Map lookup
        const transformInfo = transformMap.get(file);
        if (!transformInfo) {
          return file; // No transformation needed
        }

        const { transformer, cacheKey } = transformInfo;
        const filename = path.basename(file.path);

        try {
          // Update display if showing multi-line
          if (showMultiLine) {
            activeFiles.push(filename);
            updateTransformDisplay();
          }

          // Perform transformation
          const transformed = await transformer.transform(file);

          if (transformed) {
            if (transformed.transformed) {
              transformCount++;
            }

            // Cache the result only for heavy transformers
            if (transformer.isHeavy && this.cache) {
              await this.cache.set(cacheKey, transformed);
            }

            // Update display
            completedCount++;
            if (showMultiLine) {
              activeFiles = activeFiles.filter((f) => f !== filename);
              updateTransformDisplay();
            }

            return transformed;
          }

          return file;
        } catch (error) {
          errorCount++;
          this.log(`Failed to transform ${file.path}: ${error.message}`, 'warn');

          // Update display on error
          if (showMultiLine) {
            activeFiles = activeFiles.filter((f) => f !== filename);
            updateTransformDisplay();
          }

          return {
            ...file,
            content: `[Transform error: ${error.message}]`,
            error: error.message,
            transformed: false,
          };
        }
      }),
    );

    // Helper function to update the multi-line display
    const updateTransformDisplay = () => {
      if (!process.stdout.isTTY) return;

      // Clear previous lines
      const linesToClear = Math.min(activeFiles.length + 1, this.maxConcurrency + 1);
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\x1b[2K'); // Clear line
        if (i < linesToClear - 1) {
          process.stdout.write('\x1b[1A'); // Move up
        }
        process.stdout.write('\r'); // Return to start
      }

      // Write current status
      logger.updateSpinner(`Transforming (${completedCount}/${activeTransforms})`);

      // Write active files
      activeFiles.slice(0, this.maxConcurrency).forEach((file) => {
        process.stdout.write(`\n  → ${file}`);
      });
    };

    // Start display if needed
    if (showMultiLine && activeTransforms > 0) {
      logger.updateSpinner(`Transforming (0/${activeTransforms})`);
    }

    // Wait for all transformations to complete
    const transformedFiles = await Promise.all(transformPromises);

    // Clear multi-line display if it was shown
    if (showMultiLine && process.stdout.isTTY) {
      const linesToClear = Math.min(activeFiles.length + 1, this.maxConcurrency + 1);
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\x1b[2K\r'); // Clear line and return to start
        if (i < linesToClear - 1) {
          process.stdout.write('\x1b[1A'); // Move up
        }
      }
      logger.updateSpinner('Processing files');
    }

    // Flush any batch transformers
    if (this.registry) {
      const transformers = this.registry.getAllTransformers();
      for (const transformer of transformers) {
        if (typeof transformer.flush === 'function') {
          this.log(`Flushing batch transformer: ${transformer.constructor.name}`, 'debug');
          await transformer.flush();
        }
      }
    }

    this.log(
      `Transformed ${transformCount} files (${errorCount} errors) in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      files: transformedFiles,
      stats: {
        ...input.stats,
        transformedCount: transformCount,
        transformErrors: errorCount,
      },
    };
  }

  /**
   * Handle errors during transformation with recovery mechanism
   *
   * This implementation provides graceful recovery for transformation failures,
   * particularly useful for AI-powered transformers that may fail intermittently.
   *
   * @param {Error} error - Error that occurred during transformation
   * @param {Object} input - Input data containing files to transform
   * @returns {Promise<Object>} - Recovered result with error logging
   */
  async handleError(error, input) {
    this.log(`Transform stage encountered error: ${error.message}`, 'warn');

    // Check if this is a recoverable error type
    const isRecoverable = this._isRecoverableError(error);

    if (isRecoverable && input && input.files) {
      this.log('Attempting recovery by skipping transformation for affected files', 'info');

      // Return input with transformation skipped but files preserved
      return {
        ...input,
        stats: {
          ...input.stats,
          transformedCount: 0,
          transformErrors: input.files.length,
          recoveredFromError: true,
        },
      };
    }

    // If not recoverable, rethrow the error
    throw error;
  }

  /**
   * Check if an error is recoverable for transformation stage
   * @private
   */
  _isRecoverableError(error) {
    // Recoverable errors include transformation failures, network issues, etc.
    const recoverableTypes = [
      'TransformError',
      'ENOTFOUND', // Network errors
      'ETIMEDOUT', // Timeout errors
      'ECONNRESET', // Connection reset
    ];

    return recoverableTypes.some(
      (type) => error.name === type || error.code === type || error.message.includes(type),
    );
  }

  getTransformerForFile(file) {
    if (!this.registry) {
      return null;
    }

    try {
      const transformer = this.registry.getForFile(file);

      // Check if transformer is enabled in config
      const transformerName = transformer.constructor.name;
      const config =
        this.transformerConfig[transformerName] ||
        this.transformerConfig[transformerName.toLowerCase()] ||
        this.transformerConfig[transformerName.replace(/Transformer$/, '').toLowerCase()];

      if (config && config.enabled === false) {
        return null;
      }

      // Set noCache option on transformer if specified
      if (this.noCache) {
        transformer.cacheEnabled = false;
      }

      return transformer;
    } catch (_error) {
      // No transformer found, return null
      return null;
    }
  }
}

export default TransformStage;
