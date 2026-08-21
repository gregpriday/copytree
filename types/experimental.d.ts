/**
 * CopyTree extension points — `copytree/experimental`.
 *
 * Lower level than the package root, and versioned less conservatively: a minor
 * release may change anything here. See `src/experimental.js` for why these live
 * behind a separate import rather than on the root.
 *
 * @module copytree/experimental
 */

import type {
  CopyTreeError,
  FileResult,
  Logger,
  ConfigManager,
  ExclusionReason,
  PipelineStageId,
  ProgressEvent,
  ProgressCallback,
  StageStartEvent,
  StageCompleteEvent,
  StageErrorEvent,
  StageRecoverEvent,
  StageProgressEvent,
  FileBatchEvent,
  StageLogEvent,
  PipelineStartEvent,
  PipelineCompleteEvent,
  PipelineErrorEvent,
  PipelineEventData,
  PipelineEventType,
  PipelineEvent,
  MemorySnapshot,
  MemoryUsage,
  StageMetrics,
  StageError,
  PipelineStats,
  PipelineOptions,
} from './index.js';

export type {
  CopyTreeError,
  FileResult,
  Logger,
  ConfigManager,
  ExclusionReason,
  PipelineStageId,
  ProgressEvent,
  ProgressCallback,
  StageStartEvent,
  StageCompleteEvent,
  StageErrorEvent,
  StageRecoverEvent,
  StageProgressEvent,
  FileBatchEvent,
  StageLogEvent,
  PipelineStartEvent,
  PipelineCompleteEvent,
  PipelineErrorEvent,
  PipelineEventData,
  PipelineEventType,
  PipelineEvent,
  MemorySnapshot,
  MemoryUsage,
  StageMetrics,
  StageError,
  PipelineStats,
  PipelineOptions,
};

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
export function categorizeByExt(ext: string, groups?: Record<string, string[]>): string | null;

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
      | Array<
          | Stage
          | (new (options?: StageOptions) => Stage)
          | ((input: unknown) => Promise<unknown> | unknown)
        >,
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
 * Base transformer class for file content transformation
 */
export class BaseTransformer {
  /**
   * Transformer name (kebab-case identifier).
   *
   * Optional because the base class does not set it — a subclass is expected
   * to. Declaring it as always present meant `transformer.name.toUpperCase()`
   * type-checked and threw.
   */
  name?: string;

  /** Traits, set by the subclass. Absent on the base class. */
  traits?: TransformerTraits;

  /** The configuration this transformer runs under. */
  readonly config: ConfigManager;

  /**
   * @param options - Transformer options. Pass `config` to bind the
   *   transformer to one operation's configuration instead of the
   *   process-wide default.
   */
  constructor(options?: {
    config?: ConfigManager;
    cache?: boolean;
    noCache?: boolean;
    cacheTTL?: number;
    [key: string]: unknown;
  });

  /** Transform a file. */
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
/** Traits describing what a transformer consumes, produces and costs. */
export interface TransformerTraits {
  inputTypes: string[];
  outputTypes: string[];
  idempotent: boolean;
  orderSensitive: boolean;
  heavy: boolean;
  stateful: boolean;
  dependencies: string[];
  conflictsWith: string[];
  requirements: Record<string, unknown>;
  tags: string[];
}

/**
 * One thing the traits system noticed about a plan.
 *
 * Severity is the whole contract: `error` means the plan cannot run as given,
 * and is what `valid` reflects. `warning` and `info` are advice — a declared
 * resource requirement the registry cannot verify, a heavy transformer that
 * could run later — and used to make a plan invalid for telling you something
 * useful about it.
 */
export interface TransformerPlanIssue {
  /** What kind of issue, e.g. `conflict`, `ordering`, `declared_requirement` */
  type: string;
  severity: 'error' | 'warning' | 'info';
  /** Human-readable description */
  message: string;
  /** Transformers involved */
  transformers: string[];
  /** For `declared_requirement`: what the transformer says it needs */
  requirements?: string[];
}

/** The result of {@link TransformerRegistry.validatePlan}. */
export interface TransformerPlanValidation {
  /** False only when an `error`-severity issue was found */
  valid: boolean;
  /** Conflicts, ordering notes and declared requirements */
  issues: TransformerPlanIssue[];
  /** Optimization suggestions */
  warnings: TransformerPlanIssue[];
}

/** Registration options for a transformer. */
export interface TransformerRegistration {
  /** Claim these file extensions */
  extensions?: string[];
  /** Claim these MIME types */
  mimeTypes?: string[];
  /** Lower runs earlier */
  priority?: number;
  /** Use when nothing else claims the file */
  isDefault?: boolean;
}

export class TransformerRegistry {
  constructor(options?: TransformerRegistryOptions);

