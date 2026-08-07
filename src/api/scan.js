import Pipeline from '../pipeline/Pipeline.js';
import { ValidationError, ERROR_CODES, createAbortError } from '../utils/errors.js';
import { ConfigManager } from '../config/ConfigManager.js';
import FolderProfileLoader from '../config/FolderProfileLoader.js';
import { ProgressTracker } from '../utils/ProgressTracker.js';
import { ExclusionReport } from '../utils/exclusionReport.js';
import { resolveScope } from '../utils/scopeResolver.js';
import path from 'path';
import fs from '../utils/fsx.js';

/**
 * Stage-computed stats forwarded verbatim from the pipeline result, onto the
 * scan summary, and from there onto `CopyResult.stats`.
 *
 * One list rather than one per hop: these were stranded in the pipeline result
 * precisely because every hop had to name them, and a hop that forgot one lost
 * it silently.
 */
export const FORWARDED_STAT_KEYS = Object.freeze([
  'secretsGuard',
  'oversizedFirstFileRetained',
  'truncatedByCountBudget',
  'truncatedBySizeBudget',
  'totalCharacters',
  'characterLimit',
  'truncatedFiles',
  'skippedFiles',
]);

/**
 * Copy the {@link FORWARDED_STAT_KEYS} that are present from a source object.
 *
 * Absent keys stay absent rather than becoming `undefined`, so a consumer can
 * use `in` or `??` without a stage's non-participation looking like a value.
 *
 * @param {Object} [source] - Source object
 * @returns {Object} Object containing only the keys that were present
 */
