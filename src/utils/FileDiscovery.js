const fastGlob = require('fast-glob');
const ignore = require('ignore');
const fs = require('fs-extra');
const path = require('path');
const { config } = require('../config/ConfigManager');
const { FileSystemError } = require('./errors');
const { logger } = require('./logger');

class FileDiscovery {
  constructor(options = {}) {
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.gitignore = null;
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
      ...options
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
          'discover'
        );
      }

      // Load gitignore rules if needed
      if (this.options.respectGitignore) {
        await this.loadGitignore();
      }

      // Discover files using glob
      const files = await this.globFiles();

      // Apply additional filters
      const filteredFiles = await this.filterFiles(files);

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Discovered ${filteredFiles.length} files (${files.length} before filtering) in ${duration}ms`
      );

      return filteredFiles;
    } catch (error) {
      if (error instanceof FileSystemError) {
        throw error;
      }
      throw new FileSystemError(
        `Failed to discover files: ${error.message}`,
        this.basePath,
        'discover',
        { originalError: error }
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
        this.gitignore = ignore().add(content);
        this.logger.debug('Loaded .gitignore rules');
      } catch (error) {
        this.logger.warn(`Failed to load .gitignore: ${error.message}`);
      }
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
        ...excludedDirs.map(dir => `**/${dir}/**`),
        ...baseExcludedDirs.map(dir => `${dir}/**`),
        ...excludedFiles
      ]
    };

    this.logger.debug(`Glob patterns: ${JSON.stringify(this.patterns)}`);
    this.logger.debug(`Glob options: ${JSON.stringify(globOptions)}`);

    const entries = await fastGlob(this.patterns, globOptions);

    return entries.map(entry => ({
      path: entry.path,
      absolutePath: path.join(this.basePath, entry.path),
      relativePath: entry.path,
      size: entry.stats ? entry.stats.size : 0,
      modified: entry.stats ? entry.stats.mtime : null,
      isSymbolicLink: entry.stats ? entry.stats.isSymbolicLink() : false,
      stats: entry.stats
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
      // Check gitignore
      if (this.gitignore && this.gitignore.ignores(file.path)) {
        skippedByGitignore++;
        continue;
      }

      // Check file size
      if (this.options.maxFileSize && file.size > this.options.maxFileSize) {
        skippedBySize++;
        this.logger.debug(
          `Skipping ${file.path} (${this.logger.formatBytes(file.size)} exceeds limit)`
        );
        continue;
      }

      // Check total size
      if (this.options.maxTotalSize && totalSize + file.size > this.options.maxTotalSize) {
        this.logger.warn(
          `Reached total size limit (${this.logger.formatBytes(this.options.maxTotalSize)})`
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
   * Get file tree structure
   */
  async getTree() {
    const files = await this.discover();
    return this.buildTree(files);
  }

  /**
   * Build tree structure from flat file list
   */
  buildTree(files) {
    const tree = {
      name: path.basename(this.basePath),
      path: this.basePath,
      type: 'directory',
      children: {}
    };

    for (const file of files) {
      const parts = file.path.split(path.sep);
      let current = tree.children;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (i === parts.length - 1) {
          // It's a file
          current[part] = {
            name: part,
            path: file.path,
            absolutePath: file.absolutePath,
            type: 'file',
            size: file.size,
            modified: file.modified
          };
        } else {
          // It's a directory
          if (!current[part]) {
            current[part] = {
              name: part,
              type: 'directory',
              children: {}
            };
          }
          current = current[part].children;
        }
      }
    }

    return tree;
  }

  /**
   * Get statistics about discovered files
   */
  async getStats() {
    const files = await this.discover();
    
    const stats = {
      totalFiles: files.length,
      totalSize: 0,
      filesByExtension: {},
      largestFiles: [],
      directories: new Set()
    };

    for (const file of files) {
      stats.totalSize += file.size;

      // Count by extension
      const ext = path.extname(file.path).toLowerCase() || 'no-extension';
      stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

      // Track directories
      const dir = path.dirname(file.path);
      if (dir !== '.') {
        stats.directories.add(dir);
      }
    }

    // Find largest files
    stats.largestFiles = files
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map(f => ({
        path: f.path,
        size: f.size,
        sizeFormatted: this.logger.formatBytes(f.size)
      }));

    stats.totalSizeFormatted = this.logger.formatBytes(stats.totalSize);
    stats.directoryCount = stats.directories.size;
    delete stats.directories; // Remove the Set from output

    return stats;
  }
}

module.exports = FileDiscovery;