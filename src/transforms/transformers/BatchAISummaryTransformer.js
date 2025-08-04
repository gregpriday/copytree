import BaseTransformer from '../BaseTransformer.js';
import { AIService } from '../../services/AIService.js';

/**
 * Batch AI Summary Transformer - Processes multiple files in a single AI request
 */
class BatchAISummaryTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generates AI-powered summaries of multiple files in batches';
    this.supportedExtensions = options.extensions || [
      '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c',
      '.php', '.rb', '.swift', '.kt', '.scala', '.r', '.m', '.h', '.cs',
    ];
    this.maxFileSize = options.maxFileSize || 50 * 1024; // 50KB per file
    this.batchSize = options.batchSize || 5; // Process 5 files at a time
    this.maxBatchSize = options.maxBatchSize || 200 * 1024; // 200KB total batch size
    this.includeOriginal = options.includeOriginal ?? false;
    
    // Initialize AI service
    this.ai = AIService.forTask('codeDescription', options);
    
    // Batch queue
    this.batchQueue = [];
    this.batchPromises = new Map();
    this.isHeavy = true; // AI batch analysis is a heavy operation
  }

  async doTransform(file) {
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

    // Add to batch queue
    const batchPromise = this.addToBatch(file);
    
    // Wait for batch result
    const summary = await batchPromise;

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
  }

  /**
   * Add file to batch and return promise for its summary
   */
  async addToBatch(file) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ file, resolve, reject });
      
      // Check if we should process the batch
      if (this.shouldProcessBatch()) {
        this.processBatch();
      }
    });
  }

  /**
   * Check if batch should be processed
   */
  shouldProcessBatch() {
    if (this.batchQueue.length >= this.batchSize) {
      return true;
    }
    
    // Check total size
    const totalSize = this.batchQueue.reduce((sum, item) => sum + (item.file.size || 0), 0);
    if (totalSize >= this.maxBatchSize) {
      return true;
    }
    
    return false;
  }

  /**
   * Process a batch of files
   */
  async processBatch() {
    if (this.batchQueue.length === 0) return;
    
    // Take items from queue
    const batchItems = this.batchQueue.splice(0, this.batchSize);
    
    try {
      this.logger.debug(`Processing batch of ${batchItems.length} files for AI summary`);
      
      // Create batch prompt
      const batchPrompt = this.createBatchPrompt(batchItems.map((item) => item.file));
      
      // Get batch summary
      const response = await this.ai.complete({
        prompt: batchPrompt,
        temperature: 0.3,
        maxTokens: 2000,
      });
      
      // Parse response and resolve promises
      const summaries = this.parseBatchResponse(response.content, batchItems.length);
      
      batchItems.forEach((item, index) => {
        const summary = summaries[index] || 'Summary not available';
        item.resolve(summary);
      });
      
    } catch (error) {
      this.logger.error(`Batch AI summary failed: ${error.message}`);
      
      // Reject all promises in batch
      batchItems.forEach((item) => {
        item.reject(error);
      });
    }
  }

  /**
   * Create batch prompt for multiple files
   */
  createBatchPrompt(files) {
    let prompt = `Please provide clear and concise summaries for the following ${files.length} code files. For each file, focus on what it does, its main components, and any important patterns or techniques used.

Format your response with clear separators between summaries using "=== FILE N ===" markers.

`;

    files.forEach((file, index) => {
      const language = this.detectLanguage(file.path);
      prompt += `=== FILE ${index + 1} ===
Path: ${file.path}
Language: ${language}
Size: ${this.formatBytes(file.size)}

Code:
\`\`\`
${file.content.substring(0, 10000)} // Truncated if needed
\`\`\`

`;
    });

    prompt += `Please provide summaries for all ${files.length} files above:`;
    
    return prompt;
  }

  /**
   * Parse batch response into individual summaries
   */
  parseBatchResponse(response, expectedCount) {
    const summaries = [];
    
    // Split by file markers
    const parts = response.split(/=== FILE \d+ ===/);
    
    // Skip first empty part
    for (let i = 1; i <= expectedCount; i++) {
      if (parts[i]) {
        summaries.push(parts[i].trim());
      } else {
        summaries.push('Summary not available');
      }
    }
    
    return summaries;
  }

  /**
   * Detect programming language from file extension
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

  /**
   * Flush any remaining batches when done
   */
  async flush() {
    while (this.batchQueue.length > 0) {
      await this.processBatch();
    }
  }
}

export default BatchAISummaryTransformer;