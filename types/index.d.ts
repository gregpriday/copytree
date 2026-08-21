/**
 * CopyTree TypeScript Definitions
 *
 * Provides comprehensive type definitions for the CopyTree programmatic API.
 * Full IntelliSense support for TypeScript consumers.
 *
 * @module copytree
 */

// ============================================================================
// Progress and Callback Types
// ============================================================================

/**
 * Progress event emitted during copy/scan operations.
 * Used by the onProgress callback to report progress updates.
 */
export interface ProgressEvent {
  /**
   * Progress percentage (0-100).
   * Monotonic within a run, and reaches 100 exactly once on success.
   */
  percent: number;
  /** Human-readable progress message */
  message: string;
  /**
   * Stable stage identifier, never a class name.
   * Fires during discovery as well as formatting.
   */
  stage?: PipelineStageId;
  /**
   * The coarse phase this stage belongs to — the handful of steps a person
   * actually distinguishes, rather than one per stage.
   */
  phase?:
    | 'prepare'
    | 'discover'
    | 'select'
    | 'load'
    | 'transform'
    | 'context'
    | 'secrets'
    | 'format'
    | 'deliver';
  /**
   * How many items this stage has finished, when it knows its denominator.
   * Absent for stages that cannot count ahead.
   */
  completed?: number;
  /** The denominator for `completed`, when known. */
  total?: number;
  /** The item currently being processed, usually a POSIX file path. */
  item?: string;
}

/**
 * Progress callback function signature
 */
export type ProgressCallback = (progress: ProgressEvent) => void;

/**
 * Stable pipeline stage identifiers.
 *
 * Part of the public API: `ProgressEvent.stage` is rendered by consuming
 * applications, so these values are stable. Adding a stage is additive;
 * renaming one is breaking.
 */
export type PipelineStageId =
  | 'discover'
  | 'gitFilter'
  | 'sort'
  | 'budget'
  | 'load'
  | 'secrets'
  | 'transform'
  | 'dedupe'
  | 'charLimit'
  | 'instructions'
  | 'format'
  | 'unknown';

export const PIPELINE_STAGES: Readonly<Record<string, PipelineStageId>>;

// ============================================================================
// Exclusion Accounting
// ============================================================================

/**
 * Stable exclusion reason keys.
 *
 * Values are machine-readable and never prose: they cross process boundaries
 * and get rendered by switch statements. New reasons are additive.
 */
export type ExclusionReason =
  | 'gitignore'
  | 'copytreeignore'
  | 'globalGitignore'
  | 'gitInfoExclude'
  | 'configExclude'
  | 'optionExclude'
  | 'filterPattern'
  | 'testExclude'
  | 'binaryExtension'
  | 'binaryPolicy'
  | 'sizeGate'
  | 'totalSizeBudget'
  | 'fileCountBudget'
  | 'charBudget'
  | 'scopeFilter'
  | 'gitFilter'
  | 'duplicate'
  | 'unreadable'
  // Secret handling. Omitted before, so an exhaustive `switch` over the
  // reasons a file was dropped had no case for the three that matter most to
  // anyone auditing what left their machine.
  | 'secretFile'
  | 'secretUnscannable'
  | 'secretDetected'
  | 'symlinkEscape';

export const EXCLUSION_REASONS: Readonly<Record<string, ExclusionReason>>;

/** One excluded entry, with the rule that excluded it when known. */
export interface ExclusionDetail {
  /** POSIX path relative to the base path */
  path: string;
  /** File size in bytes (0 when unknown, e.g. a pruned directory) */
  size: number;
  /** Why it was excluded */
  reason: ExclusionReason;
  /** The pattern that matched, when known */
  rule?: string;
  /** Which ignore file and line produced the rule, e.g. `/repo/.gitignore:12` */
  ruleSource?: string;
}

/**
 * Exclusion accounting for a run.
 *
 * Aggregate counts are always present and cost nothing extra. The `largest`
 * detail list is only populated when `explain: true` was requested.
 *
 * A pruned directory counts as a single exclusion representing its entire
 * subtree; CopyTree does not descend into an excluded directory to count what
 * is inside it.
 */
export interface ExclusionSummary {
  /** How many entries were excluded */
  total: number;
  /** Counts keyed by reason */
  byReason: Partial<Record<ExclusionReason, number>>;
  /** The largest exclusions, only under `explain: true` */
  largest?: ExclusionDetail[];
}

// ============================================================================
// Manifest Outcomes
// ============================================================================

/**
 * What happened to a file.
 *
 * `excluded:<reason>` uses the {@link ExclusionReason} keys.
 */
export type ManifestOutcome =
  'included' | 'structure-only' | 'binary-placeholder' | 'truncated' | `excluded:${string}`;

/**
 * Build the lightweight manifest `copy()` returns.
 *
 * Entries never carry content, so a manifest is safe to retain in a long-lived
 * process without holding megabytes of file bodies.
 */
export function buildManifest(
  files: FileResult[],
  options?: { structureOnlyPatterns?: string[]; binaryExtensions?: Record<string, string[]> },
): ManifestEntry[];

/** Classify one file into its manifest outcome. */
export function classifyOutcome(
  file: FileResult,
  options?: { structureOnlyPatterns?: string[]; binaryExtensions?: Record<string, string[]> },
): ManifestOutcome;

export const MANIFEST_OUTCOMES: Readonly<Record<string, ManifestOutcome>>;

/** Output format version strings, e.g. `copytree-xml@1`. */
export const OUTPUT_FORMAT_VERSIONS: Readonly<Record<string, string>>;

/** Get the version string for a format name, or null if unknown. */
export function versionFor(format: string): string | null;

/** Average characters per token used by the estimator. */
export const CHARS_PER_TOKEN: number;

/**
 * Estimate tokens from a character count.
 * Heuristic: accurate to roughly ±20%, with no tokenizer dependency and no
 * per-model accuracy claim.
 */
export function estimateTokens(chars: number): number;

/** Estimate the formatted output size, in characters, for a set of files. */
export function estimateOutputChars(
  files: Array<Pick<FileResult, 'path' | 'size'> & { content?: string; isBinary?: boolean }>,
  options?: { format?: string; onlyTree?: boolean; addLineNumbers?: boolean },
): number;

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Logger interface for pipeline and stage logging
 */
export interface Logger {
  /** Log a debug message (only in debug mode) */
  logDebug(message: string, ...args: any[]): void;
  /** Log an info message */
  info(message: string, ...args: any[]): void;
  /** Log a warning message */
  warn(message: string, ...args: any[]): void;
  /** Log an error message */
  error(message: string, ...args: any[]): void;
  /** Log a success message */
  success(message: string, ...args: any[]): void;
  /** Create a child logger with a prefixed name */
  child(name: string): Logger;
  /** Format bytes to human-readable string */
  formatBytes(bytes: number): string;
  /** Format duration in milliseconds to human-readable string */
  formatDuration(ms: number): string;
}

