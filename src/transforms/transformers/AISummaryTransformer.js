import BaseTransformer from '../BaseTransformer.js';
import { AIService } from '../../services/AIService.js';

/**
 * AI Summary Transformer - Uses AI to generate summaries of files
 */
class AISummaryTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generates AI-powered summaries of file contents';
    this.supportedExtensions = options.extensions || [
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.py',
      '.java',
      '.go',
      '.rs',
      '.cpp',
      '.c',
      '.php',
      '.rb',
      '.swift',
      '.kt',
      '.scala',
      '.r',
      '.m',
      '.h',
      '.cs',
    ];
    this.maxFileSize = options.maxFileSize || 100 * 1024; // 100KB default
    this.includeOriginal = options.includeOriginal ?? false;

    // Initialize AI service
    this.ai = AIService.forTask('codeDescription', options);
    this.isHeavy = true; // AI analysis is a heavy operation
  }

  async doTransform(file) {
    try {
      // Skip if file is too large
      if (file.size > this.maxFileSize) {
        return {
          ...file,
          content: `[File too large for AI summary: ${this.formatBytes(file.size)}]`,
          transformed: false,
          transformedBy: this.constructor.name,
        };
      }

      // Skip if no content
      if (!file.content) {
        return {
          ...file,
          transformed: false,
          transformedBy: this.constructor.name,
        };
      }

      this.logger.debug(`Generating AI summary for ${file.path}`);

      // Generate summary
      const summary = await this.ai.summarizeCode(file.content, {
        filePath: file.path,
        language: this.detectLanguage(file.path),
      });

      // Build output
      let output = `=== AI Summary ===\n${summary}\n`;

      if (this.includeOriginal) {
        output += `\n=== Original Content ===\n${file.content}`;
      }

      return {
        ...file,
        content: output,
        originalContent: file.content,
        transformed: true,
        transformedBy: this.constructor.name,
        aiSummary: summary,
      };
    } catch (error) {
      this.logger.error(`Failed to generate AI summary for ${file.path}: ${error.message}`);

      return {
        ...file,
        content: `[Error generating AI summary: ${error.message}]\n\n${file.content}`,
        transformed: false,
        transformedBy: this.constructor.name,
        error: error.message,
      };
    }
  }

  /**
   * Detect programming language from file extension
   * @param {string} filePath - File path
   * @returns {string} Language name
   */
  detectLanguage(filePath) {
    const ext = (filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    const languageMap = {
      '.js': 'JavaScript',
      '.jsx': 'React JSX',
      '.ts': 'TypeScript',
      '.tsx': 'React TSX',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.cpp': 'C++',
      '.c': 'C',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.r': 'R',
      '.m': 'Objective-C',
      '.h': 'C/C++ Header',
      '.cs': 'C#',
    };

    return languageMap[ext] || 'Unknown';
  }

  canTransform(file) {
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }
}

export default AISummaryTransformer;
