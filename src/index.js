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
export { ProgressTracker } from './utils/ProgressTracker.js';

// Configuration utilities
export { config, configAsync, ConfigManager } from './config/ConfigManager.js';

// Error classes
export {
  CopyTreeError,
  CommandError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  PipelineError,
  TransformError,
  GitError,
  ProfileError,
  InstructionsError,
  SecretsDetectedError,
} from './utils/errors.js';

// Default export for convenience
export { copy as default } from './api/copy.js';
