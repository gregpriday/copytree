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
    // SHA-256, not MD5. This hash is the sole identity test for "these two
    // files are the same", and a collision here silently deletes a file from
    // the context. MD5 collisions are cheap to construct on purpose, so a
    // repository could carry two different files that dedupe into one.
    this.hashAlgorithm = options.hashAlgorithm || 'sha256';
    this.keepFirst = options.keepFirst !== false; // By default, keep first occurrence
  }

  /**
   * Whether a file's content stands in for the file rather than being it.
   *
   * Binary placeholders and structure-only notices are the same handful of
   * bytes for every file that gets one, so hashing them says only "both were
   * replaced by a placeholder" — never "both are the same file". Without this,
   * `--dedupe` deletes every binary but the first.
   *
   * Base64 is exempt: that content really is the file.
   *
   * @param {Object} file - File entry
   * @returns {boolean} True when the content is a stand-in
   * @private
   */
  _hasSyntheticContent(file) {
    if (file.binaryCategory === 'structure-only') return true;
    return Boolean(file.isBinary) && file.encoding !== 'base64';
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

      // A placeholder is not evidence of duplication.
      if (this._hasSyntheticContent(file)) {
        uniqueFiles.push(file);
        continue;
      }

      // Calculate content hash
      const hash = this.calculateHash(file.content);

      if (contentHashes.has(hash)) {
        const previous = contentHashes.get(hash);

        // `keepFirst: false` keeps the last occurrence instead, so the survivor
        // is swapped in place rather than appended. Position is preserved
        // either way: reordering here would undo the sort budgets depend on.
        let kept = previous;
        let dropped = file;

        if (!this.keepFirst) {
          const slot = uniqueFiles.indexOf(previous);
          if (slot !== -1) {
            uniqueFiles[slot] = file;
            kept = file;
            dropped = previous;
            contentHashes.set(hash, file);
          }
        }

        const droppedPath = dropped.path || dropped.relativePath;
        const keptPath = kept.path || kept.relativePath;

        duplicates.push({
          file: droppedPath,
          duplicateOf: keptPath,
          size: dropped.size || dropped.stats?.size || 0,
        });

        input?.exclusionReport?.add({
          path: droppedPath,
          size: dropped.size || dropped.stats?.size || 0,
          reason: EXCLUSION_REASONS.DUPLICATE,
          rule: `duplicateOf:${keptPath}`,
        });

        // Emit deduplication event
        if (context && context.emit) {
          context.emit('file:deduplicated', {
            original: keptPath,
            duplicate: droppedPath,
          });
        }

        logger.debug('Found duplicate file', {
          file: droppedPath,
          original: keptPath,
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
