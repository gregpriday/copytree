import { config } from '../config/ConfigManager.js';

/**
 * Base class for pipeline stages
 * All pipeline stages should extend this class
 */
class Stage {
  constructor(options = {}) {
    this.options = options;
    this.config = config();
    this.name = this.constructor.name;
    this.pipeline = options.pipeline; // Reference to parent pipeline for event emission
    
    // Performance optimization: throttle file events
    this.fileEventCount = 0;
    this.lastFileEventTime = 0;
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
   * Validate input before processing
   * @param {*} input - Input to validate
   * @returns {boolean} - True if valid
   * @throws {Error} - If validation fails
   */
  validate(_input) {
    return true;
  }

  /**
   * Handle errors during processing
   * @param {Error} error - Error that occurred
   * @param {*} input - Input that caused the error
   * @returns {*} - Recovery value or rethrows
   */
  async handleError(error, _input) {
    throw error;
  }

  /**
   * Log a message and emit stage events for UI
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

    // Original logging behavior for debug mode or errors
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
   * Emit progress update for current stage
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Optional progress message
   */
  emitProgress(progress, message) {
    if (this.pipeline) {
      this.pipeline.emit('stage:progress', {
        stage: this.name,
        progress,
        message,
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