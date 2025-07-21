const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config/ConfigManager');
const { logger } = require('../utils/logger');

/**
 * Simple file-based cache service
 * Supports TTL and automatic garbage collection
 */
class CacheService {
  constructor(options = {}) {
    this.enabled = options.enabled ?? config().get('cache.enabled', true);
    this.driver = options.driver || config().get('cache.driver', 'file');
    this.prefix = options.prefix || config().get('cache.prefix', 'copytree_');
    this.defaultTtl = options.defaultTtl || config().get('cache.defaultTtl', 3600);
    
    // File cache settings
    this.cachePath = path.resolve(
      options.cachePath || config().get('cache.file.path', '.copytree-cache')
    );
    this.extension = config().get('cache.file.extension', '.cache');
    this.gcProbability = config().get('cache.file.gcProbability', 0.01);
    
    // Memory cache for current process
    this.memoryCache = new Map();
    
    this.logger = logger.child('CacheService');
    
    // Ensure cache directory exists
    if (this.enabled && this.driver === 'file') {
      fs.ensureDirSync(this.cachePath);
    }
  }

  /**
   * Generate cache key
   * @param {string} key - Base key
   * @param {Object} data - Additional data to include in key
   * @returns {string} Cache key
   */
  generateKey(key, data = null) {
    let fullKey = this.prefix + key;
    
    if (data) {
      const hash = crypto.createHash('sha256');
      hash.update(JSON.stringify(data, Object.keys(data).sort()));
      fullKey += '_' + hash.digest('hex').substring(0, 8);
    }
    
    return fullKey;
  }

  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>} Cached value or default
   */
  async get(key, defaultValue = null) {
    if (!this.enabled) {
      return defaultValue;
    }

    const fullKey = this.generateKey(key);
    
    try {
      // Check memory cache first
      if (this.memoryCache.has(fullKey)) {
        const item = this.memoryCache.get(fullKey);
        if (item.expires > Date.now()) {
          this.logger.debug(`Cache hit (memory): ${key}`);
          return item.value;
        } else {
          this.memoryCache.delete(fullKey);
        }
      }
      
      // Check file cache
      if (this.driver === 'file') {
        const filePath = this.getCacheFilePath(fullKey);
        
        if (await fs.pathExists(filePath)) {
          const data = await fs.readJson(filePath);
          
          if (data.expires > Date.now()) {
            this.logger.debug(`Cache hit (file): ${key}`);
            // Store in memory cache for faster access
            this.memoryCache.set(fullKey, data);
            return data.value;
          } else {
            // Expired, remove file
            await fs.remove(filePath);
          }
        }
      }
      
      this.logger.debug(`Cache miss: ${key}`);
      return defaultValue;
    } catch (error) {
      this.logger.error(`Cache get error: ${error.message}`);
      return defaultValue;
    }
  }

  /**
   * Set item in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, ttl = null) {
    if (!this.enabled) {
      return false;
    }

    const fullKey = this.generateKey(key);
    const expires = Date.now() + ((ttl || this.defaultTtl) * 1000);
    
    const cacheItem = {
      key: fullKey,
      value,
      expires,
      created: Date.now()
    };
    
    try {
      // Store in memory cache
      this.memoryCache.set(fullKey, cacheItem);
      
      // Store in file cache
      if (this.driver === 'file') {
        const filePath = this.getCacheFilePath(fullKey);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeJson(filePath, cacheItem, { spaces: 2 });
        
        // Garbage collection
        if (Math.random() < this.gcProbability) {
          this.runGarbageCollection().catch(() => {});
        }
      }
      
      this.logger.debug(`Cache set: ${key} (TTL: ${ttl || this.defaultTtl}s)`);
      return true;
    } catch (error) {
      this.logger.error(`Cache set error: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Remove item from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async forget(key) {
    if (!this.enabled) {
      return false;
    }

    const fullKey = this.generateKey(key);
    
    try {
      // Remove from memory cache
      this.memoryCache.delete(fullKey);
      
      // Remove from file cache
      if (this.driver === 'file') {
        const filePath = this.getCacheFilePath(fullKey);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      }
      
      this.logger.debug(`Cache forget: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Cache forget error: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all cache
   * @param {string} pattern - Optional pattern to match keys
   * @returns {Promise<number>} Number of items cleared
   */
  async clear(pattern = null) {
    if (!this.enabled) {
      return 0;
    }

    let cleared = 0;
    
    try {
      // Clear memory cache
      if (pattern) {
        const regex = new RegExp(pattern);
        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
            cleared++;
          }
        }
      } else {
        cleared = this.memoryCache.size;
        this.memoryCache.clear();
      }
      
      // Clear file cache
      if (this.driver === 'file' && await fs.pathExists(this.cachePath)) {
        const files = await fs.readdir(this.cachePath);
        
        for (const file of files) {
          if (!file.endsWith(this.extension)) continue;
          
          if (pattern) {
            const regex = new RegExp(pattern);
            if (!regex.test(file)) continue;
          }
          
          await fs.remove(path.join(this.cachePath, file));
          cleared++;
        }
      }
      
      this.logger.info(`Cache cleared: ${cleared} items`);
      return cleared;
    } catch (error) {
      this.logger.error(`Cache clear error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Run garbage collection on file cache
   * @returns {Promise<number>} Number of expired items removed
   */
  async runGarbageCollection() {
    if (!this.enabled || this.driver !== 'file') {
      return 0;
    }

    let removed = 0;
    
    try {
      this.logger.debug('Running cache garbage collection...');
      
      const files = await fs.readdir(this.cachePath);
      const now = Date.now();
      
      for (const file of files) {
        if (!file.endsWith(this.extension)) continue;
        
        const filePath = path.join(this.cachePath, file);
        
        try {
          const data = await fs.readJson(filePath);
          
          if (data.expires < now) {
            await fs.remove(filePath);
            removed++;
          }
        } catch (error) {
          // Remove corrupted cache files
          await fs.remove(filePath);
          removed++;
        }
      }
      
      if (removed > 0) {
        this.logger.debug(`Garbage collection removed ${removed} expired items`);
      }
      
      return removed;
    } catch (error) {
      this.logger.error(`Garbage collection error: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get cache file path for key
   * @private
   */
  getCacheFilePath(key) {
    // Sanitize key for filesystem
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.cachePath, safeKey + this.extension);
  }

  /**
   * Create a cache instance for a specific namespace
   * @param {string} namespace - Cache namespace
   * @param {Object} options - Override options
   * @returns {CacheService} New cache instance
   */
  static create(namespace, options = {}) {
    return new CacheService({
      prefix: `copytree_${namespace}_`,
      ...options
    });
  }
}

// Export singleton instance and class
const defaultCache = new CacheService();

module.exports = {
  CacheService,
  cache: defaultCache
};