import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config/ConfigManager.js';
import { EventEmitter } from 'events';

class Logger extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      debug: config().get('app.debug', false),
      silent: options.silent || false,
      prefix: options.prefix || 'CopyTree',
      useInkEvents: options.useInkEvents || false, // New option for Ink integration
      ...options,
    };
    
    this.spinner = null;
  }

  /**
   * Log an info message
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
    
    if (this.options.silent) return;
    console.log(chalk.blue(`[${this.options.prefix}]`), message, ...args);
  }

  /**
   * Log a success message
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
    
    if (this.options.silent) return;
    console.log(chalk.green(`✓ ${message}`), ...args);
  }

  /**
   * Log a warning message
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
    
    if (this.options.silent) return;
    console.warn(chalk.yellow(`⚠ ${message}`), ...args);
  }

  /**
   * Log an error message
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
    
    // Errors are never silenced
    console.error(chalk.red(`✗ ${message}`), ...args);
  }

  /**
   * Log a debug message (only if debug mode is enabled)
   */
  debug(message, ...args) {
    if (!this.options.debug) return;
    
    if (this.options.useInkEvents) {
      this.emit('log', {
        type: 'debug',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.options.silent) return;
    console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
  }

  /**
   * Start a spinner with a message
   */
  startSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', {
        type: 'start',
        message,
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.options.silent || !process.stdout.isTTY) return;
    
    this.stopSpinner(); // Stop any existing spinner
    this.spinner = ora({
      text: message,
      color: 'blue',
    }).start();
  }

  /**
   * Update spinner text
   */
  updateSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', {
        type: 'update',
        message,
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.spinner && process.stdout.isTTY) {
      this.spinner.text = message;
    }
  }

  /**
   * Stop spinner with success
   */
  succeedSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', {
        type: 'success',
        message,
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.spinner) {
      this.spinner.succeed(message || this.spinner.text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner with failure
   */
  failSpinner(message) {
    if (this.options.useInkEvents) {
      this.emit('progress', {
        type: 'error',
        message,
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.spinner) {
      this.spinner.fail(message || this.spinner.text);
      this.spinner = null;
    }
  }

  /**
   * Stop spinner without status
   */
  stopSpinner() {
    if (this.options.useInkEvents) {
      this.emit('progress', {
        type: 'stop',
        timestamp: Date.now(),
      });
      return;
    }
    
    if (this.spinner) {
      this.spinner.stop();
      // Clear the line after stopping
      if (process.stdout.isTTY) {
        process.stdout.write('\r\x1b[2K');
      }
      this.spinner = null;
    }
  }

  /**
   * Log a table
   */
  table(data, options = {}) {
    if (this.options.silent) return;
    console.table(data, options.columns);
  }

  /**
   * Log a horizontal line
   */
  line(char = '-', length = 60) {
    if (this.options.silent) return;
    console.log(char.repeat(length));
  }

  /**
   * Log with custom styling
   */
  styled(style, message, ...args) {
    if (this.options.silent) return;
    
    const styles = {
      bold: chalk.bold,
      dim: chalk.dim,
      italic: chalk.italic,
      underline: chalk.underline,
      inverse: chalk.inverse,
      strikethrough: chalk.strikethrough,
    };
    
    const styleFunc = styles[style] || chalk.white;
    console.log(styleFunc(message), ...args);
  }

  /**
   * Log a file tree item
   */
  tree(path, isLast = false, indent = '') {
    if (this.options.silent) return;
    
    const connector = isLast ? '└── ' : '├── ';
    console.log(chalk.gray(indent + connector) + path);
  }

  /**
   * Create a child logger with a different prefix
   */
  child(prefix) {
    return new Logger({
      ...this.options,
      prefix: `${this.options.prefix}:${prefix}`,
    });
  }

  /**
   * Enable or disable Ink events mode
   */
  setInkEventsMode(enabled) {
    this.options.useInkEvents = enabled;
  }

  /**
   * Check if Ink events mode is enabled
   */
  isInkEventsMode() {
    return this.options.useInkEvents;
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /**
   * Log progress
   */
  progress(current, total, message = '') {
    if (this.options.silent) return;
    
    const percentage = Math.round((current / total) * 100);
    const bar = this.createProgressBar(percentage);
    
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${bar} ${percentage}% ${message}`);
    
    if (current >= total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Create a progress bar string
   */
  createProgressBar(percentage, width = 30) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return '[' + 
      chalk.green('█'.repeat(filled)) + 
      chalk.gray('░'.repeat(empty)) + 
      ']';
  }
}

// Create a default logger instance
const defaultLogger = new Logger();

// Export both the class and a default instance
export {
  Logger,
  defaultLogger as logger,
};

// Convenience method exports
export const info = defaultLogger.info.bind(defaultLogger);
export const success = defaultLogger.success.bind(defaultLogger);
export const warn = defaultLogger.warn.bind(defaultLogger);
export const error = defaultLogger.error.bind(defaultLogger);
export const debug = defaultLogger.debug.bind(defaultLogger);