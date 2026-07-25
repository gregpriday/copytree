/**
 * CopyTree Programmatic API
 *
 * This module provides a stable, typed API for using CopyTree as a library
 * in Node.js applications. The API enables developers to integrate file
 * discovery, transformation, and formatting into their build tools and scripts.
 *
 * @module copytree
 */

// Main API functions
export { scan } from './api/scan.js';
export { format } from './api/format.js';
export { copy } from './api/copy.js';

// Streaming API functions (for large outputs)
export { copyStream } from './api/copyStream.js';
export { formatStream } from './api/formatStream.js';

// Core classes for advanced usage
export { default as Pipeline } from './pipeline/Pipeline.js';
export { default as Stage } from './pipeline/Stage.js';
export { default as TransformerRegistry } from './transforms/TransformerRegistry.js';
export { default as BaseTransformer } from './transforms/BaseTransformer.js';
export { ProgressTracker, PIPELINE_STAGES, stageIdFor } from './utils/ProgressTracker.js';

// Configuration utilities
export { config, configAsync, ConfigManager } from './config/ConfigManager.js';

// Stable enums and helpers for machine consumers
export { EXCLUSION_REASONS, ExclusionReport } from './utils/exclusionReport.js';
export { MANIFEST_OUTCOMES, buildManifest, classifyOutcome } from './utils/manifest.js';
export { OUTPUT_FORMAT_VERSIONS, versionFor } from './utils/outputVersion.js';
export { estimateTokens, estimateOutputChars, CHARS_PER_TOKEN } from './utils/estimate.js';
export { resolveScope } from './utils/scopeResolver.js';
export { categorizeByExt, detect as detectBinary } from './utils/BinaryDetector.js';

// Error classes and codes
export {
  CopyTreeError,
  CommandError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  ScopeError,
  PipelineError,
  TransformError,
  GitError,
  ProfileError,
  InstructionsError,
  SecretsDetectedError,
  ERROR_CODES,
  createAbortError,
  isAbortError,
} from './utils/errors.js';

// Default export for convenience
export { copy as default } from './api/copy.js';
