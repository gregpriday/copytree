import { logger as defaultLogger } from '../utils/logger.js';

/**
 * Base class for pipeline stages
 * All pipeline stages should extend this class
 */
class Stage {
  /**
   * Create a new Stage instance
   * @param {Object} options - Stage options
   * @param {Object} [options.pipeline] - Reference to parent pipeline for event emission
   * @param {Object} [options.config] - ConfigManager instance (optional, will be set via onInit context)
   */
  constructor(options = {}) {
    this.options = options;
    // Config is now provided via the pipeline context in onInit()
    // For backward compatibility, accept config in options, but prefer context
    this._config = options.config || null;
    this.name = this.constructor.name;
    this.pipeline = options.pipeline; // Reference to parent pipeline for event emission

    // Whether a failure in this stage must fail the whole run.
    //
    // `continueOnError` is on for every production pipeline, which means a
    // stage that throws is logged, skipped, and the run reports success. That
    // is the right behaviour for a stage whose absence only costs polish, and
    // the wrong behaviour for one whose absence changes what gets emitted: a
    // skipped secrets guard produces unredacted output with exit code 0.
    //
    // Subclasses set `this.fatal = true` after `super()` to opt out of that
    // recovery. See `handleError()` for stages that can degrade gracefully.
    this.fatal = options.fatal === true;

    // Suppress terminal output, keeping the `stage:log` event. Set from the
    // pipeline context in `onInit()`; also accepted directly for stages built
    // outside a pipeline.
    this.quiet = options.quiet === true;

    // Performance optimization: throttle file events
    this.fileEventCount = 0;
    this.lastFileEventTime = 0;
  }

  /**
   * Get the config instance
   * Prefers config from pipeline context (set during onInit), falls back to options
   * Returns a safe proxy if no config is available yet (allows stages to access config
   * in constructors with defaults)
   * @returns {Object} ConfigManager instance or safe proxy
   */
  get config() {
    if (this._config) {
      return this._config;
    }
    // Return a safe proxy that returns defaults when config isn't available yet
    // This allows stages to access config in constructors before onInit is called
    return {
      get: (_path, defaultValue) => defaultValue,
      set: () => {},
      has: () => false,
      all: () => ({}),
    };
  }

  /**
   * Process method to be implemented by subclasses
   * @param {*} input - Input data from previous stage
   * @returns {Promise<*>} - Processed output for next stage
   */
  async process(_input) {
    throw new Error(`Stage ${this.name} must implement process() method`);
  }

  /**
   * Validate input before processing (optional but recommended)
   * This method is automatically called by the Pipeline before process() if it exists
   * @param {*} input - Input to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails
   */
  validate(_input) {
    return true;
  }

  /**
   * Handle errors during processing with recovery mechanism
   *
   * This method allows stages to implement custom error recovery logic.
   * If a stage can recover from an error, it should return a valid result
   * that the pipeline can use to continue processing. If recovery is not
   * possible, the method should rethrow the error or throw a new one.
   *
   * @param {Error} error - Error that occurred during stage processing
   * @param {*} input - Input data that was being processed when error occurred
   * @returns {Promise<*>} - Recovered result to continue pipeline, or rethrows
   * @throws {Error} - Rethrows original error or throws new error if recovery fails
   */
  async handleError(error, _input) {
    // Default implementation: no recovery, rethrow error
    throw error;
  }

  /**
   * Initialize stage with pipeline context
   * Called once when pipeline is created, before any processing
   * This hook allows stages to set up resources, warm caches, or prepare for processing
   *
   * This method also receives the config instance from the pipeline context,
   * enabling stages to use isolated configuration for concurrent operations.
   *
   * @param {Object} context - Pipeline context with shared resources
   * @param {Object} context.logger - Logger instance
   * @param {Object} context.options - Pipeline options
   * @param {Object} context.stats - Pipeline statistics
   * @param {Object} context.config - Configuration manager instance
   * @param {Object} context.pipeline - Reference to parent pipeline
   * @returns {Promise<void>}
   */
  async onInit(context) {
    // Set config from pipeline context if not already set
    if (context?.config && !this._config) {
      this._config = context.config;
    }
    // A pipeline running behind the programmatic API writes nothing to the
    // terminal; see `log()`.
    if (context?.quiet === true) {
      this.quiet = true;
    }
    // Default implementation - subclasses can override for custom initialization
  }

  /**
   * Called before each stage execution
   * This hook allows stages to perform pre-processing setup, validation, or preparation
   *
   * Execution Order:
   * 1. onInit() - once during pipeline creation
   * 2. beforeRun() - before each process() call
   * 3. process() - main stage logic
   * 4. afterRun() - after successful process() call
   * 5. onError() - if process() throws an error (before handleError())
   *
   * @param {*} input - Input data about to be processed
   * @returns {Promise<void>}
   */
  async beforeRun(_input) {
    // Default implementation - no operation
  }

