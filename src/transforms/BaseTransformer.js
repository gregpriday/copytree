const { TransformError } = require('../utils/errors');
const { config } = require('../config/ConfigManager');
const { logger } = require('../utils/logger');
const { CacheService } = require('../services/CacheService');
const crypto = require('crypto');
const path = require('path');

/**
 * Base class for all file transformers
 */
class BaseTransformer {
  constructor(options = {}) {
    this.options = options;
    this.config = config();
    this.logger = options.logger || logger.child(this.constructor.name);
    
    // Only enable caching for AI-based transformers by default
    const isAITransformer = this.constructor.name.toLowerCase().includes('ai') || 
                           this.constructor.name.toLowerCase().includes('summary') ||
                           this.constructor.name.toLowerCase().includes('description');
    
    this.cacheEnabled = options.noCache ? false : (options.cache ?? (isAITransformer && this.config.get('cache.transformations.enabled', true)));
    this.cacheTTL = options.cacheTTL ?? this.config.get('cache.transformations.ttl', 86400);
    
    // Indicates whether this transformer performs heavy/slow operations
    // Heavy transformers will show progress during processing
    this.isHeavy = false;
    
    // Cache will be initialized on first use if caching is enabled
    this.cache = null;
  }

  /**
   * Initialize cache if needed
   */
  initializeCache() {
    if (!this.cache && this.cacheEnabled) {
      const transformerName = this.constructor.name.toLowerCase().replace('transformer', '');
      const specificConfig = `cache.transformations.${transformerName}`;
      
      this.cache = CacheService.create('transform', {
        enabled: this.config.get(`${specificConfig}.enabled`, this.cacheEnabled),
        defaultTtl: this.config.get(`${specificConfig}.ttl`, this.cacheTTL)
      });
    }
  }

  /**
   * Transform a file
   * @param {Object} file - File object with path, content, etc.
   * @returns {Promise<Object>} Transformed file object
   */
  async transform(file) {
    try {
      // Validate input first
      this.validateInput(file);
      
      this.logger.debug(`Transforming ${file.path}`);
      const startTime = Date.now();

      // Initialize cache if needed
      this.initializeCache();

      // Check cache if enabled
      if (this.cacheEnabled && this.cache) {
        const cached = await this.getFromCache(file);
        if (cached) {
          this.logger.debug(`Cache hit for ${file.path}`);
          return cached;
        }
      }

      // Perform transformation
      const result = await this.doTransform(file);

      // Validate output
      this.validateOutput(result);

      // Cache result if enabled and cache exists
      if (this.cacheEnabled && this.cache) {
        await this.saveToCache(file, result);
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`Transformed ${file.path} in ${duration}ms`);

      return result;
    } catch (error) {
      if (error instanceof TransformError) {
        throw error;
      }
      throw new TransformError(
        `Transform failed: ${error.message}`,
        this.constructor.name,
        file ? file.path : undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Actual transformation logic - must be implemented by subclasses
   * @param {Object} file - File object
   * @returns {Promise<Object>} Transformed file
   * @abstract
   */
  async doTransform(file) {
    throw new Error('doTransform() must be implemented by subclass');
  }

  /**
   * Validate input file
   * @param {Object} file - File object to validate
   * @throws {TransformError} If validation fails
   */
  validateInput(file) {
    if (!file) {
      throw new TransformError('File object is required', this.constructor.name);
    }
    if (!file.path) {
      throw new TransformError('File path is required', this.constructor.name);
    }
  }

  /**
   * Validate output
   * @param {Object} result - Transformation result
   * @throws {TransformError} If validation fails
   */
  validateOutput(result) {
    if (!result) {
      throw new TransformError('Transformation must return a result', this.constructor.name);
    }
  }

  /**
   * Get cache key for a file
   * @param {Object} file - File object
   * @returns {string} Cache key
   */
  getCacheKey(file) {
    const parts = [
      this.constructor.name,
      file.path,
      file.size || 0,
      file.modified ? file.modified.getTime() : 0,
      JSON.stringify(this.options)
    ];
    
    return crypto
      .createHash('sha256')
      .update(parts.join(':'))
      .digest('hex');
  }

  /**
   * Get transformed content from cache
   * @param {Object} file - File object
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getFromCache(file) {
    if (!this.cache) return null;
    
    const cacheKey = this.getCacheKey(file);
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      // Merge cached content back into file object
      return {
        ...file,
        ...cached,
        fromCache: true
      };
    }
    
    return null;
  }

  /**
   * Save transformed content to cache
   * @param {Object} file - Original file object
   * @param {Object} result - Transformation result
   * @returns {Promise<void>}
   */
  async saveToCache(file, result) {
    if (!this.cache) return;
    
    const cacheKey = this.getCacheKey(file);
    
    // Only cache successful transformations
    if (result.transformed) {
      // Don't cache the entire file object, just the transformation results
      const cacheData = {
        content: result.content,
        transformed: result.transformed,
        transformedBy: result.transformedBy,
        metadata: result.metadata,
        error: result.error
      };
      
      await this.cache.set(cacheKey, cacheData, this.cacheTTL);
    }
  }

  /**
   * Check if this transformer can handle a file
   * @param {Object} file - File object
   * @returns {boolean}
   */
  canTransform(file) {
    return true;
  }

  /**
   * Get transformer metadata
   * @returns {Object} Metadata about this transformer
   */
  getMetadata() {
    return {
      name: this.constructor.name,
      description: this.description || 'No description available',
      supportedExtensions: this.supportedExtensions || [],
      options: this.options
    };
  }

  /**
   * Helper to check if content looks like text
   * @param {Buffer|string} content - Content to check
   * @returns {boolean}
   */
  isTextContent(content) {
    if (typeof content === 'string') return true;
    
    if (Buffer.isBuffer(content)) {
      // Check first 512 bytes for null characters
      const sample = content.slice(0, Math.min(512, content.length));
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Helper to detect file encoding
   * @param {Buffer} buffer - File buffer
   * @returns {string} Detected encoding
   */
  detectEncoding(buffer) {
    // Simple BOM detection
    if (buffer.length >= 3) {
      if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return 'utf8';
      }
      if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return 'utf16le';
      }
      if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        return 'utf16be';
      }
    }
    
    return 'utf8'; // Default
  }

  /**
   * Format bytes to human readable
   * @param {number} bytes - Number of bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = BaseTransformer;