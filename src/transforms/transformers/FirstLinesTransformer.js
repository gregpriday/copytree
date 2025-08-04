import BaseTransformer from '../BaseTransformer.js';
import path from 'path';

/**
 * First lines transformer
 * Returns only the first N lines of text files
 */
class FirstLinesTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Extract first N lines from text files';
    this.lineCount = options.lineCount || 20;
    this.includeLineNumbers = options.includeLineNumbers || false;
    this.skipEmptyLines = options.skipEmptyLines || false;
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    // Only transform text files
    return file.type !== 'binary' && !file.isBinary;
  }

  /**
   * Transform file to show only first lines
   */
  async doTransform(file) {
    try {
      // Get content as string
      const content = Buffer.isBuffer(file.content) 
        ? file.content.toString('utf8') 
        : String(file.content);

      // Split into lines
      let lines = content.split(/\r?\n/);
      const totalLines = lines.length;

      // Filter empty lines if requested
      if (this.skipEmptyLines) {
        lines = lines.filter((line, index) => {
          // Keep track of original line numbers
          line._originalIndex = index;
          return line.trim().length > 0;
        });
      }

      // Get first N lines
      const firstLines = lines.slice(0, this.lineCount);

      // Add line numbers if requested
      let processedLines;
      if (this.includeLineNumbers) {
        processedLines = firstLines.map((line, index) => {
          const lineNum = this.skipEmptyLines && line._originalIndex !== undefined
            ? line._originalIndex + 1
            : index + 1;
          return `${String(lineNum).padStart(4)} | ${line}`;
        });
      } else {
        processedLines = firstLines;
      }

      // Join lines back together
      const truncatedContent = processedLines.join('\n');

      // Add truncation notice if needed
      const remainingLines = totalLines - firstLines.length;
      let finalContent = truncatedContent;
      
      if (remainingLines > 0) {
        finalContent += `\n\n... (${remainingLines} more lines truncated)`;
      }

      return {
        ...file,
        content: this.formatOutput(file, finalContent, totalLines, firstLines.length),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          totalLines: totalLines,
          shownLines: firstLines.length,
          truncated: remainingLines > 0,
          lineCount: this.lineCount,
          skipEmptyLines: this.skipEmptyLines,
        },
      };
    } catch (error) {
      this.logger.error('Failed to extract first lines', {
        file: file.path,
        error: error.message,
      });

      // Return original content on error
      return {
        ...file,
        transformed: false,
        error: error.message,
      };
    }
  }

  /**
   * Format the output
   */
  formatOutput(file, content, totalLines, shownLines) {
    const filename = path.basename(file.path);
    const header = `[First ${shownLines} of ${totalLines} lines from: ${filename}]\n\n`;
    
    return header + content;
  }
}

export default FirstLinesTransformer;