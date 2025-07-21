const BaseTransformer = require('../BaseTransformer');
const path = require('path');

/**
 * Markdown link stripper transformer
 * Removes markdown links but preserves link text
 */
class MarkdownLinkStripperTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Strip markdown links while preserving text';
    this.supportedExtensions = ['.md', '.markdown', '.mdx'];
    this.stripImages = options.stripImages !== false;
    this.stripFootnotes = options.stripFootnotes !== false;
    this.stripReferences = options.stripReferences !== false;
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    const ext = path.extname(file.path).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Transform markdown by stripping links
   */
  async doTransform(file) {
    try {
      // Get content as string
      let content = Buffer.isBuffer(file.content) 
        ? file.content.toString('utf8') 
        : String(file.content);

      const originalLength = content.length;

      // Strip inline links: [text](url) -> text
      content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

      // Strip reference-style links: [text][ref] -> text
      content = content.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');

      // Strip link definitions: [ref]: url "title"
      if (this.stripReferences) {
        content = content.replace(/^\[[^\]]+\]:\s+.+$/gm, '');
      }

      // Strip images if requested: ![alt](url) -> alt
      if (this.stripImages) {
        content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, (match, alt) => {
          return alt ? `[Image: ${alt}]` : '[Image]';
        });
        
        // Reference-style images: ![alt][ref] -> alt
        content = content.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, (match, alt) => {
          return alt ? `[Image: ${alt}]` : '[Image]';
        });
      }

      // Strip footnotes if requested: [^1] -> ''
      if (this.stripFootnotes) {
        content = content.replace(/\[\^[^\]]+\]/g, '');
        
        // Strip footnote definitions: [^1]: text
        content = content.replace(/^\[\^[^\]]+\]:\s+.+$/gm, '');
      }

      // Clean up any double spaces or empty lines created
      content = content
        .replace(/  +/g, ' ') // Multiple spaces to single
        .replace(/\n\n\n+/g, '\n\n') // Multiple newlines to double
        .trim();

      const strippedLength = content.length;
      const reduction = originalLength > 0 
        ? Math.round((originalLength - strippedLength) / originalLength * 100)
        : 0;

      return {
        ...file,
        content: this.formatOutput(file, content, reduction),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: originalLength,
          strippedSize: strippedLength,
          reduction: `${reduction}%`,
          stripImages: this.stripImages,
          stripFootnotes: this.stripFootnotes,
          stripReferences: this.stripReferences
        }
      };
    } catch (error) {
      this.logger.error('Failed to strip markdown links', {
        file: file.path,
        error: error.message
      });

      // Return original content on error
      return {
        ...file,
        transformed: false,
        error: error.message
      };
    }
  }

  /**
   * Format the output
   */
  formatOutput(file, content, reduction) {
    const filename = path.basename(file.path);
    
    if (reduction > 0) {
      const header = `[Markdown links stripped: ${filename} - ${reduction}% reduction]\n\n`;
      return header + content;
    }
    
    // No changes made
    return content;
  }
}

module.exports = MarkdownLinkStripperTransformer;