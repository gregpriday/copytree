import Stage from '../Stage.js';

class CharLimitStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.limit = options.limit || 2000000; // 2M chars default
  }

  async process(input) {
    this.log(`Applying character limit of ${this.limit.toLocaleString()} characters`, 'debug');
    const startTime = Date.now();

    let totalChars = 0;
    const limitedFiles = [];
    let truncatedFiles = 0;
    let skippedFiles = 0;

    for (const file of input.files) {
      if (!file || !file.content) {
        limitedFiles.push(file);
        continue;
      }

      const contentLength = file.content.length;

      if (totalChars + contentLength <= this.limit) {
        // File fits entirely
        limitedFiles.push(file);
        totalChars += contentLength;
      } else if (totalChars < this.limit) {
        // File partially fits
        const remainingChars = this.limit - totalChars;
        const truncatedContent = file.content.substring(0, remainingChars);

        limitedFiles.push({
          ...file,
          content: truncatedContent + '\n\n... truncated due to character limit ...',
          originalLength: contentLength,
          truncated: true,
        });

        totalChars += truncatedContent.length;
        truncatedFiles++;
        break; // Hit the limit
      } else {
        // No more room
        skippedFiles++;
      }
    }

    this.log(
      `Character limit applied: ${totalChars.toLocaleString()} chars used, ${truncatedFiles} truncated, ${skippedFiles} skipped in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      files: limitedFiles,
      stats: {
        ...input.stats,
        totalCharacters: totalChars,
        characterLimit: this.limit,
        truncatedFiles,
        skippedFiles,
      },
    };
  }
}

export default CharLimitStage;
