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
  /** More than one output destination was requested */
  DESTINATION_CONFLICT: 'ERR_DESTINATION_CONFLICT',
  /** Two options that cannot be combined were both supplied */
  OPTION_CONFLICT: 'ERR_OPTION_CONFLICT',
  /** An option requires another option that was not supplied */
  OPTION_REQUIRES: 'ERR_OPTION_REQUIRES',
  /** A removed option was supplied; the error names its replacement */
  DEPRECATED_OPTION: 'ERR_DEPRECATED_OPTION',
  /** A named file-selection profile could not be found */
  PROFILE_NOT_FOUND: 'ERR_PROFILE_NOT_FOUND',
  /** A requested policy check failed (`--fail-empty`, `--strict`, ...) */
  POLICY_FAILURE: 'ERR_POLICY_FAILURE',
  /** An ignore file could not be read or parsed */
  IGNORE_INVALID: 'ERR_IGNORE_INVALID',

  // The codes below were, until 1.0, thrown as bare screaming-snake strings
  // (`FILESYSTEM_ERROR`, `GIT_ERROR`, ...) that appeared in no registry and in
  // no TypeScript union, while the documentation told consumers to switch on
  // `error.code`. A code that is not in the published union is a code a typed
  // consumer cannot handle.

  /** A filesystem operation failed: read, stat, write, or rename */
  FILESYSTEM: 'ERR_FILESYSTEM',
  /** A path exists but could not be accessed (`EACCES`, `EPERM`) */
  PERMISSION_DENIED: 'ERR_PERMISSION_DENIED',
  /** A pipeline stage failed, or its lifecycle contract was broken */
  PIPELINE_STAGE: 'ERR_PIPELINE_STAGE',
  /** A requested transformation failed */
  TRANSFORM: 'ERR_TRANSFORM',
  /** A Git operation failed */
  GIT: 'ERR_GIT',
  /** A profile was found but could not be read or was malformed */
  PROFILE_INVALID: 'ERR_PROFILE_INVALID',
  /** The instructions block could not be loaded */
  INSTRUCTIONS: 'ERR_INSTRUCTIONS',
  /** A command could not be carried out */
  COMMAND_FAILED: 'ERR_COMMAND_FAILED',
  /** Budget enforcement itself failed; the budget could not be applied */
  BUDGET_ENFORCEMENT: 'ERR_BUDGET_ENFORCEMENT',
  /** The packaged configuration schema is missing or will not compile */
  CONFIG_SCHEMA_UNAVAILABLE: 'ERR_CONFIG_SCHEMA_UNAVAILABLE',
  /** The output could not be written to its destination */
  OUTPUT_WRITE: 'ERR_OUTPUT_WRITE',
  /** A value failed validation and has no more specific code */
  VALIDATION: 'ERR_VALIDATION',
});

/**
 * Base error class for CopyTree
 */
class CopyTreeError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', details = {}) {
    super(message);
    this.name = 'CopyTreeError';
    this.code = code;

    // `cause` is lifted out of `details` onto the error itself, where the
    // language already defines what it means. Left in `details` it travels
    // through `toJSON()` into whatever a caller logs, carrying another error's
    // stack with it.
    const { cause, ...safeDetails } = details || {};
    if (cause !== undefined) this.cause = cause;
    this.details = safeDetails;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * The serialization a caller gets by default.
   *
   * No stack. `toJSON()` is what a logging integration, a `--log-format json`
   * consumer and `JSON.stringify(error)` all reach for, and a stack trace names
   * absolute paths on the machine that ran the command. It is diagnostic
   * information, not part of the error contract, so it has to be asked for by
   * name — see {@link toDebugJSON}.
   *
   * @returns {Object} Safe, structured error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  /**
   * The full serialization, including the stack and the underlying cause.
   *
   * For a debug log the operator has opted into. Never emitted by the default
   * error path.
   *
   * @returns {Object} Diagnostic error
   */
  toDebugJSON() {
    return {
      ...this.toJSON(),
      stack: this.stack,
      ...(this.cause ? { cause: String(this.cause?.stack || this.cause) } : {}),
    };
  }
}

/**
 * Command execution error
 */
