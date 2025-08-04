const fastGlob = require('fast-glob');
const { minimatch } = require('minimatch');
const fs = require('fs-extra');
const path = require('path');
const { config } = require('../config/ConfigManager');
const { FileSystemError } = require('./errors');
const { logger } = require('./logger');

class FileDiscovery {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.gitignorePatterns = [];
    this.config = config();
    this.logger = options.logger || logger;
    
    // Options
    this.options = {
      respectGitignore: options.respectGitignore ?? true,
      includeHidden: options.includeHidden ?? this.config.get('copytree.includeHidden', false),
      followSymlinks: options.followSymlinks ?? this.config.get('copytree.followSymlinks', false),
      maxFileSize: options.maxFileSize ?? this.config.get('copytree.maxFileSize'),
      maxTotalSize: options.maxTotalSize ?? this.config.get('copytree.maxTotalSize'),
      maxFileCount: options.maxFileCount ?? this.config.get('copytree.maxFileCount'),
      ...options,
    };
  }

  /**
   * Discover files based on patterns and options
   * @returns {Promise<Array>} Array of file objects
   */
  async discover() {
    this.logger.debug(`Discovering files in ${this.basePath}`);
    const startTime = Date.now();

    try {
      // Validate base path exists
      if (!await fs.pathExists(this.basePath)) {
        throw new FileSystemError(
          `Base path does not exist: ${this.basePath}`,
          this.basePath,
          'discover',
        );
      }

      // Load gitignore rules if needed
      if (this.options.respectGitignore) {
        await this.loadGitignore();
      }

      // Use fast-glob to find files
      const files = await this.globFiles();

      // Apply additional filters
      const filteredFiles = await this.filterFiles(files);

      const duration = Date.now() - startTime;
      this.logger.info(
        `Discovered ${filteredFiles.length} files in ${duration}ms ` +
        `(${files.length} total, ${files.length - filteredFiles.length} excluded)`,
      );

      return filteredFiles;
    } catch (error) {
      throw new FileSystemError(
        `File discovery failed: ${error.message}`,
        this.basePath,
        'discover',
        { originalError: error },
      );
    }
  }

  /**
   * Load .gitignore rules
   */
  async loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');
    
    if (await fs.pathExists(gitignorePath)) {
      try {
        const content = await fs.readFile(gitignorePath, 'utf8');
        this.parseGitignoreContent(content);
        this.logger.debug('Loaded .gitignore rules');
      } catch (error) {
        this.logger.warn(`Failed to load .gitignore: ${error.message}`);
      }
    }
  }

  /**
   * Parse gitignore content into patterns
   */
  parseGitignoreContent(content) {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Convert gitignore pattern to minimatch pattern
      let pattern = trimmed;
      const isNegated = pattern.startsWith('!');
      
      if (isNegated) {
        pattern = pattern.substring(1);
      }
      
      // If pattern doesn't start with /, it matches anywhere
      if (!pattern.startsWith('/')) {
        pattern = '**/' + pattern;
      } else {
        // Remove leading slash for relative matching
        pattern = pattern.substring(1);
      }
      
      // If pattern ends with /, it only matches directories
      if (pattern.endsWith('/')) {
        pattern = pattern + '**';
      }
      
      this.gitignorePatterns.push({
        pattern,
        isNegated,
        original: trimmed,
      });
    }
  }

  /**
   * Use fast-glob to find files
   */
  async globFiles() {
    const excludedDirs = this.config.get('copytree.globalExcludedDirectories', []);
    const baseExcludedDirs = this.config.get('copytree.basePathExcludedDirectories', []);
    const excludedFiles = this.config.get('copytree.globalExcludedFiles', []);

    const globOptions = {
      cwd: this.basePath,
      absolute: false,
      dot: this.options.includeHidden,
      followSymbolicLinks: this.options.followSymlinks,
      onlyFiles: true,
      stats: true,
      ignore: [
        ...excludedDirs.map((dir) => `**/${dir}/**`),
        ...baseExcludedDirs.map((dir) => `${dir}/**`),
        ...excludedFiles,
      ],
    };

    this.logger.debug(`Glob patterns: ${JSON.stringify(this.patterns)}`);
    this.logger.debug(`Glob options: ${JSON.stringify(globOptions)}`);

    const entries = await fastGlob(this.patterns, globOptions);

    return entries.map((entry) => ({
      path: entry.path,
      absolutePath: path.join(this.basePath, entry.path),
      relativePath: entry.path,
      size: entry.stats ? entry.stats.size : 0,
      modified: entry.stats ? entry.stats.mtime : null,
      isSymbolicLink: entry.stats ? entry.stats.isSymbolicLink() : false,
      stats: entry.stats,
    }));
  }

  /**
   * Apply additional filters to files
   */
  async filterFiles(files) {
    const filtered = [];
    let totalSize = 0;
    let skippedByGitignore = 0;
    let skippedBySize = 0;

    for (const file of files) {
      // Check gitignore patterns
      if (this.shouldIgnoreByGitignore(file.path)) {
        skippedByGitignore++;
        continue;
      }

      // Check file size
      if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
        skippedBySize++;
        this.logger.debug(
          `Skipping ${file.path} (${this.logger.formatBytes(file.size)} exceeds limit)`,
        );
        continue;
      }

      // Check total size
      if (this.options.maxTotalSize && totalSize + file.size > this.options.maxTotalSize) {
        this.logger.warn(
          `Reached total size limit (${this.logger.formatBytes(this.options.maxTotalSize)})`,
        );
        break;
      }

      // Check file count
      if (this.options.maxFileCount && filtered.length >= this.options.maxFileCount) {
        this.logger.warn(`Reached file count limit (${this.options.maxFileCount})`);
        break;
      }

      // Apply custom filter if provided
      if (this.options.filter && !await this.options.filter(file)) {
        continue;
      }

      filtered.push(file);
      totalSize += file.size;
    }

    if (skippedByGitignore > 0) {
      this.logger.debug(`Skipped ${skippedByGitignore} files due to .gitignore`);
    }
    if (skippedBySize > 0) {
      this.logger.debug(`Skipped ${skippedBySize} files due to size limits`);
    }

    return filtered;
  }

  /**
   * Check if a file should be ignored based on gitignore patterns
   */
  shouldIgnoreByGitignore(filePath) {
    if (this.gitignorePatterns.length === 0) {
      return false;
    }

    // Process patterns in order - last match wins for gitignore compatibility
    let ignored = false;
    
    for (const { pattern, isNegated } of this.gitignorePatterns) {
      const options = {
        dot: true,
        matchBase: true,
        nocase: process.platform === 'win32',
      };
      
      if (minimatch(filePath, pattern, options)) {
        ignored = !isNegated;
      }
    }
    
    return ignored;
  }

  /**
   * Get statistics about discovered files
   */
  getStats(files) {
    const stats = {
      totalCount: files.length,
      totalSize: 0,
      largestFile: null,
      fileTypes: {},
    };

    for (const file of files) {
      stats.totalSize += file.size;
      
      if (!stats.largestFile || file.size > stats.largestFile.size) {
        stats.largestFile = file;
      }
      
      const ext = path.extname(file.path).toLowerCase() || 'no-extension';
      stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
    }

    return stats;
  }

  /**
   * Create a sub-discovery for a subdirectory
   */
  createSubDiscovery(subPath, options = {}) {
    return new FileDiscovery({
      ...this.options,
      ...options,
      basePath: path.join(this.basePath, subPath),
    });
  }
}

module.exports = FileDiscovery;