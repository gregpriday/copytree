const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * Utility helper functions
 */

/**
 * Generate a hash for a string
 */
function hash(str, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(str).digest('hex');
}

/**
 * Generate a short hash (first 8 characters)
 */
function shortHash(str) {
  return hash(str).substring(0, 8);
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    shouldRetry = (error) => true
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      await sleep(Math.min(delay, maxDelay));
      delay *= backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Ensure a directory exists
 */
async function ensureDir(dirPath) {
  await fs.ensureDir(dirPath);
  return dirPath;
}

/**
 * Get temporary directory
 */
async function getTempDir(prefix = 'copytree') {
  const tempBase = os.tmpdir();
  const tempDir = path.join(tempBase, `${prefix}-${Date.now()}-${shortHash(Math.random().toString())}`);
  await ensureDir(tempDir);
  return tempDir;
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(tempDir) {
  try {
    await fs.remove(tempDir);
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Check if a path is within another path
 */
function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Normalize path separators for cross-platform compatibility
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Get file extension without dot
 */
function getExtension(filePath) {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Check if file is likely binary based on extension
 */
function isBinaryExtension(filePath) {
  const binaryExtensions = new Set([
    'exe', 'dll', 'so', 'dylib', 'bin',
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'webp', 'svg',
    'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm',
    'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    'db', 'sqlite', 'sqlite3'
  ]);

  const ext = getExtension(filePath).toLowerCase();
  return binaryExtensions.has(ext);
}

/**
 * Truncate string to specified length
 */
function truncate(str, maxLength, suffix = '...') {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Parse size string to bytes (e.g., '10MB' to 10485760)
 */
function parseSize(sizeStr) {
  const units = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024
  };

  const match = sizeStr.toString().match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();

  return Math.floor(value * (units[unit] || 1));
}

/**
 * Chunk an array into smaller arrays
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Debounce a function
 */
function debounce(fn, delay) {
  let timeoutId;
  
  return function debounced(...args) {
    clearTimeout(timeoutId);
    
    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(fn.apply(this, args));
      }, delay);
    });
  };
}

/**
 * Create a simple cache with TTL
 */
function createCache(ttl = 3600000) {
  const cache = new Map();

  return {
    get(key) {
      const item = cache.get(key);
      if (!item) return null;

      if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
      }

      return item.value;
    },

    set(key, value) {
      cache.set(key, {
        value,
        expiry: Date.now() + ttl
      });
    },

    delete(key) {
      cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    size() {
      return cache.size;
    }
  };
}

/**
 * Escape special characters for XML
 */
function escapeXml(str) {
  const xmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  };

  return str.replace(/[&<>"']/g, char => xmlEscapes[char]);
}

/**
 * Get current timestamp in ISO format
 */
function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  hash,
  shortHash,
  sleep,
  retry,
  ensureDir,
  getTempDir,
  cleanupTempDir,
  isPathInside,
  normalizePath,
  getExtension,
  isBinaryExtension,
  truncate,
  formatBytes,
  formatDuration,
  parseSize,
  chunk,
  debounce,
  createCache,
  escapeXml,
  timestamp
};