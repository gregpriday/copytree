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

// Core classes for advanced usage
export { default as Pipeline } from './pipeline/Pipeline.js';
export { default as Stage } from './pipeline/Stage.js';
export { default as ProfileLoader } from './profiles/ProfileLoader.js';
export { default as TransformerRegistry } from './transforms/TransformerRegistry.js';
export { default as BaseTransformer } from './transforms/BaseTransformer.js';

// Configuration utilities
export { config } from './config/ConfigManager.js';

// Error classes
export {
  CopytreeError,
  CommandError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  PipelineError,
  AIProviderError,
  TransformError,
  GitError,
  ProfileError,
} from './utils/errors.js';

// Default export for convenience
export { copy as default } from './api/copy.js';
