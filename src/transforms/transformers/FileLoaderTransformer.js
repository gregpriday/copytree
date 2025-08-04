const BaseTransformer = require('../BaseTransformer');
const fs = require('fs-extra');

/**
 * Default file loader transformer
 * Simply loads file content as-is without transformation
 */
class FileLoaderTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Default file loader - loads content without transformation';
    this.encoding = options.encoding || 'utf8';
  }

  async doTransform(file) {
    // If content is already loaded, return as-is
    if (file.content !== undefined) {
      return file;
    }

    // Load content from disk
    try {
      let content;
      
      if (file.isBinary) {
        // For binary files, return placeholder or base64 based on config
        const binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
        
        switch (binaryAction) {
        case 'base64': {
          const buffer = await fs.readFile(file.absolutePath);
          content = buffer.toString('base64');
          break;
        }
        case 'skip':
          return null;
        case 'placeholder':
        default:
          content = this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]');
        }
      } else {
        // Load text content
        content = await fs.readFile(file.absolutePath, this.encoding);
      }

      return {
        ...file,
        content,
        transformed: false,
        transformedBy: this.constructor.name,
      };
    } catch (error) {
      this.logger.error(`Failed to load ${file.path}: ${error.message}`);
      
      return {
        ...file,
        content: `[Error loading file: ${error.message}]`,
        error: error.message,
        transformed: false,
        transformedBy: this.constructor.name,
      };
    }
  }

  validateInput(file) {
    super.validateInput(file);
    
    if (!file.absolutePath) {
      throw new Error('File absolute path is required');
    }
  }
}

module.exports = FileLoaderTransformer;