// ============================================================================
// File Results
// ============================================================================

/**
 * Lightweight manifest entry representing a single included file.
 * Contains only path and size — no file content — making it safe to retain
 * in long-lived UI processes (e.g. Electron apps) without holding megabytes
 * of file data in memory.
 *
 * @example
 * const result = await copy('./src');
 * // Show a file breakdown without retaining file content
 * result.manifest.forEach(({ path, size }) => {
 *   console.log(`${path} (${size} bytes)`);
 * });
 */
export interface ManifestEntry {
  /** Relative path to the file (e.g. "src/utils/helpers.js"). Same value as `FileResult.path`. */
  path: string;
  /** File size in bytes */
  size: number;
  /** ISO timestamp of last modification, when known */
  modified?: string;
  /**
   * What happened to this file.
   *
   * A structure-only lock file and a fully included source file are not the
   * same thing, and a preview built from the manifest has to tell them apart.
   */
  outcome: ManifestOutcome;
}

/**
 * Represents a file discovered and processed by scan()
 */
export interface FileResult {
  /**
   * Relative path, always POSIX-separated on every platform.
   *
   * Normalized at discovery time, so it can be split on `/` and compared
   * against glob patterns without consulting `path.sep`. Use `absolutePath`
   * for filesystem calls, which need native separators.
   */
  path: string;
  /** Platform-specific absolute path */
  absolutePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: Date;
  /**
   * File content: a string for text, bytes for binary content that was
   * included, `null` for an excluded binary, absent when nothing was read.
   *
   * Typed as `Uint8Array` rather than `Buffer` deliberately. These declarations
   * must compile in a consumer that has not installed `@types/node` — the
   * package does not depend on it, so referring to Node's ambient types here
   * made the published `.d.ts` uncompilable in a strict project with
   * `types: []`. Every `Buffer` is a `Uint8Array`, so nothing is lost.
   */
  content?: string | Uint8Array | null;
  /** Whether file is binary */
  isBinary: boolean;
  /** Character encoding for text files */
  encoding?: string;
  /** Git status information (if withGitStatus is true) */
  gitStatus?: string;
}

// ============================================================================
// Scan API
// ============================================================================

/**
 * Options for the scan() function
 */
export interface ScanOptions {
  /** Additional include patterns (globs) */
  filter?: string | string[];
  /** Additional exclude patterns (globs) */
  exclude?: string | string[];
  /**
   * Literal paths (files or directories) to traverse instead of the whole tree.
   *
   * Not globs: a directory named `src/[draft]` is just a path, with nothing for
   * the caller to escape. Ignore rules still resolve from `basePath` — root
   * `.gitignore`, root `.copytreeignore`, and every nested ignore file between
   * the root and the selection — so a scoped run selects exactly the files a
   * filtered full run would. Output paths stay relative to `basePath`, so
   * `@`-references handed to an agent still resolve.
   *
   * Traversal starts at the selection, so cost scales with what was selected
   * rather than with the size of the repository. Composes with `filter`:
   * `{ scope: ['src'], filter: ['**\/*.ts'] }` means TypeScript files under src.
   */
  scope?: string | string[];
  /**
   * Let `scope` entries override the ignore rules that would exclude them
   * (default: false).
   *
   * Off by default so the invariant above holds. Turn it on for the deliberate
   * gesture — a user who navigated into a gitignored folder and asked for it.
   * Config exclusions still apply, so `node_modules` stays out.
   */
  scopeIgnoresIgnoreFiles?: boolean;
  /**
   * Let `scope` entries override the config-level exclusions blocking them
   * (default: false).
   *
   * `scopeIgnoresIgnoreFiles` lifts `.gitignore` and `.copytreeignore` rules;
   * this lifts `node_modules` and `copytree.globalExcluded*`. They are separate
   * because they answer different questions, and a path excluded by both needs
   * both flags — scoping into `node_modules` typically does, since most
   * repositories also gitignore it.
   *
   * `.git` is excluded by a layer no option lifts.
   */
  scopeIgnoresConfigExcludes?: boolean;
  /**
   * Use gitignore rules (default: true).
   *
   * Covers nested `.gitignore` at every depth, `.git/info/exclude`, and the
   * user's global gitignore (`core.excludesFile`). All plain filesystem reads:
   * CopyTree never shells out to `git check-ignore` and never requires the
   * target to be a git repository.
   */
  respectGitignore?: boolean;
  /** Only git modified files (working tree and index) */
  modified?: boolean;
  /**
   * Only files staged for the next commit.
   *
   * Distinct from `modified`, which folds staged, unstaged and untracked work
   * together. "What am I about to commit" is a different question.
   */
  staged?: boolean;
  /** Files changed since git ref */
  changed?: string;
  /** Keep only these extensions, with or without a leading dot */
  ext?: string | string[];
  /** Maximum directory depth */
  maxDepth?: number;
  /**
   * Run the transformation stage (default: false).
   *
   * CopyTree registers no transformers, so this does nothing on its own. It is
   * meaningful only alongside `transformers`, naming one an embedder has
   * registered through `copytree/experimental`.
   */
  transform?: boolean;
  /**
   * Per-transformer configuration, keyed by transformer name.
   *
   * Declared as `string[]` and read as an object: the runtime calls
   * `Object.entries()` on it and looks at each entry's `enabled`, so an array
   * of names enabled the stage and then matched nothing. A name that is not
   * registered is reported as a degradation rather than ignored.
   */
  transformers?: Record<string, { enabled?: boolean; options?: Record<string, unknown> }>;
  /**
   * A registry of your own transformers, from `copytree/experimental`.
   *
   * CopyTree registers none, so without this `transform` has nothing to do and
   * `transformers` can only name something that does not exist. Build one,
   * register what you need, and pass it:
   *
   * ```js
   * import { TransformerRegistry, BaseTransformer } from 'copytree/experimental';
   *
   * const registry = new TransformerRegistry();
   * registry.register('rst', new MyRstConverter(), { extensions: ['.rst'] });
   *
   * await copy(root, { transform: true, registry, transformers: { rst: { enabled: true } } });
   * ```
   */
  registry?: unknown;
  /** Include hidden files (default: false) */
  includeHidden?: boolean;
  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;
  /**
   * Memory-safety ceiling in bytes (default: 10MB).
   * Nothing above this is ever read, and nothing lifts it.
   */
  maxFileSize?: number;
  /**
   * Hard per-file size gate in bytes, applied from `stat()` (default: 256KB).
   *
   * Files above it are never opened; they are reported under
   * `stats.excluded.byReason.sizeGate`. Distinct from `maxFileSize`, which is
   * about memory, and from `charLimit`, which truncates *after* reading.
   * Only `always` / `.copytreeinclude` overrides it. `false` disables it.
   */
  sizeGate?: number | false;
  /**
   * Total size budget in bytes across all selected files.
   *
   * A hard maximum, applied after sorting so which files survive follows
   * `sort`. A single file larger than the whole budget is dropped like any
   * other that does not fit, and the selection can legitimately come back
   * empty — see `retainOversizedFirstFile` for the opt-out.
   */
  maxTotalSize?: number;
  /**
   * Keep a first file that alone exceeds `maxTotalSize` (default: false).
   *
   * The escape hatch for "I would rather have one oversized file than nothing".
   * It applies to the first file only, and the overshoot is reported as
   * `stats.oversizedFirstFileRetained`.
   */
  retainOversizedFirstFile?: boolean;
  /**
   * Maximum number of files.
   * Applied after sorting, so which files survive follows `sort`.
   */
  maxFileCount?: number;
  /**
   * Character budget across all file content.
   * Truncates at a line boundary, marks the cut inline, and never emits an
   * unpaired UTF-16 surrogate.
   */
  charLimit?: number;
  /** Collect per-file exclusion detail in `stats.excluded.largest` */
  explain?: boolean;
  /** Patterns to force include. The only thing that overrides `sizeGate`. */
  always?: string | string[];
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /**
   * Called for each pipeline lifecycle event.
   *
   * **Callback policy.** Every observational callback — this one, `onProgress`,
   * `onSummary` and `onComplete` — is isolated from the operation: one that
   * throws is logged at debug level and the run carries on. A watcher cannot
   * break the thing it is watching. To *stop* a run, pass an `AbortSignal`.
   *
   * Events carry counts and metadata, never file payloads. See
   * {@link PipelineEvent}.
   */
  onEvent?: (event: PipelineEvent) => void;
  /** Include git status information */
  withGitStatus?: boolean;
  /** Include file content in results (default: true) */
  includeContent?: boolean;
  /** Remove duplicate files */
  dedupe?: boolean;
  /** Sort key: 'path', 'size', 'modified', 'name', 'extension', 'depth' */
  sort?: 'path' | 'size' | 'modified' | 'name' | 'extension' | 'depth';
  /**
   * Sort direction (default: 'asc').
   *
   * Budgets keep the head of the sorted list, so this decides which files
   * survive when one bites. `sort: 'modified'` alone keeps the oldest files;
   * add `sortOrder: 'desc'` to keep the most recently touched.
   */
  sortOrder?: 'asc' | 'desc';
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created.
   * This enables concurrent scan operations with different configurations.
   */
  config?: ConfigManager;
  /**
   * Progress callback function.
   * Called periodically during scanning with progress updates.
   */
  onProgress?: ProgressCallback;
  /**
   * Progress throttle interval in milliseconds (default: 100).
   * Limits how frequently progress callbacks are invoked.
   */
  progressThrottleMs?: number;
  /**
   * Called once after the pipeline completes and before any file is yielded.
   *
   * This is how a streaming consumer gets the counts, exclusion accounting and
   * truncation status without buffering the whole run.
   */
  onSummary?: (summary: ScanSummary) => void;
  /**
   * Detect and redact credentials (default: the `secretsGuard.enabled` config
   * value, which is on).
   *
   * Applies identically here and on the CLI. Redaction replaces the credential
   * itself and leaves the surrounding syntax intact, so redacted source still
   * parses. Pass `false` to disable.
   */
  secretsGuard?: boolean;
  /** How redacted spans are marked (default: 'typed') */
  secretsRedactMode?: 'typed' | 'generic' | 'hash';
  /** Throw `ERR_SECRETS_DETECTED` instead of redacting */
  failOnSecrets?: boolean;
  /**
   * Name of a folder profile to load instead of auto-discovering one.
   * A load failure throws, where a failed auto-discovery is ignored.
   *
   * `false` disables profile discovery altogether, which is what the CLI's
   * `--no-profile` does.
   */
  profile?: string | false;
  /**
   * Suppress pipeline terminal output (default: true).
   *
   * The programmatic API is silent by design: stage messages are delivered as
   * `stage:log` events via `onEvent`, and a library has no claim on its host's
   * stdout. Pass `false` to let the pipeline write to the terminal.
   */
  quiet?: boolean;
}