class CommandError extends CopyTreeError {
  constructor(message, command, details = {}) {
    super(message, details.code || ERROR_CODES.COMMAND_FAILED, { command, ...details });
    this.name = 'CommandError';
    this.command = command;
  }
}

/**
 * File system error
 */
class FileSystemError extends CopyTreeError {
  constructor(message, path, operation, details = {}) {
    super(message, details.code || ERROR_CODES.FILESYSTEM, { path, operation, ...details });
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
    super(message, details.code || ERROR_CODES.CONFIG_INVALID, { configKey, ...details });
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }
}

/**
 * Exit codes, as a stable contract.
 *
 * A caller scripting CopyTree needs to distinguish "you asked for something
 * impossible" from "the disk went away" from "the check you requested failed".
 * One non-zero code for all three forces them to parse messages.
 *
 * @readonly
 * @enum {number}
 */
const EXIT_CODES = Object.freeze({
  /** Success, including a valid empty selection unless policy says otherwise */
  SUCCESS: 0,
  /** Operational failure: I/O, formatting, Git, converters, clipboard under --strict */
  OPERATIONAL: 1,
  /** Usage or configuration error: invalid option, conflict, missing path, bad profile */
  USAGE: 2,
  /** A requested policy check failed */
  POLICY: 3,
  /** Cancelled by SIGINT */
  CANCELLED: 130,
});

/** Error codes that mean "the command line or the configuration was wrong". */
const USAGE_ERROR_CODES = new Set([
  ERROR_CODES.INVALID_OPTION,
  ERROR_CODES.INVALID_FORMAT,
  ERROR_CODES.DESTINATION_CONFLICT,
  ERROR_CODES.OPTION_CONFLICT,
  ERROR_CODES.OPTION_REQUIRES,
  ERROR_CODES.DEPRECATED_OPTION,
  ERROR_CODES.PROFILE_NOT_FOUND,
  ERROR_CODES.PATH_NOT_FOUND,
  ERROR_CODES.NOT_A_DIRECTORY,
  ERROR_CODES.SCOPE_OUTSIDE_ROOT,
  ERROR_CODES.CONFIG_INVALID,
  ERROR_CODES.CONFIG_SCHEMA_UNAVAILABLE,
  ERROR_CODES.IGNORE_INVALID,
  ERROR_CODES.PROFILE_INVALID,
  ERROR_CODES.VALIDATION,
]);

/**
 * The process exit code an error should produce.
 *
 * @param {Error} error - The error being reported
 * @returns {number} One of {@link EXIT_CODES}
 */
function exitCodeFor(error) {
  const code = error?.code;
  if (isAbortError(error)) return EXIT_CODES.CANCELLED;
  // The secrets guard only throws when the caller asked it to (`--secrets
  // fail`), so a detection is a policy check reporting back, not a machine
  // failure. It keeps its own typed code for the SDK; only the exit code is
  // shared with the other `--fail-*` checks.
  if (code === ERROR_CODES.POLICY_FAILURE || code === ERROR_CODES.SECRETS_DETECTED) {
    return EXIT_CODES.POLICY;
  }
  if (USAGE_ERROR_CODES.has(code)) return EXIT_CODES.USAGE;
  return EXIT_CODES.OPERATIONAL;
}

/**
 * A policy check the caller asked for, and which did not pass.
 *
 * Distinct from an operational failure on purpose: nothing went wrong with the
 * machine. `--fail-empty` on an empty repository is CopyTree doing exactly what
 * it was told, and exit code 3 says so.
 */
class PolicyError extends CopyTreeError {
  constructor(message, policy, details = {}) {
    super(message, ERROR_CODES.POLICY_FAILURE, { policy, ...details });
    this.name = 'PolicyError';
    this.policy = policy;
  }
}

/**
 * Validation error
 *
 * Accepts an explicit `details.code` so callers can raise a specific
 * {@link ERROR_CODES} value while keeping the `ValidationError` name.
 */