  /**
   * Called after successful stage execution
   * This hook allows stages to perform post-processing cleanup, logging, or finalization
   *
   * @param {*} output - Output data from stage processing
   * @returns {Promise<void>}
   */
  async afterRun(_output) {
    // Default implementation - no operation
  }

  /**
   * Called when stage encounters an error
   * This hook is called before handleError() and allows stages to log errors,
   * clean up resources, or perform error-specific actions
   *
   * @param {Error} error - Error that occurred
   * @param {*} input - Input data being processed when error occurred
   * @returns {Promise<void>}
   */
  async onError(_error, _input) {
    // Default implementation - no operation
  }

  /**
   * Log a message and emit stage events for UI.
   * Routes output through the central logger so that log-level filtering,
   * format (text/json/silent), and destination (stderr/stdout) are all
   * respected uniformly across the pipeline.
   *
   * Under `quiet` the `stage:log` event is still emitted and nothing is written
   * to the terminal. A library has no business printing to its host's stdout,
   * and an embedder that wants these messages has the event to subscribe to.
   *
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, warn, error, debug)
   */
  log(message, level = 'info') {
    // Emit event for UI if pipeline is available
    if (this.pipeline) {
      this.pipeline.emit('stage:log', {
        stage: this.name,
        message,
        level,
        timestamp: Date.now(),
      });
    }

    if (this.quiet) return;

    // Route all terminal output through the central logger so that
    // --log-level, --log-format, --no-color, and COPYTREE_LOG_LEVEL are obeyed.
    const prefixedMessage = `[${this.name}] ${message}`;

    switch (level) {
      case 'error':
        defaultLogger.error(prefixedMessage);
        break;
      case 'warn':
        defaultLogger.warn(prefixedMessage);
        break;
      // Stage 'info' messages are internal pipeline progress/timing info.
      // They were previously only visible in debug mode (app.debug=true), so
      // we map them to debug level to preserve that backward-compatible behavior.
      // Use --log-level debug (or COPYTREE_LOG_LEVEL=debug) to see them.
      case 'info':
        defaultLogger.debug(prefixedMessage);
        break;
      default: // 'debug'
        defaultLogger.debug(prefixedMessage);
    }
  }

  /**
   * Emit progress update for current stage.
   *
   * `detail` carries concrete counts — `{ completed, total, item }` — because
   * "Converting documents… 3/8" is a number the reader can trust, where a
   * percentage of one stage inside a fourteen-stage pipeline is not. A stage
   * that knows its own denominator should always pass it.
   *
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} [message] - Optional progress message
   * @param {{completed?: number, total?: number, item?: string}} [detail] - Concrete counts
   */
  emitProgress(progress, message, detail = {}) {
    if (this.pipeline) {
      this.pipeline.emit('stage:progress', {
        stage: this.name,
        progress,
        message,
        ...detail,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Emit file processing event (throttled for performance)
   * @param {string} filePath - Path of file being processed
   * @param {string} action - Action being performed
   */
  emitFileEvent(filePath, action = 'processed') {
    if (!this.pipeline) return;

    this.fileEventCount++;
    const now = Date.now();

    // Only emit every 20th file or every 100ms
    if (this.fileEventCount % 20 === 0 || now - this.lastFileEventTime > 100) {
      this.pipeline.emit('file:batch', {
        stage: this.name,
        count: this.fileEventCount,
        lastFile: filePath,
        action,
        timestamp: now,
      });
      this.lastFileEventTime = now;
    }
  }

  /**
   * Record that this stage could not do what it was asked, but carried on.
   *
   * A stage that swallows its own failure and returns its input unchanged
   * answers a different question than the one that was asked — `--changed
   * <bad-ref>` returned the entire repository instead of a diff, and the run
   * exited 0 without a word. In CI that is a two-hundred-thousand-token context
   * where a small one was expected, and nothing to notice it by.
   *
   * Degrading is still the right call for most of these; going silent is not.
   * The reporter turns these into warnings on the completion line.
   *
   * @param {Object} input - The stage input being passed through
   * @param {string} message - What could not be done, in user terms
   * @returns {Object} `input` with the degradation recorded on its stats
   */
  degrade(input, rawMessage) {
    // First line only. A git failure arrives with several lines of the
    // command's own advice attached, and pasting that into a status line buries
    // the sentence that matters underneath it.
    const message = String(rawMessage).split('\n')[0].trim();
    this.log(rawMessage, 'debug');
    return {
      ...input,
      stats: {
        ...(input?.stats || {}),
        degradations: [...(input?.stats?.degradations || []), { stage: this.name, message }],
      },
    };
  }

  /**
   * Get elapsed time since a start time
   * @param {number} startTime - Start time from Date.now()
   * @returns {string} - Formatted elapsed time
   */
  getElapsedTime(startTime) {
    const elapsed = Date.now() - startTime;

    if (elapsed < 1000) {
      return `${elapsed}ms`;
    } else if (elapsed < 60000) {
      return `${(elapsed / 1000).toFixed(1)}s`;
    } else {
      return `${(elapsed / 60000).toFixed(1)}m`;
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} - Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default Stage;