/**
 * A single secret detection, stripped of the credential itself.
 *
 * Findings travel into `stats`, into events, and onto thrown errors, all of
 * which an embedder is liable to log. They carry position and identity only.
 */
export interface SecretFinding {
  /** Path the finding was found in */
  file: string | null;
  /** Rule that matched, e.g. `GENERIC_TOKEN`, `AWS_ACCESS_KEY` */
  ruleId: string;
  /** 1-based line where the credential starts */
  startLine: number | null;
  /** 1-based line where the credential ends */
  endLine: number | null;
  /** 1-based column where the credential starts */
  startColumn: number | null;
  /** 1-based inclusive column where the credential ends */
  endColumn: number | null;
  /** Length of the matched credential in characters */
  matchLength: number;
  /** The marker written in place of the credential */
  preview: string;
  /**
   * Truncated SHA-256 of the matched bytes.
   *
   * Stable enough to correlate the same credential across runs, and not
   * reversible for anything with real entropy.
   */
  fingerprint: string | null;
}

/** Secrets detection summary, exposed on `stats.secretsGuard`. */
export interface SecretsGuardSummary {
  /** Always true when present; the key is absent when the guard did not run */
  enabled: boolean;
  /**
   * Which scanner produced the numbers.
   *
   * `none` means nothing was scanned: a dry run has no content, so only the
   * exclusions decidable from the manifest were applied.
   */
  scanner: 'gitleaks' | 'builtin' | 'none';
  /** True on a dry run, where nothing was scanned */
  planOnly: boolean;
  /** How many credentials were detected */
  findings: number;
  /** How many spans were replaced */
  redacted: number;
  /** Files dropped for matching the secret-prone glob list */
  excludedSecretFiles: number;
  /** Files dropped for being too large to scan */
  excludedUnscannable: number;
  /**
   * Files that held a detected secret and were removed rather than emitted.
   *
   * Either `secretsGuard.redactInline` is off, or a detected span could not be
   * proven redacted. The guard never emits a file it could not clean.
   */
  excludedWithSecrets: number;
  /** Detected secrets that could not be proven redacted, across all files */
  redactionFailures: number;
  /**
   * Present only when the preferred scanner failed and a weaker one finished
   * the run. Its absence is the assertion that it did not.
   */
  degraded?: { from: string; to: string; reason: string };
  /**
   * Sample paths behind each count, capped at five. The counts are exact; these
   * lists are for a status line that can name what it is talking about.
   */
  excludedSecretFilePaths: string[];
  excludedUnscannablePaths: string[];
  excludedWithSecretsPaths: string[];
  redactedPaths: string[];
  /** Detail behind the counts. Written by `--secrets-report`. */
  report: {
    scanner: 'gitleaks' | 'builtin' | 'none';
    degraded?: { from: string; to: string; reason: string };
    redactionMode: 'typed' | 'generic' | 'hash';
    findings: SecretFinding[];
  };
}

