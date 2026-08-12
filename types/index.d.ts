/**
 * CopyTree TypeScript Definitions
 *
 * Provides comprehensive type definitions for the CopyTree programmatic API.
 * Full IntelliSense support for TypeScript consumers including Canopy.
 *
 * @module copytree
 * @version 0.17.0
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
  /** Files processed so far */
  filesProcessed?: number;
  /** Total files estimated */
  totalFiles?: number;
  /** Current file being processed */
  currentFile?: string;
  /** Timestamp of the progress event */
  timestamp?: number;
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
  | 'alwaysInclude'
  | 'gitFilter'
  | 'filter'
  | 'sort'
  | 'budget'
  | 'limit'
  | 'load'
  | 'secrets'
  | 'transform'
  | 'dedupe'
  | 'charLimit'
  | 'instructions'
  | 'format'
  | 'unknown';

export const PIPELINE_STAGES: Readonly<Record<string, PipelineStageId>>;

/** Map a stage class name to its stable identifier. */
export function stageIdFor(stageName: string): PipelineStageId;

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
  | 'sizeGate'
  | 'totalSizeBudget'
  | 'fileCountBudget'
  | 'charBudget'
  | 'scopeFilter'
  | 'gitFilter'
  | 'duplicate'
  | 'unreadable';

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
  | 'included'
  | 'structure-only'
  | 'binary-placeholder'
  | 'truncated'
  | `excluded:${string}`;

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
// Scope
// ============================================================================

/** A resolved `scope` entry. */
export interface ScopeEntry {
  /** Platform-native absolute path */
  absolutePath: string;
  /** POSIX path relative to the base path */
  relativePath: string;
  /** Whether the entry is a directory */
  isDirectory: boolean;
}

/**
 * Resolve, validate, and normalize a scope selection.
 *
 * Entries are literal paths, not globs. Duplicates are removed and a parent
 * subsumes its children.
 *
 * @throws ScopeError `ERR_SCOPE_OUTSIDE_ROOT` when an entry escapes the base path
 * @throws ScopeError `ERR_PATH_NOT_FOUND` when an entry does not exist
 */
export function resolveScope(
  basePath: string,
  scope: string | string[],
  options?: { followSymlinks?: boolean },
): Promise<ScopeEntry[]>;

/**
 * Classify a file extension without touching the filesystem.
 * Returns null for unknown extensions and for source-code extensions that must
 * never be treated as binary (`.ts`, `.h`, `.html`, ...).
 */
export function categorizeByExt(
  ext: string,
  groups?: Record<string, string[]>,
): string | null;

/** Detect whether a file is binary. Extension first, content sniff only when unknown. */
export function detectBinary(
  filePath: string,
  options?: {
    sampleBytes?: number;
    nonPrintableThreshold?: number;
    extensions?: Record<string, string[]>;
  },
): Promise<{
  isBinary: boolean;
  category: string;
  reason: 'extension' | 'magic' | 'null-byte' | 'ratio' | 'textual' | 'error';
  ext: string;
  name?: string;
  error?: string;
}>;

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
  /** File content (string for text files, Buffer for binary if included, null for excluded binaries) */
  content?: string | Buffer | null;
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
  /** Apply transformers */
  transform?: boolean;
  /** Specific transformers to use (array of transformer names) */
  transformers?: string[];
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
   * Applied after sorting, so which files survive follows `sort`.
   */
  maxTotalSize?: number;
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
  /** Event callback function */
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
   */
  profile?: string;
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
  /** Detail behind the counts. Written by `--secrets-report`. */
  report: {
    scanner: 'gitleaks' | 'builtin' | 'none';
    redactionMode: 'typed' | 'generic' | 'hash';
    findings: SecretFinding[];
  };
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
}

/**
 * Scan a directory and return an async iterable of FileResult objects.
 * Files are yielded as soon as they are discovered and processed.
 *
 * @param basePath - Path to directory to scan
 * @param options - Scan options
 * @returns Async iterable of file results
 * @throws ValidationError `ERR_PATH_NOT_FOUND` when basePath does not exist
 * @throws ScopeError `ERR_SCOPE_OUTSIDE_ROOT` / `ERR_PATH_NOT_FOUND` for bad scope entries
 */
export function scan(
  basePath: string,
  options?: ScanOptions,
): AsyncIterable<FileResult>;

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
  /** Progress callback function */
  onProgress?: (progress: { percent: number; message: string }) => void;
}

