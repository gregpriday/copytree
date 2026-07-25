import crypto from 'crypto';
import Stage from '../Stage.js';
import { logger } from '../../utils/logger.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';

/**
 * Deduplicate files stage - Remove duplicate files based on content hash
 */
class DeduplicateFilesStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.hashAlgorithm = options.hashAlgorithm || 'md5';
    this.keepFirst = options.keepFirst !== false; // By default, keep first occurrence
  }

  /**
   * Handle errors during deduplication - return files unchanged
   */
  async handleError(error, input) {
    this.log(`Deduplication failed: ${error.message}, returning files unchanged`, 'warn');
    // Return input unchanged if deduplication fails
    return input;
  }

  /**
   * Process files and remove duplicates.
   *
   * Accepts the pipeline contract (`process(input)` where `input.files` is the
   * array, returning `{...input, files}`) and, for backwards compatibility, a
   * bare array plus context. The bare-array form is deprecated.
   *
   * @param {Object|Array} input - Pipeline input, or a legacy file array
   * @param {Object} [legacyContext] - Legacy event emitter context
   * @returns {Promise<Object|Array>} Same shape as the input
   */
  async process(input, legacyContext) {
    const isLegacyArray = Array.isArray(input);
    const files = isLegacyArray ? input : input?.files;
    const context = isLegacyArray ? legacyContext : input;
    const wrap = (result) => (isLegacyArray ? result : { ...input, files: result });

    if (!files || files.length === 0) {
      return isLegacyArray ? files : input;
    }

    const startTime = Date.now();
    const contentHashes = new Map();
    const duplicates = [];
    const uniqueFiles = [];

    this.log(`Checking ${files.length} files for duplicates`, 'info');

    for (const file of files) {
      // Skip files without content
      if (!file.content && file.content !== '') {
        uniqueFiles.push(file);
        continue;
      }

      // Calculate content hash
      const hash = this.calculateHash(file.content);

      if (contentHashes.has(hash)) {
        // Found a duplicate
        const original = contentHashes.get(hash);
        duplicates.push({
          file: file.path || file.relativePath,
          duplicateOf: original.path || original.relativePath,
          size: file.size || file.stats?.size || 0,
        });

        input?.exclusionReport?.add({
          path: file.path || file.relativePath,
          size: file.size || file.stats?.size || 0,
          reason: EXCLUSION_REASONS.DUPLICATE,
          rule: `duplicateOf:${original.path || original.relativePath}`,
        });

        // Emit deduplication event
        if (context && context.emit) {
          context.emit('file:deduplicated', {
            original: original.path || original.relativePath,
            duplicate: file.path || file.relativePath,
          });
        }

        logger.debug('Found duplicate file', {
          file: file.path || file.relativePath,
          original: original.path || original.relativePath,
          hash,
        });
      } else {
        // First occurrence of this content
        contentHashes.set(hash, file);
        uniqueFiles.push(file);
      }
    }

    const elapsed = this.getElapsedTime(startTime);

    if (duplicates.length > 0) {
      const totalDuplicateSize = duplicates.reduce((sum, dup) => sum + dup.size, 0);

      this.log(
        `Removed ${duplicates.length} duplicate file(s) (${this.formatBytes(totalDuplicateSize)}) in ${elapsed}`,
        'info',
      );

      // Log details if debug is enabled
      if (this.config.get('app.debug')) {
        duplicates.forEach((dup) => {
          this.log(`  - ${dup.file} (duplicate of ${dup.duplicateOf})`, 'debug');
        });
      }
    } else {
      this.log(`No duplicates found in ${elapsed}`, 'info');
    }

    return wrap(uniqueFiles);
  }

  /**
   * Calculate hash of file content
   */
  calculateHash(content) {
    const hash = crypto.createHash(this.hashAlgorithm);

    if (Buffer.isBuffer(content)) {
      hash.update(content);
    } else if (typeof content === 'string') {
      hash.update(content, 'utf8');
    } else {
      // For other types, convert to string
      hash.update(String(content), 'utf8');
    }

    return hash.digest('hex');
  }

  /**
   * Check if this stage should apply
   */
  shouldApply(context) {
    return context.options && context.options.dedupe === true;
  }

  /**
   * Validate input
   */
  validate(input) {
    if (Array.isArray(input)) {
      return true; // legacy bare-array form
    }

    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }

    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }

    return true;
  }
}

export default DeduplicateFilesStage;
