const Stage = require('../Stage');
const fs = require('fs-extra');
const path = require('path');

class FileLoadingStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.encoding = options.encoding || 'utf8';
    this.binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
  }

  async process(input) {
    this.log(`Loading content for ${input.files.length} files`, 'debug');
    const startTime = Date.now();

    const filesWithContent = await Promise.all(
      input.files.map(file => this.loadFileContent(file))
    );

    this.log(`Loaded file contents in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      files: filesWithContent
    };
  }

  async loadFileContent(file) {
    try {
      const isBinary = await this.isBinaryFile(file.absolutePath);
      
      if (isBinary) {
        return this.handleBinaryFile(file);
      }

      const content = await fs.readFile(file.absolutePath, this.encoding);
      
      return {
        ...file,
        content,
        isBinary: false,
        encoding: this.encoding
      };
    } catch (error) {
      this.log(`Error loading ${file.path}: ${error.message}`, 'warn');
      
      return {
        ...file,
        content: `[Error loading file: ${error.message}]`,
        error: error.message,
        isBinary: false
      };
    }
  }

  async isBinaryFile(filePath) {
    const buffer = Buffer.alloc(512);
    let fd;
    
    try {
      fd = await fs.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);
      
      // Check for null bytes (common in binary files)
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }
      
      // Check by extension
      const ext = path.extname(filePath).toLowerCase();
      const binaryExtensions = [
        '.exe', '.dll', '.so', '.dylib', '.bin',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
        '.mp3', '.mp4', '.avi', '.mov', '.pdf',
        '.zip', '.tar', '.gz', '.rar', '.7z'
      ];
      
      return binaryExtensions.includes(ext);
    } catch (error) {
      return false;
    } finally {
      if (fd) {
        await fd.close();
      }
    }
  }

  handleBinaryFile(file) {
    switch (this.binaryAction) {
      case 'skip':
        return null;
        
      case 'base64':
        return this.loadBinaryAsBase64(file);
        
      case 'placeholder':
      default:
        return {
          ...file,
          content: this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
          isBinary: true
        };
    }
  }

  async loadBinaryAsBase64(file) {
    try {
      const buffer = await fs.readFile(file.absolutePath);
      const base64 = buffer.toString('base64');
      
      return {
        ...file,
        content: base64,
        isBinary: true,
        encoding: 'base64'
      };
    } catch (error) {
      return {
        ...file,
        content: `[Error loading binary file: ${error.message}]`,
        error: error.message,
        isBinary: true
      };
    }
  }
}

module.exports = FileLoadingStage;