/**
 * The stable machine vocabulary for degradations.
 *
 * `STAGE_RECOVERED` is the open end of the set: when a stage recovers from a
 * typed error, that error's own `ERR_*` code is carried through in preference,
 * because it says more than "something was recovered". Treat `DegradationCode`
 * as the known values rather than the only possible ones.
 */
export type DegradationCode =
  | 'STAGE_DEGRADED'
  | 'STAGE_RECOVERED'
  | 'STAGE_AFTER_RUN_FAILED'
  | 'GIT_FILTER_FAILED'
  | 'SECRET_SCANNER_DEGRADED'
  | 'SECRET_REDACTION_FAILED';

/** Frozen map of {@link DegradationCode} values. */
export const DEGRADATION_CODES: Readonly<Record<string, DegradationCode>>;

/**
 * One thing the run could not do as asked, but carried on from.
 *
 * A degradation is not an error: the run completed and returned a result. It is
 * the record that the result is not the one that was requested — a Git selector
 * that could not be applied and so selected everything, a scanner that fell
 * back to a weaker one. `--strict` turns any of these into a non-zero exit.
 */
export interface Degradation {
  /** Stage that recorded it */
  stage: string;
  /** Stable machine code; see {@link DegradationCode} */
  code: DegradationCode | string;
  /** What could not be done, in user terms */
  message: string;
}

/** Summary of a scan, delivered via `ScanOptions.onSummary`. */
export interface ScanSummary {
  /** Files selected */
  totalFiles: number;
  /** Total size of selected files in bytes */
  totalSize: number;
  /**
   * True when nothing matched.
   *
   * A valid, common outcome (an empty folder, a fully-ignored scope), not an
   * error: `copy()` returns a valid empty document rather than throwing.
   */
  noFilesMatched: boolean;
  /** Exclusion accounting */
  excluded: ExclusionSummary;
  /** Whether a budget dropped files */
  truncated: boolean;
  /** How many files a budget dropped */
  truncatedCount?: number;
  /** Which budget bit first */
  truncatedBy?: 'maxFileCount' | 'maxTotalSize' | 'charLimit';
  /** Set when the retained set is larger than `maxTotalSize` */
  budgetExceeded?: boolean;
  /** Resolved scope entries, when scoped */
  scope?: string[];
  /** Set when the retained set is larger than `maxTotalSize` */
  oversizedFirstFileRetained?: boolean;
  /** Files dropped by `maxFileCount` */
  truncatedByCountBudget?: number;
  /** Files dropped by `maxTotalSize` */
  truncatedBySizeBudget?: number;
  /** Characters emitted, when `charLimit` was set */
  totalCharacters?: number;
  /** The character budget that was applied */
  characterLimit?: number;
  /** Files whose content `charLimit` cut short */
  truncatedFiles?: number;
  /** Files `charLimit` dropped entirely */
  skippedFiles?: number;
  /** Secrets detection summary, present when the guard ran */
  secretsGuard?: SecretsGuardSummary;
  /**
   * Things the run could not do as asked, but carried on from.
   *
   * Present only when there were any. `copytree --strict` exits non-zero when
   * this is non-empty; an embedder deciding whether to trust the result should
   * do the same.
   */
  degradations?: Degradation[];
}

/**
 * Scan a directory and return an async iterable of FileResult objects.
 *
 * **Buffering:** the selection is resolved in full before the first file is
 * yielded. It has to be — sorting is global, and the file-count and total-size
 * budgets decide which files survive by position in the sorted order, so
 * neither question can be answered one file at a time. The iterable is a
 * convenience over a completed selection, not a producer stream, and peak
 * memory is proportional to the selection.
 *
 * @param basePath - Path to directory to scan
 * @param options - Scan options
 * @returns Async iterable of file results
 * @throws ValidationError `ERR_PATH_NOT_FOUND` when basePath does not exist
 * @throws ScopeError `ERR_SCOPE_OUTSIDE_ROOT` / `ERR_PATH_NOT_FOUND` for bad scope entries
 */
export function scan(basePath: string, options?: ScanOptions): AsyncIterable<FileResult>;

// ============================================================================
// Format API
// ============================================================================

/**
 * Options for the format() function
 */
export interface FormatOptions {
  /** Output format (default: 'xml') */
  format?: 'xml' | 'json' | 'markdown' | 'tree' | 'ndjson' | 'sarif';
  /** Only include file tree, no content */
  onlyTree?: boolean;
  /** Add line numbers to file content */
  addLineNumbers?: boolean;
  /** Base path for relative paths */
  basePath?: string;
  /** Instructions to include in output */
  instructions?: string;
  /** Show file sizes in tree */
  showSize?: boolean;
  /** Pretty print JSON output (default: true) */
  prettyPrint?: boolean;
  /** Emit optional per-entry metadata (default: true) */
  includeMetadata?: boolean;
  /**
   * Omit fields that vary between runs (default: false).
   *
   * Timestamps and durations are what make two exports of an unchanged tree
   * differ; dropping them makes the output diffable and cacheable.
   */
  reproducible?: boolean;
  /**
   * ConfigManager instance for isolated configuration.
   *
   * Formatting reads configuration too, so passing the same instance the
   * selection ran under is what keeps two concurrent operations from formatting
   * each other's files under the wrong settings.
   */
  config?: ConfigManager;
  /**
   * Return an empty document instead of throwing when there are no files
   * (default: false).
   *
   * `copy()` sets this: "nothing to copy here" is an outcome, not a failure.
   */
  allowEmpty?: boolean;
}

/**
 * Format a collection of files into the specified output format.
 * Accepts arrays, iterables, or async iterables for flexible input.
 *
 * @param files - Files to format
 * @param options - Format options
 * @returns Formatted output string
 */
export function format(
  files: FileResult[] | Iterable<FileResult> | AsyncIterable<FileResult>,
  options?: FormatOptions,
): Promise<string>;

// ============================================================================
// Streaming Format API
// ============================================================================

/**
 * Options for the formatStream() function
 */
export interface FormatStreamOptions extends FormatOptions {
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created.
   */
  config?: ConfigManager;
}

/**
 * Format a collection of files as chunks, rather than as one string.
 *
 * Concatenating the chunks equals `format()` of the same inputs, byte for byte.
 *
 * **What this bounds, and what it does not.** The input collection is drained
 * before the first chunk, because the document header carries a file count and
 * a total size. Peak memory therefore remains proportional to the selection.
 * What chunking saves is the second contiguous copy of the whole document, and
 * it lets output start reaching a socket, a PTY or a file before the last file
 * is rendered. This is chunked output generation, not a bounded-memory
 * pipeline.
 *
 * @param files - Files to format (array or async iterable)
 * @param options - Format options
 * @returns Async generator yielding formatted chunks
 */
