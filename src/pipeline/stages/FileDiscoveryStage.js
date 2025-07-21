const Stage = require('../Stage');
const fastGlob = require('fast-glob');
const ignore = require('ignore');
const fs = require('fs-extra');
const path = require('path');

class FileDiscoveryStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.gitignore = null;
  }

  async process(input) {
    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    // Load gitignore rules if present
    await this.loadGitignore();

    // Get all files matching patterns
    const files = await this.discoverFiles();

    // Filter out excluded files
    const filteredFiles = this.filterFiles(files);

    this.log(`Discovered ${filteredFiles.length} files in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      basePath: this.basePath,
      files: filteredFiles,
      stats: {
        totalFiles: files.length,
        filteredFiles: filteredFiles.length,
        excludedFiles: files.length - filteredFiles.length
      }
    };
  }

  async loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');
    
    if (await fs.pathExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      this.gitignore = ignore().add(gitignoreContent);
      this.log('Loaded .gitignore rules', 'debug');
    }
  }

  async discoverFiles() {
    const globOptions = {
      cwd: this.basePath,
      absolute: false,
      dot: this.config.get('copytree.includeHidden', false),
      followSymbolicLinks: this.config.get('copytree.followSymlinks', false),
      ignore: [
        ...this.config.get('copytree.globalExcludedDirectories', []).map(dir => `**/${dir}/**`),
        ...this.config.get('copytree.basePathExcludedDirectories', []).map(dir => `${dir}/**`),
        ...this.config.get('copytree.globalExcludedFiles', [])
      ],
      onlyFiles: true,
      stats: true
    };

    try {
      const entries = await fastGlob(this.patterns, globOptions);
      
      return entries.map(entry => ({
        path: entry.path,
        absolutePath: path.join(this.basePath, entry.path),
        size: entry.stats.size,
        modified: entry.stats.mtime,
        isSymbolicLink: entry.stats.isSymbolicLink()
      }));
    } catch (error) {
      this.log(`Error discovering files: ${error.message}`, 'error');
      throw error;
    }
  }

  filterFiles(files) {
    const maxFileSize = this.config.get('copytree.maxFileSize');
    const maxTotalSize = this.config.get('copytree.maxTotalSize');
    const maxFileCount = this.config.get('copytree.maxFileCount');

    let totalSize = 0;
    const filtered = [];

    for (const file of files) {
      // Check gitignore
      if (this.gitignore && this.gitignore.ignores(file.path)) {
        continue;
      }

      // Check file size
      if (maxFileSize && file.size > maxFileSize) {
        this.log(`Skipping ${file.path} (size: ${this.formatBytes(file.size)} exceeds limit)`, 'debug');
        continue;
      }

      // Check total size
      if (maxTotalSize && totalSize + file.size > maxTotalSize) {
        this.log(`Reached total size limit (${this.formatBytes(maxTotalSize)})`, 'warn');
        break;
      }

      // Check file count
      if (maxFileCount && filtered.length >= maxFileCount) {
        this.log(`Reached file count limit (${maxFileCount})`, 'warn');
        break;
      }

      filtered.push(file);
      totalSize += file.size;
    }

    return filtered;
  }
}

module.exports = FileDiscoveryStage;