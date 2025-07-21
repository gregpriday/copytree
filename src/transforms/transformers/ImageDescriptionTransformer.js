const BaseTransformer = require('../BaseTransformer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs-extra');

/**
 * Image description transformer using Gemini Vision API
 * Generates detailed descriptions of images for developers
 */
class ImageDescriptionTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Generate AI-powered descriptions of images';
    this.supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    this.maxImageSize = options.maxImageSize || 10 * 1024 * 1024; // 10MB default
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    
    if (!this.apiKey) {
      this.logger.warn('No Gemini API key provided, image descriptions will be disabled');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: options.model || "gemini-1.5-flash"
      });
    }
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    const ext = path.extname(file.path).toLowerCase();
    return this.supportedExtensions.includes(ext) && this.apiKey;
  }

  /**
   * Transform image to description
   */
  async doTransform(file) {
    // Check file size
    const size = file.stats?.size || Buffer.byteLength(file.content);
    if (size > this.maxImageSize) {
      return {
        ...file,
        content: `[Image too large for description: ${this.formatBytes(size)}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          skippedReason: 'size_limit_exceeded'
        }
      };
    }

    try {
      // Get image buffer
      let imageBuffer;
      if (Buffer.isBuffer(file.content)) {
        imageBuffer = file.content;
      } else if (file.path && await fs.pathExists(file.path)) {
        imageBuffer = await fs.readFile(file.path);
      } else {
        throw new Error('No image content available');
      }

      // Convert to base64
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(file.path);

      // Generate description using Gemini
      const prompt = this.options.prompt || `Describe this image in detail for a developer. Include:
- What the image shows
- Key visual elements and their arrangement
- Any text or code visible in the image
- Color scheme and design patterns
- Potential use case or context
Keep the description concise but informative (2-3 paragraphs).`;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        }
      ]);

      const description = result.response.text();

      return {
        ...file,
        content: this.formatDescription(file, description, size),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          mimeType: mimeType,
          model: this.model.model
        }
      };
    } catch (error) {
      this.logger.error('Failed to generate image description', {
        file: file.path,
        error: error.message
      });

      // Return placeholder on error
      return {
        ...file,
        content: `[Image: ${path.basename(file.path)} - ${this.formatBytes(size)}]\n[Description generation failed: ${error.message}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          error: error.message
        }
      };
    }
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Format the description output
   */
  formatDescription(file, description, size) {
    const filename = path.basename(file.path);
    const dimensions = file.metadata?.dimensions ? 
      ` (${file.metadata.dimensions.width}x${file.metadata.dimensions.height})` : '';
    
    return `[Image: ${filename}${dimensions} - ${this.formatBytes(size)}]

${description}

[AI-generated description by ${this.constructor.name}]`;
  }
}

module.exports = ImageDescriptionTransformer;