export function pickForwardedStats(source) {
  if (!source) return {};
  const result = {};
  for (const key of FORWARDED_STAT_KEYS) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

/**
 * @typedef {Object} FileResult
 * @property {string} path - POSIX-style relative path
 * @property {string} absolutePath - Platform-specific absolute path
 * @property {number} size - File size in bytes
 * @property {Date} modified - Last modified timestamp
 * @property {string} [content] - File content (if includeContent is true)
 * @property {boolean} isBinary - Whether file is binary
 * @property {string} [encoding] - Character encoding (for text files)
 * @property {Object} [gitStatus] - Git status information (if withGitStatus is true)
 */

/**
 * @typedef {Object} ScanSummary
 * @property {number} totalFiles - Files selected
 * @property {number} totalSize - Total size of selected files in bytes
 * @property {boolean} noFilesMatched - True when nothing matched. This is a valid
 *   outcome (an empty folder, a fully-ignored scope), not an error.
 * @property {Object} excluded - Exclusion accounting; see EXCLUSION_REASONS
 * @property {boolean} [truncated] - Whether a budget dropped files
 * @property {number} [truncatedCount] - How many files a budget dropped
 * @property {string} [truncatedBy] - Which budget bit first
 * @property {string[]} [scope] - Resolved scope entries, when scoped
 */

/**
 * @typedef {Object} ScanOptions
 * @property {string[]} [filter] - Additional include patterns (globs)
 * @property {string[]} [exclude] - Additional exclude patterns (globs)
 * @property {string[]} [scope] - Literal paths (files or directories) to traverse instead of the
 *   whole tree. Ignore rules still resolve from `basePath`, output paths stay relative to
 *   `basePath`, and no glob escaping is required. Composes with `filter`.
 * @property {boolean} [scopeIgnoresIgnoreFiles=false] - Let `scope` entries override the ignore
 *   rules that would otherwise exclude them. Off by default so a scoped run selects exactly the
 *   files a filtered full run would.
 * @property {boolean} [scopeIgnoresConfigExcludes=false] - Let `scope` entries override the
 *   config-level exclusions (`node_modules`, `copytree.globalExcluded*`) blocking them. For the
 *   case where a user picked the folder deliberately. `.git` is never included.
 * @property {boolean} [respectGitignore=true] - Use .gitignore rules
 * @property {boolean} [modified=false] - Only git modified files
 * @property {string} [changed] - Files changed since git ref
 * @property {number} [maxDepth] - Maximum directory depth
 * @property {boolean} [transform=false] - Apply transformers
 * @property {string[]} [transformers] - Specific transformers to use
 * @property {boolean} [includeHidden=false] - Include hidden files
 * @property {boolean} [followSymlinks=false] - Follow symbolic links
 * @property {number} [maxFileSize] - Memory-safety ceiling; files above it are never read
 * @property {number|false} [sizeGate] - Hard per-file size gate applied from stat(). Files above
 *   it are never opened. Only `always` / `.copytreeinclude` overrides it. `false` disables.
 * @property {number} [maxTotalSize] - Maximum total size in bytes
 * @property {number} [maxFileCount] - Maximum number of files
 * @property {number} [charLimit] - Character budget across all file content
 * @property {string[]} [always] - Patterns to force include
 * @property {AbortSignal} [signal] - AbortSignal for cancellation
 * @property {Function} [onEvent] - Event callback function
 * @property {boolean} [withGitStatus=false] - Include git status information
 * @property {boolean} [includeContent=true] - Include file content in results
 * @property {boolean} [dedupe=false] - Remove duplicate files
 * @property {boolean} [explain=false] - Collect per-file exclusion detail
 * @property {boolean} [secretsGuard] - Detect and redact credentials. Defaults to the
 *   `secretsGuard.enabled` configuration value (on), and applies identically here and on the
 *   CLI. Pass `false` to disable it explicitly.
 * @property {'typed'|'generic'|'hash'} [secretsRedactMode] - How redacted spans are marked
 * @property {boolean} [failOnSecrets] - Throw `ERR_SECRETS_DETECTED` instead of redacting
 * @property {string} [sort] - Sort order: 'path', 'size', 'modified', 'name', 'extension', 'depth'
 * @property {ConfigManager} [config] - ConfigManager instance for isolated configuration.
 *   If not provided, an isolated instance will be created. This enables concurrent
 *   scan operations with different configurations.
 * @property {Function} [onProgress] - Progress callback ({ percent, message }).
 *   Called periodically during scanning with normalized progress updates (0-100%).
 * @property {number} [progressThrottleMs=100] - Minimum ms between progress emissions.
 * @property {Function} [onSummary] - Called once with a {@link ScanSummary} after the pipeline
 *   completes and before any file is yielded. This is how a streaming consumer gets the numbers
 *   (counts, exclusion accounting, truncation) without buffering the whole run.
 */

/**
 * Scan a directory and return an async iterable of FileResult objects.
 *
 * The async-iterable shape is for **consumption convenience**, not bounded
 * memory. The pipeline runs to completion and the full selection is resident
 * before the first file is yielded, because sorting and exact budget
 * enforcement both need to see every candidate before any of them can be
 * declared a survivor. Iterate it to process files one at a time without
 * building your own array; do not rely on it to keep a repository larger than
 * memory out of memory.
 *
 * `onSummary` is invoked once, before the first yield, so a consumer gets the
 * counts and exclusion accounting without draining the iterator first.
 *
 * @param {string} basePath - Path to directory to scan
 * @param {ScanOptions} [options={}] - Scan options
 * @returns {AsyncIterable<FileResult>} Async iterable of file results
 * @throws {ValidationError} If basePath is invalid or doesn't exist (`ERR_PATH_NOT_FOUND`)
 * @throws {ScopeError} If a scope entry is missing or escapes the base path
 * @throws {Error} If scan is aborted via signal (`name: 'AbortError'`, `code: 'ERR_ABORTED'`)
 *
 * @example
 * // Basic scan
 * for await (const file of scan('./src')) {
 *   console.log(file.path, file.size);
 * }
 *
 * @example
 * // Scope to a subtree without walking the whole repository.
 * // Ignore rules still resolve from the repository root, and paths stay
 * // root-relative, so `@`-references handed to an agent still resolve.
 * const files = scan(repoRoot, {
 *   scope: ['src/panels/file-browser', 'package.json'],
 * });
 *
 * @example
 * // Streaming consumer that still gets the numbers
 * let summary;
 * for await (const file of scan('./src', { onSummary: (s) => (summary = s) })) {
 *   process(file);
 * }
 * console.log(summary.totalFiles, summary.excluded.total);
 *
 * @example
 * // With cancellation
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * try {
 *   for await (const file of scan('./large-project', {
 *     signal: controller.signal
 *   })) {
 *     process(file);
 *   }
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Scan cancelled');
 *   }
 * }
 */
export async function* scan(basePath, options = {}) {
  // Guard against null options
  options = options ?? {};

  // Validate basePath
  if (!basePath || typeof basePath !== 'string') {
    throw new ValidationError('basePath must be a non-empty string', 'scan', basePath, {
      code: ERROR_CODES.INVALID_OPTION,
    });
  }

  // Resolve and validate path. Everything resolves from basePath: no step in the
  // pipeline consults process.cwd(), so an embedder whose cwd is elsewhere
  // (an app bundle, a worker thread) gets the same answer.
  const resolvedPath = path.resolve(basePath);
  if (!(await fs.pathExists(resolvedPath))) {
    throw new ValidationError(`Path does not exist: ${resolvedPath}`, 'scan', basePath, {
      code: ERROR_CODES.PATH_NOT_FOUND,
    });
  }

  // Check for abort signal
  if (options.signal?.aborted) {
    throw createAbortError('Scan aborted');
  }

  // 1. Load Folder Profile (Fix: Use FolderProfileLoader with basePath)
  const loader = new FolderProfileLoader({ cwd: resolvedPath });
  let folderProfile = null;

  // If a specific profile name is passed in options, load it; otherwise auto-discover
  try {
    if (options.profile) {
      folderProfile = await loader.loadNamed(options.profile);
    } else {
      folderProfile = await loader.discover();
    }
  } catch (e) {
    // If explicit profile failed, throw. If auto-discovery failed, ignore.
    if (options.profile) throw e;
  }

  // Create or use provided config instance for isolation
  const configInstance = options.config || (await ConfigManager.create());

  // Build configuration from options and config defaults
  const copytreeConfig = configInstance.get('copytree', {});

  // 2. Build Profile Config (Merging Logic)
  // Precedence: Options (API) > Folder Profile (.copytree.yml) > Global Defaults

  // Helper to ensure array
  const toArray = (val) => (Array.isArray(val) ? val : val ? [val] : []);

  const profile = {
    // Include patterns
    include: options.filter
      ? toArray(options.filter)
      : folderProfile?.include?.length > 0
        ? folderProfile.include
        : ['**/*'],

    // Exclude patterns from the caller and the folder profile.
    // Config-level exclusions (globalExcludedDirectories / globalExcludedFiles)
    // are NOT merged here: FileDiscoveryStage applies them unconditionally, so
    // the CLI and the programmatic API cannot drift apart.
    exclude: [...toArray(options.exclude), ...(folderProfile?.exclude || [])],

    // Filter patterns
    filter: toArray(options.filter),

    // Force-include patterns
    always: [...toArray(options.always), ...toArray(folderProfile?.always)],

    // Options merging
    options: {
      respectGitignore:
        options.respectGitignore ??
        folderProfile?.options?.respectGitignore ??
        copytreeConfig.respectGitignore ??
        true,
      includeHidden:
        options.includeHidden ??
        folderProfile?.options?.includeHidden ??
        copytreeConfig.includeHidden ??
        false,
      followSymlinks:
        options.followSymlinks ??
        folderProfile?.options?.followSymlinks ??
        copytreeConfig.followSymlinks ??
        false,
      maxFileSize:
        options.maxFileSize ?? folderProfile?.options?.maxFileSize ?? copytreeConfig.maxFileSize,
      sizeGate: options.sizeGate ?? folderProfile?.options?.sizeGate ?? copytreeConfig.sizeGate,
      maxTotalSize:
        options.maxTotalSize ?? folderProfile?.options?.maxTotalSize ?? copytreeConfig.maxTotalSize,
      maxFileCount:
        options.maxFileCount ?? folderProfile?.options?.maxFileCount ?? copytreeConfig.maxFileCount,
      charLimit: options.charLimit ?? folderProfile?.options?.charLimit,
      maxDepth: options.maxDepth ?? folderProfile?.options?.maxDepth,
    },
  };

  // Resolve the scope BEFORE the pipeline runs. The pipeline continues on stage
  // errors by design, which would turn "that folder does not exist" into an
  // empty result indistinguishable from "everything there is gitignored".
  const scope = toArray(options.scope);
  const scopeEntries =
    scope.length > 0
      ? await resolveScope(resolvedPath, scope, {
          followSymlinks: profile.options.followSymlinks,
        })
      : [];
  const scopePaths = scopeEntries.map((entry) => entry.absolutePath);

  // Create pipeline with stages and pass config instance for isolation
  const pipeline = new Pipeline({
    continueOnError: true,
    emitProgress: Boolean(options.onEvent || options.onProgress),
    config: configInstance,
    // The SDK writes nothing to its host's terminal. Stage messages are still
    // emitted as `stage:log` events for a caller that wants them, and
    // `quiet: false` restores the old behaviour.
    quiet: options.quiet !== false,
  });

  // Setup stages
  const stages = [];

  // Merge force-include patterns
  const mergedAlways = [...toArray(options.always), ...toArray(profile.always)];

  // 1. File Discovery Stage
  const { default: FileDiscoveryStage } = await import('../pipeline/stages/FileDiscoveryStage.js');
  stages.push(
    new FileDiscoveryStage({
      basePath: resolvedPath,
      patterns: profile.include || ['**/*'],
      excludes: profile.exclude || [],
      respectGitignore: profile.options.respectGitignore,
      includeHidden: profile.options.includeHidden,
      followSymlinks: profile.options.followSymlinks,
      maxFileSize: profile.options.maxFileSize,
      sizeGate: profile.options.sizeGate,
      maxDepth: profile.options.maxDepth,
      forceInclude: mergedAlways,
      scope: scopePaths,
      scopeIgnoresIgnoreFiles: options.scopeIgnoresIgnoreFiles === true,
      scopeIgnoresConfigExcludes: options.scopeIgnoresConfigExcludes === true,
      explain: options.explain === true,
    }),
  );

  // 2. Always Include Stage
  if (mergedAlways.length > 0) {
    const { default: AlwaysIncludeStage } =
      await import('../pipeline/stages/AlwaysIncludeStage.js');
    stages.push(new AlwaysIncludeStage(mergedAlways));
  }

  // 3. Git Filter Stage
  if (options.modified || options.changed) {
    const { default: GitFilterStage } = await import('../pipeline/stages/GitFilterStage.js');
    stages.push(
      new GitFilterStage({
        basePath: resolvedPath,
        modified: options.modified,
        changed: options.changed,
        withGitStatus: options.withGitStatus,
      }),
    );
  }

  // 4. Profile Filter Stage
  const { default: ProfileFilterStage } = await import('../pipeline/stages/ProfileFilterStage.js');
  stages.push(
    new ProfileFilterStage({
      exclude: profile.exclude || [],
      filter: profile.filter || [],
    }),
  );

  // 5. Sort Stage — ALWAYS, not only when the caller asked for an order.
  //    Budgets truncate from the tail, so "which files survive" is only
  //    meaningful once the order is defined.
  const { default: SortFilesStage } = await import('../pipeline/stages/SortFilesStage.js');
  stages.push(
    new SortFilesStage({ sortBy: options.sort || 'path', order: options.sortOrder || 'asc' }),
  );

  // 6. Budget Stage — maxFileCount and maxTotalSize, applied to the sorted list.
  const { default: BudgetStage } = await import('../pipeline/stages/BudgetStage.js');
  stages.push(
    new BudgetStage({
      maxFileCount: profile.options.maxFileCount,
      maxTotalSize: profile.options.maxTotalSize,
    }),
  );

  // Secret scanning needs content, but two of the exclusions it applies (the
  // secret-prone glob list, the scan size ceiling) are decidable without it.
  // Running the stage in plan mode keeps a dry run's selection identical to the
  // real run's, which is the contract `dryRun` advertises.
  const planOnly = options.includeContent === false;
  const secretsGuardEnabled =
    options.secretsGuard !== false &&
    (options.secretsGuard === true || configInstance.get('secretsGuard.enabled', true));

  // 7. File Loading Stage (if includeContent is not explicitly false)
  if (options.includeContent !== false) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(
      new FileLoadingStage({
        encoding: 'utf8',
      }),
    );

    // 8. Transform Stage (if requested)
    if (options.transform) {
      const { default: TransformStage } = await import('../pipeline/stages/TransformStage.js');
      const TransformerRegistry = (await import('../transforms/TransformerRegistry.js')).default;
      // Pass config to registry for isolation
      const registry = await TransformerRegistry.createDefault({ config: configInstance });

      stages.push(
        new TransformStage({
          registry,
          transformers: options.transformers,
          profile,
        }),
      );
    }
  }

  // 9. Deduplicate Stage — after loading, because duplicates are decided by
  //    content hash and there is no content before this point.
  //
  //    Before the secrets guard, because redaction destroys the distinction it
  //    hashes on: two config files differing only in their credentials become
  //    byte-identical strings of the same marker, and one is then dropped as a
  //    duplicate of the other.
  if (options.dedupe) {
    const { default: DeduplicateFilesStage } =
      await import('../pipeline/stages/DeduplicateFilesStage.js');
    stages.push(new DeduplicateFilesStage());
  }

  // 10. Secrets Guard Stage — same policy, same position, as the CLI. An
  //     embedder should not have to know which entry point it reached for to
  //     know whether credentials were redacted.
  //
  //     Outside the content block above, because it runs in plan mode too: the
  //     secret-prone glob list and the scan size ceiling are both decidable
  //     without content, and omitting them made a dry run's selection differ
  //     from the real run's. It still lands after transformation, since that
  //     branch adds no stages when there is no content.
  if (secretsGuardEnabled) {
    const { default: SecretsGuardStage } = await import('../pipeline/stages/SecretsGuardStage.js');
    stages.push(
      new SecretsGuardStage({
        enabled: true,
        planOnly,
        redactionMode:
          options.secretsRedactMode || configInstance.get('secretsGuard.redactionMode', 'typed'),
        failOnSecrets:
          options.failOnSecrets ?? configInstance.get('secretsGuard.failOnSecrets', false),
      }),
    );
  }

  // 10. Character Limit Stage
  // Nullish rather than truthy, so `charLimit: 0` reaches the stage as the
  // budget it is instead of being read as "no budget requested".
  if (profile.options.charLimit != null) {
    const { default: CharLimitStage } = await import('../pipeline/stages/CharLimitStage.js');
    stages.push(
      new CharLimitStage({
        limit: parseInt(profile.options.charLimit, 10),
        // Without content loaded (dry run) the budget is planned from byte size
        // so the dry run still selects the same files as the real run.
        plan: options.includeContent === false,
      }),
    );
  }

  pipeline.through(stages);

  // Setup progress tracking
  if (options.onProgress) {
    const tracker = new ProgressTracker({
      totalStages: stages.length,
      onProgress: options.onProgress,
      throttleMs: options.progressThrottleMs ?? 100,
    });
    tracker.attach(pipeline);
  }

  // Cancellation is handled by the signal being checked inside the walker and
  // again before each yield, NOT by emitting on the pipeline: 'error' is a
  // special EventEmitter event, and emitting it with no listener attached
  // crashes the host process rather than rejecting the caller's promise.

  // Setup event forwarding
  if (options.onEvent) {
    const events = [
      'stage:start',
      'stage:complete',
      'stage:error',
      'stage:recover',
      'stage:progress',
      'file:batch',
      'stage:log',
    ];

    for (const event of events) {
      pipeline.on(event, (data) => {
        options.onEvent({ type: event, data });
      });
    }
  }

  // Execute pipeline
  try {
    const result = await pipeline.process({
      basePath: resolvedPath,
      profile,
      options: { ...options, scope },
    });

    // A cancelled run is always fatal, whatever `continueOnError` recovered.
    // Returning a partial selection as if it were complete is the one outcome a
    // caller cannot detect.
    if (options.signal?.aborted) {
      throw createAbortError('Scan aborted');
    }

    // Yield files in stable order
    const files = (result.files || []).filter((file) => file !== null);

    // Deliberately not re-sorted. `SortFilesStage` has already ordered these,
    // and its ordering is the canonical one: pinned to the `en` locale, numeric
    // aware, with a code-unit tie-break so the result does not depend on
    // filesystem enumeration order.
    //
    // The second sort that used to sit here ran a bare `new Intl.Collator()` —
    // the *system* locale, no numeric handling, ties left unresolved — over the
    // whole selection, so it did not merely repeat the stage's O(n log n) work,
    // it overwrote a deterministic order with a machine-dependent one. Two
    // developers running the same command against the same tree under different
    // `LANG` settings got different documents, which is precisely the bug the
    // pinned collator in `SortFilesStage` exists to prevent.

    if (options.onSummary) {
      const report =
        result.exclusionReport instanceof ExclusionReport
          ? result.exclusionReport.toJSON()
          : (result.stats?.excluded ?? { total: 0, byReason: {} });

      const summary = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
        noFilesMatched: files.length === 0,
        excluded: report,
        ...(result.stats?.truncated
          ? {
              truncated: true,
              truncatedCount: result.stats.truncatedCount,
              truncatedBy: result.stats.truncatedBy,
            }
          : { truncated: false }),
        ...(result.stats?.budgetExceeded ? { budgetExceeded: true } : {}),
        ...(scope.length > 0 ? { scope } : {}),
        // Stage-level detail that stages already compute. These were stranded
        // in the pipeline result: a caller reading `stats` could see *that* a
        // budget bit but not which one, and could not see the secrets summary
        // at all even though the types promised it.
        ...pickForwardedStats(result.stats),
      };

      try {
        options.onSummary(summary);
      } catch {
        // A buggy summary callback must not fail the scan.
      }
    }

    for (const file of files) {
      // Check abort signal before yielding
      if (options.signal?.aborted) {
        throw createAbortError('Scan aborted');
      }

      yield file;
    }
  } catch (error) {
    // Re-throw abort errors as-is
    if (error.name === 'AbortError') {
      throw error;
    }

    // Preserve typed errors (scope resolution, validation, configuration) so
    // callers can switch on `code` instead of matching on message substrings.
    if (error.code && String(error.code).startsWith('ERR_')) {
      throw error;
    }

    // Wrap other errors with context
    const scanError = new Error(`Scan failed: ${error.message}`);
    scanError.cause = error;
    throw scanError;
  }
}

export default scan;