  /**
   * Create the default registry, passing `options.config` to every transformer
   * it constructs.
   */
  static createDefault(options?: TransformerRegistryOptions): Promise<TransformerRegistry>;

  /** Register a transformer, optionally with its traits. */
  register(
    name: string,
    transformer: BaseTransformer,
    options?: TransformerRegistration,
    traits?: Partial<TransformerTraits> | null,
  ): void;

  /**
   * Get a transformer by name.
   *
   * @throws TransformError when the name is not registered. It was declared as
   * returning `undefined`, so a consumer following the types wrote a null check
   * that could never run and had no `catch` for the throw that actually happens.
   */
  get(name: string): BaseTransformer;

  /** Every registered transformer instance. */
  getAllTransformers(): BaseTransformer[];

  /** Registered transformer names with their priority and traits. */
  list(): Array<{ name: string; priority: number; traits: TransformerTraits | null }>;

  /** Whether a transformer is registered. */
  has(name: string): boolean;

  /** The transformer that claims a file, or the default. */
  getForFile(file: { path: string; mimeType?: string }): BaseTransformer | null;

  /** The transformer registered for an extension. */
  getExtension(ext: string): BaseTransformer | null;

  /** Traits for a registered transformer. */
  getTraits(name: string): TransformerTraits | null;

  /** Remove every registration. */
  clear(): void;

  /** Turn plan validation on or off. */
  setValidationEnabled(enabled: boolean): void;

  /**
   * Resolve the declared dependency graph into an execution order.
   *
   * Throws on a cycle or a missing dependency. It was declared as returning
   * `{ valid, errors, warnings }` and returns an ordered array of transformer
   * names, so a consumer following the declaration read `.valid` off an array
   * and got `undefined` — which is falsy, so the careful ones concluded every
   * graph was invalid.
   */
  validateDependencies(): string[];

  /**
   * Check an ordered plan against the traits system.
   *
   * `valid` is false only when an `error`-severity issue was found. `issues`
   * also carries advisory entries — a declared resource requirement, an
   * ordering note — at `info`, so a plan can be valid and still have issues
   * worth reading.
   */
  validatePlan(plan: string[]): TransformerPlanValidation;

  /** Reorder a plan so heavy transformers run last and conflicts are avoided. */
  optimizePlan(plan: string[]): string[];
}

// ============================================================================
// Exclusion Accounting
// ============================================================================

/**
 * The running record of what was dropped and why.
 *
 * Aggregate counts are always kept; per-file detail depends on the retention
 * policy the caller asked for.
 */
export declare class ExclusionReport {
  constructor(options?: { retain?: 'counts' | 'top' | 'all'; topN?: number; maxEntries?: number });

  /** Record one exclusion. */
  add(entry: {
    path: string;
    size?: number;
    reason: ExclusionReason;
    rule?: string;
    source?: string;
    line?: number;
  }): void;

  /** Total entries excluded. */
  readonly total: number;

  /** Counts keyed by stable reason. */
  readonly byReason: Record<string, number>;

  /** The report as a plain object, for `stats.excluded`. */
  toJSON(): {
    total: number;
    byReason: Record<string, number>;
    largest?: Array<{ path: string; size: number; reason: ExclusionReason }>;
    truncated?: boolean;
    omittedEntries?: number;
  };
}

/** Map a pipeline stage class name to its stable identifier. */
export function stageIdFor(stageName: string): PipelineStageId;

// ============================================================================
// Serialization
// ============================================================================

/** Formats CopyTree can serialize. */
export const FORMATS: readonly ['xml', 'json', 'markdown', 'tree', 'ndjson', 'sarif'];

/** Resolve a format alias (`md`) to its canonical name (`markdown`). */
export function canonicalFormat(format: string): string;

/**
 * The canonical document model every serializer renders.
 *
 * Built once per operation with every configuration lookup already resolved, so
 * a serializer is a pure function of this value.
 */
export interface CopyTreeDocument {
  basePath: string;
  files: FileResult[];
  instructions: string | null;
  instructionsName: string | null;
  profile: { name: string } | null;
  gitMetadata: Record<string, unknown> | null;
  version: string | null;
  options: Record<string, unknown>;
}

/** Normalize a caller's input into the canonical document. */
export function buildDocument(
  input: Record<string, unknown>,
  overrides?: Record<string, unknown>,
  config?: ConfigManager | null,
): CopyTreeDocument;

/**
 * Serialize a document into output chunks.
 *
 * Concatenating these chunks equals `render()` of the same document, which is
 * what makes buffered and streamed output identical by construction.
 */
export function serialize(doc: CopyTreeDocument): AsyncGenerator<string>;

/** Render a document to one string. */
export function render(doc: CopyTreeDocument): Promise<string>;
