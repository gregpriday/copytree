import crypto from 'crypto';
import fs from './fsx.js';

/**
 * Generate a hash for file content
 * @param {string} filePath - Path to the file
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {Promise<string>} Hash of the file content
 */
/**
 * Files at or below this size are read in one call instead of streamed.
 *
 * A read stream sets up an event emitter, a file handle wrapper, and at least
 * one chunk boundary per file. For a repository of small source files that
 * scaffolding costs more than the bytes it moves; above this threshold the
 * stream is the right tool and memory matters more than setup.
 */
const INLINE_HASH_CEILING = 128 * 1024;

async function hashFile(filePath, algorithm = 'sha256', options = {}) {
  const size = options.size;

  if (typeof size === 'number' && size >= 0 && size <= INLINE_HASH_CEILING) {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash(algorithm).update(buffer).digest('hex');
  }

  const hash = crypto.createHash(algorithm);
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Generate a hash for string content
 * @param {string} content - Content to hash
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {string} Hash of the content
 */
function hashContent(content, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(content).digest('hex');
}

/**
 * Generate a composite hash for transformation caching
 * @param {Object} file - File object with path and stats
 * @param {string} transformerName - Name of the transformer
 * @param {Object} options - Transformer options
 * @returns {string} Composite hash
 */
function generateTransformCacheKey(file, transformerName, options = {}) {
  const components = {
    path: file.path,
    size: file.stats?.size || 0,
    mtime: file.stats?.mtime?.getTime() || 0,
    transformer: transformerName,
    options: JSON.stringify(options, Object.keys(options).sort()),
  };

  return hashContent(JSON.stringify(components));
}

export { hashFile, hashContent, generateTransformCacheKey };
