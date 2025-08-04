const BaseTransformer = require('../BaseTransformer');
const fs = require('fs-extra');
const path = require('path');
const Tesseract = require('tesseract.js');

/**
 * Image transformer - extracts text from images using OCR
 * Also provides image metadata and description
 */
class ImageTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Extracts text from images using OCR and provides metadata';
    this.supportedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', 
      '.tiff', '.tif', '.webp',
    ];
    this.enableOCR = options.enableOCR ?? true;
    this.language = options.language || 'eng';
    this.includeMetadata = options.includeMetadata ?? true;
    this.isHeavy = true; // OCR is a heavy operation
    
    // Initialize Tesseract worker
    this.worker = null;
  }

  async doTransform(file) {
    try {
      let imagePath = file.absolutePath;
      let tempFile = null;
      
      // If content is base64, write to temp file
      if (!imagePath && file.content && file.encoding === 'base64') {
        const tempDir = require('os').tmpdir();
        tempFile = path.join(tempDir, `copytree-img-${Date.now()}${path.extname(file.path)}`);
        const buffer = Buffer.from(file.content, 'base64');
        await fs.writeFile(tempFile, buffer);
        imagePath = tempFile;
      }
      
      if (!imagePath) {
        return {
          ...file,
          content: '[Image file - no path available for OCR]',
          transformed: false,
          transformedBy: this.constructor.name,
        };
      }

      let output = '';
      
      // Add image metadata
      if (this.includeMetadata) {
        output += '=== Image Information ===\n';
        output += `File: ${path.basename(file.path)}\n`;
        output += `Size: ${this.formatBytes(file.size || 0)}\n`;
        output += `Type: ${this.getImageType(file.path)}\n`;
        output += '\n';
      }

      // Perform OCR if enabled
      if (this.enableOCR) {
        const ocrResult = await this.performOCR(imagePath);
        
        if (ocrResult.confidence > 0) {
          output += '=== Extracted Text (OCR) ===\n';
          output += `Confidence: ${ocrResult.confidence}%\n\n`;
          output += ocrResult.text;
          
          if (ocrResult.blocks && ocrResult.blocks.length > 0) {
            output += '\n\n=== Text Blocks ===\n';
            ocrResult.blocks.forEach((block, index) => {
              output += `\nBlock ${index + 1} (${block.confidence}% confidence):\n`;
              output += block.text + '\n';
            });
          }
        } else {
          output += '[No text detected in image]\n';
        }
      } else {
        output += '[OCR disabled - image content not extracted]\n';
      }
      
      // Clean up temp file if created
      if (tempFile) {
        await fs.remove(tempFile).catch(() => {});
      }

      return {
        ...file,
        content: output,
        originalContent: file.content,
        transformed: true,
        transformedBy: this.constructor.name,
        isImage: true,
      };
    } catch (error) {
      this.logger.error(`Failed to process image ${file.path}: ${error.message}`);
      
      return {
        ...file,
        content: `[Error processing image: ${error.message}]`,
        transformed: false,
        transformedBy: this.constructor.name,
        error: error.message,
      };
    }
  }

  /**
   * Perform OCR on image
   * @param {string} imagePath - Path to image file
   * @returns {Promise<Object>} OCR results
   */
  async performOCR(imagePath) {
    try {
      // Create worker if not exists
      if (!this.worker) {
        this.worker = await Tesseract.createWorker(this.language);
      }

      // Perform OCR
      const { data } = await this.worker.recognize(imagePath);
      
      return {
        text: data.text,
        confidence: data.confidence,
        blocks: data.blocks?.map((block) => ({
          text: block.text,
          confidence: block.confidence,
          bbox: block.bbox,
        })),
      };
    } catch (error) {
      this.logger.warn(`OCR failed for ${imagePath}: ${error.message}`);
      return {
        text: '',
        confidence: 0,
        error: error.message,
      };
    }
  }

  /**
   * Get human-readable image type
   * @param {string} filePath - Image file path
   * @returns {string} Image type description
   */
  getImageType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.jpg': 'JPEG Image',
      '.jpeg': 'JPEG Image',
      '.png': 'PNG Image',
      '.gif': 'GIF Animation',
      '.bmp': 'Bitmap Image',
      '.tiff': 'TIFF Image',
      '.tif': 'TIFF Image',
      '.webp': 'WebP Image',
    };
    
    return typeMap[ext] || 'Image';
  }

  canTransform(file) {
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = ImageTransformer;