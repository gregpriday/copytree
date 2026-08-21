import { EventEmitter } from 'events';
import { ConfigManager } from '../config/ConfigManager.js';
import { PipelineError, ValidationError, isAbortError } from '../utils/errors.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { DEGRADATION_CODES } from './Stage.js';

/**
 * Marks an error as a lifecycle-contract failure rather than a processing one.
 *
 * A Symbol key, so it never reaches a serialized error or a log line —
 * `JSON.stringify` and `Object.keys` both skip symbol properties. It is a
 * routing decision inside this file, not part of the public error shape.
 */
const LIFECYCLE_FAILURE = Symbol('copytree.lifecycleFailure');

/**
 * Tag an error as a lifecycle failure.
 * @param {Error} error - Error to tag
 * @returns {Error} The same error
 */
function asLifecycleFailure(error) {
  error[LIFECYCLE_FAILURE] = true;
  return error;
}

/**
 * Whether an error came from a lifecycle hook or a validator.
 * @param {Error} error - Error to test
 * @returns {boolean} True for a lifecycle-contract failure
 */
function isLifecycleFailure(error) {
  return error?.[LIFECYCLE_FAILURE] === true;
}

/**
 * A content key for a degradation record, for deduplication.
 *
 * @param {{stage?: string, code?: string, message?: string}} entry - Degradation
 * @returns {string} Stable key
 */
function degradationKey(entry) {
  return `${entry?.stage ?? ''}\u0000${entry?.code ?? ''}\u0000${entry?.message ?? ''}`;
}

/**
 * How many files a pipeline value carries, for an event payload.
 *
 * @param {*} value - Pipeline input or output
 * @returns {number} File count, or 1 for a non-collection value
 */
