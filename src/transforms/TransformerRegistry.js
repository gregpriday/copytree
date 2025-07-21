const { TransformError } = require('../utils/errors');
const { logger } = require('../utils/logger');

/**
 * Registry for file transformers
 * Manages transformer registration and selection based on file type
 */
class TransformerRegistry {
  constructor() {
    this.transformers = new Map();
    this.extensionMap = new Map();
    this.mimeTypeMap = new Map();
    this.defaultTransformer = null;
    this.logger = logger.child('TransformerRegistry');
  }

  /**
   * Register a transformer
   * @param {string} name - Transformer name
   * @param {Object} transformer - Transformer instance or class
   * @param {Object} options - Registration options
   */
  register(name, transformer, options = {}) {
    if (this.transformers.has(name)) {
      this.logger.warn(`Overwriting existing transformer: ${name}`);
    }

    this.transformers.set(name, {
      transformer,
      options,
      priority: options.priority || 0
    });

    // Register extensions
    if (options.extensions) {
      options.extensions.forEach(ext => {
        const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
        if (!this.extensionMap.has(normalizedExt)) {
          this.extensionMap.set(normalizedExt, []);
        }
        this.extensionMap.get(normalizedExt).push(name);
      });
    }

    // Register MIME types
    if (options.mimeTypes) {
      options.mimeTypes.forEach(mimeType => {
        if (!this.mimeTypeMap.has(mimeType)) {
          this.mimeTypeMap.set(mimeType, []);
        }
        this.mimeTypeMap.get(mimeType).push(name);
      });
    }

    // Set as default if specified
    if (options.isDefault) {
      this.defaultTransformer = name;
    }

    this.logger.debug(`Registered transformer: ${name}`);
  }

  /**
   * Get a transformer by name
   * @param {string} name - Transformer name
   * @returns {Object} Transformer instance
   */
  get(name) {
    const entry = this.transformers.get(name);
    if (!entry) {
      throw new TransformError(`Transformer not found: ${name}`, name);
    }
    return entry.transformer;
  }

  /**
   * Get transformer for a file
   * @param {Object} file - File object with path and optional mimeType
   * @returns {Object} Most appropriate transformer
   */
  getForFile(file) {
    const transformerNames = [];

    // Check by extension
    const ext = this.getExtension(file.path);
    if (ext && this.extensionMap.has(ext)) {
      transformerNames.push(...this.extensionMap.get(ext));
    }

    // Check by MIME type
    if (file.mimeType && this.mimeTypeMap.has(file.mimeType)) {
      transformerNames.push(...this.mimeTypeMap.get(file.mimeType));
    }

    // Get unique transformer names with highest priority
    const uniqueNames = [...new Set(transformerNames)];
    if (uniqueNames.length > 0) {
      const sorted = uniqueNames
        .map(name => ({ name, ...this.transformers.get(name) }))
        .sort((a, b) => b.priority - a.priority);
      
      return this.get(sorted[0].name);
    }

    // Return default transformer
    if (this.defaultTransformer) {
      return this.get(this.defaultTransformer);
    }

    throw new TransformError(
      `No transformer found for file: ${file.path}`,
      'unknown',
      file.path
    );
  }

  /**
   * Check if a transformer exists
   * @param {string} name - Transformer name
   * @returns {boolean}
   */
  has(name) {
    return this.transformers.has(name);
  }

  /**
   * List all registered transformers
   * @returns {Array} Array of transformer info
   */
  list() {
    return Array.from(this.transformers.entries()).map(([name, entry]) => ({
      name,
      priority: entry.priority,
      extensions: Array.from(this.extensionMap.entries())
        .filter(([_, names]) => names.includes(name))
        .map(([ext]) => ext),
      mimeTypes: Array.from(this.mimeTypeMap.entries())
        .filter(([_, names]) => names.includes(name))
        .map(([mime]) => mime),
      isDefault: this.defaultTransformer === name
    }));
  }

  /**
   * Clear all registered transformers
   */
  clear() {
    this.transformers.clear();
    this.extensionMap.clear();
    this.mimeTypeMap.clear();
    this.defaultTransformer = null;
  }

  /**
   * Get file extension
   * @private
   */
  getExtension(filePath) {
    const ext = filePath.match(/\.[^.]+$/);
    return ext ? ext[0].toLowerCase() : null;
  }

  /**
   * Create default registry with standard transformers
   * @static
   */
  static createDefault() {
    const registry = new TransformerRegistry();
    
    // Register default transformers
    const FileLoaderTransformer = require('./transformers/FileLoaderTransformer');
    const MarkdownTransformer = require('./transformers/MarkdownTransformer');
    const CSVTransformer = require('./transformers/CSVTransformer');
    const BinaryTransformer = require('./transformers/BinaryTransformer');
    const PDFTransformer = require('./transformers/PDFTransformer');
    const ImageTransformer = require('./transformers/ImageTransformer');
    
    registry.register('file-loader', new FileLoaderTransformer(), {
      isDefault: true,
      priority: 0
    });

    registry.register('markdown', new MarkdownTransformer(), {
      extensions: ['.md', '.markdown', '.mdown', '.mkd'],
      priority: 10
    });

    registry.register('csv', new CSVTransformer(), {
      extensions: ['.csv', '.tsv'],
      mimeTypes: ['text/csv', 'text/tab-separated-values'],
      priority: 10
    });

    registry.register('pdf', new PDFTransformer(), {
      extensions: ['.pdf'],
      mimeTypes: ['application/pdf'],
      priority: 15
    });

    registry.register('image', new ImageTransformer(), {
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp'],
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp'],
      priority: 15
    });

    registry.register('binary', new BinaryTransformer(), {
      extensions: [
        '.doc', '.docx', '.xls', '.xlsx',
        '.zip', '.tar', '.gz', '.rar', '.7z',
        '.exe', '.dll', '.so', '.dylib'
      ],
      priority: 5
    });

    return registry;
  }
}

module.exports = TransformerRegistry;