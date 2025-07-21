const { config } = require('../config/ConfigManager');

/**
 * Base class for pipeline stages
 * All pipeline stages should extend this class
 */
class Stage {
  constructor(options = {}) {
    this.options = options;
    this.config = config();
    this.name = this.constructor.name;
  }

  /**
   * Process method to be implemented by subclasses
   * @param {*} input - Input data from previous stage
   * @returns {Promise<*>} - Processed output for next stage
   */
  async process(input) {
    throw new Error(`Stage ${this.name} must implement process() method`);
  }

  /**
   * Validate input before processing
   * @param {*} input - Input to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails
   */
  validate(input) {
    return true;
  }

  /**
   * Handle errors during processing
   * @param {Error} error - Error that occurred
   * @param {*} input - Input that caused the error
   * @returns {*} - Recovery value or rethrows
   */
  async handleError(error, input) {
    throw error;
  }

  /**
   * Log a message (respects debug settings)
   * @param {string} message - Message to log
   * @param {string} level - Log level (info, warn, error, debug)
   */
  log(message, level = 'info') {
    if (this.config.get('app.debug') || level === 'error') {
      const prefix = `[${this.name}]`;
      
      switch (level) {
        case 'error':
          console.error(prefix, message);
          break;
        case 'warn':
          console.warn(prefix, message);
          break;
        case 'debug':
          if (this.config.get('app.debug')) {
            console.log(prefix, '[DEBUG]', message);
          }
          break;
        default:
          console.log(prefix, message);
      }
    }
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

module.exports = Stage;