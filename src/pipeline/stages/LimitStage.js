import Stage from '../Stage.js';

class LimitStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.limit = options.limit || 100;
  }

  async process(input) {
    this.log(`Limiting to first ${this.limit} files`, 'debug');

    if (input.files.length <= this.limit) {
      return input;
    }

    const limitedFiles = input.files.slice(0, this.limit);
    const truncatedCount = input.files.length - this.limit;

    this.log(`Limited output to ${this.limit} files (${truncatedCount} truncated)`, 'info');

    return {
      ...input,
      files: limitedFiles,
      stats: {
        ...input.stats,
        truncated: true,
        truncatedCount,
      },
    };
  }
}

export default LimitStage;