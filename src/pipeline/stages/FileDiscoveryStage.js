/**
 * FileDiscoveryStage - Discovers files with layered ignore support
 *
 * One exclusion path, used by both the CLI and the programmatic API:
 * - Config `globalExcludedDirectories` / `globalExcludedFiles` always apply
 * - `.gitignore` is layered at every depth, alongside `.copytreeignore`
 * - `.git/info/exclude` and the user's global gitignore apply as root layers
 * - Negations (!) can re-include, last match wins, excluded directories are pruned
 * - A hard size gate is applied from `stat()`, so oversized files are never opened
 * - Every exclusion is accounted for and reported
 *
 * With `scope`, traversal starts at the selected subtrees while ignore rules
 * still resolve from the base path, so a scoped run selects exactly the files a
 * filtered full run would.
 */

import Stage from '../Stage.js';
import { walkWithIgnore } from '../../utils/ignoreWalker.js';
import { walkParallel } from '../../utils/parallelWalker.js';
import micromatch from 'micromatch';
import fastGlob from 'fast-glob';
import ignore from 'ignore';
import path from 'path';
import { promises as fsp } from 'node:fs';
import { getLimiterFor } from '../../utils/taskLimiter.js';
import { toPosix } from '../../utils/pathUtils.js';
import { collectGitIgnoreSources } from '../../utils/gitignoreSources.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { resolveScope } from '../../utils/scopeResolver.js';

/** Directories that are never worth traversing, whatever the config says. */
const DANGEROUS_DIRECTORIES = ['.git', 'node_modules'];

