import BaseTransformer from '../BaseTransformer.js';
import fs from 'fs-extra';
import { PDFParse } from 'pdf-parse';

/**
 * PDF transformer - extracts text from PDF files
 */
class PDFTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Extracts text content from PDF files';
    this.supportedExtensions = ['.pdf'];
    this.maxPages = options.maxPages || 50;
    this.includeMetadata = options.includeMetadata ?? true;
    this.isHeavy = true; // PDF parsing is a heavy operation
  }

  async doTransform(file) {
    // Load PDF buffer if not already loaded
    let buffer;

    if (file.content) {
      // If content is base64, decode it
      if (file.encoding === 'base64') {
        buffer = Buffer.from(file.content, 'base64');
      } else if (Buffer.isBuffer(file.content)) {
        buffer = file.content;
      } else {
        // Content is not suitable for PDF parsing
        return {
          ...file,
          content: '[PDF file - unable to parse content]',
          transformed: false,
          transformedBy: this.constructor.name,
          error: 'Invalid content format for PDF',
        };
      }
    } else if (file.absolutePath) {
      try {
        buffer = await fs.readFile(file.absolutePath);
      } catch (error) {
        return {
          ...file,
          content: `[Error loading PDF: ${error.message}]`,
          transformed: false,
          transformedBy: this.constructor.name,
          error: error.message,
        };
      }
    } else {
      return {
        ...file,
        content: '[PDF file - no content available]',
        transformed: false,
        transformedBy: this.constructor.name,
      };
    }

    // PDF parser instance
    let parser = null;

    try {
      // Create parser with buffer (pdf-parse v2 API)
      parser = new PDFParse({ data: buffer });

      // Get text content from PDF
      const data = await parser.getText({
        // Limit pages if needed
        ...(this.maxPages && { partial: Array.from({ length: this.maxPages }, (_, i) => i + 1) }),
      });

      // Build output
      let output = '';

      if (this.includeMetadata && data.info) {
        output += '=== PDF Metadata ===\n';
        if (data.info.Title) output += `Title: ${data.info.Title}\n`;
        if (data.info.Author) output += `Author: ${data.info.Author}\n`;
        if (data.info.Subject) output += `Subject: ${data.info.Subject}\n`;
        if (data.info.Creator) output += `Creator: ${data.info.Creator}\n`;
        if (data.info.Producer) output += `Producer: ${data.info.Producer}\n`;
        if (data.info.CreationDate) {
          output += `Created: ${this.formatPDFDate(data.info.CreationDate)}\n`;
        }
        if (data.info.ModDate) {
          output += `Modified: ${this.formatPDFDate(data.info.ModDate)}\n`;
        }
        output += `Pages: ${data.numpages}\n`;
        output += '\n=== Content ===\n';
      }

      // Add text content
      output += data.text;

      // Add page limit notice if applicable
      if (data.numpages > this.maxPages) {
        output += `\n\n[... PDF contains ${data.numpages} pages, showing first ${this.maxPages} ...]`;
      }

      return {
        ...file,
        content: output,
        originalContent: file.content,
        isBinary: false, // Mark as text after successful conversion
        encoding: 'utf8',
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          pages: data.numpages,
          info: data.info,
          version: data.version,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to parse PDF ${file.path}: ${error.message}`);

      return {
        ...file,
        content: `[Error parsing PDF: ${error.message}]`,
        transformed: false,
        transformedBy: this.constructor.name,
        error: error.message,
      };
    } finally {
      // Clean up parser resources
      if (parser) {
        try {
          await parser.destroy();
        } catch (cleanupError) {
          this.logger.warn(`Failed to cleanup PDF parser: ${cleanupError.message}`);
        }
      }
    }
  }

  /**
   * Format PDF date string
   * @param {string} dateStr - PDF date string (e.g., "D:20230101120000Z")
   * @returns {string} Formatted date
   */
  formatPDFDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;

    // PDF dates are in format: D:YYYYMMDDHHmmSSOHH'mm'
    const match = dateStr.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [_, year, month, day, hour, minute, second] = match;
      const date = new Date(year, month - 1, day, hour, minute, second);
      return date.toLocaleString();
    }

    return dateStr;
  }

  canTransform(file) {
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }
}

export default PDFTransformer;
