const Stage = require('../Stage');
const fastGlob = require('fast-glob');
const { minimatch } = require('minimatch');
const fs = require('fs-extra');
const path = require('path');

class FileDiscoveryStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.gitignorePatterns = [];
  }

  async process(input) {
    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    // Load ignore rules in parallel
    await Promise.all([
      this.loadGitignore(),
      this.loadCopytreeIgnore()
    ]);

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
      this.parseGitignoreContent(gitignoreContent);
      this.log('Loaded .gitignore rules', 'debug');
    }
  }

  async loadCopytreeIgnore() {
    const copytreeIgnorePath = path.join(this.basePath, '.copytreeignore');
    
    if (await fs.pathExists(copytreeIgnorePath)) {
      const copytreeIgnoreContent = await fs.readFile(copytreeIgnorePath, 'utf8');
      this.parseGitignoreContent(copytreeIgnoreContent);
      this.log('Loaded .copytreeignore rules', 'debug');
    }
  }

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
        original: trimmed
      });
    }
  }

  async discoverFiles() {
    // Load copytree config for exclusions
    const copytreeConfig = require('../../../config/copytree');
    
    // Combine all ignore patterns early for better performance
    const ignorePatterns = [];
    
    // Add default ignores from config
    if (this.options.respectGitignore !== false) {
      // Add global excluded directories
      ignorePatterns.push(...copytreeConfig.globalExcludedDirectories.map(dir => `**/${dir}/**`));
      
      // Add base path excluded directories (only at root)
      ignorePatterns.push(...copytreeConfig.basePathExcludedDirectories.map(dir => `${dir}/**`));
      
      // Add global excluded files
      ignorePatterns.push(...copytreeConfig.globalExcludedFiles);
    }
    
    // Add gitignore patterns (converted to glob format)
    for (const { pattern, isNegated } of this.gitignorePatterns) {
      if (!isNegated) {
        ignorePatterns.push(pattern);
      }
    }
    
    // Add profile exclusions if provided
    if (this.options.profileExclusions) {
      ignorePatterns.push(...this.options.profileExclusions);
    }
    
    const globOptions = {
      cwd: this.basePath,
      absolute: false,
      dot: this.options.includeHidden || false,
      onlyFiles: true,
      stats: true,
      ignore: ignorePatterns,
      // Use stream for large directories
      concurrency: this.options.maxConcurrency || 100
    };

    const entries = await fastGlob(this.patterns, globOptions);

    return entries.map(entry => ({
      path: entry.path,
      absolutePath: path.join(this.basePath, entry.path),
      size: entry.stats?.size || 0,
      modified: entry.stats?.mtime || null,
      stats: entry.stats
    }));
  }

  filterFiles(files) {
    if (!this.gitignorePatterns.length) {
      return files;
    }

    return files.filter(file => !this.shouldIgnore(file.path));
  }

  shouldIgnore(filePath) {
    // Process patterns in order - last match wins for gitignore compatibility
    let ignored = false;
    
    for (const { pattern, isNegated } of this.gitignorePatterns) {
      const options = {
        dot: true,
        matchBase: true,
        nocase: process.platform === 'win32'
      };
      
      if (minimatch(filePath, pattern, options)) {
        ignored = !isNegated;
      }
    }
    
    return ignored;
  }
}

module.exports = FileDiscoveryStage;