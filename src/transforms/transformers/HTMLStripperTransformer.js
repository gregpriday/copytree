import BaseTransformer from '../BaseTransformer.js';
import path from 'path';

/**
 * HTML stripper transformer
 * Converts HTML to plain text by removing tags and formatting
 */
class HTMLStripperTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Strip HTML tags and convert to plain text';
    this.supportedExtensions = ['.html', '.htm', '.xhtml'];
    this.preserveLinks = options.preserveLinks !== false;
    this.preserveNewlines = options.preserveNewlines !== false;
    this.decodeEntities = options.decodeEntities !== false;
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    const ext = path.extname(file.path).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Transform HTML to plain text
   */
  async doTransform(file) {
    try {
      // Get content as string
      const htmlContent = Buffer.isBuffer(file.content)
        ? file.content.toString('utf8')
        : String(file.content);

      // Strip HTML and convert to text
      let textContent = htmlContent;

      // Remove script and style content
      textContent = textContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      textContent = textContent.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // Replace links with text representation if requested
      if (this.preserveLinks) {
        textContent = textContent.replace(
          /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
          '$2 [$1]',
        );
      }

      // Replace common block elements with newlines
      if (this.preserveNewlines) {
        // Block elements
        textContent = textContent.replace(
          /<\/?(p|div|h[1-6]|ul|ol|li|blockquote|pre|hr|br|tr)\b[^>]*>/gi,
          '\n',
        );

        // Add extra newline for headers
        textContent = textContent.replace(/<h[1-6]\b[^>]*>/gi, '\n\n');
      }

      // Remove all remaining HTML tags
      textContent = textContent.replace(/<[^>]+>/g, '');

      // Decode HTML entities if requested
      if (this.decodeEntities) {
        textContent = this.decodeHtmlEntities(textContent);
      }

      // Clean up whitespace
      textContent = textContent
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple blank lines to double
        .replace(/[ \t]+/g, ' ') // Multiple spaces to single
        .replace(/^\s+|\s+$/gm, '') // Trim lines
        .trim();

      return {
        ...file,
        content: this.formatOutput(file, textContent, htmlContent.length),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: htmlContent.length,
          strippedSize: textContent.length,
          reduction: Math.round((1 - textContent.length / htmlContent.length) * 100) + '%',
        },
      };
    } catch (error) {
      this.logger.error('Failed to strip HTML', {
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
   * Decode common HTML entities
   */
  decodeHtmlEntities(text) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': '\'',
      '&apos;': '\'',
      '&nbsp;': ' ',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&euro;': '€',
      '&pound;': '£',
      '&yen;': '¥',
      '&cent;': '¢',
      '&deg;': '°',
      '&plusmn;': '±',
      '&frac12;': '½',
      '&frac14;': '¼',
      '&frac34;': '¾',
      '&times;': '×',
      '&divide;': '÷',
      '&alpha;': 'α',
      '&beta;': 'β',
      '&gamma;': 'γ',
      '&delta;': 'δ',
      '&epsilon;': 'ε',
      '&lambda;': 'λ',
      '&mu;': 'μ',
      '&pi;': 'π',
      '&sigma;': 'σ',
      '&omega;': 'ω',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'g'), char);
    }

    // Decode numeric entities
    decoded = decoded.replace(/&#(\d+);/g, (match, num) => String.fromCharCode(parseInt(num)));
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );

    return decoded;
  }

  /**
   * Format the output
   */
  formatOutput(file, content, originalSize) {
    const filename = path.basename(file.path);
    const header = `[HTML stripped: ${filename} - Reduced from ${this.formatBytes(originalSize)}]\n\n`;

    return header + content;
  }
}

export default HTMLStripperTransformer;
