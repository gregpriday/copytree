const Stage = require('../Stage');
const { AIService } = require('../../services/AIService');

/**
 * AI Filter Stage - Uses AI to filter files based on natural language queries
 */
class AIFilterStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.query = options.query;
    this.ai = new AIService({ modelType: 'small' });
  }

  async process(input) {
    if (!this.query) {
      this.log('No AI query provided, skipping AI filtering', 'debug');
      return input;
    }

    this.log(`Applying AI filter: "${this.query}"`, 'info');
    const startTime = Date.now();

    try {
      // Prepare file information for AI
      const fileInfo = input.files.map(file => ({
        path: file.path,
        size: file.size,
        extension: file.path.match(/\.[^.]+$/)?.[0] || '',
        // Include first 200 chars of content if available
        preview: file.content ? file.content.substring(0, 200) : ''
      }));

      // Filter files using AI
      const filteredFiles = await this.ai.filterFiles(fileInfo, this.query);
      
      // Get the paths of filtered files
      const filteredPaths = new Set(filteredFiles.map(f => f.path));
      
      // Filter the original files
      const result = {
        ...input,
        files: input.files.filter(file => filteredPaths.has(file.path))
      };

      const removedCount = input.files.length - result.files.length;
      this.log(`AI filter completed in ${this.getElapsedTime(startTime)}, removed ${removedCount} files`, 'info');
      
      this.emit('ai:filter:complete', {
        query: this.query,
        originalCount: input.files.length,
        filteredCount: result.files.length,
        removedCount
      });

      return result;
    } catch (error) {
      this.log(`AI filter failed: ${error.message}`, 'error');
      
      // On error, return original input
      this.emit('ai:filter:error', {
        query: this.query,
        error: error.message
      });
      
      return input;
    }
  }
}

module.exports = AIFilterStage;