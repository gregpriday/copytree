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
    super(message, details.code || 'CONFIG_ERROR', { configKey, ...details });
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }
}

/**
 * Stable, machine-readable error codes.
 *
 * These are part of the public API. Consumers switch on `error.code` to pick a
 * recovery action, so values never change once released; new codes are additive.
 * Substring matching on `error.message` is not a supported integration.
 *
 * @readonly
 * @enum {string}
 */
const ERROR_CODES = Object.freeze({
  /** The requested path does not exist */
  PATH_NOT_FOUND: 'ERR_PATH_NOT_FOUND',
  /** The requested path exists but is not a directory */
  NOT_A_DIRECTORY: 'ERR_NOT_A_DIRECTORY',
  /** A `scope` entry resolved outside the base path */
  SCOPE_OUTSIDE_ROOT: 'ERR_SCOPE_OUTSIDE_ROOT',
  /** An option value was missing or malformed */
  INVALID_OPTION: 'ERR_INVALID_OPTION',
  /** An unsupported output format was requested */
  INVALID_FORMAT: 'ERR_INVALID_FORMAT',
  /** Configuration could not be loaded or failed validation */
  CONFIG_INVALID: 'ERR_CONFIG_INVALID',
  /** The operation was cancelled via an AbortSignal */
  ABORTED: 'ERR_ABORTED',
  /**
   * No files matched.
   *
   * NOTE: this is NOT thrown by `copy()` / `scan()`. An empty selection is a
   * valid, common outcome (an empty folder, a fully-ignored scope) and is
   * reported as `result.stats.noFilesMatched === true`. The code exists so
   * callers that do want to treat emptiness as fatal have a stable value to
   * raise and match on.
   */
  NO_FILES_MATCHED: 'ERR_NO_FILES_MATCHED',
  /** Secrets were found and `secretsGuard.failOnSecrets` is enabled */
  SECRETS_DETECTED: 'ERR_SECRETS_DETECTED',
  /** A symlink resolved outside the real repository root */
  SYMLINK_OUTSIDE_ROOT: 'ERR_SYMLINK_OUTSIDE_ROOT',
});

/**
 * Validation error
 *
 * Accepts an explicit `details.code` so callers can raise a specific
 * {@link ERROR_CODES} value while keeping the `ValidationError` name.
 */
class ValidationError extends CopyTreeError {
  constructor(message, field, value, details = {}) {
    super(message, details.code || 'VALIDATION_ERROR', { field, value, ...details });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Scope resolution error
 *
 * Raised when a `scope` entry cannot be used: it does not exist, or it resolves
 * outside the base path. Both are caller mistakes worth surfacing loudly rather
 * than degrading into an empty result.
 */
class ScopeError extends CopyTreeError {
  constructor(message, code, scopePath, details = {}) {
    super(message, code, { scopePath, ...details });
    this.name = 'ScopeError';
    this.scopePath = scopePath;
  }
}

/**
 * Create the canonical abort error.
 *
 * `name` is `AbortError` (what the DOM/`AbortSignal` ecosystem expects, and what
 * callers special-case to treat a user cancel as silent) and `code` is
 * `ERR_ABORTED` for consistency with every other typed error.
 *
 * @param {string} [message='Operation aborted'] - Error message
 * @returns {Error} Abort error
 */
function createAbortError(message = 'Operation aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = ERROR_CODES.ABORTED;
  return error;
}

/**
 * Check whether an error represents a cancellation.
 * @param {Error} error - Error to test
 * @returns {boolean} True when the error is an abort
 */
function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === ERROR_CODES.ABORTED;
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
 * Secrets detected error
 * Thrown when secrets are found and failOnSecrets is enabled
 *
 * Message-first, like every other error here, because that is how both call
 * sites already used it. `findings` must already be safe (see
 * `SecretRedactor.toSafeFinding`): this error is thrown to callers who will log
 * it, so a raw match on it would be a secret written to their log.
 */
class SecretsDetectedError extends CopyTreeError {
  constructor(message, findings = [], details = {}) {
    const safeFindings = Array.isArray(findings) ? findings : [];
    super(message, ERROR_CODES.SECRETS_DETECTED, {
      secretsCount: safeFindings.length,
      findings: safeFindings,
      ...details,
    });
    this.name = 'SecretsDetectedError';
    this.secretsCount = safeFindings.length;
    this.findings = safeFindings;
  }
}

/**
 * Handle errors consistently
 */
function handleError(error, options = {}) {
  const { exit = true, verbose = false, logger = console.error } = options;

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

/**
 * Error codes that should be retried (transient errors)
 */
export const RETRYABLE_ERROR_CODES = [
  // Network errors (existing)
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
  // Filesystem errors (new)
  'EBUSY', // Resource busy (file locked)
  'EPERM', // Permission denied (transient on Windows with antivirus)
  'EACCES', // Access denied (Windows file lock/antivirus)
  'EMFILE', // Too many open files
  'ENFILE', // File table overflow
  'EAGAIN', // Resource temporarily unavailable
  'EIO', // I/O error (network drives)
];

/**
 * Error codes that should NOT be retried (permanent errors)
 */
export const NON_RETRYABLE_ERROR_CODES = [
  'INVALID_REQUEST',
  'PERMISSION_DENIED',
  'VALIDATION_ERROR',
  'CONFIG_ERROR',
];

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
export function isRetryableError(error) {
  // Check for common network error codes on the error object
  const errorCode = error.code || error.name || '';
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

/**
 * Check if an error is a retryable filesystem error
 * @param {Error|string} error - The error to check (Error object or error code string)
 * @returns {boolean} True if the error is a retryable filesystem error
 */
export function isRetryableFsError(error) {
  const code = error?.code || error;
  // Filesystem-specific retryable codes
  const fsRetryableCodes = ['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE', 'EAGAIN', 'EIO'];
  return fsRetryableCodes.includes(code);
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
  handleError,
};
