/**
 * CopyTree TypeScript Definitions
 *
 * Provides type definitions for the CopyTree programmatic API.
 * @module copytree
 */

// ============================================================================
// File Results
// ============================================================================

/**
 * Represents a file discovered and processed by scan()
 */
export interface FileResult {
  /** POSIX-style relative path (forward slashes) */
  path: string;
  /** Platform-specific absolute path */
  absolutePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: Date;
  /** File content (if includeContent is true) */
  content?: string;
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
  /** Sort order: 'path', 'size', 'modified', 'name', 'extension' */
  sort?: 'path' | 'size' | 'modified' | 'name' | 'extension';
  /**
   * ConfigManager instance for isolated configuration.
   * If not provided, an isolated instance will be created.
   * This enables concurrent scan operations with different configurations.
   */
  config?: ConfigManager;
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
  onProgress?: (progress: { percent: number; message: string }) => void;
  /** Add line numbers (alias for addLineNumbers) */
  withLineNumbers?: boolean;
}

/**
 * Stream copy operation that yields formatted output chunks incrementally.
 * This prevents UI freezing in applications when processing large codebases
 * by yielding output as it's generated instead of buffering everything in memory.
 *
 * IMPORTANT: Unlike copy(), this function streams output incrementally.
 * - Memory efficient: Only one file's content in memory at a time
 * - Non-blocking: Yields chunks as they're ready
 * - Concatenated output equals copy() output for same inputs
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
// Core Classes
// ============================================================================

/**
 * Pipeline context provided to stages
 */
export interface PipelineContext {
  /** Logger instance */
  logger: any;
  /** Pipeline options */
  options: any;
  /** Pipeline statistics */
  stats: any;
  /** Configuration manager */
  config: any;
  /** Reference to pipeline */
  pipeline: Pipeline;
}

/**
 * Pipeline event data
 */
export interface PipelineEvent {
  /** Event type */
  type:
    | 'stage:start'
    | 'stage:complete'
    | 'stage:error'
    | 'stage:recover'
    | 'stage:progress'
    | 'file:batch'
    | 'stage:log';
  /** Event data */
  data: any;
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
  /** Continue processing after stage failures */
  continueOnError?: boolean;
  /** Emit progress events */
  emitProgress?: boolean;
  /** Enable parallel stage processing */
  parallel?: boolean;
  /** Maximum concurrent operations */
  maxConcurrency?: number;
}

/**
 * Pipeline for orchestrating file processing stages
 */
export class Pipeline {
  constructor(options?: PipelineOptions);
  through(stages: any[]): Pipeline;
  process(input: any): Promise<any>;
  on(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
}

/**
 * Base class for pipeline stages
 */
export class Stage {
  constructor(options?: any);
  process(input: any): Promise<any>;
  onInit?(context: PipelineContext): Promise<void>;
  beforeRun?(input: any): Promise<void>;
  afterRun?(output: any): Promise<void>;
  handleError?(error: Error, input: any): Promise<any>;
  validate?(input: any): boolean;
}


/**
 * Base transformer class
 */
export class BaseTransformer {
  constructor(options?: any);
  transform(file: FileResult): Promise<FileResult>;
}

/**
 * Transformer registry for managing transformers
 */
export class TransformerRegistry {
  static createDefault(): Promise<TransformerRegistry>;
  register(name: string, transformer: BaseTransformer): void;
  get(name: string): BaseTransformer | undefined;
  getAll(): BaseTransformer[];
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

export class CopytreeError extends Error {
  constructor(message: string, code?: string);
  code?: string;
}

export class CommandError extends CopytreeError {}
export class FileSystemError extends CopytreeError {}
export class ConfigurationError extends CopytreeError {}
export class ValidationError extends CopytreeError {}
export class PipelineError extends CopytreeError {}
export class AIProviderError extends CopytreeError {}
export class TransformError extends CopytreeError {}
export class GitError extends CopytreeError {}
export class ProfileError extends CopytreeError {}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default export (copy function)
 */
export default copy;
