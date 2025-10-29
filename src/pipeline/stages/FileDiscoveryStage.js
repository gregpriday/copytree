import Stage from '../Stage.js';
import fastGlob from 'fast-glob';
import { minimatch } from 'minimatch';
import fs from 'fs-extra';
import path from 'path';

class FileDiscoveryStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.respectGitignore = options.respectGitignore !== false;
    this.gitignorePatterns = [];
    this.forceInclude = options.forceInclude || [];
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
    }

    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    // Load ignore rules in parallel
    const loadTasks = [];
    if (this.respectGitignore) {
      loadTasks.push(this.loadGitignore());
      loadTasks.push(this.loadCopytreeIgnore());
    }
    loadTasks.push(this.loadCopytreeInclude());
    if (loadTasks.length > 0) {
      await Promise.all(loadTasks);
    }

    // Get all files matching patterns
    const files = await this.discoverFiles();

    // Filter out excluded files
    const filteredFiles = this.filterFiles(files);

    // Discover force-include patterns with dot:true and no ignores
    let forcedEntries = [];
    if (this.forceInclude.length > 0) {
      this.log(`Force-including ${this.forceInclude.length} pattern(s)`, 'debug');
      const globOptions = {
        cwd: this.basePath,
        absolute: false,
        dot: true, // ensure hidden files/dirs are discovered
        onlyFiles: true,
        stats: true,
        ignore: [], // bypass all ignore patterns
        concurrency: this.options.maxConcurrency || 100,
      };

      forcedEntries = await fastGlob(this.forceInclude, globOptions);
    }

    // Convert entries to file objects and merge with deduplication
    const toFileObj = (entry) => ({
      path: entry.path || entry,
      absolutePath: path.join(this.basePath, entry.path || entry),
      size: entry.stats?.size || 0,
      modified: entry.stats?.mtime || null,
      stats: entry.stats,
    });

    const merged = [...filteredFiles, ...forcedEntries.map(toFileObj)];
    const byPath = new Map(merged.map((f) => [f.path, f]));
    const finalFiles = [...byPath.values()];

    this.log(
      `Discovered ${finalFiles.length} files (${forcedEntries.length} force-included) in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      basePath: this.basePath,
      files: finalFiles,
      stats: {
        totalFiles: files.length,
        filteredFiles: filteredFiles.length,
        forcedFiles: forcedEntries.length,
        excludedFiles: files.length - filteredFiles.length,
      },
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
    const copytreeignorePath = path.join(this.basePath, '.copytreeignore');

    if (await fs.pathExists(copytreeignorePath)) {
      const copytreeignoreContent = await fs.readFile(copytreeignorePath, 'utf8');
      this.parseGitignoreContent(copytreeignoreContent);
      this.log('Loaded .copytreeignore rules', 'debug');
    }
  }

  async loadCopytreeInclude() {
    const copytreeincludePath = path.join(this.basePath, '.copytreeinclude');

    if (await fs.pathExists(copytreeincludePath)) {
      const copytreeincludeContent = await fs.readFile(copytreeincludePath, 'utf8');
      const patterns = copytreeincludeContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      if (patterns.length > 0) {
        this.forceInclude = [...this.forceInclude, ...patterns];
        this.log(`Loaded ${patterns.length} .copytreeinclude pattern(s)`, 'debug');
      }
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
        original: trimmed,
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
      ignorePatterns.push(...globalExcludedDirs.map((dir) => `**/${dir}/**`));

      // Add base path excluded directories (only at root)
      const basePathExcludedDirs = this.config.get('copytree.basePathExcludedDirectories', []);
      ignorePatterns.push(...basePathExcludedDirs.map((dir) => `${dir}/**`));

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
      concurrency: this.options.maxConcurrency || 100,
    };

    const entries = await fastGlob(this.patterns, globOptions);

    return entries.map((entry) => ({
      path: entry.path || entry,
      absolutePath: path.join(this.basePath, entry.path || entry),
      size: entry.stats?.size || 0,
      modified: entry.stats?.mtime || null,
      stats: entry.stats,
    }));
  }

  filterFiles(files) {
    if (!this.gitignorePatterns.length) {
      return files;
    }

    return files.filter((file) => !this.shouldIgnore(file.path));
  }

  shouldIgnore(filePath) {
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
}

export default FileDiscoveryStage;
