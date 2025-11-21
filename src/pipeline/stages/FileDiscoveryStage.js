/**
 * FileDiscoveryStage - Discovers files with layered .copytreeignore support
 *
 * This implementation uses git-style traversal with layered ignore rules:
 * - Reads .gitignore and .copytreeignore files as encountered during traversal
 * - Supports negations (!) for re-including files
 * - Anchored patterns (/) are relative to the containing directory
 * - Properly prunes excluded directories (doesn't descend into them)
 */

import Stage from '../Stage.js';
import { walkWithIgnore } from '../../utils/ignoreWalker.js';
import { walkParallel } from '../../utils/parallelWalker.js';
import micromatch from 'micromatch';
import fastGlob from 'fast-glob';
import ignore from 'ignore';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../../config/ConfigManager.js';
import { getLimiterFor } from '../../utils/taskLimiter.js';

class FileDiscoveryStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.respectGitignore = options.respectGitignore !== false;
    this.forceInclude = options.forceInclude || [];
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
    }

    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    // Merge config forceIncludeDotfiles with runtime forceInclude
    const configForceIncludes = config().get('copytree.forceIncludeDotfiles', []);
    this.forceInclude = [...this.forceInclude, ...configForceIncludes];

    // Build initial layers with global exclusions first
    const initialLayers = [];

    // 1. Add global exclusions from config (highest priority, always excluded)
    const globalExcluded = config().get('copytree.globalExcludedDirectories', []);
    const basePathExcluded = config().get('copytree.basePathExcludedDirectories', []);
    const globalExcludedFiles = config().get('copytree.globalExcludedFiles', []);

    if (
      globalExcluded.length > 0 ||
      basePathExcluded.length > 0 ||
      globalExcludedFiles.length > 0
    ) {
      const globalRules = [
        ...globalExcluded.map((dir) => dir), // Exclude the directory itself
        ...globalExcluded.map((dir) => `${dir}/**`), // Exclude directory and all contents
        ...globalExcludedFiles, // Add file patterns (lock files, OS files, etc.)
      ];

      // Base path exclusions only apply at project root
      const baseRules = basePathExcluded.map((dir) => `/${dir}/**`);

      const globalLayer = ignore().add([...globalRules, ...baseRules]);
      initialLayers.push({ base: this.basePath, ig: globalLayer });

      this.log(
        `Applied ${globalExcluded.length} global + ${basePathExcluded.length} base + ${globalExcludedFiles.length} file exclusions`,
        'debug',
      );
    }

    // 1a. Conditionally exclude tests if --no-tests flag is provided
    if (input.options?.tests === false) {
      const testExclusions = [
        // Test directories
        'test',
        'tests',
        '__tests__',
        'spec',
        'specs',
        'test/**',
        'tests/**',
        '__tests__/**',
        'spec/**',
        'specs/**',
        // Test files (scattered outside test directories)
        '*.test.js',
        '*.test.ts',
        '*.test.jsx',
        '*.test.tsx',
        '*.spec.js',
        '*.spec.ts',
        '*.spec.jsx',
        '*.spec.tsx',
        '*.test.mjs',
        '*.spec.mjs',
        'jest.config.js',
        'jest.config.ts',
        'jest.setup.js',
        'vitest.config.js',
        'vitest.config.ts',
      ];

      const testLayer = ignore().add(testExclusions);
      initialLayers.push({ base: this.basePath, ig: testLayer });

      this.log(`Applied --no-tests: excluding test directories and files`, 'debug');
    }

    // 2. Add .gitignore layer if we should respect it
    if (this.respectGitignore) {
      const gitignoreLayer = await this.loadGitignore();
      if (gitignoreLayer) {
        initialLayers.push(gitignoreLayer);
      }
    }

    // Load .copytreeinclude patterns (force-include)
    await this.loadCopytreeInclude();

    // Determine if parallel traversal is enabled
    const discoveryConfig = config().get('copytree.discovery', {});
    const parallelEnabled = discoveryConfig.parallelEnabled || false;
    const discoveryConcurrency =
      discoveryConfig.maxConcurrency ||
      this.options.maxConcurrency ||
      config().get('app.maxConcurrency', 5);
    const highWaterMark = discoveryConfig.highWaterMark;

    this.log(
      `Using ${parallelEnabled ? 'parallel' : 'sequential'} file discovery (concurrency: ${discoveryConcurrency})`,
      'debug',
    );

    // Discover files using layered ignore walker
    const discoveredFiles = [];
    const walkOptions = {
      ignoreFileName: '.copytreeignore',
      includeDirectories: false,
      followSymlinks: false,
      explain: this.options.explain || false,
      initialLayers,
      config: config().all(), // Pass full config for retry settings
    };

    // Add parallel-specific options if enabled
    if (parallelEnabled) {
      walkOptions.concurrency = discoveryConcurrency;
      if (highWaterMark) {
        walkOptions.highWaterMark = highWaterMark;
      }
    }

    // Choose walker based on configuration
    const walker = parallelEnabled
      ? walkParallel(this.basePath, walkOptions)
      : walkWithIgnore(this.basePath, walkOptions);

    for await (const fileInfo of walker) {
      // Convert to relative path
      const relativePath = path.relative(this.basePath, fileInfo.path);

      // Check if this file matches our include patterns (if specified)
      if (this.patterns.length > 0 && !this.patterns.includes('**/*')) {
        const matches = micromatch.isMatch(relativePath, this.patterns);
        if (!matches) continue;
      }

      discoveredFiles.push({
        path: relativePath,
        absolutePath: fileInfo.path,
        size: fileInfo.stats.size,
        modified: fileInfo.stats.mtime,
        stats: fileInfo.stats,
      });
    }

    // Handle force-include patterns (.copytreeinclude)
    let forcedEntries = [];
    if (this.forceInclude.length > 0) {
      this.log(`Force-including ${this.forceInclude.length} pattern(s)`, 'debug');

      // Use task limiter for fast-glob to prevent oversubscription
      const globLimiter = getLimiterFor('glob', 100);
      const globConcurrency = Math.min(
        globLimiter.activeCount + 50, // Allow more for glob since it's usually quick
        100,
      );

      const globOptions = {
        cwd: this.basePath,
        absolute: false,
        dot: true, // ensure hidden files/dirs are discovered
        onlyFiles: true,
        stats: true,
        ignore: [], // bypass all ignore patterns
        concurrency: globConcurrency,
      };

      const entries = await fastGlob(this.forceInclude, globOptions);
      forcedEntries = entries.map((entry) => ({
        path: entry.path || entry,
        absolutePath: path.join(this.basePath, entry.path || entry),
        size: entry.stats?.size || 0,
        modified: entry.stats?.mtime || null,
        stats: entry.stats,
      }));
    }

    // Merge discovered files with forced entries, deduplicating by path
    const merged = [...discoveredFiles, ...forcedEntries];
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
        totalFiles: discoveredFiles.length,
        filteredFiles: discoveredFiles.length, // No post-filtering needed
        forcedFiles: forcedEntries.length,
        excludedFiles: 0, // Not tracked with walker approach
      },
    };
  }

  /**
   * Load .gitignore and return as an ignore layer
   * @returns {Promise<{base: string, ig: any}|null>} Ignore layer or null
   */
  async loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');

    if (await fs.pathExists(gitignorePath)) {
      try {
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
        // Strip BOM if present
        const cleaned =
          gitignoreContent.charCodeAt(0) === 0xfeff ? gitignoreContent.slice(1) : gitignoreContent;

        const ig = ignore().add(cleaned);
        this.log('Loaded .gitignore rules', 'debug');

        return {
          base: this.basePath,
          ig,
        };
      } catch (error) {
        this.log(`Error loading .gitignore: ${error.message}`, 'debug');
        return null;
      }
    }

    return null;
  }

  /**
   * Load .copytreeinclude patterns for force-including files
   */
  async loadCopytreeInclude() {
    const copytreeincludePath = path.join(this.basePath, '.copytreeinclude');

    if (await fs.pathExists(copytreeincludePath)) {
      const copytreeincludeContent = await fs.readFile(copytreeincludePath, 'utf8');
      const rawPatterns = copytreeincludeContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

      // Transform patterns following gitignore conventions
      const transformedPatterns = rawPatterns.map((pattern) => {
        // If pattern already has glob characters, keep it as-is
        if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
          return pattern;
        }

        // If pattern doesn't start with /, it matches anywhere
        if (!pattern.startsWith('/')) {
          pattern = '**/' + pattern;
        } else {
          // Remove leading slash for relative matching
          pattern = pattern.substring(1);
        }

        // If pattern ends with /, it only matches directories (append /**)
        if (pattern.endsWith('/')) {
          pattern = pattern + '**';
        } else {
          // For bare directory names (no trailing slash), append /** to match directory contents
          // This matches gitignore behavior where "foo" matches "foo/" recursively
          pattern = pattern + '/**';
        }

        return pattern;
      });

      if (transformedPatterns.length > 0) {
        this.forceInclude = [...this.forceInclude, ...transformedPatterns];
        this.log(`Loaded ${transformedPatterns.length} .copytreeinclude pattern(s)`, 'debug');
      }
    }
  }
}

export default FileDiscoveryStage;
