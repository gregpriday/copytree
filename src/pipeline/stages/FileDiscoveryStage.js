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
import micromatch from 'micromatch';
import fastGlob from 'fast-glob';
import { createMatcher } from '../../utils/ignoreMatcher.js';
import path from 'path';
import { promises as fsp } from 'node:fs';
import { getLimiterFor } from '../../utils/taskLimiter.js';
import { toPosix } from '../../utils/pathUtils.js';
import { collectGitIgnoreSources } from '../../utils/gitignoreSources.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { resolveScope } from '../../utils/scopeResolver.js';
import { HARD_EXCLUDED_DIRECTORIES, isHardExcluded } from '../../utils/hardExclusions.js';

/**
 * Directories excluded by default because including them buries the signal,
 * not because they are dangerous to read. A `--scope` entry pointed inside one
 * can opt back in via `scopeIgnoresConfigExcludes`.
 */
const BULK_DIRECTORIES = ['node_modules'];

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
    // The patterns the caller supplied. `process()` derives the effective set
    // from these plus the configured dotfile force-includes plus
    // `.copytreeinclude`, and must derive it fresh each time: a stage that
    // accumulated them across two runs would force-include the union of both.
    this.declaredForceInclude = options.forceInclude || [];
    this.forceInclude = [...this.declaredForceInclude];
    // Two exclusion sources, kept apart because they sit at different heights
    // in the precedence stack: a profile's rules, then the caller's, which have
    // the last word over every ignore file in the tree.
    this.profileExcludes = options.profileExcludes || [];
    this.excludes = options.excludes || [];
    // CLI include globs narrow the profile's include set rather than replacing
    // it. A caller who wants the profile out of the way says --no-profile.
    this.includes = options.includes || [];

    // Scoped traversal (R1)
    this.scope = Array.isArray(options.scope)
      ? options.scope
      : options.scope
        ? [options.scope]
        : [];
    this.scopeIgnoresIgnoreFiles = options.scopeIgnoresIgnoreFiles === true;
    // The candidate baseline `ignore context` needs: everything Git and the
    // built-in defaults already remove, but not `.copytreeignore` — so the
    // areas a rule might want to exclude are all still visible. Affects the
    // ignore file only; `.copytreeinclude` is an inclusion and always applies.
    this.skipCopytreeIgnore = options.skipCopytreeIgnore === true;
    this.scopeIgnoresConfigExcludes = options.scopeIgnoresConfigExcludes === true;

    // Budgets applied from stat(), before any file is opened
    this.maxFileSize = normalizeLimit(options.maxFileSize);
    this.sizeGate = normalizeLimit(options.sizeGate);

    // Convenience filter options
    this.extFilter = options.extFilter || null; // e.g. ['.js', '.ts']
    this.maxDepth =
      options.maxDepth !== undefined && options.maxDepth !== null ? options.maxDepth : null;

    /**
     * Every ignore source that took part, in evaluation order.
     *
     * Populated during the walk and handed downstream, because `inspect --view
     * rules` and `explain` both need to name the sources and the order they
     * were applied in, and reconstructing that after the fact means building
     * the layer stack a second time.
     */
    this.activeRuleSources = [];
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
    }

    this.log(`Discovering files in ${this.basePath}`, 'debug');
    const startTime = Date.now();

    const explain = Boolean(this.options.explain || input.options?.explain);
    const retention = this.options.decisionRetention || input.options?.decisionRetention || null;
    const report = new ExclusionReport({
      explain,
      retention: retention?.mode,
      maxEntries: retention?.maxEntries,
      topN: retention?.limit ?? this.config.get('copytree.exclusionReport.topN', 50),
    });

    // Rebuilt from the declared patterns, not appended to whatever the last
    // run left behind, and the compiled matchers go with it.
    this.forceInclude = [
      ...this.declaredForceInclude,
      ...this.config.get('copytree.forceIncludeDotfiles', []),
    ];
    this._forceIncludeMatcher = null;
    this._includeMatcher = null;
    this._cliIncludeMatcher = null;

    // .copytreeinclude has the highest precedence of all: load it before
    // building layers so gate overrides know about it.
    //
    // Loaded even when `.copytreeignore` is being skipped. The two files are
    // opposites — one excludes, one force-includes — and the candidate baseline
    // an ignore report is built from is defined by which *exclusions* are off.
    // Coupling them made the baseline and the ignore-file-only plan differ by
    // two things at once, so the difference was no longer attributable.
    await this.loadCopytreeInclude();

    const initialLayers = await this.buildInitialLayers(input);
    const finalLayers = this.buildFinalLayers();
    const describeLayer = (position) => (layer) => ({
      kind: layer.kind,
      source: layer.source,
      ruleCount: Array.isArray(layer.rules) ? layer.rules.length : 0,
      position,
    });
    // Nested ignore files sit between these two groups. They are discovered as
    // the walker descends, so the list is completed after the walk; a single
    // placeholder row was not an answer to "which rules are in force".
    this.activeRuleSources = [
      ...initialLayers.map(describeLayer('initial')),
      ...finalLayers.map(describeLayer('final')),
    ];
    /** @type {Map<string, {kind: string, source: string, ruleCount: number}>} */
    this.nestedRuleSources = new Map();

    // Ignore file names layered at every directory depth. Later names win, so a
    // `.copytreeignore` rule beats a conflicting `.gitignore` rule.
    const ignoreFileNames = (
      this.respectGitignore
        ? this.config.get('copytree.gitignore.nested', true)
          ? ['.gitignore', '.copytreeignore']
          : ['.copytreeignore']
        : ['.copytreeignore']
    ).filter((name) => !(this.skipCopytreeIgnore && name === '.copytreeignore'));

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
      // Every nested ignore file the walk actually reads, so `inspect --view
      // rules` can name them instead of describing them.
      onIgnoreFile: (layer) => {
        if (this.nestedRuleSources.has(layer.source)) return;
        this.nestedRuleSources.set(layer.source, {
          kind: layer.kind,
          source: layer.source,
          ruleCount: Array.isArray(layer.rules) ? layer.rules.length : 0,
          position: 'nested',
        });
      },
      includeDirectories: false,
      followSymlinks: this.options.followSymlinks === true,
      explain,
      initialLayers,
      finalLayers,
      // The three retry settings the walkers actually read, and nothing else.
      // This was `this.config.all()`, which deep-clones the entire merged
      // configuration — including the exclusion lists, which are the largest
      // thing in it — once per run, to reach three integers.
      config: {
        copytree: {
          fs: {
            retryAttempts: this.config.get('copytree.fs.retryAttempts', 3),
            retryDelay: this.config.get('copytree.fs.retryDelay', 100),
            maxDelay: this.config.get('copytree.fs.maxDelay', 2000),
          },
        },
      },
      maxDepth: this.maxDepth !== null ? this.maxDepth : undefined,
      signal: input.options?.signal,
      onExclude: (record) => report.add(record),
    };

    if (scopePaths) {
      walkOptions.scope = scopePaths;
      walkOptions.scopeIgnoresIgnoreFiles = this.scopeIgnoresIgnoreFiles;
      walkOptions.scopeIgnoresConfigExcludes = this.scopeIgnoresConfigExcludes;
    }

    // Add parallel-specific options if enabled
    if (parallelEnabled) {
      walkOptions.concurrency = discoveryConcurrency;
      if (highWaterMark) {
        walkOptions.highWaterMark = highWaterMark;
      }
    }

    // Choose walker based on configuration.
    //
    // The parallel walker is loaded only when it is the one being used.
    // Parallel discovery is off by default, so importing both meant every run
    // parsed a traversal implementation it was not going to call.
    const walker = parallelEnabled
      ? (await import('../../utils/parallelWalker.js')).walkParallel(this.basePath, walkOptions)
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
      if (usePatternFilter && !this.matchesIncludePatterns(relativePath)) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
        });
        continue;
      }

      // CLI include globs are an additional narrowing condition: a file has to
      // match at least one of them, on top of whatever the profile allowed.
      if (this.includes.length > 0 && !this.matchesCliIncludes(relativePath)) {
        report.add({
          path: relativePath,
          size: fileSize,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
          rule: `include:${this.includes.join(', ')}`,
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

    // Forced entries last, so a file that was both discovered normally and
    // force-included keeps the `alwaysInclude` mark.
    const merged = [...discoveredFiles, ...forcedEntries];
    const byPath = new Map(merged.map((f) => [f.path, f]));
    const finalFiles = [...byPath.values()];

    const filterDesc = [
      this.extFilter ? `ext: ${this.extFilter.join(',')}` : null,
      this.maxDepth !== null ? `max-depth: ${this.maxDepth}` : null,
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
      // Initial layers, then the nested files the walk found, then the layers
      // that get the last word — evaluation order, which is the only order in
      // which the list means anything.
      ruleSources: [
        ...this.activeRuleSources.filter((entry) => entry.position === 'initial'),
        ...this.nestedRuleSources.values(),
        ...this.activeRuleSources.filter((entry) => entry.position === 'final'),
      ],
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

    for (const dir of BULK_DIRECTORIES) {
      configRules.push(dir, `${dir}/**`);
    }

    layers.push({
      base: this.basePath,
      ig: createMatcher(dedupe(configRules)),
      kind: 'config-exclude',
      source: 'config:copytree.globalExcluded*',
      rules: dedupe(configRules),
    });

    // Git metadata is its own layer because it is the one exclusion no option
    // lifts. `--scope` with `scopeIgnoresConfigExcludes` is a deliberate "yes,
    // I mean node_modules" gesture; there is no corresponding reason to want
    // the contents of `.git`, and packed objects and refs are the last thing
    // that should reach a model.
    const hardRules = [];
    for (const dir of HARD_EXCLUDED_DIRECTORIES) {
      hardRules.push(dir, `${dir}/**`);
    }

    layers.push({
      base: this.basePath,
      ig: createMatcher(hardRules),
      kind: 'hard-exclude',
      source: 'builtin:always-excluded',
      rules: hardRules,
    });

    // 2. --no-tests
    if (input.options?.tests === false) {
      layers.push({
        base: this.basePath,
        ig: createMatcher(TEST_EXCLUSIONS),
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
          ig: createMatcher(source.rules),
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

    return layers;
  }

  /**
   * The layers that get the last word.
   *
   * Profile exclusions, then caller exclusions. They are evaluated after every
   * nested `.gitignore` and `.copytreeignore`, which is the whole point: an
   * `--exclude 'docs/'` that a `!docs/keep.md` deep in the tree could overturn
   * would not be an exclusion, it would be a suggestion.
   *
   * This also replaces the second, minimatch-based application of the same
   * patterns that used to happen downstream. One language, one evaluator, one
   * pass — so anchoring, dotfiles, directory rules and negation cannot mean two
   * different things depending on which stage looked at them.
   *
   * @returns {Array} Ordered final layers
   */
  buildFinalLayers() {
    const layers = [];

    if (this.profileExcludes.length > 0) {
      layers.push({
        base: this.basePath,
        ig: createMatcher(this.profileExcludes),
        kind: 'profile-exclude',
        source: 'profile:exclude',
        rules: this.profileExcludes,
      });
    }

    if (this.excludes.length > 0) {
      layers.push({
        base: this.basePath,
        ig: createMatcher(this.excludes),
        kind: 'option-exclude',
        source: 'option:--exclude',
        rules: this.excludes,
      });
    }

    return layers;
  }

  /**
   * Compiled matchers, built on first use and reused for every path.
   *
   * `micromatch.isMatch(path, patterns)` compiles the pattern list into regular
   * expressions on each call, and both of these were called once per discovered
   * file — so a run over a thousand files parsed the same ten force-include
   * globs a thousand times. `micromatch.matcher()` returns the compiled matcher
   * so the parse happens once.
   *
   * Lazy rather than constructed up front: a stage built for `--only-tree` or a
   * dry run may never reach the walk, and compiling globs it will not use is the
   * same waste in a smaller package.
   *
   * @param {string} relativePath - POSIX path relative to the base path
   * @returns {boolean} Whether the path is force-included
   */
  matchesForceInclude(relativePath) {
    if (!this._forceIncludeMatcher) {
      this._forceIncludeMatcher = micromatch.matcher(this.forceInclude, { dot: true });
    }
    return this._forceIncludeMatcher(relativePath);
  }

  /**
   * Whether a path satisfies the caller's include patterns.
   *
   * @param {string} relativePath - POSIX path relative to the base path
   * @returns {boolean} Whether the path matches
   */
  matchesIncludePatterns(relativePath) {
    if (!this._includeMatcher) {
      this._includeMatcher = micromatch.matcher(this.patterns);
    }
    return this._includeMatcher(relativePath);
  }

  /**
   * Whether a path satisfies the CLI include globs.
   *
   * @param {string} relativePath - POSIX path relative to the base path
   * @returns {boolean} Whether the path matches at least one CLI include
   */
  matchesCliIncludes(relativePath) {
    if (!this._cliIncludeMatcher) {
      this._cliIncludeMatcher = micromatch.matcher(this.includes, { dot: true });
    }
    return this._cliIncludeMatcher(relativePath);
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
    const forced = this.forceInclude.length > 0 && this.matchesForceInclude(relativePath);

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

      // Force inclusion overrides *exclusions* — ignore files, profile and CLI
      // excludes, the hidden-file default, the size gate. It does not override
      // an inclusion selector: `--include '**/*.ts'` is the caller narrowing
      // what they asked for, and a force-include that survived it would make
      // the flag advisory. Profile includes are deliberately not applied here,
      // which is what lets `.copytreeinclude` reach a hidden file a profile's
      // include list would never have matched.
      if (this.includes.length > 0 && !this.matchesCliIncludes(entryPath)) {
        report?.add({
          path: entryPath,
          size,
          reason: EXCLUSION_REASONS.FILTER_PATTERN,
          rule: `include:${this.includes.join(', ')}`,
        });
        continue;
      }

      // `always` overrides ignore rules; it does not override the hard
      // exclusions. Packed objects and refs are not source, and are never what
      // a pattern like `.git/**` or a broad `**/config*` actually meant.
      if (isHardExcluded(entryPath)) {
        report?.add({
          path: entryPath,
          size,
          reason: EXCLUSION_REASONS.CONFIG_EXCLUDE,
          rule: 'builtin:always-excluded',
        });
        continue;
      }

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
        // Marked here, at the decision, rather than re-derived by a later stage
        // with a different matcher against a pattern list that never included
        // `.copytreeinclude`. Downstream stages — the Git filter especially —
        // need to know a file was demanded, not merely selected.
        alwaysInclude: true,
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
        ig: createMatcher(rules),
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