export function formatStream(
  files: FileResult[] | AsyncIterable<FileResult>,
  options?: FormatStreamOptions,
): AsyncGenerator<string>;

// ============================================================================
// Copy API
// ============================================================================

/**
 * Options for the copy() function
 */
/**
 * `basePath` and `allowEmpty` are omitted deliberately. `copy()` sets both
 * itself — the base path is its first argument, and an empty selection always
 * yields an empty document rather than an exception — so accepting them here
 * advertised two options whose values were unconditionally replaced.
 */
export interface CopyOptions extends ScanOptions, Omit<FormatOptions, 'basePath' | 'allowEmpty'> {
  /** Output file path (if specified, writes to file) */
  output?: string;
  /** Display output to console (default: false) */
  display?: boolean;
  /** Copy output to clipboard (default: false in programmatic mode) */
  clipboard?: boolean;
  /** Stream output to stdout */
  stream?: boolean;
  /**
   * Plan the run without reading or formatting content.
   *
   * Every stat-based budget (`sizeGate`, `maxFileSize`, `maxFileCount`,
   * `maxTotalSize`) applies exactly as it would in the real run, so the
   * selection is identical.
   *
   * Two options cannot be planned exactly, because both need content:
   * `charLimit` is planned from byte size, which equals character length for
   * ASCII but overestimates for multi-byte text; `dedupe` cannot run at all.
   * With either option set, treat the preview as an estimate.
   */
  dryRun?: boolean;
  /** Character budget across all file content */
  charLimit?: number;
  /** Instructions to include in output */
  instructions?: string;
  /** Add line numbers (alias for addLineNumbers) */
  withLineNumbers?: boolean;
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created.
   * This enables concurrent copy operations with different configurations.
   * Note: This overrides the config option from ScanOptions.
   */
  config?: ConfigManager;
  /**
   * Progress callback function.
   * Called periodically during copy operations with progress updates.
   * Note: Inherits from ScanOptions but documented here for clarity.
   */
  onProgress?: ProgressCallback;
  /**
   * Progress throttle interval in milliseconds (default: 100).
   * Limits how frequently progress callbacks are invoked.
   * Note: Inherits from ScanOptions but documented here for clarity.
   */
  progressThrottleMs?: number;
}

/**
 * Result returned by copy() function
 */
export interface CopyResult {
  /** Formatted output string */
  output: string;
  /**
   * Version of the emitted format, e.g. `copytree-xml@1`.
   *
   * The output shape and its delimiters are a compatibility surface: agents are
   * prompted against them, so a change is versioned rather than silent.
   */
  outputFormatVersion: string | null;
  /**
   * Full file results including content, metadata, and git status.
   * Use `manifest` instead when you only need paths and sizes — it avoids
   * retaining megabytes of file content in memory.
   */
  files: FileResult[];
  /**
   * Lightweight manifest of included files.
   *
   * Safe to retain in a long-lived process: entries carry `path`, `size`,
   * `modified` and an `outcome`, never `content`. The `outcome` is what makes
   * this usable for a preview — a structure-only lock file and a fully included
   * source file are distinguishable.
   *
   * @example
   * const result = await copy('./src');
   * result.manifest.forEach(({ path, size, outcome }) => {
   *   console.log(`${outcome}\t${path}: ${size} bytes`);
   * });
   *
   * @example
   * // Dry run: get the plan without reading content
   * const { manifest } = await copy('./src', { dryRun: true });
   * console.log(`Would include ${manifest.filter((f) => f.outcome === 'included').length} files`);
   */
  manifest: ManifestEntry[];
  /** Processing statistics */
  stats: {
    /** Total number of files processed */
    totalFiles: number;
    /** Processing duration in milliseconds */
    duration: number;
    /** Total size of files in bytes */
    totalSize: number;
    /** Output size in bytes */
    outputSize?: number;
    /**
     * Output characters. Measured on a real run, estimated on a dry run.
     *
     * Bytes on disk are the wrong unit for deciding whether a context fits;
     * output characters are what the budget is actually spent on.
     *
     * On a dry run the estimate is biased **high**, typically by 10-15%:
     * per-file overhead is rounded up, sizes are bytes where the output is
     * counted in characters, and structure-only placeholders shrink files the
     * plan counted in full. A plan that fits is a run that fits.
     */
    estimatedOutputChars: number;
    /**
     * Rough token count (chars/4).
     *
     * Heuristic: accurate to roughly ±20%, no tokenizer dependency, no
     * per-model accuracy claim. Enough to turn "312 KB" into "~78k tokens",
     * which is the number that decides whether you paste it.
     */
    estimatedTokens: number;
    /**
     * True when nothing matched.
     *
     * A valid, common outcome, not a failure: `copy()` returns a valid empty
     * document instead of throwing, so a caller can say "nothing to copy here".
     */
    noFilesMatched: boolean;
    /** Exclusion accounting: what didn't make it, and why */
    excluded: ExclusionSummary;
    /** Whether a budget dropped files. Truncation is reported, never silent. */
    truncated?: boolean;
    /** How many files a budget dropped */
    truncatedCount?: number;
    /** Which budget bit first */
    truncatedBy?: 'maxFileCount' | 'maxTotalSize' | 'charLimit';
    /**
     * Set when the retained set is larger than `maxTotalSize`.
     *
     * Happens only under `retainOversizedFirstFile`, which is off by default:
     * a first file larger than the whole budget is otherwise dropped like any
     * other that does not fit. The overshoot is reported here rather than
     * hidden.
     */
    budgetExceeded?: boolean;
    /** Resolved scope entries, when scoped */
    scope?: string[];
    /** Secrets detection summary, present when the guard ran */
    secretsGuard?: SecretsGuardSummary;
    /**
     * Set when the first file alone exceeded `maxTotalSize` and was kept
     * anyway. Pairs with `budgetExceeded`.
     */
    oversizedFirstFileRetained?: boolean;
    /** Files dropped by `maxFileCount` */
    truncatedByCountBudget?: number;
    /** Files dropped by `maxTotalSize` */
    truncatedBySizeBudget?: number;
    /** Characters emitted, when `charLimit` was set */
    totalCharacters?: number;
    /** The character budget that was applied */
    characterLimit?: number;
    /** Files whose content `charLimit` cut short */
    truncatedFiles?: number;
    /** Files `charLimit` dropped entirely */
    skippedFiles?: number;
    /** Scan errors (if any occurred) */
    scanErrors?: string[];
    /** Clipboard error message (if clipboard copy failed) */
    clipboardError?: string;
    /** Indicates this was a dry run */
    dryRun?: boolean;
    /**
     * Things the run could not do as asked, but carried on from.
     *
     * Present only when there were any. `copytree --strict` exits non-zero when
     * this is non-empty; an embedder deciding whether to trust the result
     * should do the same.
     */
    degradations?: Degradation[];
  };
  /** Output file path (if written to file) */
  outputPath?: string;
}

