const BaseTransformer = require('../BaseTransformer');
const path = require('path');

/**
 * Binary file transformer
 * Handles binary files based on configuration
 */
class BinaryTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Handles binary files with placeholder text or base64 encoding';
    this.supportedExtensions = [
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.svg',
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      // Archives
      '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
      // Executables
      '.exe', '.dll', '.so', '.dylib', '.app',
      // Media
      '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
      // Other
      '.db', '.sqlite', '.bin', '.dat'
    ];
  }

  async doTransform(file) {
    const action = this.config.get('copytree.binaryFileAction', 'placeholder');
    
    switch (action) {
      case 'skip':
        return null;
        
      case 'base64':
        return await this.transformToBase64(file);
        
      case 'placeholder':
      default:
        return this.transformToPlaceholder(file);
    }
  }

  /**
   * Transform to placeholder text
   * @param {Object} file - File object
   * @returns {Object} Transformed file
   */
  transformToPlaceholder(file) {
    const placeholderText = this.config.get(
      'copytree.binaryPlaceholderText', 
      '[Binary file not included]'
    );

    const fileInfo = [
      placeholderText,
      `Type: ${this.getFileType(file.path)}`,
      `Size: ${this.formatBytes(file.size || 0)}`
    ].join('\n');

    return {
      ...file,
      content: fileInfo,
      transformed: true,
      transformedBy: this.constructor.name,
      isBinary: true,
      binaryAction: 'placeholder'
    };
  }

  /**
   * Transform to base64
   * @param {Object} file - File object
   * @returns {Promise<Object>} Transformed file
   */
  async transformToBase64(file) {
    const fs = require('fs-extra');
    
    try {
      // Check size limit for base64 encoding
      const maxBase64Size = this.config.get('copytree.maxBase64Size', 1024 * 1024); // 1MB default
      
      if (file.size > maxBase64Size) {
        this.logger.warn(`File ${file.path} too large for base64 encoding (${this.formatBytes(file.size)})`);
        return this.transformToPlaceholder(file);
      }

      const buffer = await fs.readFile(file.absolutePath);
      const base64 = buffer.toString('base64');
      
      // Add metadata comment
      const content = [
        `[Binary file encoded as base64]`,
        `Type: ${this.getFileType(file.path)}`,
        `Size: ${this.formatBytes(file.size || 0)}`,
        `Encoding: base64`,
        '',
        base64
      ].join('\n');

      return {
        ...file,
        content,
        transformed: true,
        transformedBy: this.constructor.name,
        isBinary: true,
        binaryAction: 'base64',
        encoding: 'base64'
      };
    } catch (error) {
      this.logger.error(`Failed to encode ${file.path} to base64: ${error.message}`);
      return this.transformToPlaceholder(file);
    }
  }

  /**
   * Get human-readable file type
   * @param {string} filePath - File path
   * @returns {string} File type description
   */
  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const typeMap = {
      // Images
      '.jpg': 'JPEG Image',
      '.jpeg': 'JPEG Image',
      '.png': 'PNG Image',
      '.gif': 'GIF Image',
      '.bmp': 'Bitmap Image',
      '.webp': 'WebP Image',
      '.ico': 'Icon',
      '.svg': 'SVG Image',
      
      // Documents
      '.pdf': 'PDF Document',
      '.doc': 'Word Document',
      '.docx': 'Word Document',
      '.xls': 'Excel Spreadsheet',
      '.xlsx': 'Excel Spreadsheet',
      '.ppt': 'PowerPoint Presentation',
      '.pptx': 'PowerPoint Presentation',
      
      // Archives
      '.zip': 'ZIP Archive',
      '.tar': 'TAR Archive',
      '.gz': 'Gzip Archive',
      '.rar': 'RAR Archive',
      '.7z': '7-Zip Archive',
      
      // Media
      '.mp3': 'MP3 Audio',
      '.mp4': 'MP4 Video',
      '.avi': 'AVI Video',
      '.mov': 'QuickTime Video',
      
      // Other
      '.exe': 'Windows Executable',
      '.dll': 'Dynamic Link Library',
      '.so': 'Shared Library',
      '.db': 'Database File'
    };

    return typeMap[ext] || `Binary File (${ext})`;
  }

  canTransform(file) {
    // Check if file is marked as binary
    if (file.isBinary) return true;
    
    // Check extension
    const ext = (file.path || '').toLowerCase().match(/\.[^.]+$/);
    return ext && this.supportedExtensions.includes(ext[0]);
  }

  validateInput(file) {
    super.validateInput(file);
    
    if (!file.absolutePath && this.config.get('copytree.binaryFileAction') === 'base64') {
      throw new Error('File absolute path is required for base64 encoding');
    }
  }
}

module.exports = BinaryTransformer;