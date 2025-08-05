/**
 * Base error class for CopyTree
 */
class CopyTreeError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.name = 'CopyTreeError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Command execution error
 */
class CommandError extends CopyTreeError {
  constructor(message, command, details = {}) {
    super(message, 'COMMAND_ERROR', { command, ...details });
    this.name = 'CommandError';
    this.command = command;
  }
}

/**
 * File system error
 */
class FileSystemError extends CopyTreeError {
  constructor(message, path, operation, details = {}) {
    super(message, 'FILESYSTEM_ERROR', { path, operation, ...details });
    this.name = 'FileSystemError';
    this.path = path;
    this.operation = operation;
  }
}

/**
 * Configuration error
 */
class ConfigurationError extends CopyTreeError {
  constructor(message, configKey, details = {}) {
    super(message, 'CONFIG_ERROR', { configKey, ...details });
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }
}

/**
 * Validation error
 */
class ValidationError extends CopyTreeError {
  constructor(message, field, value, details = {}) {
    super(message, 'VALIDATION_ERROR', { field, value, ...details });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Pipeline error
 */
class PipelineError extends CopyTreeError {
  constructor(message, stage, details = {}) {
    super(message, 'PIPELINE_ERROR', { stage, ...details });
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

/**
 * AI Provider error
 */
class AIProviderError extends CopyTreeError {
  constructor(message, provider, details = {}) {
    super(message, 'AI_PROVIDER_ERROR', { provider, ...details });
    this.name = 'AIProviderError';
    this.provider = provider;
  }
}

/**
 * Transform error
 */
class TransformError extends CopyTreeError {
  constructor(message, transformer, file, details = {}) {
    super(message, 'TRANSFORM_ERROR', { transformer, file, ...details });
    this.name = 'TransformError';
    this.transformer = transformer;
    this.file = file;
  }
}

/**
 * Git error
 */
class GitError extends CopyTreeError {
  constructor(message, operation, details = {}) {
    super(message, 'GIT_ERROR', { operation, ...details });
    this.name = 'GitError';
    this.operation = operation;
  }
}

/**
 * Profile error
 */
class ProfileError extends CopyTreeError {
  constructor(message, profile, details = {}) {
    super(message, 'PROFILE_ERROR', { profile, ...details });
    this.name = 'ProfileError';
    this.profile = profile;
  }
}

/**
 * Instructions error
 */
class InstructionsError extends CopyTreeError {
  constructor(message, instructionsName, details = {}) {
    super(message, 'INSTRUCTIONS_ERROR', { instructionsName, ...details });
    this.name = 'InstructionsError';
    this.instructionsName = instructionsName;
  }
}

/**
 * Handle errors consistently
 */
function handleError(error, options = {}) {
  const { 
    exit = true, 
    verbose = false,
    logger = console.error, 
  } = options;

  // Convert to CopyTreeError if not already
  if (!(error instanceof CopyTreeError)) {
    error = new CopyTreeError(error.message, 'UNKNOWN_ERROR', {
      originalError: error.name,
      originalStack: error.stack,
    });
  }

  // Log error
  if (verbose) {
    logger(error.toJSON());
  } else {
    logger(`Error: ${error.message}`);
    if (error.code) {
      logger(`Code: ${error.code}`);
    }
  }

  // Exit if requested
  if (exit && process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }

  return error;
}

// Alias for consistency with BaseProvider
const ProviderError = AIProviderError;

/**
 * Error codes that should be retried (transient errors)
 */
export const RETRYABLE_ERROR_CODES = [
  'RATE_LIMIT',
  'TIMEOUT',
  'SERVICE_UNAVAILABLE', 
  'NETWORK_ERROR',
  'TEMPORARY_FAILURE',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'SOCKET_TIMEOUT',
];

/**
 * Error codes that should NOT be retried (permanent errors)
 */
export const NON_RETRYABLE_ERROR_CODES = [
  'INVALID_API_KEY',
  'SAFETY_FILTER',
  'INVALID_REQUEST',
  'CONTENT_BLOCKED',
  'QUOTA_EXCEEDED',
  'PERMISSION_DENIED',
  'AUTHENTICATION_FAILED',
  'VALIDATION_ERROR',
  'CONFIG_ERROR',
];

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
export function isRetryableError(error) {
  if (error instanceof ProviderError) {
    // For ProviderError, the specific error code is in details.code
    const specificCode = error.details?.code;
    return specificCode && RETRYABLE_ERROR_CODES.includes(specificCode);
  }
  
  // Check for common network error codes on the error object
  const errorCode = error.code || error.name || '';
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

/**
 * Categorize an error as retryable or non-retryable
 * @param {Error} error - The error to categorize
 * @returns {string} 'retryable', 'non-retryable', or 'unknown'
 */
export function categorizeError(error) {
  if (isRetryableError(error)) {
    return 'retryable';
  }
  
  if (error instanceof ProviderError) {
    // For ProviderError, the specific error code is in details.code
    const specificCode = error.details?.code;
    if (specificCode && NON_RETRYABLE_ERROR_CODES.includes(specificCode)) {
      return 'non-retryable';
    }
  }
  
  const errorCode = error.code || error.name || '';
  if (NON_RETRYABLE_ERROR_CODES.includes(errorCode)) {
    return 'non-retryable';
  }
  
  return 'unknown';
}

export {
  CopyTreeError,
  CommandError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  PipelineError,
  AIProviderError,
  ProviderError,
  TransformError,
  GitError,
  ProfileError,
  InstructionsError,
  handleError,
};