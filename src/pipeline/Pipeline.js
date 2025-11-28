import { EventEmitter } from 'events';
import { ConfigManager } from '../config/ConfigManager.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

class Pipeline extends EventEmitter {
  /**
   * Create a new Pipeline instance
   * @param {Object} options - Pipeline options
   * @param {ConfigManager} [options.config] - ConfigManager instance for isolated configuration.
   *   If not provided, an isolated instance will be created during initialization.
   *   This enables concurrent pipeline operations with different configurations.
   * @param {boolean} [options.continueOnError] - Continue processing after stage failures
   * @param {boolean} [options.emitProgress] - Emit progress events
   * @param {boolean} [options.parallel=false] - Enable parallel stage processing
   * @param {number} [options.maxConcurrency] - Maximum concurrent operations
   */
  constructor(options = {}) {
    super();

    this.stages = [];
    this.stageInstances = []; // Track instantiated stages for lifecycle hooks

    // Store config instance if provided, otherwise will be created during init
    this._configInstance = options.config || null;

    this.options = {
      continueOnError: options.continueOnError, // Will be lazy-loaded from config if not provided
      emitProgress: options.emitProgress, // Will be lazy-loaded from config if not provided
      parallel: options.parallel ?? false,
      maxConcurrency: options.maxConcurrency, // Will be lazy-loaded from config if not provided
      ...options,
    };

    this.stats = {
      startTime: null,
      endTime: null,
      stagesCompleted: 0,
      stagesFailed: 0,
      errors: [],
      perStageTimings: {},
      perStageMetrics: {},
      totalStageTime: 0,
      averageStageTime: 0,
    };

    // Create pipeline context for stages
    // Note: config will be populated during initialization if not provided
    this.context = {
      logger: logger?.child?.('Pipeline') || {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        success: () => {},
      },
      options: this.options,
      stats: this.stats,
      config: this._configInstance, // May be null until _initializeStages runs
      pipeline: this, // Reference to pipeline for event emission
    };
  }

  /**
   * Add stages to the pipeline
   * @param {Array|Function} stages - Stage class(es) or function(s) to add
   * @returns {Pipeline} - Returns this for chaining
   */
  through(stages) {
    if (!Array.isArray(stages)) {
      stages = [stages];
    }

    this.stages.push(...stages);
    return this;
  }