/**
 * Complete end-to-end copy operation combining scan and format.
 * This is the programmatic equivalent of the CLI command.
 *
 * @param basePath - Path to directory to copy
 * @param options - Combined options
 * @returns Copy result with output and stats
 */
export function copy(basePath: string, options?: CopyOptions): Promise<CopyResult>;

// ============================================================================
// Streaming Copy API
// ============================================================================

/**
 * Options for the copyStream() function
 */
export interface CopyStreamOptions
  extends ScanOptions,
    Omit<FormatOptions, 'basePath' | 'allowEmpty'> {
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created.
   */
  config?: ConfigManager;
  /** Progress callback function */
  onProgress?: ProgressCallback;
  /** Add line numbers (alias for addLineNumbers) */
  withLineNumbers?: boolean;
  /** Plan the run and report, emitting no chunks */
  dryRun?: boolean;
  /**
   * Called once after the last chunk with the same numbers `copy()` returns.
   * Choosing streaming does not mean giving up the stats and manifest.
   */
  onComplete?: (result: {
    outputFormatVersion: string | null;
    manifest: ManifestEntry[];
    stats: CopyResult['stats'];
  }) => void;
}

/**
 * Stream copy operation that yields formatted output chunks incrementally.
 *
 * This is **chunked output**, not end-to-end streaming. Selection and file
 * loading complete before the first chunk is yielded; what streams is the
 * formatted document, not the pipeline feeding it.
 *
 * What that does buy you:
 * - The output document is emitted in pieces rather than assembled as one
 *   string, so a large export does not need a contiguous allocation the size
 *   of the result. SARIF is the exception: it is one JSON object with a
 *   required envelope, and is serialized whole.
 * - Chunks reach a writable stream or a PTY as they are produced, so the host
 *   process is not blocked assembling output before anything is written.
 * - Chunks never split a UTF-16 surrogate pair, so each one is valid text.
 * - Concatenated output equals `copy()` output for the same inputs.
 *
 * What it does **not** currently guarantee, despite the name:
 * - Peak memory is not proportional to a small window. Every selected file's
 *   content is resident before the first chunk is emitted.
 * - Time to first chunk is not lower than `copy()` by much; the selection and
 *   loading work is the same and happens first.
 * - Breaking out of the loop early does not cancel upstream work that has
 *   already completed. Use an `AbortSignal` to cancel a run.
 *
 * Choose it for output delivery and responsiveness. If you need bounded memory
 * over a repository larger than you can hold, that is not yet available from
 * either entry point.
 *
 * @param basePath - Path to directory to copy
 * @param options - Combined options
 * @returns Async generator yielding formatted output chunks
 *
 * @example
 * // Stream to file (Electron)
 * import { copyStream } from 'copytree';
 * import { createWriteStream } from 'fs';
 *
 * const stream = createWriteStream('output.xml');
 * for await (const chunk of copyStream('./src')) {
 *   stream.write(chunk);
 * }
 * stream.end();
 *
 * @example
 * // Stream to string with progress
 * let output = '';
 * for await (const chunk of copyStream('./large-repo', { format: 'json' })) {
 *   output += chunk;
 * }
 */
export function copyStream(basePath: string, options?: CopyStreamOptions): AsyncGenerator<string>;

// ============================================================================
// Pipeline Statistics and Metrics
// ============================================================================

/**
 * Memory usage metrics captured during stage execution
 */
/**
 * A snapshot of process memory, matching what `process.memoryUsage()` returns.
 *
 * Spelled out rather than referencing `NodeJS.MemoryUsage`, so these
 * declarations compile without `@types/node` installed.
 */
export interface MemorySnapshot {
  /** Resident set size in bytes */
  rss: number;
  /** Total heap allocated in bytes */
  heapTotal: number;
  /** Heap in use in bytes */
  heapUsed: number;
  /** Memory used by C++ objects bound to JavaScript objects */
  external: number;
  /** Memory allocated for `ArrayBuffer`s and `SharedArrayBuffer`s */
  arrayBuffers?: number;
}

export interface MemoryUsage {
  /** Memory usage before stage execution */
  before: MemorySnapshot;
  /** Memory usage after stage execution */
  after: MemorySnapshot;
  /** Delta (difference) in memory usage */
  delta: {
    /** Resident set size delta in bytes */
    rss: number;
    /** Heap used delta in bytes */
    heapUsed: number;
    /** Total heap delta in bytes */
    heapTotal: number;
  };
}

/**
 * Stage performance metrics captured during execution
 */
export interface StageMetrics {
  /** Number of input items (files) */
  inputSize: number;
  /** Number of output items (files) */
  outputSize: number;
  /** Memory usage metrics for this stage */
  memoryUsage: MemoryUsage;
  /** Timestamp when stage completed */
  timestamp: number;
}

/**
 * Error information captured during pipeline execution
 */
export interface StageError {
  /** Name of the stage that failed */
  stage: string;
  /** Error message */
  error: string;
  /** Stack trace (if available) */
  stack?: string;
}

/**
 * Pipeline execution statistics
 */
export interface PipelineStats {
  /** Pipeline start timestamp (milliseconds since epoch) */
  startTime: number | null;
  /** Pipeline end timestamp (milliseconds since epoch) */
  endTime: number | null;
  /** Number of stages that completed successfully */
  stagesCompleted: number;
  /** Number of stages that failed */
  stagesFailed: number;
  /**
   * Stages that threw and whose `handleError()` returned a usable result.
   *
   * Counted separately because a recovered stage is neither a success nor a
   * failure: it did something other than what was asked. Omitting it made
   * `successRate` report 1 for a run in which a stage had recovered.
   */
  stagesRecovered: number;
  /** Collection of errors from failed stages */
  errors: StageError[];
  /** Execution time per stage (stage name -> milliseconds) */
  perStageTimings: Record<string, number>;
  /** Performance metrics per stage (stage name -> metrics) */
  perStageMetrics: Record<string, StageMetrics>;
  /** Total time spent in all stages (milliseconds) */
  totalStageTime: number;
  /** Average time per stage (milliseconds) */
  averageStageTime: number;
  /**
   * Total pipeline duration in milliseconds, or `null` before the run starts.
   *
   * Not optional and not always a number: `Date.now() - null` is `Date.now()`,
   * so a pipeline that had never run reported a duration of fifty-six years.
   */
  duration: number | null;
  /**
   * Completed stages over attempted, or `null` when none were attempted.
   *
   * "Attempted" counts completed, failed and recovered stages.
   *
   * `1` for zero stages claimed every stage had succeeded when none had been
   * tried, which is the difference between "nothing went wrong" and "nothing
   * happened".
   */
  successRate: number | null;
}

/**
 * Options for Pipeline construction
 */