/**
 * Format a collection of files as a streaming async generator.
 * Yields formatted output chunks incrementally, enabling memory-efficient
 * processing of large file collections.
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
export interface CopyOptions extends ScanOptions, FormatOptions {
  /** Output file path (if specified, writes to file) */
  output?: string;
  /** Display output to console (default: false) */
  display?: boolean;
  /** Copy output to clipboard (default: false in programmatic mode) */
  clipboard?: boolean;
  /** Stream output to stdout */
  stream?: boolean;
  /** Path to write secrets report */
  secretsReport?: string;
  /** Include summary information */
  info?: boolean;
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
  /** Verbose error output */
  verbose?: boolean;
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
     * Happens only when the first file alone exceeds the budget: it is kept,
     * because returning nothing at all is a worse answer, and the overshoot is
     * reported here rather than hidden.
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
export function copy(
  basePath: string,
  options?: CopyOptions,
): Promise<CopyResult>;

// ============================================================================
// Streaming Copy API
// ============================================================================

/**
 * Options for the copyStream() function
 */
export interface CopyStreamOptions extends ScanOptions, FormatOptions {
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
 * - The full output document is never assembled as one string, so a large
 *   export does not need a contiguous allocation the size of the result.
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
export function copyStream(
  basePath: string,
  options?: CopyStreamOptions,
): AsyncGenerator<string>;

// ============================================================================
// Pipeline Statistics and Metrics
// ============================================================================

/**
 * Memory usage metrics captured during stage execution
 */
export interface MemoryUsage {
  /** Memory usage before stage execution */
  before: NodeJS.MemoryUsage;
  /** Memory usage after stage execution */
  after: NodeJS.MemoryUsage;
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
  /** Total pipeline duration (milliseconds) - calculated */
  duration?: number;
  /** Success rate (0-1) - calculated */
  successRate?: number;
}

// ============================================================================
// Pipeline Event Types
// ============================================================================

/**
 * Data payload for 'stage:start' event
 */
export interface StageStartEvent {
  /** Stage name */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** Input data for this stage */
  input: unknown;
}

/**
 * Data payload for 'stage:complete' event
 */
export interface StageCompleteEvent {
  /** Stage name */
  stage: string;
  /** Stage index in pipeline */
  index: number;
  /** Output data from this stage */
  output: unknown;
  /** Execution duration in milliseconds */
  duration: number;
  /** Number of input items */
  inputSize: number;
  /** Number of output items */
  outputSize: number;
  /** Memory usage metrics */
  memoryUsage: MemoryUsage;
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
  /** Result returned by error handler */
  recoveredResult: unknown;
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
  /** Progress report timestamp */
  timestamp: number;
}

/**
 * Data payload for 'file:batch' event
 */
export interface FileBatchEvent {
  /** Stage processing files */
  stage: string;
  /** Number of files processed in batch */
  count: number;
  /** Path of most recent file */
  lastFile: string;
  /** Action performed (e.g., 'processed', 'transformed') */
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
  /** Log level (info, warn, error, debug) */
  level: 'info' | 'warn' | 'error' | 'debug';
  /** Log timestamp */
  timestamp: number;
}

/**
 * Data payload for 'pipeline:start' event
 */
export interface PipelineStartEvent {
  /** Initial pipeline input */
  input: unknown;
  /** Total number of stages */
  stages: number;
  /** Pipeline configuration options */
  options: PipelineOptions;
}

/**
 * Data payload for 'pipeline:complete' event
 */
export interface PipelineCompleteEvent {
  /** Final pipeline output */
  result: unknown;
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
 * Union type for all pipeline event data
 */
export type PipelineEventData =
  | StageStartEvent
  | StageCompleteEvent
  | StageErrorEvent
  | StageRecoverEvent
  | StageProgressEvent
  | FileBatchEvent
  | StageLogEvent
  | PipelineStartEvent
  | PipelineCompleteEvent
  | PipelineErrorEvent;

/**
 * Pipeline event types
 */
export type PipelineEventType =
  | 'pipeline:start'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'stage:start'
  | 'stage:complete'
  | 'stage:error'
  | 'stage:recover'
  | 'stage:progress'
  | 'file:batch'
  | 'stage:log';

/**
 * Pipeline event data (generic wrapper for event callbacks)
 */
export interface PipelineEvent {
  /** Event type */
  type: PipelineEventType;
  /** Event data */
  data: PipelineEventData;
}

// ============================================================================
// Pipeline Core Classes
// ============================================================================

/**
 * Pipeline context provided to stages during initialization and execution
 */
export interface PipelineContext {
  /** Logger instance for stage logging */
  logger: Logger;
  /** Pipeline options */
  options: PipelineOptions;
  /** Pipeline statistics (live, updated during execution) */
  stats: PipelineStats;
  /** Configuration manager instance */
  config: ConfigManager;
  /** Reference to parent pipeline for event emission */
  pipeline: Pipeline;
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
  /** Progress callback function */
  onProgress?: ProgressCallback;
}

/**
 * Stage options passed to stage constructor
 */
export interface StageOptions {
  /** Reference to parent pipeline for event emission */
  pipeline?: Pipeline;
  /** ConfigManager instance (optional, will be set via onInit context) */
  config?: ConfigManager;
  /** Additional stage-specific options */
  [key: string]: unknown;
}

/**
 * Pipeline for orchestrating file processing stages.
 * Implements the event-driven pipeline architecture described in the architecture docs.
 */
export class Pipeline {
  /** Create a new Pipeline instance */
  constructor(options?: PipelineOptions);

