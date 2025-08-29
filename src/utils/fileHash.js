import crypto from 'crypto';
import fs from 'fs-extra';

/**
 * Generate a hash for file content
 * @param {string} filePath - Path to the file
 * @param {string} algorithm - Hash algorithm (default: 'sha256')
 * @returns {Promise<string>} Hash of the file content
 */
async function hashFile(filePath, algorithm = 'sha256') {
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
