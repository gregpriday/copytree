const BaseTransformer = require('../BaseTransformer');
const fs = require('fs-extra');
const { Readable } = require('stream');

/**
 * Streaming File Loader Transformer - Loads file content using streams
 * Optimized for large files and memory efficiency
 */
class StreamingFileLoaderTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Loads file content using streams for memory efficiency';
    this.bufferSize = options.bufferSize || 64 * 1024; // 64KB chunks
    this.maxSize = options.maxSize || this.config.get('copytree.maxFileSize', 10 * 1024 * 1024);
    this.encoding = options.encoding || 'utf8';
  }

  async doTransform(file) {
    try {
      // Skip if already has content
      if (file.content !== undefined) {
        return file;
      }

      // Check file size
      const stats = file.stats || await fs.stat(file.absolutePath);
      if (stats.size > this.maxSize) {
        return {
          ...file,
          content: `[File too large: ${this.formatBytes(stats.size)}]`,
          isBinary: false,
          transformed: true,
          transformedBy: this.constructor.name,
          streamingSkipped: true,
        };
      }

      // Check if binary
      const isBinary = await this.isBinaryFile(file.absolutePath, stats.size);
      
      if (isBinary) {
        const binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
        
        if (binaryAction === 'skip') {
          return null;
        } else if (binaryAction === 'base64') {
          // Use streaming for base64 encoding
          const content = await this.streamToBase64(file.absolutePath);
          return {
            ...file,
            content,
            isBinary: true,
            encoding: 'base64',
            transformed: true,
            transformedBy: this.constructor.name,
          };
        } else {
          // Placeholder
          return {
            ...file,
            content: this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
            isBinary: true,
            transformed: true,
            transformedBy: this.constructor.name,
          };
        }
      }

      // Stream text file content
      const content = await this.streamTextFile(file.absolutePath);
      
      return {
        ...file,
        content,
        isBinary: false,
        transformed: true,
        transformedBy: this.constructor.name,
      };
    } catch (error) {
      this.logger.error(`Failed to load file ${file.path}: ${error.message}`);
      
      return {
        ...file,
        content: `[Error reading file: ${error.message}]`,
        error: error.message,
        transformed: false,
        transformedBy: this.constructor.name,
      };
    }
  }

  /**
   * Stream text file content
   */
  async streamTextFile(filePath) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = fs.createReadStream(filePath, {
        encoding: this.encoding,
        highWaterMark: this.bufferSize,
      });

      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(chunks.join('')));
      stream.on('error', reject);
    });
  }

  /**
   * Stream file to base64
   */
  async streamToBase64(filePath) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = fs.createReadStream(filePath, {
        highWaterMark: this.bufferSize,
      });

      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('base64'));
      });
      stream.on('error', reject);
    });
  }

  /**
   * Check if file is binary by reading first few bytes
   */
  async isBinaryFile(filePath, size) {
    if (size === 0) return false;
    
    // Common binary file extensions
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.zip', '.tar', '.gz', 
      '.7z', '.rar', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.ppt', '.pptx', '.odt', '.ods', '.odp', '.jpg', '.jpeg',
      '.png', '.gif', '.bmp', '.ico', '.svg', '.webp', '.mp3',
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.wav', '.flac', '.aac', '.ogg', '.wma', '.ttf', '.otf',
      '.woff', '.woff2', '.eot', '.pyc', '.pyo', '.class',
      '.o', '.obj', '.a', '.lib', '.pdb', '.idb', '.jar',
      '.war', '.ear', '.db', '.sqlite', '.sqlite3',
    ];
    
    const ext = (filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (binaryExtensions.includes(ext)) {
      return true;
    }
    
    // Check file content
    const bytesToCheck = Math.min(8000, size);
    const buffer = Buffer.alloc(bytesToCheck);
    
    const fd = await fs.open(filePath, 'r');
    try {
      await fs.read(fd, buffer, 0, bytesToCheck, 0);
      
      // Check for null bytes or high percentage of non-printable chars
      let nonPrintable = 0;
      for (let i = 0; i < bytesToCheck; i++) {
        const byte = buffer[i];
        if (byte === 0) return true; // Null byte found
        
        // Count non-printable characters (excluding common whitespace)
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintable++;
        }
      }
      
      // If more than 30% non-printable, consider binary
      return (nonPrintable / bytesToCheck) > 0.3;
    } finally {
      await fs.close(fd);
    }
  }

  canTransform(file) {
    // This transformer handles all files that need content loading
    return file.content === undefined;
  }
}

module.exports = StreamingFileLoaderTransformer;