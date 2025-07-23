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
    this.respectGitignore = options.respectGitignore !== false;
    this.gitignorePatterns = [];
  }

  async process(input) {
    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    // Load ignore rules in parallel
    const loadTasks = [];
    if (this.respectGitignore) {
      loadTasks.push(this.loadGitignore());
      loadTasks.push(this.loadCtreeIgnore());
    }
    if (loadTasks.length > 0) {
      await Promise.all(loadTasks);
    }

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

  async loadCtreeIgnore() {
    const ctreeignorePath = path.join(this.basePath, '.ctreeignore');
    
    if (await fs.pathExists(ctreeignorePath)) {
      const ctreeignoreContent = await fs.readFile(ctreeignorePath, 'utf8');
      this.parseGitignoreContent(ctreeignoreContent);
      this.log('Loaded .ctreeignore rules', 'debug');
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
    // Get copytree config for exclusions from ConfigManager
    const ignorePatterns = [];
    
    // Add default ignores from config
    if (this.respectGitignore) {
      // Add global excluded directories
      const globalExcludedDirs = this.config.get('copytree.globalExcludedDirectories', []);
      ignorePatterns.push(...globalExcludedDirs.map(dir => `**/${dir}/**`));
      
      // Add base path excluded directories (only at root)
      const basePathExcludedDirs = this.config.get('copytree.basePathExcludedDirectories', []);
      ignorePatterns.push(...basePathExcludedDirs.map(dir => `${dir}/**`));
      
      // Add global excluded files
      const globalExcludedFiles = this.config.get('copytree.globalExcludedFiles', []);
      ignorePatterns.push(...globalExcludedFiles);
    }
    
    // Add gitignore patterns (converted to glob format)
    if (this.respectGitignore) {
      for (const { pattern, isNegated } of this.gitignorePatterns) {
        if (!isNegated) {
          ignorePatterns.push(pattern);
        }
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
      path: entry.path || entry,
      absolutePath: path.join(this.basePath, entry.path || entry),
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