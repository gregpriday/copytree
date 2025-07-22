const BaseTransformer = require('../BaseTransformer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

/**
 * Document to text transformer using Pandoc
 * Converts various document formats to plain text
 */
class DocumentToTextTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.description = 'Convert documents to plain text using Pandoc';
    this.supportedExtensions = ['.docx', '.doc', '.odt', '.rtf', '.epub', '.html', '.htm'];
    this.maxDocSize = options.maxDocSize || 50 * 1024 * 1024; // 50MB default
    this.pandocPath = options.pandocPath || 'pandoc';
    this.pandocAvailable = this.checkPandoc();
    this.isHeavy = true; // Document conversion is a heavy operation
  }

  /**
   * Check if Pandoc is available
   */
  checkPandoc() {
    try {
      execSync(`${this.pandocPath} --version`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      this.logger.warn('Pandoc not found. Document conversion will be disabled.');
      this.logger.warn('Install pandoc: https://pandoc.org/installing.html');
      return false;
    }
  }

  /**
   * Check if this transformer can handle the file
   */
  canTransform(file) {
    if (!this.pandocAvailable) return false;
    const ext = path.extname(file.path).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Transform document to text
   */
  async doTransform(file) {
    const size = file.stats?.size || Buffer.byteLength(file.content);
    
    // Check file size
    if (size > this.maxDocSize) {
      return {
        ...file,
        content: `[Document too large for conversion: ${this.formatBytes(size)}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          skippedReason: 'size_limit_exceeded'
        }
      };
    }

    // Create temp file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-doc-'));
    const tempInput = path.join(tempDir, path.basename(file.path));
    
    try {
      // Write content to temp file
      if (Buffer.isBuffer(file.content)) {
        await fs.writeFile(tempInput, file.content);
      } else {
        await fs.writeFile(tempInput, file.content, 'utf8');
      }

      // Determine input format
      const inputFormat = this.getInputFormat(file.path);
      
      // Run pandoc conversion
      const command = [
        this.pandocPath,
        '-f', inputFormat,
        '-t', 'plain',
        '--wrap=none',
        '--strip-comments',
        `"${tempInput}"`
      ].join(' ');

      const textContent = execSync(command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      return {
        ...file,
        content: this.formatOutput(file, textContent, size),
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          originalFormat: inputFormat,
          convertedSize: Buffer.byteLength(textContent)
        }
      };
    } catch (error) {
      this.logger.error('Failed to convert document', {
        file: file.path,
        error: error.message
      });

      // Return error message
      return {
        ...file,
        content: `[Document: ${path.basename(file.path)} - ${this.formatBytes(size)}]\n[Conversion failed: ${error.message}]`,
        transformed: true,
        transformedBy: this.constructor.name,
        metadata: {
          originalSize: size,
          error: error.message
        }
      };
    } finally {
      // Clean up temp files
      try {
        await fs.remove(tempDir);
      } catch (error) {
        this.logger.warn('Failed to clean up temp files', { error: error.message });
      }
    }
  }

  /**
   * Get Pandoc input format from file extension
   */
  getInputFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const formatMap = {
      '.docx': 'docx',
      '.doc': 'doc',
      '.odt': 'odt',
      '.rtf': 'rtf',
      '.epub': 'epub',
      '.html': 'html',
      '.htm': 'html'
    };
    return formatMap[ext] || 'markdown';
  }

  /**
   * Format the output
   */
  formatOutput(file, textContent, originalSize) {
    const filename = path.basename(file.path);
    const header = `[Document: ${filename} - Original size: ${this.formatBytes(originalSize)}]\n`;
    const footer = `\n\n[Converted to plain text by ${this.constructor.name}]`;
    
    return header + '\n' + textContent.trim() + footer;
  }
}

module.exports = DocumentToTextTransformer;