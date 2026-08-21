/**
 * CopyTree's extension points, which are experimental.
 *
 * ```js
 * import { Pipeline, Stage } from 'copytree/experimental';
 * ```
 *
 * These are lower-level than the package root and are versioned less
 * conservatively: **a minor release may change anything here.** They live
 * behind a separate import so that choosing them is a decision rather than an
 * accident, and so the core API can promise stability without promising it for
 * every class that happens to be reachable from it.
 *
 * A genuinely stable third-party extension contract needs more than exported
 * classes — a lifecycle and error contract, a trait schema, configuration
 * injection, cache-key versioning, cancellation, concurrency guarantees. Until
 * those are specified and tested, this subpath is where the honest version of
 * "you can reach in, and it may move" lives.
 *
 * **Why the name changed.** This was `copytree/advanced` through the release
 * candidates. "Advanced" describes the audience; a package publishing 1.0 makes
 * a SemVer promise about everything it exports, and a subpath whose own
 * documentation says a minor release may break it is not covered by that
 * promise. Naming it `experimental` is the smallest way to make the exception
 * legible from the import statement, which is the only place most people will
 * ever read about it. It appeared in no stable release, so nothing is being
 * broken — only a name corrected before it could set an expectation.
 *
 * @module copytree/experimental
 */

// Pipeline composition
export { default as Pipeline } from './pipeline/Pipeline.js';
export { default as Stage } from './pipeline/Stage.js';

// Transformation
export { default as TransformerRegistry } from './transforms/TransformerRegistry.js';
export { default as BaseTransformer } from './transforms/BaseTransformer.js';

// Progress plumbing
export { ProgressTracker, stageIdFor } from './utils/ProgressTracker.js';

// Selection and classification internals
export { ExclusionReport } from './utils/exclusionReport.js';
export { resolveScope } from './utils/scopeResolver.js';
export { categorizeByExt, detect as detectBinary } from './utils/BinaryDetector.js';

// Serialization internals. One serializer per format, each an async generator
// of chunks; `render()` joins them, `serialize()` yields them.
export { serialize, render, buildDocument, canonicalFormat, FORMATS } from './formatters/index.js';
