import { EventEmitter } from 'events';
import { ConfigManager } from '../config/ConfigManager.js';
import { ValidationError, isAbortError } from '../utils/errors.js';
import { logger as defaultLogger } from '../utils/logger.js';

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

    // Per-stage heap snapshots are diagnostic, not operational: only
    // `--profile`, `COPYTREE_PERFORMANCE` and the benchmark harness read them.
    // Opt in rather than pay for them on every run.
    this.measureMemory =
      options.measureMemory ?? (process.env.COPYTREE_PERFORMANCE === 'true' || false);

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
    // A quiet pipeline is quiet all the way through. Gating only `Stage.log()`
    // left the pipeline's own recovery warnings writing to the host's terminal,
    // which is the same problem one level up.
    const silent = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      child: () => silent,
    };

    this.context = {
      logger: options.quiet === true ? silent : defaultLogger?.child?.('Pipeline') || { ...silent },
      options: this.options,
      stats: this.stats,
      config: this._configInstance, // May be null until _initializeStages runs
      pipeline: this, // Reference to pipeline for event emission
      // Stages write nothing to the terminal when set. The programmatic API
      // turns this on: an embedder's stdout belongs to the embedder.
      quiet: this.options.quiet === true,
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

      // Both entry points build their stages as instances and hand them over
      // already constructed, so the constructor's `pipeline` option never
      // reached them. `Stage.log()` guards on this reference, which meant
      // `stage:log` was listed as part of the event contract and never fired
      // for a single production run.
      if (stageInstance && typeof stageInstance === 'object' && !stageInstance.pipeline) {
        stageInstance.pipeline = this;
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
        // Checked between stages as well as inside them. A stage that does not
        // observe the signal itself still cannot start after the run has been
        // cancelled, which bounds how long a Ctrl+C takes to be honoured to the
        // duration of one stage rather than the whole pipeline.
        this.options.signal?.throwIfAborted();

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

            if (this.options.continueOnError && !stageInstance.fatal) {
              this.context.logger.warn(
                `[Pipeline] Validation warning in ${stageName}: ${validationError.message}`,
              );
            } else {
              throw validationError;
            }
          }
        }

        // Capture timing and metrics for this stage.
        //
        // `process.memoryUsage()` walks the V8 heap statistics and is far from
        // free; it ran twice per stage on every run, to fill in a field only
        // `--profile` and the benchmark harness ever read. Timing stays
        // unconditional — it is a single clock read and the reporter uses it.
        const stageStart = Date.now();
        const stageStartMemory = this.measureMemory ? process.memoryUsage() : null;
        const inputSize = result?.files?.length || (Array.isArray(result) ? result.length : 1);

        // Execute main stage processing
        const output = await processMethod.call(stageInstance, result);

        const stageEnd = Date.now();
        const stageEndMemory = this.measureMemory ? process.memoryUsage() : null;
        const stageDuration = stageEnd - stageStart;
        const outputSize = output?.files?.length || (Array.isArray(output) ? output.length : 1);

        // Store stage timings and metrics
        this.stats.perStageTimings[stageName] = stageDuration;
        this.stats.perStageMetrics[stageName] = {
          inputSize,
          outputSize,
          memoryUsage:
            stageStartMemory && stageEndMemory
              ? {
                  before: stageStartMemory,
                  after: stageEndMemory,
                  delta: {
                    rss: stageEndMemory.rss - stageStartMemory.rss,
                    heapUsed: stageEndMemory.heapUsed - stageStartMemory.heapUsed,
                    heapTotal: stageEndMemory.heapTotal - stageStartMemory.heapTotal,
                  },
                }
              : null,
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
        // Cancellation is not a stage failure and is never recoverable: the
        // caller asked the run to stop, so stop. Without this, `continueOnError`
        // marches every remaining stage through an aborted result and turns a
        // cancel into a stream of spurious recovery warnings.
        if (isAbortError(error)) {
          this.stats.endTime = Date.now();
          this.emit('stage:error', { stage: stageName, index: i, error });
          throw error;
        }

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
              // Recorded on the result, not only emitted. An event is available
              // to whoever is listening at the time; this has to survive to the
              // end of the run, because "the output is not what you asked for"
              // is a fact about the result rather than a moment during it.
              result = {
                ...recoveredResult,
                stats: {
                  ...(recoveredResult.stats || {}),
                  degradations: [
                    ...(recoveredResult.stats?.degradations || []),
                    { stage: stageName, message: `${stageName} failed: ${error.message}` },
                  ],
                },
              };
              continue; // Continue with recovered result
            }
          } catch (handlerError) {
            // Handler failed, continue with original handling.
            //
            // Logged at debug, not warn: when the stage is fatal the original
            // error is about to be rethrown and reported properly, and a
            // handler that declined to recover is a detail of that one failure
            // rather than a second thing that went wrong. Saying it twice, in
            // two different vocabularies, makes the real message harder to find.
            this.context.logger.debug(
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

        // A fatal stage overrides continueOnError. Recovering past one produces
        // output that looks complete and is not — the single outcome a caller
        // has no way to detect.
        if (!this.options.continueOnError || stageInstance.fatal) {
          throw error;
        }
      }
    }

    return result;
  }

  /**
   * Process stages in parallel (when applicable)
   *
   * Errors are not caught here. `_processSequential` has already applied the
   * `continueOnError` / `fatal` policy, so anything reaching this point is an
   * error it deliberately chose to propagate — a fatal stage or a cancellation.
   * Swallowing it and substituting `null` undid that decision and reinstated
   * exactly the "looks successful, is not" outcome the fatal flag exists to
   * prevent.
   *
   * @private
   */
  async _processParallel(input) {
    const chunks = Array.isArray(input) ? input : [input];
    const results = [];

    // Process chunks in batches
    for (let i = 0; i < chunks.length; i += this.options.maxConcurrency) {
      const batch = chunks.slice(i, i + this.options.maxConcurrency);

      const batchResults = await Promise.all(
        batch.map(async (chunk) => await this._processSequential(chunk)),
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