  /**
   * Add stages to the pipeline
   * @param stages - Stage class(es), instance(s), or functions to add
   * @returns Pipeline instance for chaining
   */
  through(
    stages:
      | Stage
      | Stage[]
      | (new (options?: StageOptions) => Stage)
      | Array<new (options?: StageOptions) => Stage>
      | ((input: unknown) => Promise<unknown> | unknown)
      | Array<Stage | (new (options?: StageOptions) => Stage) | ((input: unknown) => Promise<unknown> | unknown)>
  ): Pipeline;

  /**
   * Process input through all pipeline stages
   * @param input - Initial input to process
   * @returns Final processed output
   */
  process<TInput = unknown, TOutput = unknown>(input: TInput): Promise<TOutput>;

  /**
   * Get pipeline statistics
   * @returns Current pipeline stats
   */
  getStats(): PipelineStats;

  /**
   * Subscribe to pipeline events
   * @param event - Event name
   * @param listener - Event listener function
   * @returns Pipeline instance for chaining
   */
  on(event: 'pipeline:start', listener: (data: PipelineStartEvent) => void): this;
  on(event: 'pipeline:complete', listener: (data: PipelineCompleteEvent) => void): this;
  on(event: 'pipeline:error', listener: (data: PipelineErrorEvent) => void): this;
  on(event: 'stage:start', listener: (data: StageStartEvent) => void): this;
  on(event: 'stage:complete', listener: (data: StageCompleteEvent) => void): this;
  on(event: 'stage:error', listener: (data: StageErrorEvent) => void): this;
  on(event: 'stage:recover', listener: (data: StageRecoverEvent) => void): this;
  on(event: 'stage:progress', listener: (data: StageProgressEvent) => void): this;
  on(event: 'file:batch', listener: (data: FileBatchEvent) => void): this;
  on(event: 'stage:log', listener: (data: StageLogEvent) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Subscribe to pipeline events (once)
   * @param event - Event name
   * @param listener - Event listener function
   * @returns Pipeline instance for chaining
   */
  once(event: 'pipeline:start', listener: (data: PipelineStartEvent) => void): this;
  once(event: 'pipeline:complete', listener: (data: PipelineCompleteEvent) => void): this;
  once(event: 'pipeline:error', listener: (data: PipelineErrorEvent) => void): this;
  once(event: 'stage:start', listener: (data: StageStartEvent) => void): this;
  once(event: 'stage:complete', listener: (data: StageCompleteEvent) => void): this;
  once(event: 'stage:error', listener: (data: StageErrorEvent) => void): this;
  once(event: 'stage:recover', listener: (data: StageRecoverEvent) => void): this;
  once(event: 'stage:progress', listener: (data: StageProgressEvent) => void): this;
  once(event: 'file:batch', listener: (data: FileBatchEvent) => void): this;
  once(event: 'stage:log', listener: (data: StageLogEvent) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Emit a pipeline event
   * @param event - Event name
   * @param args - Event arguments
   * @returns true if event had listeners
   */
  emit(event: string, ...args: unknown[]): boolean;

  /**
   * Remove an event listener
   * @param event - Event name
   * @param listener - Event listener to remove
   * @returns Pipeline instance for chaining
   */
  removeListener(event: 'pipeline:start', listener: (data: PipelineStartEvent) => void): this;
  removeListener(event: 'pipeline:complete', listener: (data: PipelineCompleteEvent) => void): this;
  removeListener(event: 'pipeline:error', listener: (data: PipelineErrorEvent) => void): this;
  removeListener(event: 'stage:start', listener: (data: StageStartEvent) => void): this;
  removeListener(event: 'stage:complete', listener: (data: StageCompleteEvent) => void): this;
  removeListener(event: 'stage:error', listener: (data: StageErrorEvent) => void): this;
  removeListener(event: 'stage:recover', listener: (data: StageRecoverEvent) => void): this;
  removeListener(event: 'stage:progress', listener: (data: StageProgressEvent) => void): this;
  removeListener(event: 'file:batch', listener: (data: FileBatchEvent) => void): this;
  removeListener(event: 'stage:log', listener: (data: StageLogEvent) => void): this;
  removeListener(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Create a new pipeline instance (static factory)
   * @param options - Pipeline options
   * @returns New pipeline instance
   */
  static create(options?: PipelineOptions): Pipeline;

  /**
   * Laravel-style fluent pipeline interface
   * @param passable - Data to process
   * @returns Fluent interface for chaining
   */
  send<T>(passable: T): {
    through(stages: Stage[] | Array<new (options?: StageOptions) => Stage>): {
      then<TResult>(callback?: (result: T) => TResult): Promise<TResult>;
      thenReturn(): Promise<T>;
    };
  };
}

/**
 * Base class for pipeline stages.
 * All pipeline stages should extend this class.
 */
export class Stage {
  /** Stage name (defaults to constructor name) */
  readonly name: string;
  /** Stage options */
  protected options: StageOptions;
  /** Reference to parent pipeline for event emission */
  protected pipeline?: Pipeline;
  /** Configuration manager instance (available after onInit) */
  protected get config(): ConfigManager;

  /** Create a new Stage instance */
  constructor(options?: StageOptions);

  /**
   * Process input data (must be implemented by subclasses)
   * @param input - Input data from previous stage
   * @returns Processed output for next stage
   */
  process(input: unknown): Promise<unknown> | unknown;

  /**
   * Validate input before processing (optional but recommended)
   * Called automatically by Pipeline before process()
   * @param input - Input to validate
   * @returns true if valid, false/undefined otherwise
   * @throws Error if validation fails
   */
  validate?(input: unknown): boolean | void | Promise<boolean | void>;

  /**
   * Handle errors during processing with recovery mechanism
   * If recovery is possible, return a valid result to continue pipeline
   * @param error - Error that occurred during stage processing
   * @param input - Input data being processed when error occurred
   * @returns Recovered result to continue pipeline
   * @throws Error if recovery is not possible
   */
  handleError?(error: Error, input: unknown): Promise<unknown> | unknown;

  /**
   * Initialize stage with pipeline context
   * Called once when pipeline is created, before any processing
   * @param context - Pipeline context with shared resources
   */
  onInit?(context: PipelineContext): Promise<void> | void;

  /**
   * Called before each stage execution
   * @param input - Input data about to be processed
   */
  beforeRun?(input: unknown): Promise<void> | void;

  /**
   * Called after successful stage execution
   * @param output - Output data from stage processing
   */
  afterRun?(output: unknown): Promise<void> | void;

  /**
   * Called when stage encounters an error (before handleError)
   * @param error - Error that occurred
   * @param input - Input data being processed when error occurred
   */
  onError?(error: Error, input: unknown): Promise<void> | void;

  /**
   * Log a message and emit stage events
   * @param message - Message to log
   * @param level - Log level (default: 'info')
   */
  protected log(message: string, level?: 'info' | 'warn' | 'error' | 'debug'): void;

  /**
   * Emit progress update for current stage
   * @param progress - Progress percentage (0-100)
   * @param message - Optional progress message
   */
  protected emitProgress(progress: number, message?: string): void;

  /**
   * Emit file processing event (throttled for performance)
   * @param filePath - Path of file being processed
   * @param action - Action being performed (default: 'processed')
   */
  protected emitFileEvent(filePath: string, action?: string): void;

  /**
   * Get elapsed time since a start time
   * @param startTime - Start time from Date.now()
   * @returns Formatted elapsed time string
   */
  protected getElapsedTime(startTime: number): string;

  /**
   * Format bytes to human readable string
   * @param bytes - Number of bytes
   * @returns Formatted string
   */
  protected formatBytes(bytes: number): string;
}

// ============================================================================
// Progress Tracker
// ============================================================================

/**
 * Options for constructing a ProgressTracker
 */
export interface ProgressTrackerOptions {
  /** Total number of pipeline stages (default: 1) */
  totalStages?: number;
  /** Progress callback function */
  onProgress?: ProgressCallback;
  /** Minimum milliseconds between throttled emissions (default: 100) */
  throttleMs?: number;
}

/**
 * Normalizes pipeline events into simple progress updates.
 *
 * Translates detailed pipeline events (stage:start, stage:complete, file:batch,
 * stage:progress) into a simple { percent, message } format for UI consumers.
 *
 * Progress guarantees:
 * - Always starts at 0%
 * - Always ends at 100% on success
 * - Monotonically increasing (never goes backward)
 * - Throttled to avoid overwhelming UI (default 100ms)
 */
export class ProgressTracker {
  /** Total number of pipeline stages */
  totalStages: number;
  /** Progress callback function */
  onProgress: ProgressCallback;
  /** Throttle interval in milliseconds */
  throttleMs: number;

  /** Create a new ProgressTracker instance */
  constructor(options?: ProgressTrackerOptions);

  /**
   * Attach event listeners to a pipeline instance.
   * Once attached, the tracker will listen to pipeline events and
   * invoke the onProgress callback with normalized progress updates.
   * @param pipeline - Pipeline instance to track
   */
  attach(pipeline: Pipeline): void;
}

// ============================================================================
// Transformer Classes
// ============================================================================

/**
 * Transformer trait definitions
 */
export interface TransformerTraits {
  /** Input content types (e.g., ['text', 'binary']) */
  inputTypes: string[];
  /** Output content types */
  outputTypes: string[];
  /** Whether the transformer is idempotent (can be safely reapplied) */
  idempotent: boolean;
  /** Whether the transformer is resource-intensive */
  heavy: boolean;
  /** Required external tools (e.g., ['pandoc']) */
  dependencies?: string[];
}

/**
 * Base transformer class for file content transformation
 */
export class BaseTransformer {
  /** Transformer name (kebab-case identifier) */
  readonly name: string;
  /** Transformer traits */
  readonly traits: TransformerTraits;

  /** Create a new transformer instance */
  constructor(options?: Record<string, unknown>);

  /**
   * Transform a file
   * @param file - File to transform
   * @returns Transformed file
   */
  transform(file: FileResult): Promise<FileResult>;
}

/**
 * Options for creating a TransformerRegistry
 */
export interface TransformerRegistryOptions {
  /** ConfigManager instance for isolated configuration */
  config?: ConfigManager;
}

/**
 * Transformer registry for managing and scheduling transformers
 */
export class TransformerRegistry {
  /**
   * Create the default registry with all built-in transformers
   * @param options - Registry options
   * @returns Initialized registry
   */
  static createDefault(options?: TransformerRegistryOptions): Promise<TransformerRegistry>;

  /**
   * Register a transformer
   * @param name - Transformer name
   * @param transformer - Transformer instance
   */
  register(name: string, transformer: BaseTransformer): void;

  /**
   * Get a transformer by name
   * @param name - Transformer name
   * @returns Transformer instance or undefined
   */
  get(name: string): BaseTransformer | undefined;

  /**
   * Get all registered transformers
   * @returns Array of all transformer instances
   */
  getAll(): BaseTransformer[];

  /**
   * Check if a transformer is registered
   * @param name - Transformer name
   * @returns true if registered
   */
  has(name: string): boolean;
}

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

/**
 * Get or create the singleton ConfigManager instance.
 *
 * @deprecated Use `ConfigManager.create()` instead for new code. The singleton
 * pattern prevents safe concurrent operations with different configurations.
 * This function will be removed in the next major version.
 */
export function config(options?: { noValidate?: boolean }): ConfigManager;

/**
 * Async version of config() that ensures full initialization.
 *
 * @deprecated Use `ConfigManager.create()` instead for new code. The singleton
 * pattern prevents safe concurrent operations with different configurations.
 * This function will be removed in the next major version.
 */
export function configAsync(options?: { noValidate?: boolean }): Promise<ConfigManager>;

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
  | 'ERR_IGNORE_INVALID';

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
