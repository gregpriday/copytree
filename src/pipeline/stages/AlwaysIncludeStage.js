import Stage from '../Stage.js';
import { minimatch } from 'minimatch';
import path from 'path';
import { logger } from '../../utils/logger.js';

/**
 * Always include stage - Ensures specific files are always included regardless of other filters
 * This stage should be used in conjunction with ProfileFilterStage
 */
class AlwaysIncludeStage extends Stage {
  constructor(alwaysPatterns = []) {
    super();
    this.alwaysPatterns = Array.isArray(alwaysPatterns) ? alwaysPatterns : [alwaysPatterns];
  }

  /**
   * Process files and mark those that should always be included
   */
  async process(input) {
    const { files } = input;

    if (!this.alwaysPatterns || this.alwaysPatterns.length === 0) {
      this.log('No always-include patterns configured', 'debug');
      return input;
    }

    const startTime = Date.now();
    let alwaysIncludeCount = 0;

    this.log(`Processing ${this.alwaysPatterns.length} always-include pattern(s)`, 'info');

    // Mark files that match always patterns
    const processedFiles = files.map((file) => {
      if (this.matchesAlwaysPatterns(file)) {
        alwaysIncludeCount++;

        logger.debug('File marked as always-include', {
          path: file.path || file.relativePath,
          patterns: this.alwaysPatterns,
        });

        return {
          ...file,
          alwaysInclude: true,
        };
      }

      return file;
    });

    const elapsed = this.getElapsedTime(startTime);
    this.log(`Marked ${alwaysIncludeCount} file(s) as always-include in ${elapsed}`, 'info');

    return {
      ...input,
      files: processedFiles,
      alwaysPatterns: this.alwaysPatterns,
    };
  }

  /**
   * Check if a file matches any of the always patterns
   */
  matchesAlwaysPatterns(file) {
    const filePath = file.path || file.relativePath;

    for (const pattern of this.alwaysPatterns) {
      // Support both glob patterns and exact matches
      if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
        // Glob pattern
        if (
          minimatch(filePath, pattern, {
            matchBase: true,
            dot: true,
            nocase: process.platform === 'win32',
          })
        ) {
          return true;
        }
      } else {
        // Exact match or path contains
        if (filePath === pattern || filePath.includes(pattern)) {
          return true;
        }

        // Also check basename for convenience
        if (path.basename(filePath) === pattern) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate input
   */
  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }

    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }

    return true;
  }
}

export default AlwaysIncludeStage;
