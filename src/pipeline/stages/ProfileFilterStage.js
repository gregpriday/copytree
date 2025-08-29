import Stage from '../Stage.js';
import { minimatch } from 'minimatch';

class ProfileFilterStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.exclude = options.exclude || [];
    this.filter = options.filter || []; // Always include these
  }

  async process(input) {
    this.log('Applying profile filters', 'debug');
    const startTime = Date.now();

    const originalCount = input.files.length;

    // Filter files
    const filteredFiles = input.files.filter((file) => {
      // Check if file should be always included
      if (this.filter.length > 0) {
        let matched = false;
        for (const pattern of this.filter) {
          if (minimatch(file.path, pattern)) {
            matched = true;
            break;
          }
        }
        // If filter patterns exist but file doesn't match any, exclude it
        if (!matched) {
          this.log(`Excluding ${file.path} (no filter match)`, 'debug');
          return false;
        }
      }

      // Check exclusion patterns
      for (const pattern of this.exclude) {
        if (minimatch(file.path, pattern, { dot: true })) {
          this.log(`Excluding ${file.path} (matches ${pattern})`, 'debug');
          return false;
        }
      }

      return true;
    });

    const excludedCount = originalCount - filteredFiles.length;

    this.log(
      `Filtered ${excludedCount} files (${filteredFiles.length} remaining) in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      files: filteredFiles,
      stats: {
        ...input.stats,
        excludedByProfile: excludedCount,
      },
    };
  }
}

export default ProfileFilterStage;