class ValidationError extends CopyTreeError {
  constructor(message, field, value, details = {}) {
    super(message, details.code || ERROR_CODES.VALIDATION, { field, value, ...details });
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
    super(message, details.code || ERROR_CODES.PIPELINE_STAGE, { stage, ...details });
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

/**
 * Transform error
 */
class TransformError extends CopyTreeError {
  constructor(message, transformer, file, details = {}) {
    super(message, details.code || ERROR_CODES.TRANSFORM, { transformer, file, ...details });
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
    super(message, details.code || ERROR_CODES.GIT, { operation, ...details });
    this.name = 'GitError';
    this.operation = operation;
  }
}

/**
 * Profile error
 */
class ProfileError extends CopyTreeError {
  constructor(message, profile, details = {}) {
    super(message, details.code || ERROR_CODES.PROFILE_INVALID, { profile, ...details });
    this.name = 'ProfileError';
    this.profile = profile;
  }
}

/**
 * Instructions error
 */
class InstructionsError extends CopyTreeError {
  constructor(message, instructionsName, details = {}) {
    super(message, details.code || ERROR_CODES.INSTRUCTIONS, { instructionsName, ...details });
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
 * Render a list of accepted values as an English phrase.
 *
 * @param {string[]} values - Accepted values
 * @returns {string} e.g. `text, json or ndjson`
 */

/**
 * The first non-empty line of a message.
 *
 * @param {string} message - Possibly multi-line text
 * @returns {string|null} First line, or null when there is none
 */

/**
 * Turn an error into something a person can act on.
 *
 * Built from `error.code`, never from matching the message text: the codes are
 * the stable contract and the messages are not. A good error answers three
 * questions — what happened, which value caused it, and what to do next — and
 * the third is the one the previous `Error: … / Code: …` pair never answered.
 *
 * @param {Error} error - The error to describe
 * @param {Object} [context] - Extra facts worth naming
 * @param {string} [context.basePath] - Project root, for scope errors
 * @returns {{status: string, title: string, subject: string|null, suggestion: string|null,
 *   code: string, details: Object}} A renderable description
 */
function listPhrase(values) {
  const list = [...values];
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} or ${list.at(-1)}`;
}

function firstLine(message) {
  const line = String(message || '')
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? null;
}

function describeError(error, context = {}) {
  const code = error?.code || 'UNKNOWN_ERROR';
  const details = error?.details || {};
  const describe = (title, subject, suggestion) => ({
    status: 'error',
    title,
    subject: subject ?? null,
    suggestion: suggestion ?? null,
    code,
    details,
  });

  switch (code) {
    case ERROR_CODES.PATH_NOT_FOUND:
      return describe(
        'Path not found',
        details.path || error.path || null,
        'Check the path or run copytree from the project root',
      );

    case ERROR_CODES.NOT_A_DIRECTORY:
      return describe(
        'Not a directory',
        details.path || error.path || null,
        'Point copytree at a directory, or use --scope for a single file',
      );

    case ERROR_CODES.SCOPE_OUTSIDE_ROOT:
      return describe(
        'Scope is outside the project',
        error.scopePath || details.scopePath || null,
        context.basePath
          ? `Choose a path inside ${context.basePath}`
          : 'Choose a path inside the project',
      );

    case ERROR_CODES.SYMLINK_OUTSIDE_ROOT:
      return describe(
        'Symlink points outside the project',
        details.path || null,
        'Exclude the symlink, or re-run with --follow-symlinks off',
      );

    case ERROR_CODES.INVALID_OPTION:
      // The message is already the problem statement — "Invalid --size-gate
      // value 'large'" — so it is the title, not the remediation. Errors that
      // know a concrete next step attach it as `details.suggestion`.
      return describe(error.message, null, details.suggestion || null);

    case ERROR_CODES.INVALID_FORMAT:
      // The accepted set comes from the option that rejected the value, not
      // from a list written here: `--format` on `plan` accepts a different set
      // from `--format` on `copy`.
      return describe(
        'Unknown format',
        details.value || details.format || null,
        details.accepted
          ? `Choose ${listPhrase(details.accepted)}`
          : details.suggestion || 'Choose xml, markdown, json, ndjson, sarif or tree',
      );

    case ERROR_CODES.CONFIG_INVALID:
      return describe(
        'CopyTree configuration is invalid',
        details.configKey || null,
        'Run copytree config:validate for details',
      );

    case ERROR_CODES.SECRETS_DETECTED: {
      const count = error.secretsCount || 0;
      return describe(
        `Output not created — ${count} possible ${count === 1 ? 'secret' : 'secrets'} found`,
        null,
        'Write a safe report with --secrets-report report.json',
      );
    }

    case ERROR_CODES.NO_FILES_MATCHED:
      return describe(
        'No files matched',
        null,
        'Check --scope, --include and ignore rules; run copytree plan . --explain for details',
      );

    case ERROR_CODES.DESTINATION_CONFLICT:
      // The message already names both offending flags, so repeating them as
      // the subject would print the same fact twice.
      return describe(
        error.message,
        null,
        details.suggestion || 'Use exactly one of --reference, --clipboard, --stdout or --output',
      );

    case ERROR_CODES.OPTION_CONFLICT:
    case ERROR_CODES.OPTION_REQUIRES:
      return describe(error.message, details.value ?? null, details.suggestion || null);

    case ERROR_CODES.DEPRECATED_OPTION:
      // The message already names the option, so repeating it as the subject
      // would print the same fact twice.
      return describe(error.message, null, details.suggestion || null);

    case ERROR_CODES.PROFILE_NOT_FOUND:
      return describe(
        `Profile not found: ${details.profile ?? details.value ?? ''}`.trim(),
        details.searchPath || null,
        "Run 'copytree inspect . --view profile' to list available profiles",
      );

    case ERROR_CODES.IGNORE_INVALID:
      return describe(error.message, details.path || null, details.suggestion || null);

    case ERROR_CODES.POLICY_FAILURE:
      return describe(error.message, error.policy || null, details.suggestion || null);

    case ERROR_CODES.ABORTED:
      return describe('Cancelled', null, null);

    case ERROR_CODES.CONFIG_SCHEMA_UNAVAILABLE:
      return describe(
        'The packaged configuration schema could not be loaded',
        details.schemaPath || null,
        'Reinstall copytree; the package appears to be incomplete',
      );

    case ERROR_CODES.PERMISSION_DENIED:
      return describe(
        'Permission denied',
        error.path || details.path || null,
        'Check the file permissions, or exclude the path',
      );

    case ERROR_CODES.OUTPUT_WRITE:
      return describe(
        'Could not write the output file',
        error.path || details.path || null,
        details.errno === 'ENOENT'
          ? 'Check that the destination directory exists'
          : details.errno === 'EACCES' || details.errno === 'EPERM'
            ? 'Check the destination permissions, or choose another path'
            : firstLine(error.message),
      );

    case ERROR_CODES.FILESYSTEM: {
      const permission = /EACCES|EPERM|permission/i.test(error.message || '');
      return describe(
        error.operation ? `Could not ${error.operation}` : 'Filesystem error',
        error.path || details.path || null,
        permission
          ? 'Permission denied; check the file permissions or exclude the path'
          : error.message,
      );
    }

    case ERROR_CODES.GIT:
      // Git's stderr carries an advice block, and on some machines a toolchain
      // warning above it. The first line is the failure; the rest is noise in a
      // status line, and is available under --debug.
      return describe(
        `Git selection failed: ${error.operation ?? 'git'}`,
        firstLine(error.message),
        'Check the ref exists and that this directory is a Git repository',
      );

    case ERROR_CODES.PROFILE_INVALID:
      // The message already names the profile and what went wrong with it, so
      // it is the problem statement; only the remediation needs adding.
      return describe(
        error.message,
        null,
        'Check the profile name, or run without -p to use auto-discovery',
      );

    default:
      return describe(
        'CopyTree could not complete the operation',
        error?.message || null,
        'Run again with --verbose for diagnostic details',
      );
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
  // Registry values, not the bare `VALIDATION_ERROR`-style strings these error
  // classes used to carry. Left unmigrated, `categorizeError()` would answer
  // `unknown` for a validation or configuration failure — the two most
  // obviously permanent errors there are — and a caller branching on that
  // answer would retry them.
  ERROR_CODES.PERMISSION_DENIED,
  ERROR_CODES.VALIDATION,
  ERROR_CODES.CONFIG_INVALID,
  ERROR_CODES.CONFIG_SCHEMA_UNAVAILABLE,
  ERROR_CODES.INVALID_OPTION,
  ERROR_CODES.PROFILE_NOT_FOUND,
  ERROR_CODES.PROFILE_INVALID,
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
  PolicyError,
  ERROR_CODES,
  EXIT_CODES,
  exitCodeFor,
  createAbortError,
  isAbortError,
  describeError,
  handleError,
};
