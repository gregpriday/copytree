/**
 * CopyTree TypeScript Definitions
 *
 * Provides comprehensive type definitions for the CopyTree programmatic API.
 * Full IntelliSense support for TypeScript consumers including Canopy.
 *
 * @module copytree
 * @version 0.14.0
 */

// ============================================================================
// Progress and Callback Types
// ============================================================================

/**
 * Progress event emitted during copy/scan operations.
 * Used by the onProgress callback to report progress updates.
 */
export interface ProgressEvent {
  /** Progress percentage (0-100) */
  percent: number;
  /** Human-readable progress message */
  message: string;
  /** Current stage name */
  stage?: string;
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
 * Represents a file discovered and processed by scan()
 */
export interface FileResult {
  /** Relative path (may use platform-specific separators on Windows) */
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
  /** Additional include patterns */
  filter?: string | string[];
  /** Additional exclude patterns */
  exclude?: string | string[];
  /** Use .gitignore rules (default: true) */
  respectGitignore?: boolean;
  /** Only git modified files */
  modified?: boolean;
  /** Files changed since git ref */
  changed?: string;
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
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Maximum total size in bytes */
  maxTotalSize?: number;
  /** Maximum number of files */
  maxFileCount?: number;
  /** Patterns to force include */
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
  /** Sort order: 'path', 'size', 'modified', 'name', 'extension', 'depth' */
  sort?: 'path' | 'size' | 'modified' | 'name' | 'extension' | 'depth';
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
}

/**
 * Scan a directory and return an async iterable of FileResult objects.
 * Files are yielded as soon as they are discovered and processed.
 *
 * @param basePath - Path to directory to scan
 * @param options - Scan options
 * @returns Async iterable of file results
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
  /** Preview without processing */
  dryRun?: boolean;
  /** Verbose error output */
  verbose?: boolean;
  /** Character limit per file */
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
  /** Array of file results */
  files: FileResult[];
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
    /** Secrets detection summary (if enabled) */
    secretsGuard?: {
      detected: number;
      redacted: number;
      report?: object;
    };
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

// Note: Streaming API (copyStream/formatStream) will be added in a future release
// These functions are not yet implemented but types are included for planning purposes

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

/**
 * Configuration manager for CopyTree.
 * Supports both singleton pattern (deprecated) and instance-based usage.
 */
export class ConfigManager {
  /**
   * Create a new ConfigManager instance (use ConfigManager.create() instead)
   */
  constructor(options?: { noValidate?: boolean });

  /**
   * Static factory method to create and initialize a ConfigManager instance.
   * Recommended for new code - enables concurrent operations with isolated configuration.
   * @param options - Configuration options
   * @returns Promise resolving to an initialized ConfigManager instance
   */
  static create(options?: { noValidate?: boolean }): Promise<ConfigManager>;

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
export class PipelineError extends CopyTreeError {}
export class TransformError extends CopyTreeError {}
export class GitError extends CopyTreeError {}
export class ProfileError extends CopyTreeError {}
export class InstructionsError extends CopyTreeError {}
export class SecretsDetectedError extends CopyTreeError {}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export (copy function)
 */
export default copy;