export interface PipelineOptions {
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created during initialization.
   * This enables concurrent pipeline operations with different configurations.
   */
  config?: ConfigManager;
  /** Continue processing after stage failures (default: false) */
  continueOnError?: boolean;
  /** Emit progress events (default: true) */
  emitProgress?: boolean;
  /** Enable parallel stage processing (default: false) */
  parallel?: boolean;
  /** Maximum concurrent operations (default: 5) */
  maxConcurrency?: number;
}

// ============================================================================
// Pipeline Event Types
// ============================================================================

/**
 * Data payload for 'stage:start' event.
 *
 * Counts, never payloads. Lifecycle events used to carry the pipeline's input
 * and output, which meant an `onEvent` listener saw every file's content from
 * every stage — including content that had not yet reached the secrets guard.
 * An embedder that logged events wrote unredacted credentials to its own logs
 * while CopyTree reported the export as redacted. Raw values are available only
 * on the explicitly unstable `stage:debug` event, which the SDK does not
 * forward.
 */
export interface StageStartEvent {
  /** Stage name */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** How many files this stage was handed */
  inputCount: number;
}

/**
 * Data payload for 'stage:complete' event
 */
export interface StageCompleteEvent {
  /** Stage name */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** Execution duration in milliseconds */
  duration: number;
  /** Number of input items */
  inputSize: number;
  /** Number of output items */
  outputSize: number;
  /**
   * Memory usage metrics, or `null` when they could not be sampled.
   *
   * Sampling is best-effort; a host that does not expose `process.memoryUsage`
   * still runs the pipeline, and this is the field that says so.
   */
  memoryUsage: MemoryUsage | null;
  /** Completion timestamp */
  timestamp: number;
}

/**
 * Data payload for 'stage:error' event
 */
export interface StageErrorEvent {
  /** Stage name that failed */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** Error that occurred */
  error: Error;
}

/**
 * Data payload for 'stage:recover' event
 */
export interface StageRecoverEvent {
  /** Stage name that recovered */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** Original error that occurred */
  originalError: Error;
  /** How many files the error handler returned */
  recoveredCount: number;
}

/**
 * Data payload for 'stage:progress' event
 */
export interface StageProgressEvent {
  /** Stage name reporting progress */
  stage: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Optional progress message */
  message?: string;
  /**
   * Concrete counts, when the stage knows its denominator.
   *
   * A percentage alone cannot be rendered as "312 of 4,000 files", which is
   * what a progress display actually wants.
   */
  completed?: number;
  total?: number;
  /** The item being processed when the update was emitted */
  item?: string;
  /** Progress report timestamp */
  timestamp: number;
}

/**
 * Data payload for 'file:batch' event
 */
export interface FileBatchEvent {
  /** Stage processing files */
  stage: string;
  /** Files processed by this stage so far */
  count: number;
  /** Path of most recent file */
  lastFile: string;
  /** Action performed (e.g. 'processed', 'transformed') */
  action: string;
  /** Batch completion timestamp */
  timestamp: number;
}

/**
 * Data payload for 'stage:log' event
 */
export interface StageLogEvent {
  /** Stage that logged */
  stage: string;
  /** Log message */
  message: string;
  /** Log level */
  level: 'info' | 'warn' | 'error' | 'debug';
  /** Log timestamp */
  timestamp: number;
}

/**
 * Data payload for 'pipeline:start' event
 */
export interface PipelineStartEvent {
  /** How many files the initial input carried */
  inputCount: number;
  /** Total number of stages */
  stages: number;
  /** Pipeline configuration options */
  options: PipelineOptions;
}

/**
 * Data payload for 'pipeline:complete' event
 */
export interface PipelineCompleteEvent {
  /** How many files the final output carried */
  resultCount: number;
  /** Complete pipeline statistics */
  stats: PipelineStats;
}

/**
 * Data payload for 'pipeline:error' event
 */
export interface PipelineErrorEvent {
  /** Pipeline-level error */
  error: Error;
  /** Statistics at time of failure */
  stats: PipelineStats;
}

/**
 * Every pipeline event, mapped to the payload it carries.
 *
 * The map is what makes `onEvent` narrowable: switching on `event.type` yields
 * the matching payload rather than a union of all of them.
 */
export interface PipelineEventMap {
  'pipeline:start': PipelineStartEvent;
  'pipeline:complete': PipelineCompleteEvent;
  'pipeline:error': PipelineErrorEvent;
  'stage:start': StageStartEvent;
  'stage:complete': StageCompleteEvent;
  'stage:error': StageErrorEvent;
  'stage:recover': StageRecoverEvent;
  'stage:progress': StageProgressEvent;
  'file:batch': FileBatchEvent;
  'stage:log': StageLogEvent;
}

/**
 * Pipeline event types
 */
export type PipelineEventType = keyof PipelineEventMap;

/**
 * Union type for all pipeline event data
 */
export type PipelineEventData = PipelineEventMap[PipelineEventType];

/**
 * A pipeline event, discriminated by `type`.
 *
 * ```ts
 * scan(root, {
 *   onEvent: (event) => {
 *     if (event.type === 'stage:complete') {
 *       // event.data is StageCompleteEvent here
 *       console.log(event.data.duration);
 *     }
 *   },
 * });
 * ```
 */
export type PipelineEvent = {
  [K in PipelineEventType]: { type: K; data: PipelineEventMap[K] };
}[PipelineEventType];

// ============================================================================
// Configuration
// ============================================================================

/** Options for constructing a ConfigManager. */
export interface ConfigManagerOptions {
  /** Skip JSON schema validation */
  noValidate?: boolean;
  /**
   * Load `~/.copytree` (default: true).
   *
   * Set false for a hermetic configuration that depends only on the package
   * defaults. For a CLI a user config directory is a feature; for an embedded
   * application it means the context depends on a file outside the project,
   * different on every machine, and a `.js` file there is arbitrary code
   * executed in the host process.
   */
  userConfig?: boolean;
  /** Explicit source list, e.g. `['defaults']`. Takes precedence over `userConfig`. */
  configSources?: Array<'defaults' | 'user'>;
  /** Override the user config directory */
  userConfigPath?: string;
  /**
   * Throw `ERR_CONFIG_INVALID` when a source fails to load, instead of warning
   * and continuing with a partial (possibly empty) configuration.
   */
  strict?: boolean;
  /**
   * Override the data configuration directory — the platform's conventional
   * location, holding `config.yaml`. Distinct from `userConfigPath`, which is
   * the legacy executable `~/.copytree` directory.
   */
  dataConfigPath?: string;
  /**
   * Where non-fatal load warnings go. Defaults to stderr; an embedded
   * application passes its own sink so a desktop app is not writing to the
   * host console uninvited.
   */
  onWarning?: (message: string) => void;
}

/**
 * Configuration manager for CopyTree.
 * Supports both singleton pattern (deprecated) and instance-based usage.
 *
 * Everything resolves from the package directory and the explicit `basePath`
 * passed to the API; nothing consults `process.cwd()`.
 *
 * A loaded instance is safe to share across concurrent `copy()` / `scan()`
 * calls. Create one per process or per project, not one per call: loading
 * parses every config file and compiles the JSON schema.
 */
