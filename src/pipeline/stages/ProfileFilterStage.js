import Stage from '../Stage.js';
import { minimatch } from 'minimatch';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';

class ProfileFilterStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.exclude = options.exclude || [];
    this.filter = options.filter || []; // Always include these
  }

  async process(input) {
    // With neither list populated the filter admits every file, so the only
    // effect of running it is a full pass over the selection and a rebuilt
    // array. That is the default case for a plain `copytree`.
    if (this.exclude.length === 0 && this.filter.length === 0) {
      this.log('No filter patterns, skipping', 'debug');
      return input;
    }

    this.log('Applying filters', 'debug');
    const startTime = Date.now();

    const originalCount = input.files.length;
    const report = input.exclusionReport;

    // Filter files
    const filteredFiles = input.files.filter((file) => {
      // Always include files marked as force-include (highest priority)
      if (file.alwaysInclude) {
        return true;
      }

      // Check if file should be always included
      if (this.filter.length > 0) {
        let matched = false;
        for (const pattern of this.filter) {
          if (minimatch(file.path, pattern, { dot: true, nocase: process.platform === 'win32' })) {
            matched = true;
            break;
          }
        }
        // If filter patterns exist but file doesn't match any, exclude it
        if (!matched) {
          this.log(`Excluding ${file.path} (no filter match)`, 'debug');
          report?.add({
            path: file.path,
            size: file.size || 0,
            reason: EXCLUSION_REASONS.FILTER_PATTERN,
            rule: this.filter.join(', '),
          });
          return false;
        }
      }

      // Check exclusion patterns
      for (const pattern of this.exclude) {
        if (minimatch(file.path, pattern, { dot: true, nocase: process.platform === 'win32' })) {
          this.log(`Excluding ${file.path} (matches ${pattern})`, 'debug');
          report?.add({
            path: file.path,
            size: file.size || 0,
            reason: EXCLUSION_REASONS.OPTION_EXCLUDE,
            rule: pattern,
          });
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
