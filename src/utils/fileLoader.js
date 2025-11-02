import fs from 'fs-extra';
import path from 'path';
import fastGlob from 'fast-glob';
import { logger } from './logger.js';
import { withFsRetry } from './retryableFs.js';
import { isRetryableFsError } from './errors.js';
import {
  recordRetry,
  recordGiveUp,
  recordPermanent,
  recordSuccessAfterRetry,
} from './fsErrorReport.js';

/**
 * File loader utility for loading files from a directory
 */
class FileLoader {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.includeHidden = options.includeHidden || false;
    this.followSymlinks = options.followSymlinks || false;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.config = options.config || {};

    // Extract retry configuration with defaults
    this.retryConfig = {
      maxAttempts: this.config?.copytree?.fs?.retryAttempts ?? 3,
      initialDelay: this.config?.copytree?.fs?.retryDelay ?? 100,
      maxDelay: this.config?.copytree?.fs?.maxDelay ?? 2000,
    };
  }

  /**
   * Load files based on patterns
   */
  async loadFiles(patterns = {}) {
    const { include = ['**/*'], exclude = [] } = patterns;

    try {
      // Get file paths using fast-glob
      const filePaths = await fastGlob(include, {
        cwd: this.basePath,
        ignore: exclude,
        dot: this.includeHidden,
        followSymbolicLinks: this.followSymlinks,
        onlyFiles: true,
      });

      // Load file contents
      const files = [];
      for (const filePath of filePaths) {
        const file = await this.loadFile(filePath);
        if (file) {
          files.push(file);
        }
      }

      return files;
    } catch (error) {
      logger.error('Failed to load files', {
        basePath: this.basePath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Load a single file
   */
  async loadFile(relativePath) {
    const fullPath = path.join(this.basePath, relativePath);

    try {
      // Stat file with retry logic
      const stats = await withFsRetry(() => fs.stat(fullPath), {
        ...this.retryConfig,
        onRetry: ({ code }) => recordRetry(fullPath, code),
      });

      // Skip files that are too large
      if (stats.size > this.maxFileSize) {
        // Record success for stat operation even though we're skipping the file
        recordSuccessAfterRetry(fullPath);
        logger.warn('Skipping large file', {
          path: relativePath,
          size: stats.size,
          maxSize: this.maxFileSize,
        });
        return null;
      }

      // Read file content with retry logic
      const content = await withFsRetry(() => fs.readFile(fullPath, 'utf8'), {
        ...this.retryConfig,
        onRetry: ({ code }) => recordRetry(fullPath, code),
      });

      // Record successful operation after retries
      recordSuccessAfterRetry(fullPath);

      return {
        name: path.basename(relativePath),
        relativePath: relativePath,
        path: fullPath,
        content: content,
        stats: {
          size: stats.size,
          mtime: stats.mtime,
          ctime: stats.ctime,
          mode: stats.mode,
        },
        type: this.detectFileType(relativePath, content),
      };
    } catch (error) {
      // Handle different error types
      if (error.code === 'EISDIR') {
        recordPermanent(fullPath, error.code);
        return null; // Skip directories
      }

      // Try reading as binary if UTF-8 fails (only for non-retryable errors)
      if (error.toString().includes('Invalid') && !isRetryableFsError(error)) {
        try {
          const content = await withFsRetry(() => fs.readFile(fullPath), {
            ...this.retryConfig,
            onRetry: ({ code }) => recordRetry(fullPath, code),
          });
          const stats = await withFsRetry(() => fs.stat(fullPath), {
            ...this.retryConfig,
            onRetry: ({ code }) => recordRetry(fullPath, code),
          });

          recordSuccessAfterRetry(fullPath);

          return {
            name: path.basename(relativePath),
            relativePath: relativePath,
            path: fullPath,
            content: content,
            stats: {
              size: stats.size,
              mtime: stats.mtime,
              ctime: stats.ctime,
              mode: stats.mode,
            },
            type: 'binary',
            isBinary: true,
          };
        } catch (binaryError) {
          // Record binary read failure
          if (isRetryableFsError(binaryError)) {
            recordGiveUp(fullPath, binaryError.code);
          } else {
            recordPermanent(fullPath, binaryError.code);
          }
          logger.error('Failed to load file as binary', {
            path: relativePath,
            error: binaryError.message,
          });
          return null;
        }
      } else {
        // Record the failure based on error type
        if (isRetryableFsError(error)) {
          recordGiveUp(fullPath, error.code);
          logger.warn('File failed after retries', {
            path: relativePath,
            code: error.code,
          });
        } else {
          recordPermanent(fullPath, error.code);
          logger.error('Failed to load file', {
            path: relativePath,
            error: error.message,
          });
        }
        return null;
      }
    }
  }

  /**
   * Detect file type based on extension and content
   */
  detectFileType(filePath, content) {
    const ext = path.extname(filePath).toLowerCase();

    // Code files
    const codeExtensions = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.php': 'php',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
    };

    if (codeExtensions[ext]) {
      return codeExtensions[ext];
    }

    // Data files
    const dataExtensions = {
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.csv': 'csv',
    };

    if (dataExtensions[ext]) {
      return dataExtensions[ext];
    }

    // Document files
    const docExtensions = {
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.txt': 'text',
      '.rst': 'restructuredtext',
      '.tex': 'latex',
    };

    if (docExtensions[ext]) {
      return docExtensions[ext];
    }

    // Web files
    const webExtensions = {
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
    };

    if (webExtensions[ext]) {
      return webExtensions[ext];
    }

    // Default to text if content looks like text
    if (typeof content === 'string' && this.isTextContent(content)) {
      return 'text';
    }

    return 'unknown';
  }

  /**
   * Check if content appears to be text
   */
  isTextContent(content) {
    if (typeof content !== 'string') return false;

    // Check for null bytes or other binary indicators
    for (let i = 0; i < Math.min(content.length, 1000); i++) {
      const charCode = content.charCodeAt(i);
      if (
        charCode === 0 ||
        (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13)
      ) {
        return false;
      }
    }

    return true;
  }
}

export default FileLoader;