export class ConfigManager {
  /**
   * Create a new ConfigManager instance (use ConfigManager.create() instead)
   */
  constructor(options?: ConfigManagerOptions);

  /**
   * Static factory method to create and initialize a ConfigManager instance.
   * Recommended for new code - enables concurrent operations with isolated configuration.
   * @param options - Configuration options
   * @returns Promise resolving to an initialized ConfigManager instance
   */
  static create(options?: ConfigManagerOptions): Promise<ConfigManager>;

  /**
   * Whether the package default configuration loaded successfully.
   *
   * False means the run would proceed with no exclusion lists at all, which
   * looks like success and is not. Check this after `create()` when embedding.
   */
  readonly isDefaultsLoaded: boolean;

  /** Load failures encountered during initialization; empty when clean. */
  getLoadErrors(): Array<{ scope: string; message: string }>;

  /**
   * Get configuration value using dot notation
   * @param path - Configuration path (e.g., 'ai.providers.openai.apiKey')
   * @param defaultValue - Default value if config not found
   * @returns Configuration value
   */
  get<T = any>(path: string, defaultValue?: T): T;

  /**
   * Set configuration value at runtime
   * @param path - Configuration path
   * @param value - Value to set
   */
  set(path: string, value: any): void;

  /**
   * Check if configuration path exists
   * @param path - Configuration path
   * @returns true if path exists
   */
  has(path: string): boolean;

  /**
   * Get all configuration
   * @returns Deep copy of all configuration
   */
  all(): Record<string, any>;

  /**
   * Load configuration (called automatically by create())
   */
  loadConfiguration(): Promise<void>;

  /**
   * Reload configuration
   */
  reload(): Promise<void>;

  /**
   * Get effective configuration with provenance information
   */
  effective(options?: { redact?: boolean; section?: string }): Record<
    string,
    {
      value: any;
      source: string;
      type: string;
      redacted: boolean;
    }
  >;

  /**
   * Enable or disable configuration validation
   * @param enabled - Whether to enable validation
   */
  setValidationEnabled(enabled: boolean): void;

  /**
   * Check if configuration validation is enabled
   * @returns true if validation is enabled and schema is loaded
   */
  isValidationEnabled(): boolean;
}

// ============================================================================
// Error Classes
// ============================================================================

export class CopyTreeError extends Error {
  constructor(message: string, code?: string, details?: Record<string, any>);
  code: string;
  details: Record<string, any>;
  timestamp: string;
  toJSON(): object;
}

export class CommandError extends CopyTreeError {
  constructor(message: string, command: string, details?: Record<string, any>);
  command: string;
}

export class FileSystemError extends CopyTreeError {
  constructor(message: string, path: string, operation: string, details?: Record<string, any>);
  path: string;
  operation: string;
}

export class ConfigurationError extends CopyTreeError {}
export class ValidationError extends CopyTreeError {}
export class ScopeError extends CopyTreeError {
  /** The offending scope entry, as the caller supplied it */
  scopePath: string;
}
export class PipelineError extends CopyTreeError {}
export class TransformError extends CopyTreeError {}
export class GitError extends CopyTreeError {}
export class ProfileError extends CopyTreeError {}
export class InstructionsError extends CopyTreeError {}
export class SecretsDetectedError extends CopyTreeError {}

/**
 * A policy check the caller asked for, and which did not pass.
 *
 * Distinct from an operational failure: nothing went wrong with the machine.
 * `--fail-empty` on an empty repository is CopyTree doing exactly what it was
 * told, and exit code 3 says so.
 */
export class PolicyError extends CopyTreeError {
  /** The flag or check that failed */
  policy: string;
}

/**
 * Stable, machine-readable error codes.
 *
 * Switch on `error.code` to pick a recovery action. Values never change once
 * released; new codes are additive. Substring matching on `error.message` is
 * not a supported integration.
 */
export type ErrorCode =
  | 'ERR_PATH_NOT_FOUND'
  | 'ERR_NOT_A_DIRECTORY'
  | 'ERR_SCOPE_OUTSIDE_ROOT'
  | 'ERR_INVALID_OPTION'
  | 'ERR_INVALID_FORMAT'
  | 'ERR_CONFIG_INVALID'
  | 'ERR_ABORTED'
  | 'ERR_NO_FILES_MATCHED'
  | 'ERR_SECRETS_DETECTED'
  | 'ERR_SYMLINK_OUTSIDE_ROOT'
  | 'ERR_DESTINATION_CONFLICT'
  | 'ERR_OPTION_CONFLICT'
  | 'ERR_OPTION_REQUIRES'
  | 'ERR_DEPRECATED_OPTION'
  | 'ERR_PROFILE_NOT_FOUND'
  | 'ERR_POLICY_FAILURE'
  | 'ERR_IGNORE_INVALID'
  // Operational codes. These are thrown by the typed error classes
  // (`FileSystemError`, `GitError`, `TransformError`, ...) which previously
  // carried untyped `FILESYSTEM_ERROR`-style values that appeared in no union,
  // so a TypeScript consumer had no case to write for the failures most likely
  // to actually happen.
  | 'ERR_FILESYSTEM'
  | 'ERR_PERMISSION_DENIED'
  | 'ERR_PIPELINE_STAGE'
  | 'ERR_TRANSFORM'
  | 'ERR_GIT'
  | 'ERR_PROFILE_INVALID'
  | 'ERR_INSTRUCTIONS'
  | 'ERR_COMMAND_FAILED'
  | 'ERR_BUDGET_ENFORCEMENT'
  | 'ERR_CONFIG_SCHEMA_UNAVAILABLE'
  | 'ERR_OUTPUT_WRITE'
  | 'ERR_VALIDATION'
  | 'ERR_OPERATION_FAILED';

export const ERROR_CODES: Readonly<Record<string, ErrorCode>>;

/**
 * Process exit codes, as a stable contract.
 *
 * A caller scripting CopyTree needs to distinguish "you asked for something
 * impossible" from "the disk went away" from "the check you requested failed".
 */
export const EXIT_CODES: Readonly<{
  /** Success, including a valid empty selection unless policy says otherwise */
  SUCCESS: 0;
  /** Operational failure: I/O, formatting, Git, converters */
  OPERATIONAL: 1;
  /** Usage or configuration error */
  USAGE: 2;
  /** A requested policy check failed */
  POLICY: 3;
  /** Cancelled by SIGINT */
  CANCELLED: 130;
}>;

/** The process exit code an error should produce. */
export function exitCodeFor(error: unknown): number;

/**
 * Create the canonical abort error: `name === 'AbortError'`, `code === 'ERR_ABORTED'`.
 */
export function createAbortError(message?: string): Error;

/** Whether an error represents a cancellation. */
export function isAbortError(error: unknown): boolean;

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export (copy function)
 */
export default copy;