  /**
   * Initialize all stages and call their onInit hooks
   * This method should be called after all stages are added via through()
   * Creates an isolated ConfigManager instance if not provided via options.
   * @private
   */
  async _initializeStages() {
    if (this.stageInstances.length > 0) {
      // Already initialized
      return;
    }

    // Create isolated config instance if not provided
    if (!this._configInstance) {
      this._configInstance = await ConfigManager.create();
    }
    // Update context with config instance
    this.context.config = this._configInstance;

    // Instantiate all stages and call onInit hooks
    for (let i = 0; i < this.stages.length; i++) {
      const Stage = this.stages[i];
      let stageInstance;

      if (typeof Stage === 'function' && !Stage.prototype) {
        // It's a plain function, use it directly
        stageInstance = Stage;
      } else if (typeof Stage === 'object' && Stage.process) {
        // It's already an instance with a process method
        stageInstance = Stage;
      } else {
        // It's a constructor, instantiate it with pipeline reference
        stageInstance = new Stage({ ...this.options, pipeline: this });
      }

      this.stageInstances.push(stageInstance);

      // Call onInit hook if it exists
      if (typeof stageInstance.onInit === 'function') {
        try {
          await stageInstance.onInit(this.context);
        } catch (error) {
          // Log initialization error but don't fail pipeline creation
          this.context.logger.warn(
            `Stage ${this._getStageName(Stage, i)} onInit hook failed: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Process input through all pipeline stages
   * @param {*} input - Initial input to process
   * @returns {Promise<*>} - Final processed output
   */
  async process(input) {
    // Initialize stages if not already done (also creates isolated config if needed)
    await this._initializeStages();

    // Refresh options from config now that we are async and likely fully loaded
    // Only override if not explicitly provided in constructor options
    // Use the isolated config instance, not the singleton
    const cfg = this._configInstance;
    if (this.options.continueOnError === undefined) {
      this.options.continueOnError = cfg.get('pipeline.continueOnError', false);
    }
    if (this.options.emitProgress === undefined) {
      this.options.emitProgress = cfg.get('pipeline.emitProgress', true);
    }
    if (this.options.maxConcurrency === undefined) {
      this.options.maxConcurrency = cfg.get('app.maxConcurrency', 5);
    }
    // Update context options as well
    this.context.options = this.options;

    this.stats.startTime = Date.now();
    this.stats.stagesCompleted = 0;
    this.stats.stagesFailed = 0;
    this.stats.errors = [];
    this.stats.perStageTimings = {};
    this.stats.perStageMetrics = {};
    this.stats.totalStageTime = 0;
    this.stats.averageStageTime = 0;

    this.emit('pipeline:start', {
      input,
      stages: this.stages.length,
      options: this.options,
    });

    let result = input;

    try {
      if (this.options.parallel) {
        result = await this._processParallel(result);
      } else {
        result = await this._processSequential(result);
      }

      this.stats.endTime = Date.now();

      this.emit('pipeline:complete', {
        result,
        stats: this.getStats(),
      });

      return result;
    } catch (error) {
      this.stats.endTime = Date.now();

      this.emit('pipeline:error', {
        error,
        stats: this.getStats(),
      });

      throw error;
    }
  }

  /**
   * Process stages sequentially
   * @private
   */
  async _processSequential(input) {
    let result = input;

    for (let i = 0; i < this.stageInstances.length; i++) {
      const stageInstance = this.stageInstances[i];
      const Stage = this.stages[i]; // For name resolution
      const stageName = this._getStageName(Stage, i);

      try {
        this.emit('stage:start', {
          stage: stageName,
          index: i,
          input: result,
        });

        const processMethod = stageInstance.process || stageInstance;

        if (typeof processMethod !== 'function') {
          throw new Error(`Stage ${stageName} does not have a process method`);
        }

        // Call beforeRun hook if it exists
        if (typeof stageInstance.beforeRun === 'function') {
          try {
            await stageInstance.beforeRun(result);
          } catch (hookError) {
            this.context.logger.warn(
              `Stage ${stageName} beforeRun hook failed: ${hookError.message}`,
            );
            // Continue processing - hook failures shouldn't stop pipeline
          }
        }

        // Validate input before processing if validate method exists
        if (typeof stageInstance.validate === 'function') {
          try {
            await stageInstance.validate(result);
          } catch (error) {
            const validationError =
              error instanceof ValidationError
                ? error
                : new ValidationError(
                    `Stage validation failed: ${error.message}`,
                    stageName,
                    result,
                  );

            if (this.options.continueOnError) {
              console.warn(
                `[Pipeline] Validation warning in ${stageName}: ${validationError.message}`,
              );
            } else {
              throw validationError;
            }
          }
        }

        // Capture timing and metrics for this stage
        const stageStart = Date.now();
        const stageStartMemory = process.memoryUsage();
        const inputSize = result?.files?.length || (Array.isArray(result) ? result.length : 1);

        // Execute main stage processing
        const output = await processMethod.call(stageInstance, result);

        const stageEnd = Date.now();
        const stageEndMemory = process.memoryUsage();
        const stageDuration = stageEnd - stageStart;
        const outputSize = output?.files?.length || (Array.isArray(output) ? output.length : 1);

        // Store stage timings and metrics
        this.stats.perStageTimings[stageName] = stageDuration;
        this.stats.perStageMetrics[stageName] = {
          inputSize,
          outputSize,
          memoryUsage: {
            before: stageStartMemory,
            after: stageEndMemory,
            delta: {
              rss: stageEndMemory.rss - stageStartMemory.rss,
              heapUsed: stageEndMemory.heapUsed - stageStartMemory.heapUsed,
              heapTotal: stageEndMemory.heapTotal - stageStartMemory.heapTotal,
            },
          },
          timestamp: stageEnd,
        };

        // Update totals
        this.stats.totalStageTime += stageDuration;

        // Call afterRun hook if it exists
        if (typeof stageInstance.afterRun === 'function') {
          try {
            await stageInstance.afterRun(output);
          } catch (hookError) {
            this.context.logger.warn(
              `Stage ${stageName} afterRun hook failed: ${hookError.message}`,
            );
            // Continue processing - hook failures shouldn't stop pipeline
          }
        }

        result = output;
        this.stats.stagesCompleted++;

        this.emit('stage:complete', {
          stage: stageName,
          index: i,
          output: result,
          // Enhanced timing and metrics data
          duration: stageDuration,
          inputSize,
          outputSize,
          memoryUsage: this.stats.perStageMetrics[stageName].memoryUsage,
          timestamp: stageEnd,
        });
      } catch (error) {
        // Call onError hook if it exists (before handleError)
        if (typeof stageInstance.onError === 'function') {
          try {
            await stageInstance.onError(error, result);
          } catch (hookError) {
            this.context.logger.warn(
              `Stage ${stageName} onError hook failed: ${hookError.message}`,
            );
            // Continue with original error handling
          }
        }

        // Try stage-specific error handling
        if (typeof stageInstance.handleError === 'function') {
          try {
            const recoveredResult = await stageInstance.handleError(error, result);
            if (recoveredResult !== undefined) {
              // Stage handled the error and provided recovery
              this.emit('stage:recover', {
                stage: stageName,
                index: i,
                originalError: error,
                recoveredResult,
              });
              result = recoveredResult;
              continue; // Continue with recovered result
            }
          } catch (handlerError) {
            // Handler failed, continue with original handling
            this.context.logger.warn(
              `Recovery handler for ${stageName} failed: ${handlerError.message}`,
            );
            // Use original issue instead of handler issue
          }
        }

        // Existing error handling continues here...
        this.stats.stagesFailed++;
        this.stats.errors.push({
          stage: stageName,
          error: error.message,
          stack: error.stack,
        });

        this.emit('stage:error', {
          stage: stageName,
          index: i,
          error,
        });

        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }

    return result;
  }

  /**
   * Process stages in parallel (when applicable)
   * @private
   */
  async _processParallel(input) {
    const chunks = Array.isArray(input) ? input : [input];
    const results = [];

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += this.options.maxConcurrency) {
      const batch = chunks.slice(i, i + this.options.maxConcurrency);

      const batchResults = await Promise.all(
        batch.map(async (chunk, _index) => {
          try {
            return await this._processSequential(chunk);
          } catch (error) {
            if (!this.options.continueOnError) {
              throw error;
            }
            return null;
          }
        }),
      );

      results.push(...batchResults);
    }

    return Array.isArray(input) ? results : results[0];
  }

  /**
   * Get stage name for logging
   * @private
   */
  _getStageName(Stage, index) {
    if (typeof Stage === 'string') return Stage;
    if (Stage.name) return Stage.name;
    if (Stage.constructor && Stage.constructor.name) return Stage.constructor.name;
    return `Stage${index + 1}`;
  }

  /**
   * Get pipeline statistics
   * @returns {Object} Pipeline stats
   */
  getStats() {
    // Calculate average stage time if we have completed stages
    const totalStages = this.stats.stagesCompleted + this.stats.stagesFailed;
    if (totalStages > 0 && this.stats.totalStageTime > 0) {
      this.stats.averageStageTime = this.stats.totalStageTime / totalStages;
    }

    return {
      ...this.stats,
      duration: this.stats.endTime
        ? this.stats.endTime - this.stats.startTime
        : Date.now() - this.stats.startTime,
      successRate: totalStages > 0 ? this.stats.stagesCompleted / totalStages : 1,
    };
  }

  /**
   * Create a new pipeline instance
   * @static
   * @param {Object} options - Pipeline options
   * @returns {Pipeline} New pipeline instance
   */
  static create(options) {
    return new Pipeline(options);
  }

  /**
   * Send data through pipeline stages (Laravel-style)
   * @param {*} passable - Data to process
   * @returns {Object} Fluent interface
   */
  send(passable) {
    const self = this;
    return {
      through(stages) {
        self.through(stages);
        return {
          async then(callback) {
            const result = await self.process(passable);
            if (callback) {
              return callback(result);
            }
            return result;
          },
          async thenReturn() {
            return await self.process(passable);
          },
        };
      },
    };
  }
}

export default Pipeline;