function countOf(value) {
  if (Array.isArray(value)) return value.length;
  return value?.files?.length ?? 1;
}

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
    // Tracked separately from `stageInstances.length`, which a failed `onInit`
    // used to leave partially populated and therefore truthy. `_initializing`
    // closes the window between the first `await` inside `_initializeStages()`
    // and the flag being set, during which a stage could still be appended and
    // would then be instantiated as part of the run already under way.
    this._initialized = false;
    this._initializing = false;

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
      stagesRecovered: 0,
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
    // A pipeline is immutable once it has been initialized. `_initializeStages()`
    // returns early when `stageInstances` is populated, so a stage added after
    // the first run was pushed onto `this.stages` and then never instantiated,
    // never initialized, and never executed — silently. Adding stages to a
    // running pipeline has no legitimate use here, and failing to notice that
    // they did nothing is much worse than being told they cannot be added.
    if (this._initialized || this._initializing) {
      throw new PipelineError(
        'Cannot add stages to a pipeline that has already run',
        'Pipeline.through',
      );
    }

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
    if (this._initialized) return;
    this._initializing = true;

    try {
      await this._buildStages();
      this._initialized = true;
    } finally {
      // Cleared whether or not initialization succeeded. Left set on a failure
      // it would wedge the pipeline permanently: `_initialized` stays false, so
      // nothing is runnable, and `_initializing` stays true, so nothing can be
      // added either.
      this._initializing = false;
    }
  }

  /**
   * Instantiate every stage and run its `onInit`.
   *
   * Split from `_initializeStages()` so the `_initializing` flag can be cleared
   * in one `finally` regardless of how this returns.
   *
   * @private
   */
  async _buildStages() {
    // Create isolated config instance if not provided
    if (!this._configInstance) {
      this._configInstance = await ConfigManager.create();
    }
    // Update context with config instance
    this.context.config = this._configInstance;

    // Built into a local array and committed only once every `onInit` has
    // succeeded. Pushing directly onto `this.stageInstances` meant a failed
    // `onInit` left a partial prefix behind — and because the early return
    // above keyed off that array being non-empty, a second `process()` call
    // skipped initialization entirely and ran the prefix, reporting success
    // for a pipeline that was missing most of its stages.
    const instances = [];

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

      instances.push(stageInstance);

      // Call onInit hook if it exists.
      //
      // Fatal, unconditionally. `onInit` is where a stage resolves its
      // configuration, compiles its patterns, opens its scanner and decides what
      // it is going to do. A stage that failed to initialize and then ran anyway
      // is a stage running on defaults nobody asked for, which is precisely the
      // "looks complete, is not" outcome this pipeline exists to avoid. It used
      // to be a warning.
      if (typeof stageInstance.onInit === 'function') {
        const stageName = this._getStageName(Stage, i);
        try {
          await stageInstance.onInit(this.context);
        } catch (error) {
          if (isAbortError(error)) throw error;
          throw new PipelineError(
            `Stage ${stageName} failed to initialize: ${error.message}`,
            stageName,
            { cause: error },
          );
        }
      }
    }

    this.stageInstances = instances;
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
      inputCount: countOf(input),
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
        resultCount: countOf(result),
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

        // Metadata, not the payload. This event used to carry `input` — which
        // is the entire selection, with every file's content on it. Any
        // embedder that attached a logger to `onEvent` was serializing the
        // whole repository, and a third-party listener saw more than the run
        // it was observing. `stage:debug` carries the raw values for anyone
        // who genuinely needs them.
        this.emit('stage:start', {
          stage: stageName,
          index: i,
          inputCount: countOf(result),
        });
        if (this.listenerCount('stage:debug') > 0) {
          this.emit('stage:debug', { stage: stageName, index: i, phase: 'start', input: result });
        }

        const processMethod = stageInstance.process || stageInstance;

        if (typeof processMethod !== 'function') {
          throw new Error(`Stage ${stageName} does not have a process method`);
        }

        // Call beforeRun hook if it exists.
        //
        // Fatal, like `onInit` and for the same reason: it runs before the
        // output exists, so its failure can change what the output is.
        if (typeof stageInstance.beforeRun === 'function') {
          try {
            await stageInstance.beforeRun(result);
          } catch (hookError) {
            if (isAbortError(hookError)) throw hookError;
            throw asLifecycleFailure(
              new PipelineError(
                `Stage ${stageName} beforeRun hook failed: ${hookError.message}`,
                stageName,
                { cause: hookError },
              ),
            );
          }
        }

        // Validate input before processing if validate method exists.
        //
        // Always fatal. `continueOnError` used to downgrade this to a warning
        // and then call `process()` with the very input that had just been
        // declared invalid — which makes `validate()` a logging function rather
        // than a precondition. A validator that cannot stop the thing it
        // validates is not worth having.
        if (typeof stageInstance.validate === 'function') {
          try {
            await stageInstance.validate(result);
          } catch (error) {
            if (isAbortError(error)) throw error;
            throw asLifecycleFailure(
              error instanceof ValidationError
                ? error
                : new ValidationError(
                    `Stage validation failed: ${error.message}`,
                    stageName,
                    result,
                  ),
            );
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

        result = output;

        // Call afterRun hook if it exists.
        //
        // The one hook that is *not* fatal, and deliberately so: it runs after
        // `process()` has already produced its output, so nothing it does can
        // change what that output contains. Failing the run over a metrics or
        // cleanup hook would discard a correct result. It is still recorded as
        // a degradation rather than logged and forgotten — the line between
        // "not fatal" and "not worth mentioning" is where silent failure lives.
        if (typeof stageInstance.afterRun === 'function') {
          try {
            await stageInstance.afterRun(result);
          } catch (hookError) {
            if (isAbortError(hookError)) throw hookError;
            this.context.logger.warn(
              `Stage ${stageName} afterRun hook failed: ${hookError.message}`,
            );
            result = this._recordDegradation(result, {
              stage: stageName,
              code: DEGRADATION_CODES.STAGE_AFTER_RUN_FAILED,
              message: `${stageName} afterRun hook failed: ${hookError.message}`,
            });
          }
        }

        this.stats.stagesCompleted++;

        this.emit('stage:complete', {
          stage: stageName,
          index: i,
          // Enhanced timing and metrics data
          duration: stageDuration,
          inputSize,
          outputSize,
          memoryUsage: this.stats.perStageMetrics[stageName].memoryUsage,
          timestamp: stageEnd,
        });
        if (this.listenerCount('stage:debug') > 0) {
          this.emit('stage:debug', {
            stage: stageName,
            index: i,
            phase: 'complete',
            output: result,
          });
        }
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

        // A broken precondition is not a stage failure that recovery can
        // reason about. `handleError()` exists to answer "processing did not
        // work"; it has nothing useful to say about "the input was invalid" or
        // "setup did not happen", and letting `continueOnError` step over
        // either is how a validator became a logging function.
        if (isLifecycleFailure(error)) {
          this.stats.stagesFailed++;
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
                recoveredCount: countOf(recoveredResult),
              });
              // Recorded on the result, not only emitted. An event is available
              // to whoever is listening at the time; this has to survive to the
              // end of the run, because "the output is not what you asked for"
              // is a fact about the result rather than a moment during it.
              // `carriedOver` is the degradations recorded *before* this
              // stage. A `handleError()` is free to build a fresh result rather
              // than spreading its input, and several do — which silently
              // erased every degradation an earlier stage had recorded, so a
              // run could recover twice and report only the second.
              const previous = Array.isArray(result?.stats?.degradations)
                ? result.stats.degradations
                : [];
              // Compared by content, not by identity. A `handleError()` that
              // rebuilds its degradation entries — spreading them, or mapping
              // over the list — produces equal-but-distinct objects, and an
              // identity check would carry every one of them over a second
              // time.
              const alreadyPresent = new Set(
                (recoveredResult?.stats?.degradations || []).map(degradationKey),
              );
              const carriedOver = previous.filter(
                (entry) => !alreadyPresent.has(degradationKey(entry)),
              );

              result = this._recordDegradation(
                recoveredResult,
                {
                  stage: stageName,
                  code: error.code || DEGRADATION_CODES.STAGE_RECOVERED,
                  message: `${stageName} failed: ${error.message}`,
                },
                carriedOver,
              );
              // Counted. A recovered stage was neither completed nor failed, so
              // it fell out of `successRate` entirely: a run in which every
              // stage recovered reported `null`, and one success beside one
              // recovery reported 1 — "every stage succeeded", about a run
              // where one did not.
              this.stats.stagesRecovered++;
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
   * Append a structured degradation record to a pipeline result.
   *
   * One shape, one place. A degradation says the run completed but not as
   * asked. Callers branch on `stats.degradations.length`; `--strict` turns a
   * non-empty list into a policy failure.
   *
   * @private
   * @param {Object} result - Stage output to annotate
   * @param {{stage: string, code: string, message: string}} degradation - What could not be done
   * @returns {Object} `result` with the degradation recorded on its stats
   */
  _recordDegradation(result, degradation, carriedOver = []) {
    // Only a plain object carries stats. A stage is free to return an array or
    // a scalar — `_processParallel` passes arrays through, and the Laravel-style
    // `send().through()` form imposes no shape at all — and spreading one of
    // those into an object literal silently replaced the value with
    // `{ stats: ... }`. Losing the result to record a note about the result is
    // the wrong trade; the degradation is logged instead.
    // A genuinely plain object, checked by prototype. `typeof x === 'object'`
    // is also true of a Buffer, a Date, a Map and every class instance, and
    // spreading one of those into an object literal throws away its prototype
    // and its internal state — so a stage returning a Buffer would have had it
    // silently replaced by `{ stats: ... }`.
    // The null check comes first: `Object.getPrototypeOf(undefined)` throws,
    // and a stage returning `undefined` with a failing `afterRun` would have
    // replaced the degradation with a TypeError.
    const isObject = typeof result === 'object' && result !== null;
    const prototype = isObject ? Object.getPrototypeOf(result) : undefined;
    const isPlainObject = isObject && (prototype === Object.prototype || prototype === null);

    if (!isPlainObject) {
      this.context.logger.warn(`${degradation.stage}: ${degradation.message}`);
      return result;
    }

    return {
      ...result,
      stats: {
        ...(result.stats || {}),
        degradations: [...carriedOver, ...(result.stats?.degradations || []), degradation],
      },
    };
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
    const totalStages =
      this.stats.stagesCompleted + this.stats.stagesFailed + this.stats.stagesRecovered;
    if (totalStages > 0 && this.stats.totalStageTime > 0) {
      this.stats.averageStageTime = this.stats.totalStageTime / totalStages;
    }

    return {
      ...this.stats,
      // `null` before the run starts, not a number. `Date.now() - null` is
      // `Date.now()`, so a pipeline that had never run reported a duration of
      // fifty-six years; and a success rate of 1 for zero stages said every
      // stage had succeeded when none had been attempted. Both read as data.
      duration:
        this.stats.startTime === null
          ? null
          : (this.stats.endTime ?? Date.now()) - this.stats.startTime,
      successRate: totalStages > 0 ? this.stats.stagesCompleted / totalStages : null,
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
