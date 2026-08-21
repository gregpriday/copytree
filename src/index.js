/**
 * The CopyTree public API.
 *
 * Everything exported here is covered by semantic versioning from 1.0. That is
 * the reason this list is short.
 *
 * The root used to export 47 values, including `Pipeline`, `Stage`,
 * `TransformerRegistry` and `BaseTransformer`. Exporting a class is a promise
 * about its constructor, its methods, its lifecycle, its error behaviour and
 * its configuration injection — and none of those had been specified, let alone
 * frozen. A caller had no way to tell which of the 47 were the API and which
 * were implementation that happened to be reachable.
 *
 * Extension points now live behind an explicit subpath:
 *
 * ```js
 * import { Pipeline, Stage } from 'copytree/experimental';
 * ```
 *
 * That import states what it is. It can also evolve on its own schedule without
 * dragging the core API's compatibility promise along with it.
 *
 * @module copytree
 */

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
export { copy } from './api/copy.js';
export { copyStream } from './api/copyStream.js';
export { scan } from './api/scan.js';
export { format } from './api/format.js';
export { formatStream } from './api/formatStream.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
//
// `ConfigManager` only. The `config()` and `configAsync()` singletons were
// exported and documented as deprecated; they are now internal. A process-wide
// mutable configuration is the opposite of the isolation an embedded library
// has to offer, and keeping it on the public surface through 1.x would have
// meant supporting the thing every other part of this release works to avoid.
export { ConfigManager } from './config/ConfigManager.js';

// ---------------------------------------------------------------------------
// Stable vocabularies
// ---------------------------------------------------------------------------
//
// The values a machine consumer switches on. Each is frozen and versioned.
export { DEGRADATION_CODES } from './pipeline/Stage.js';
export { EXCLUSION_REASONS } from './utils/exclusionReport.js';
export { MANIFEST_OUTCOMES, buildManifest, classifyOutcome } from './utils/manifest.js';
export { OUTPUT_FORMAT_VERSIONS, versionFor } from './utils/outputVersion.js';
export { PIPELINE_STAGES } from './utils/ProgressTracker.js';
export { estimateTokens, estimateOutputChars, CHARS_PER_TOKEN } from './utils/estimate.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
//
// Switch on `error.code`, never on the message.
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
} from './utils/errors.js';

// The common case, by name as well as by default.
export { copy as default } from './api/copy.js';