/** Test files and directories excluded by `--no-tests`. */
const TEST_EXCLUSIONS = [
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

class FileDiscoveryStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Nothing downstream can distinguish "discovery failed" from "the
    // repository is empty", so a failure here has to stop the run.
    this.fatal = true;
    this.basePath = options.basePath || process.cwd();
    this.patterns = options.patterns || ['**/*'];
    this.respectGitignore = options.respectGitignore !== false;
    this.forceInclude = options.forceInclude || [];
    this.excludes = options.excludes || [];

    // Scoped traversal (R1)
    this.scope = Array.isArray(options.scope)
      ? options.scope
      : options.scope
        ? [options.scope]
        : [];
    this.scopeIgnoresIgnoreFiles = options.scopeIgnoresIgnoreFiles === true;

    // Budgets applied from stat(), before any file is opened
    this.maxFileSize = normalizeLimit(options.maxFileSize);
    this.sizeGate = normalizeLimit(options.sizeGate);

    // Convenience filter options
    this.extFilter = options.extFilter || null; // e.g. ['.js', '.ts']
    this.maxDepth =
      options.maxDepth !== undefined && options.maxDepth !== null ? options.maxDepth : null;
    this.minSizeBytes =
      options.minSizeBytes !== undefined && options.minSizeBytes !== null
        ? options.minSizeBytes
        : null;
    this.maxSizeBytes =
      options.maxSizeBytes !== undefined && options.maxSizeBytes !== null
        ? options.maxSizeBytes
        : null;
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
    }

    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    const explain = Boolean(this.options.explain || input.options?.explain);
    const report = new ExclusionReport({
      explain,
      topN: this.config.get('copytree.exclusionReport.topN', 50),
    });

    // Merge config forceIncludeDotfiles with runtime forceInclude
    const configForceIncludes = this.config.get('copytree.forceIncludeDotfiles', []);
    const forceIncludePatterns = [...this.forceInclude, ...configForceIncludes];
    this.forceInclude = forceIncludePatterns;

    // .copytreeinclude has the highest precedence of all: load it before
    // building layers so gate overrides know about it.
    await this.loadCopytreeInclude();

    const initialLayers = await this.buildInitialLayers(input);

    // Ignore file names layered at every directory depth. Later names win, so a
    // `.copytreeignore` rule beats a conflicting `.gitignore` rule.
    const ignoreFileNames = this.respectGitignore
      ? this.config.get('copytree.gitignore.nested', true)
        ? ['.gitignore', '.copytreeignore']
        : ['.copytreeignore']
      : ['.copytreeignore'];

    // Resolve the scope selection before walking so path errors surface early.
    const scopePaths =
      this.scope.length > 0
        ? (await resolveScope(this.basePath, this.scope)).map((entry) => entry.absolutePath)
        : null;

    // Determine if parallel traversal is enabled
    const discoveryConfig = this.config.get('copytree.discovery', {});
    const parallelEnabled = discoveryConfig.parallelEnabled || false;
    const discoveryConcurrency =
      discoveryConfig.maxConcurrency ||
      this.options.maxConcurrency ||
      this.config.get('app.maxConcurrency', 5);
    const highWaterMark = discoveryConfig.highWaterMark;

    this.log(
      `Using ${parallelEnabled ? 'parallel' : 'sequential'} file discovery (concurrency: ${discoveryConcurrency})`,
      'debug',
    );

    const discoveredFiles = [];
    const walkOptions = {
      ignoreFileNames,
      includeDirectories: false,
      followSymlinks: this.options.followSymlinks === true,
      explain,
      initialLayers,
      config: this.config.all(), // Pass full config for retry settings
      maxDepth: this.maxDepth !== null ? this.maxDepth : undefined,
      signal: input.options?.signal,
      onExclude: (record) => report.add(record),
    };

    if (scopePaths) {
      walkOptions.scope = scopePaths;
      walkOptions.scopeIgnoresIgnoreFiles = this.scopeIgnoresIgnoreFiles;
    }

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

    const usePatternFilter = this.patterns.length > 0 && !this.patterns.includes('**/*');
    let seen = 0;

    for await (const fileInfo of walker) {
      // Convert to relative path
      const relativePath = toPosix(path.relative(this.basePath, fileInfo.path));
      const fileSize = fileInfo.stats.size;

      seen++;
      if (seen % 250 === 0) {
        // Discovery is the long pole on large repositories; a progress bar that
        // sits at 0% until formatting starts reads as a hang.
        this.emitProgress(indeterminatePercent(seen), `Discovered ${seen} files`);
      }

      // Check if this file matches our include patterns (if specified)
      if (usePatternFilter && !micromatch.isMatch(relativePath, this.patterns)) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
        });
        continue;
      }

      // Apply extension filter (--ext)
      if (this.extFilter && this.extFilter.length > 0) {
        const ext = path.extname(relativePath).toLowerCase();
        if (!this.extFilter.includes(ext)) {
          report.add({
            path: relativePath,
            size: fileSize,
            reason: EXCLUSION_REASONS.FILTER_PATTERN,
            rule: `ext:${this.extFilter.join(',')}`,
          });
          continue;
        }
      }

      // Apply size filters (--min-size, --max-size)
      if (this.minSizeBytes !== null && fileSize < this.minSizeBytes) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
          rule: `min-size:${this.minSizeBytes}`,
        });
        continue;
      }
      if (this.maxSizeBytes !== null && fileSize > this.maxSizeBytes) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
          rule: `max-size:${this.maxSizeBytes}`,
        });
        continue;
      }

      // Hard size gate, decided from stat(). `always` / .copytreeinclude is the
      // only thing that can override it, and the override is reported.
      const gate = this.effectiveSizeGate(relativePath);
      if (gate !== null && fileSize > gate) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.SIZE_GATE,
          rule: `sizeGate:${gate}`,
        });
        continue;
      }

      discoveredFiles.push({
        path: relativePath,
        absolutePath: fileInfo.path,
        size: fileSize,
        modified: fileInfo.stats.mtime,
        stats: fileInfo.stats,
      });
    }

    const forcedEntries = await this.collectForcedEntries(scopePaths, report);

    // Merge discovered files with forced entries, deduplicating by path
    // A force-included file may have been recorded as excluded moments earlier
    // by an ignore rule it overrides. Reporting it as both included and
    // excluded in the same run would be incoherent.
    for (const entry of forcedEntries) {
      report.remove(entry.path);
    }

    const merged = [...discoveredFiles, ...forcedEntries];
    const byPath = new Map(merged.map((f) => [f.path, f]));
    const finalFiles = [...byPath.values()];

    const filterDesc = [
      this.extFilter ? `ext: ${this.extFilter.join(',')}` : null,
      this.maxDepth !== null ? `max-depth: ${this.maxDepth}` : null,
      this.minSizeBytes !== null ? `min-size: ${this.minSizeBytes}B` : null,
      this.maxSizeBytes !== null ? `max-size: ${this.maxSizeBytes}B` : null,
      this.sizeGate !== null ? `size-gate: ${this.sizeGate}B` : null,
      scopePaths
        ? `scope: ${scopePaths.length} entr${scopePaths.length === 1 ? 'y' : 'ies'}`
        : null,
    ]
      .filter(Boolean)
      .join(', ');

    this.log(
      `Discovered ${finalFiles.length} files (${forcedEntries.length} force-included, ${report.total} excluded)${filterDesc ? ` [${filterDesc}]` : ''} in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      basePath: this.basePath,
      files: finalFiles,
      exclusionReport: report,
      stats: {
        ...input.stats,
        totalFiles: discoveredFiles.length,
        filteredFiles: discoveredFiles.length,
        forcedFiles: forcedEntries.length,
        excludedFiles: report.total,
        excluded: report.toJSON(),
      },
    };
  }

  /**
   * Build the ignore layers that apply before any per-directory ignore file.
   *
   * Order is precedence order (later wins):
   *   config excludes -> test exclusions -> global gitignore -> .git/info/exclude
   *   -> caller excludes
   *
   * Per-directory `.gitignore` / `.copytreeignore` layers are appended by the
   * walker as it descends, so they sit between these and nothing else.
   *
   * @param {Object} input - Pipeline input
   * @returns {Promise<Array>} Ordered ignore layers
   */
  async buildInitialLayers(input) {
    const layers = [];

    // 1. Config exclusions. These ALWAYS apply — the CLI and the programmatic
    //    API must agree on what gets excluded, and the media/junk lists are the
    //    difference between a usable context and one full of PNG bytes.
    const globalExcludedDirs = this.config.get('copytree.globalExcludedDirectories', []);
    const globalExcludedFiles = this.config.get('copytree.globalExcludedFiles', []);
    const basePathExcluded = this.config.get('copytree.basePathExcludedDirectories', []);

    const configRules = [
      ...globalExcludedDirs,
      ...globalExcludedDirs.map((dir) => `${dir}/**`),
      ...globalExcludedFiles,
      ...basePathExcluded.map((dir) => `/${dir}/**`),
    ];

    for (const dir of DANGEROUS_DIRECTORIES) {
      configRules.push(dir, `${dir}/**`);
    }

    layers.push({
      base: this.basePath,
      ig: ignore().add(dedupe(configRules)),
      kind: 'config-exclude',
      source: 'config:copytree.globalExcluded*',
      rules: dedupe(configRules),
    });

    // 2. --no-tests
    if (input.options?.tests === false) {
      layers.push({
        base: this.basePath,
        ig: ignore().add(TEST_EXCLUSIONS),
        kind: 'test-exclude',
        source: 'option:--no-tests',
        rules: TEST_EXCLUSIONS,
      });
      this.log('Applied --no-tests: excluding test directories and files', 'debug');
    }

    // 3. Git ignore sources outside the tree: the user's global gitignore and
    //    .git/info/exclude. Both are plain file reads; no git subprocess, and a
    //    non-repository simply contributes nothing.
    if (this.respectGitignore) {
      const gitignoreConfig = this.config.get('copytree.gitignore', {});
      const sources = await collectGitIgnoreSources(this.basePath, {
        infoExclude: gitignoreConfig.infoExclude !== false,
        globalExcludesFile: gitignoreConfig.globalExcludesFile !== false,
      });

      for (const source of sources) {
        layers.push({
          base: this.basePath,
          ig: ignore().add(source.rules),
          kind: source.kind,
          source: source.path,
          rules: source.rules,
        });
        this.log(`Loaded ${source.kind} rules from ${source.path}`, 'debug');
      }

      // When nested .gitignore support is disabled, the root .gitignore still
      // applies as a single layer so behaviour degrades rather than vanishing.
      if (this.config.get('copytree.gitignore.nested', true) === false) {
        const rootLayer = await this.loadGitignore();
        if (rootLayer) layers.push(rootLayer);
      }
    }

    // 4. Caller-supplied excludes. Kept as their own layer so exclusion
    //    accounting can attribute them, and re-applied later by
    //    ProfileFilterStage so they have the final say over ignore negations.
    if (this.excludes.length > 0) {
      layers.push({
        base: this.basePath,
        ig: ignore().add(this.excludes),
        kind: 'option-exclude',
        source: 'option:--exclude',
        rules: this.excludes,
      });
    }

    return layers;
  }

  /**
   * The size gate in effect for a path.
   *
   * `always` / `.copytreeinclude` is an explicit statement of intent and is the
   * only thing that lifts the gate.
   *
   * @param {string} relativePath - POSIX path relative to the base path
   * @returns {number|null} Byte ceiling, or null when no gate applies
   */
  effectiveSizeGate(relativePath) {
    const forced =
      this.forceInclude.length > 0 &&
      micromatch.isMatch(relativePath, this.forceInclude, { dot: true });

    // maxFileSize is a memory-safety ceiling and is never lifted.
    if (forced) return this.maxFileSize;

    if (this.sizeGate === null) return this.maxFileSize;
    if (this.maxFileSize === null) return this.sizeGate;
    return Math.min(this.sizeGate, this.maxFileSize);
  }

  /**
   * Resolve force-include patterns into file entries.
   *
   * These bypass every ignore rule, which is the documented contract for
   * `.copytreeinclude` and `always`.
   *
   * @param {string[]|null} scopePaths - Absolute scope roots, when scoped
   * @param {ExclusionReport} [report] - Accounting for entries the ceiling rejects
   * @returns {Promise<Array>} File entries
   */
  async collectForcedEntries(scopePaths, report) {
    if (this.forceInclude.length === 0) return [];

    this.log(`Force-including ${this.forceInclude.length} pattern(s)`, 'debug');

    // Use task limiter for fast-glob to prevent oversubscription
    const globLimiter = getLimiterFor('glob', 100);
    const globConcurrency = Math.min(
      globLimiter.activeCount + 50, // Allow more for glob since it's usually quick
      100,
    );

    const followSymlinks = this.options.followSymlinks === true;

    const entries = await fastGlob(this.forceInclude, {
      cwd: this.basePath,
      absolute: false,
      dot: true, // ensure hidden files/dirs are discovered
      onlyFiles: true,
      stats: true,
      ignore: [], // bypass all ignore patterns
      concurrency: globConcurrency,
      // fast-glob follows symlinks by default, which made `always` the one path
      // into the tree that ignored the traversal setting entirely: a force
      // include would follow links even with `followSymlinks: false`, and even
      // when following was on it skipped the root-containment check both
      // walkers apply.
      followSymbolicLinks: followSymlinks,
    });

    const scopePrefixes = scopePaths
      ? scopePaths.map((abs) => toPosix(path.relative(this.basePath, abs)))
      : null;

    const forced = [];
    for (const entry of entries) {
      const entryPath = toPosix(entry.path || entry);
      const size = entry.stats?.size || 0;

      // A scoped run must not drag in force-included files from outside the
      // selection: the caller asked for a subtree.
      if (scopePrefixes && !scopePrefixes.some((prefix) => isWithin(entryPath, prefix))) {
        continue;
      }

      // `always` lifts the size gate, but not the memory ceiling. `maxFileSize`
      // is the one limit nothing overrides — a force-included 100MB file would
      // otherwise be read straight into memory here.
      if (this.maxFileSize !== null && size > this.maxFileSize) {
        report?.add({
          path: entryPath,
          size,
          reason: EXCLUSION_REASONS.SIZE_GATE,
          rule: `maxFileSize:${this.maxFileSize}`,
        });
        continue;
      }

      const absolutePath = path.join(this.basePath, entryPath);

      // A force include is still bounded by the repository. `always` overrides
      // ignore rules and the size gate; it does not override the root boundary,
      // which is a security limit rather than a convenience filter.
      if (followSymlinks && !(await this.withinRealRoot(absolutePath))) {
        report?.add({
          path: entryPath,
          size,
          reason: EXCLUSION_REASONS.SYMLINK_ESCAPE,
          rule: 'followSymlinks',
        });
        continue;
      }

      forced.push({
        path: entryPath,
        absolutePath,
        size,
        modified: entry.stats?.mtime || null,
        stats: entry.stats,
      });
    }

    return forced;
  }

  /**
   * Whether a path resolves inside the real base path.
   *
   * Compared after `realpath` on both sides so that a repository reached
   * through a symlink does not fail containment on its own files.
   *
   * @param {string} absolutePath - Candidate path
   * @returns {Promise<boolean>} True when contained
   */
  async withinRealRoot(absolutePath) {
    if (this._realBasePath === undefined) {
      this._realBasePath = await fsp.realpath(this.basePath).catch(() => null);
    }
    if (this._realBasePath === null) return false;

    let real;
    try {
      real = await fsp.realpath(absolutePath);
    } catch {
      return false;
    }

    return real === this._realBasePath || real.startsWith(this._realBasePath + path.sep);
  }

  /**
   * Load the root .gitignore as a single ignore layer.
   *
   * Only used when nested `.gitignore` support is explicitly disabled; the
   * normal path layers `.gitignore` at every depth via the walker.
   *
   * @returns {Promise<{base: string, ig: any}|null>} Ignore layer or null
   */
  async loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');

    try {
      const content = await fsp.readFile(gitignorePath, 'utf8');
      // Strip BOM if present
      const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
      const rules = cleaned.split('\n');

      this.log('Loaded root .gitignore rules', 'debug');

      return {
        base: this.basePath,
        ig: ignore().add(rules),
        kind: 'gitignore',
        source: gitignorePath,
        rules,
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.log(`Error loading .gitignore: ${error.message}`, 'debug');
      }
      return null;
    }
  }

  /**
   * Load .copytreeinclude patterns for force-including files
   */
  async loadCopytreeInclude() {
    const copytreeincludePath = path.join(this.basePath, '.copytreeinclude');

    let content;
    try {
      content = await fsp.readFile(copytreeincludePath, 'utf8');
    } catch {
      return;
    }

    const rawPatterns = content
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

/**
 * Normalize a byte limit option into a positive number or null.
 * @param {*} value - Raw option value
 * @returns {number|null} Positive limit, or null when disabled
 */
function normalizeLimit(value) {
  if (value === undefined || value === null || value === false) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

/**
 * Remove duplicates while preserving order.
 * @param {string[]} values - Input values
 * @returns {string[]} Deduplicated values
 */
function dedupe(values) {
  return [...new Set(values)];
}

/**
 * Whether a POSIX path sits at or below a prefix.
 * @param {string} candidate - Path to test
 * @param {string} prefix - Directory prefix (empty means the root)
 * @returns {boolean} True when the candidate is within the prefix
 */
function isWithin(candidate, prefix) {
  if (prefix === '' || prefix === '.') return true;
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

/**
 * Map an unbounded count onto a percentage that rises quickly and never reaches
 * 100. Discovery has no known total, and a bar that jumps backwards is worse
 * than one that eases in.
 *
 * @param {number} count - Files seen so far
 * @returns {number} Percent in [0, 100)
 */
function indeterminatePercent(count) {
  return Math.round(100 * (1 - 1 / (1 + count / 1000)));
}

export default FileDiscoveryStage;
