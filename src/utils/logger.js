import chalk from 'chalk';
import ora from 'ora';
import stripAnsi from 'strip-ansi';
import { config } from '../config/ConfigManager.js';
import { EventEmitter } from 'events';
import { formatBytes, formatDuration } from './helpers.js';

/**
 * Log level hierarchy — lower number = higher priority.
 * `success` shares the same priority as `info`.
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  success: 2,
  info: 2,
  debug: 3,
};

/**
 * Valid log format values.
 */
const LOG_FORMATS = ['text', 'json', 'silent'];

/**
 * Valid log level values exposed to CLI / config.
 */
const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug'];

class Logger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      // Structured logging options (new)
      level: options.level, // lazy-loaded from config / env when undefined
      format: options.format, // lazy-loaded from config / env when undefined
      colorize: options.colorize, // lazy-loaded from config / env when undefined
      timestamp: options.timestamp, // lazy-loaded from config when undefined
      destination: options.destination, // lazy-loaded from config when undefined

      // Legacy compatibility options
      debug: options.debug, // will be lazy-loaded from config if not provided
      silent: options.silent || false,
      prefix: options.prefix || 'CopyTree',
      useInkEvents: options.useInkEvents || false,
      ...options,
    };

    this.spinner = null;
  }

  // ─── Effective option getters ─────────────────────────────────────────────

  /**
   * Effective log level, respecting priority:
   *   explicit configure() call > COPYTREE_LOG_LEVEL env > legacy debug flag
   *   > legacy silent flag > config file > default ('info')
   */
  get _effectiveLevel() {
    if (this.options.level !== undefined) {
      return this.options.level;
    }
    // Read env var directly (ConfigManager.env() always returns default)
    const envLevel = process.env.COPYTREE_LOG_LEVEL?.toLowerCase();
    if (envLevel && VALID_LOG_LEVELS.includes(envLevel)) {
      return envLevel;
    }
    // Legacy: debug flag enables debug level
    if (this._isDebugEnabled) {
      return 'debug';
    }
    // Legacy: silent flag maps to error-only
    if (this.options.silent) {
      return 'error';
    }
    // Config file default
    return config().get('logging.level', 'info');
  }

  /**
   * Effective log format, respecting priority:
   *   explicit configure() call > COPYTREE_LOG_FORMAT env > config file
   *   > legacy silent flag > default ('text')
   */
  get _effectiveFormat() {
    if (this.options.format !== undefined) {
      return this.options.format;
    }
    const envFormat = process.env.COPYTREE_LOG_FORMAT?.toLowerCase();
    if (envFormat && LOG_FORMATS.includes(envFormat)) {
      return envFormat;
    }
    // Legacy: silent flag maps to silent format
    if (this.options.silent) {
      return 'silent';
    }
    return config().get('logging.format', 'text');
  }

  get _effectiveColorize() {
    if (this.options.colorize !== undefined) {
      return this.options.colorize;
    }
    return config().get('logging.colorize', 'auto');
  }

  get _effectiveDestination() {
    if (this.options.destination !== undefined) {
      return this.options.destination;
    }
    return config().get('logging.destination', 'stderr');
  }

  get _effectiveTimestamp() {
    if (this.options.timestamp !== undefined) {
      return this.options.timestamp;
    }
    return config().get('logging.timestamp', true);
  }

  // ─── Legacy debug support ─────────────────────────────────────────────────

  /** Lazy-load debug setting from config (backward compat). */
  get _isDebugEnabled() {
    if (this.options.debug === undefined) {
      this.options.debug = config().get('app.debug', false);
    }
    return this.options.debug;
  }

  // ─── Core filtering & formatting helpers ─────────────────────────────────

  /**
   * Decide whether a message at `level` should be written given the current
   * effective level and format settings.
   */
  _shouldLog(level) {
    const format = this._effectiveFormat;
    if (format === 'silent') {
      // Silent mode: only errors pass through
      return level === 'error';
    }
    const messagePriority = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    const currentPriority = LOG_LEVELS[this._effectiveLevel] ?? LOG_LEVELS.info;
    return messagePriority <= currentPriority;
  }

  /** Decide whether to apply ANSI colors based on colorize setting and TTY. */
  _shouldColorize() {
    if (this._effectiveFormat === 'json') return false;
    const colorize = this._effectiveColorize;
    if (colorize === 'always') return true;
    if (colorize === 'never') return false;
    // 'auto': colorize only when writing to a real TTY
    return this._getOutputStream().isTTY === true;
  }

  /** Return the output stream (stderr by default, stdout if configured). */
  _getOutputStream() {
    return this._effectiveDestination === 'stdout' ? process.stdout : process.stderr;
  }

  /**
   * Build an NDJSON log entry.
   * @param {string} level - Log level
   * @param {string|*} message - Primary message
   * @param {...*} args - Additional context arguments
   * @returns {string} JSON string (no trailing newline)
   */
  _formatJsonLine(level, message, ...args) {
    let messageStr;
    if (typeof message === 'string') {
      messageStr = message;
    } else {
      try {
        messageStr = JSON.stringify(message);
      } catch {
        messageStr = String(message);
      }
    }

    const entry = { level, message: messageStr };
    if (this._effectiveTimestamp) {
      entry.timestamp = new Date().toISOString();
    }
    if (args.length > 0) {
      entry.context = args.length === 1 ? args[0] : args;
    }

    try {
      return JSON.stringify(entry);
    } catch {
      // Fallback for circular references, BigInt, or other non-serializable context
      const safeEntry = { level, message: messageStr };
      if (entry.timestamp) safeEntry.timestamp = entry.timestamp;
      try {
        return JSON.stringify(safeEntry);
      } catch {
        return `{"level":"${level}","message":"[unserializable]"}`;
      }
    }
  }

  /**
   * Write a line to the configured output stream.
   * In JSON format, args are included as context in the JSON entry.
   * In text format, colorized or plain text is written.
   *
   * @param {string} level - Log level key for filtering
   * @param {string} coloredText - Pre-formatted, colorized text (text format)
   * @param {string|*} rawMessage - Unformatted message (JSON format)
   * @param {Array} args - Additional arguments
   */
  _writeLog(level, coloredText, rawMessage, args = []) {
    if (!this._shouldLog(level)) return;

    const stream = this._getOutputStream();
    const format = this._effectiveFormat;

    if (format === 'json') {
      stream.write(this._formatJsonLine(level, rawMessage, ...args) + '\n');
    } else {
      const text = this._shouldColorize()
        ? (coloredText ?? '')
        : stripAnsi(typeof coloredText === 'string' ? coloredText : String(coloredText ?? ''));
      stream.write(text + '\n');
    }
  }

  // ─── Runtime reconfiguration ──────────────────────────────────────────────

  /**
   * Apply new logging options at runtime.
   * Typically called from CLI action handlers after parsing flags.
   *
   * @param {Object} newOptions - Options to apply
   * @param {string} [newOptions.level]       - Log level (error|warn|info|debug)
   * @param {string} [newOptions.format]      - Log format (text|json|silent)
   * @param {string} [newOptions.colorize]    - Color mode (auto|always|never)
   * @param {boolean} [newOptions.timestamp]  - Include timestamps in JSON
   * @param {string} [newOptions.destination] - Output stream (stderr|stdout)
   */
  configure(newOptions) {
    if (newOptions.level !== undefined) this.options.level = newOptions.level;
    if (newOptions.format !== undefined) this.options.format = newOptions.format;
    if (newOptions.colorize !== undefined) this.options.colorize = newOptions.colorize;
    if (newOptions.timestamp !== undefined) this.options.timestamp = newOptions.timestamp;
    if (newOptions.destination !== undefined) this.options.destination = newOptions.destination;
    // Legacy options
    if (newOptions.silent !== undefined) this.options.silent = newOptions.silent;
    if (newOptions.debug !== undefined) this.options.debug = newOptions.debug;
  }

  // ─── Log methods ──────────────────────────────────────────────────────────

  /**
   * Log an info message.
   */
  info(message, ...args) {
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'info',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    this._writeLog('info', `${chalk.blue(`[${this.options.prefix}]`)} ${message}`, message, args);
  }

  /**
   * Log a success message.
   */
  success(message, ...args) {
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'success',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    this._writeLog('success', chalk.green(`✓ ${message}`), message, args);
  }

  /**
   * Log a warning message.
   */
  warn(message, ...args) {
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'warning',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    this._writeLog('warn', chalk.yellow(`⚠ ${message}`), message, args);
  }

  /**
   * Log an error message.
   * Errors always pass the level filter but respect the format setting.
   */
  error(message, ...args) {
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'error',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    this._writeLog('error', chalk.red(`✗ ${message}`), message, args);
  }

  /**
   * Log a debug message.
   * Alias kept for standard logger interface compatibility.
   */
  debug(message, ...args) {
    return this.logDebug(message, ...args);
  }

  logDebug(message, ...args) {
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'debug',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    this._writeLog('debug', chalk.gray(`[DEBUG] ${message}`), message, args);
  }

  // ─── Spinner methods ──────────────────────────────────────────────────────

  /**
   * Start a spinner with a message.
   * Spinners are suppressed in JSON format and when not writing to a TTY.
   */
  startSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', { type: 'start', message, timestamp: Date.now() });
      return;
    }

    // Suppress spinner when format is json, silent, or when the stream is not a TTY
    if (
      this._effectiveFormat !== 'text' ||
      !this._shouldLog('info') ||
      !this._getOutputStream().isTTY
    ) {
      return;
    }

    this.stopSpinner();
    this.spinner = ora({ text: message, color: 'blue' }).start();
  }

  /**
   * Update spinner text.
   */
  updateSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', { type: 'update', message, timestamp: Date.now() });
      return;
    }

    if (this.spinner && this._getOutputStream().isTTY) {
      this.spinner.text = message;
    }
  }

  /**
   * Stop spinner with success.
   */
  succeedSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', { type: 'success', message, timestamp: Date.now() });
      return;
    }

    if (this.spinner) {
      this.spinner.succeed(message || this.spinner.text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with failure.
   */
  failSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', { type: 'error', message, timestamp: Date.now() });
      return;
    }

    if (this.spinner) {
      this.spinner.fail(message || this.spinner.text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner without status.
   */
  stopSpinner() {
    if (this.options.useInkEvents) {
      this.emit('progress', { type: 'stop', timestamp: Date.now() });
      return;
    }

    if (this.spinner) {
      this.spinner.stop();
      const stream = this._getOutputStream();
      if (stream.isTTY) {
        stream.write('\r\x1b[2K');
      }
      this.spinner = null;
    }
  }

  // ─── Miscellaneous display helpers ────────────────────────────────────────

  /**
   * Log a table.
   */
  table(data, options = {}) {
    if (!this._shouldLog('info')) return;
    console.table(data, options.columns);
  }

  /**
   * Log a horizontal line.
   */
  line(char = '-', length = 60) {
    if (!this._shouldLog('info')) return;
    this._getOutputStream().write(char.repeat(length) + '\n');
  }

  /**
   * Log with custom styling.
   */
  styled(style, message, ...args) {
    if (!this._shouldLog('info')) return;

    const styles = {
      bold: chalk.bold,
      dim: chalk.dim,
      italic: chalk.italic,
      underline: chalk.underline,
      inverse: chalk.inverse,
      strikethrough: chalk.strikethrough,
    };

    const styleFunc = styles[style] || chalk.white;
    const formatted = styleFunc(message);
    this._getOutputStream().write(
      (this._shouldColorize()
        ? formatted
        : stripAnsi(typeof formatted === 'string' ? formatted : String(formatted ?? ''))) + '\n',
    );
    if (args.length > 0) {
      this._getOutputStream().write(args.join(' ') + '\n');
    }
  }

  /**
   * Log a file tree item.
   */
  tree(path, isLast = false, indent = '') {
    if (!this._shouldLog('info')) return;

    const connector = isLast ? '└── ' : '├── ';
    const line = chalk.gray(indent + connector) + path;
    this._getOutputStream().write(
      (this._shouldColorize()
        ? line
        : stripAnsi(typeof line === 'string' ? line : String(line ?? ''))) + '\n',
    );
  }

  /**
   * Create a child logger with a different prefix.
   */
  child(prefix) {
    return new Logger({
      ...this.options,
      prefix: `${this.options.prefix}:${prefix}`,
    });
  }

  /**
   * Enable or disable Ink events mode.
   */
  setInkEventsMode(enabled) {
    this.options.useInkEvents = enabled;
  }

  /**
   * Check if Ink events mode is enabled.
   */
  isInkEventsMode() {
    return this.options.useInkEvents;
  }

  /**
   * Format bytes to human readable (delegates to helpers).
   */
  formatBytes(bytes) {
    return formatBytes(bytes, 1);
  }

  /**
   * Format duration (delegates to helpers).
   */
  formatDuration(ms) {
    return formatDuration(ms);
  }

  /**
   * Log progress.
   */
  progress(current, total, message = '') {
    if (!this._shouldLog('info')) return;

    const percentage = Math.round((current / total) * 100);
    const progressMsg = `${percentage}% ${message}`;
    const stream = this._getOutputStream();

    if (stream.isTTY && this._effectiveFormat === 'text') {
      const bar = this.createProgressBar(percentage);
      stream.clearLine(0);
      stream.cursorTo(0);
      stream.write(`${bar} ${progressMsg}`);

      if (current >= total) {
        stream.write('\n');
      }
    } else {
      if (current >= total) {
        this.info(progressMsg);
      }
    }
  }

  /**
   * Create a progress bar string.
   */
  createProgressBar(percentage, width = 30) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    return '[' + chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ']';
  }
}

// Create a default logger instance
const defaultLogger = new Logger();

// Export both the class and a default instance
export { Logger, defaultLogger as logger };
