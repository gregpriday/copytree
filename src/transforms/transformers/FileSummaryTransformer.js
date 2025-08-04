const BaseTransformer = require('../BaseTransformer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

/**
 * File summary transformer using Gemini API
 * Generates concise summaries of file contents
 */
class FileSummaryTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generate AI-powered summaries of files';
    this.maxFileSize = options.maxFileSize || 100 * 1024; // 100KB default
    this.maxInputTokens = options.maxInputTokens || 4000;
    this.summaryLength = options.summaryLength || '2-3 sentences';
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      this.logger.warn('No Gemini API key provided, file summaries will be disabled');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: options.model || this.config.get('ai.gemini.model'),
      });
    }
    
    this.isHeavy = true; // AI file analysis is a heavy operation
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    if (!this.apiKey) return false;
    
    // Only summarize text files
    if (file.type === 'binary' || file.isBinary) return false;
    
    // Check file size
    const size = file.stats?.size || Buffer.byteLength(file.content);
    return size <= this.maxFileSize;
  }

  /**
   * Transform file to summary
   */
  async doTransform(file) {
    try {
      // Get content as string
      const content = Buffer.isBuffer(file.content) 
        ? file.content.toString('utf8') 
        : String(file.content);

      // Truncate content if too long
      const truncatedContent = content.length > this.maxInputTokens * 4
        ? content.substring(0, this.maxInputTokens * 4) + '\n... (truncated)'
        : content;

      // Detect file type for better prompts
      const fileType = this.detectFileType(file);
      
      // Generate prompt based on file type
      const prompt = this.generatePrompt(fileType, file.path, truncatedContent);

      // Generate summary using Gemini
      const result = await this.model.generateContent(prompt);
      const summary = result.response.text();

      return {
        ...file,
        content: this.formatOutput(file, summary, content.length),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: content.length,
          fileType: fileType,
          truncated: content.length > this.maxInputTokens * 4,
          model: this.model.model,
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate file summary', {
        file: file.path,
        error: error.message,
      });

      // Return truncated content on error
      const content = Buffer.isBuffer(file.content) 
        ? file.content.toString('utf8') 
        : String(file.content);
      
      return {
        ...file,
        content: content.substring(0, 500) + '\n\n... (summary generation failed)',
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          error: error.message,
        },
      };
    }
  }

  /**
   * Detect file type from extension and content
   */
  detectFileType(file) {
    const ext = path.extname(file.path).toLowerCase();
    
    // Map extensions to file types
    const typeMap = {
      '.js': 'javascript',
      '.jsx': 'react',
      '.ts': 'typescript',
      '.tsx': 'react-typescript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.rs': 'rust',
      '.css': 'css',
      '.scss': 'scss',
      '.html': 'html',
      '.xml': 'xml',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.txt': 'text',
      '.sh': 'shell',
      '.sql': 'sql',
      '.dockerfile': 'dockerfile',
      '.makefile': 'makefile',
    };

    return typeMap[ext] || file.type || 'unknown';
  }

  /**
   * Generate appropriate prompt based on file type
   */
  generatePrompt(fileType, filePath, content) {
    const filename = path.basename(filePath);
    const basePrompt = `Summarize this ${fileType} file in ${this.summaryLength}. Focus on what the file does, its main purpose, and key functionality.`;
    
    // Type-specific prompts
    const typePrompts = {
      'javascript': 'Mention key functions, classes, or exports.',
      'react': 'Describe the component(s), props, and main UI elements.',
      'typescript': 'Include type definitions and interfaces if significant.',
      'python': 'Mention classes, functions, and main logic flow.',
      'css': 'Describe the styling targets and main visual effects.',
      'json': 'Describe the data structure and main fields.',
      'markdown': 'Summarize the document content and main topics.',
      'yaml': 'Describe the configuration structure and key settings.',
      'dockerfile': 'Describe the base image and main build steps.',
      'sql': 'Describe the database operations or schema.',
    };

    const typeSpecific = typePrompts[fileType] || '';
    
    return `${basePrompt} ${typeSpecific}

File: ${filename}
Content:
${content}`;
  }

  /**
   * Format the output
   */
  formatOutput(file, summary, originalSize) {
    const filename = path.basename(file.path);
    const header = `[Summary of ${filename} - ${this.formatBytes(originalSize)}]\n\n`;
    const footer = `\n\n[AI-generated summary by ${this.constructor.name}]`;
    
    return header + summary.trim() + footer;
  }
}

module.exports = FileSummaryTransformer;