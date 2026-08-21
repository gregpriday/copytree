# CopyTree Architecture Guide

## Overview

CopyTree implements a sophisticated event-driven pipeline architecture that processes files through a series of specialized stages. This document details the core contracts, patterns, and mechanisms that enable reliable, high-performance file processing.

**Key Architectural Principles:**

- **Stage-based processing**: Each operation is encapsulated in a distinct stage
- **Event-driven communication**: Stages communicate via events for loose coupling
- **Error recovery**: Robust error handling with automatic recovery mechanisms
- **Performance monitoring**: Built-in metrics and timing for optimization
- **Lifecycle management**: Comprehensive hooks for stage initialization and cleanup

## Core Architecture Components

### Pipeline System

The `Pipeline` class (`src/pipeline/Pipeline.js`) serves as the orchestration engine, managing stage execution, error handling, and event emission. It provides both sequential and parallel processing modes with comprehensive lifecycle management.

### Stage Contracts

All processing stages inherit from the `Stage` base class (`src/pipeline/Stage.js`), which defines the core interface and provides common functionality like logging, progress reporting, and utility methods.

### Stage Order

Every entry point builds the same selection through **one engine**,
`src/selection/selection.js`. `copy`, `plan`, `inspect`, `explain`, `ignore check` and the
programmatic `scan()` call `buildSelectionStages()`; they differ only in what they do afterwards.
A preview whose selection differs from the run it previews is worse than no preview, and one
implementation is the only way to guarantee it cannot happen.

**Selection stages** (built by the shared engine):

| #   | Stage                | Always?                                                       | Responsibility                                                                                 |
| --- | -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `FileDiscoveryStage` | yes                                                           | Layered ignore evaluation, include narrowing, force-inclusion, scope traversal, size gate, exclusion accounting |
| 2   | `GitFilterStage`     | with `--modified` / `--staged` / `--changed` / `--git-status` | Git filtering, and Git status annotation independent of it                                     |
| 3   | `SortFilesStage`     | yes                                                           | Establishes the order budgets will truncate from                                               |
| 4   | `BudgetStage`        | yes                                                           | `maxFiles`, then `maxTotalSize`                                                                |

There is no `AlwaysIncludeStage`. Force-inclusion is layer 11 of the one
exclusion evaluator, applied inside discovery, which is what lets
`.copytreeinclude` override a `.gitignore` rule several directories deeper.
Documenting it as a separate stage described a two-pass design the code
deliberately does not have.

**What each entry point appends after that.** There is no single list: `plan`
never reads content, and a dry `scan()` reads none either, so the stages that
need bytes are absent from both. A table that showed one order for all of them
was wrong for every one of them.

| Stage                                            | `copy`                     | `plan`                | `scan()`              | `scan({ includeContent: false })` |
| ------------------------------------------------ | -------------------------- | --------------------- | --------------------- | --------------------------------- |
| `FileLoadingStage`                               | unless `--no-content`      | never                 | unless disabled       | never                             |
| `TransformStage`                                 | with content               | never                 | with `transform`      | never                             |
| `DeduplicateFilesStage`                          | with `--dedupe`            | never                 | with `dedupe`         | with `dedupe` (a no-op)           |
| `SecretsGuardStage`                              | unless `--secrets off`     | plan mode             | unless disabled       | plan mode                         |
| `CharLimitStage`                                 | with `--max-chars`         | plan mode, with content | with `charLimit`    | plan mode                         |
| `InstructionsStage`                              | unless `--no-instructions` | never                 | never                 | never                             |
| `OutputFormattingStage` / `StreamingOutputStage` | yes                        | never                 | never                 | never                             |

"Plan mode" means the stage applies only what is decidable from `stat()`: the
secrets guard drops secret-prone filenames and files too large to scan, and the
character budget is computed from byte size.

**A plan is exact about paths, and estimated about content.** Byte size equals
character count for ASCII and overstates it for multi-byte text, so a character
budget can stop a plan one file earlier than the copy. `plan --format json`
reports this in `exactness`: `pathSelection` becomes `estimated-from-bytes` as
soon as a character budget is in play, rather than claiming `exact` about a set
it estimated. Deduplication and content-level secret redaction cannot be planned
at all.

There is no second exclusion pass. `ProfileFilterStage` used to re-apply the caller's exclude
patterns through `minimatch` after discovery had already applied them through the Git-ignore
engine, so anchoring, dotfiles, directory rules and negation could mean two different things
depending on which stage looked at a path. Profile and CLI exclusions are now layers in the one
evaluator, placed after every nested ignore file so they still get the last word. `LimitStage` is
gone with `--head`: after a deterministic sort, `--max-files` is the same operation under a name
that says which files survive.

Two ordering constraints are load-bearing:

- **Sort precedes budget.** Budgets truncate from the tail, so "which files survive" is only meaningful once the order is defined. `--sort modified` means "keep the recently-touched files when the budget bites"; that is a promise the pipeline can only keep if sorting has already happened.
- **Dedup follows loading.** Duplicates are decided by content hash, and there is no content before `FileLoadingStage`.
- **Secret scanning follows transformation.** What gets scanned has to be what gets emitted. Scanning first left a gap: a transformer that converts a document to text can surface a credential that was not present in the bytes the scanner saw.

### The exclusion evaluator

One language, one evaluator, one pass. Exclusions are Git-ignore syntax — `.gitignore`,
`.copytreeignore`, profile `exclude`, CLI `--exclude` — and inclusions are globs — profile
`include`, CLI `--include`, `.copytreeinclude`, force-includes. `--scope` values are literal paths,
never globs, so right-click integrations and paths containing brackets stay predictable.

Layers are evaluated in this order, last match winning within the stack:

1. Root containment and hard safety (`.git`, symlink escapes) — never overrideable
2. Literal scope traversal
3. Profile and CLI include selectors (CLI narrows the profile; it does not replace it)
4. Built-in default exclusions (dependencies, caches, media, known junk)
5. The user's global Git ignore
6. `.git/info/exclude`
7. Root and nested `.gitignore`, deeper sources later
8. Root and nested `.copytreeignore`, deeper sources later
9. Profile exclusions
10. CLI `--exclude` rules
11. Force inclusion — `.copytreeinclude`, profile force-includes, then `--force-include`
12. Stat filters and per-file gates
13. Deterministic sort
14. File-count and total-size budgets

Layers 9 and 10 are passed to the walkers as `finalLayers` and evaluated after every per-directory
ignore file, which is what makes them the caller's last word: an `--exclude 'docs/'` that a
`!docs/keep.md` buried three directories down could overturn would be a suggestion, not an
exclusion.

### Decision retention

The exclusion report keeps aggregate counts unconditionally, because they are incremented at a
decision that was already being made. Per-file detail is a policy:

| Mode     | Used by                                        | Keeps                                                                      |
| -------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `counts` | `inspect`, `ignore context`, ordinary `scan()` | Aggregates only                                                            |
| `top`    | `copy`                                         | The largest `topN` exclusions                                              |
| `all`    | `plan --explain`, `explain`                    | Every decision, up to `maxEntries`, with the overflow counted and reported |

A silent cap would read as "that is everything", so `all` reports `truncated` and
`omittedEntries` rather than quietly dropping the tail.

### Fatal versus recoverable stages

Both entry points run with `continueOnError: true`, so a stage that throws is normally logged, skipped, and the run still reports success. That is right for a stage whose absence costs only polish, and wrong for one whose absence changes what gets emitted.

Stages set `this.fatal = true` to opt out of that recovery, and the pipeline
rethrows for them regardless of `continueOnError`.

<!-- fatal-stage-table:start -->

| Stage                    | Fatal       | Because                                                                |
| ------------------------ | ----------- | ---------------------------------------------------------------------- |
| `FileDiscoveryStage`     | yes         | No selection is not an empty selection                                 |
| `GitFilterStage`         | conditional | Fatal for a selector (`--modified`), recoverable for `--git-status`    |
| `SortFilesStage`         | yes         | Budgets truncate from the tail, so an undefined order changes the set  |
| `BudgetStage`            | yes         | It answered a failure by returning every file: `--max-total-size 2MB` could exit 0 having produced 40MB |
| `FileLoadingStage`       | yes         | A document with no content is not the document that was asked for      |
| `TransformStage`         | yes         | Skipping it emits untransformed content as though it were transformed  |
| `DeduplicateFilesStage`  | yes         | Silently keeping duplicates spends a budget the caller was managing    |
| `SecretsGuardStage`      | yes         | Skipping it emits unredacted credentials with a success exit code      |
| `CharLimitStage`         | yes         | `maxChars` is a context-window and cost boundary, not presentation     |
| `InstructionsStage`      | conditional | Fatal for `--instructions <name>`, recoverable for the default block   |
| `OutputFormattingStage`  | yes         | See below                                                              |
| `StreamingOutputStage`   | yes         | As above, for the streaming path                                       |

<!-- fatal-stage-table:end -->

The pattern: a stage is fatal when its absence changes *what gets emitted* while
still looking like success. Two stages split the difference, and both split it
on the same line — whether the caller asked for the thing by name.
`GitFilterStage` is fatal for a *selector*, which would otherwise silently copy
the whole repository, and recoverable for a `--git-status` annotation that
changes nothing about the selection. `InstructionsStage` is fatal for
`--instructions <name>`, because a document missing the instructions the caller
believes are in it is not the document they asked for, and recoverable for the
configured default.

`tests/real/pipeline/stageFatality.test.js` compares this table against the
runtime flags, because the previous version of this paragraph named four fatal
stages when there were eleven, and described `SortFilesStage` and `BudgetStage`
as degrading gracefully after both had been made fatal precisely because
degrading gracefully was the bug.

`OutputFormattingStage` in particular no longer answers a formatting failure by emitting a different format. A caller who asked for XML and received JSON has a parse failure on output that reported success.

### Terminal output belongs to the reporter

No stage writes to a terminal. Stages emit events — `stage:progress` carries
`{ completed, total, item }` alongside its percentage — and a single reporter
(`src/ui/feedback/Reporter.js`) decides whether any of it is drawn, and how.

This is a hard boundary, learned from breaking it. `TransformStage` used to
manage a multi-line display of its own: clearing lines, moving the cursor and
writing filenames straight to `process.stdout`. That collided with the spinner
and with Ink, corrupted `--display` and `--stream` output by sharing their
stream, and silently ignored `--no-color`, `--quiet` and the log level, none of
which it knew about.

The feedback layer is four small modules with no pipeline knowledge:

| Module                    | Responsibility                                            |
| ------------------------- | --------------------------------------------------------- |
| `ui/feedback/glyphs.js`   | The status vocabulary, and what the terminal can render   |
| `ui/feedback/messages.js` | Every user-facing string, and the user-facing phase model |
| `ui/feedback/model.js`    | Structured completion, warning and failure models         |
| `ui/feedback/Reporter.js` | Rendering: TTY, plain, verbose, NDJSON, quiet             |

`ProgressTracker` is the only normalization layer between pipeline events and
the screen: it maps stage class names to stable ids, groups those ids into the
handful of phases a person actually distinguishes, and guarantees progress never
runs backwards.

### Exclusion Accounting

`FileDiscoveryStage` creates an `ExclusionReport` and threads it through the pipeline on `input.exclusionReport`. Any stage that drops a file records it with a stable reason key from `EXCLUSION_REASONS` (see `src/utils/exclusionReport.js`).

Aggregate counts are collected unconditionally: they are incremented at the point of a decision that was already being made, so they cost nothing. Per-file detail — the matched rule, and the ignore file and line it came from — is only retained under `explain: true`, because resolving which individual rule produced a verdict requires compiling rules one at a time.

The report surfaces as `result.stats.excluded`, and via `onSummary` for streaming consumers.

## PipelineContext Contract

The PipelineContext provides stages with access to shared resources and pipeline state. Every stage receives this context during initialization and can use it throughout its lifecycle.

```typescript
interface PipelineContext {
  logger: Logger; // Child logger instance for the stage
  options: PipelineOptions; // Pipeline configuration options
  stats: PipelineStats; // Live pipeline statistics and metrics
  config: ConfigManager; // Application configuration access
  pipeline: Pipeline; // Reference to parent pipeline for event emission
}
```

### Context Usage Examples

```javascript
class MyStage extends Stage {
  async onInit(context) {
    // Access configuration
    this.maxFiles = context.config.get('app.maxFiles', 1000);

    // Use child logger
    context.logger.info('Stage initialized with config', { maxFiles: this.maxFiles });

    // Emit custom events via pipeline
    context.pipeline.emit('stage:custom', { stage: this.name, data: 'init complete' });
  }
}
```

### PipelineOptions Shape

```typescript
interface PipelineOptions {
  continueOnError: boolean; // Continue processing after stage failures
  emitProgress: boolean; // Enable progress event emission
  parallel: boolean; // Enable parallel stage processing
  maxConcurrency: number; // Maximum concurrent operations
  // ... additional stage-specific options
}
```

### PipelineStats Shape

```typescript
interface PipelineStats {
  startTime: number | null; // Pipeline start timestamp
  endTime: number | null; // Pipeline completion timestamp
  stagesCompleted: number; // Number of stages completed successfully
  stagesFailed: number; // Number of stages that failed
  errors: Array<StageError>; // Collection of stage errors
  perStageTimings: Record<string, number>; // Timing data per stage
  perStageMetrics: Record<string, StageMetrics>; // Detailed metrics per stage
  totalStageTime: number; // Total processing time across all stages
  averageStageTime: number; // Average processing time per stage
}
```

## Stage Lifecycle

Stages follow a comprehensive lifecycle with multiple hooks for customization and error handling. The lifecycle ensures proper initialization, execution, and cleanup.

### Execution Order

1. **`onInit(context)`** - Called once during pipeline creation
2. **`beforeRun(input)`** - Called before each `process()` execution
3. **`validate(input)`** - Input validation (if implemented)
4. **`process(input)`** - Main stage processing logic
5. **`afterRun(output)`** - Called after successful `process()` execution
6. **`onError(error, input)`** - Called when `process()` throws an error
7. **`handleError(error, input)`** - Error recovery mechanism

### Lifecycle Hook Implementations

```javascript
class ExampleStage extends Stage {
  async onInit(context) {
    // Initialize resources, warm caches, validate configuration
    this.cache = new Map();
    this.config = context.config.get('myStage', {});
    this.logger = context.logger;

    this.logger.info(`${this.name} initialized with config`, this.config);
  }

  async beforeRun(input) {
    // Pre-processing setup, input preparation
    this.startTime = Date.now();
    this.logger.debug('Starting processing', { fileCount: input.files?.length });
  }

  validate(input) {
    // Input validation - throw ValidationError if invalid
    if (!input || !input.files) {
      throw new ValidationError('Input must contain files array', this.name, input);
    }
    return true;
  }

  async process(input) {
    // Main processing logic
    const results = await this.processFiles(input.files);
    return { ...input, processedFiles: results };
  }

  async afterRun(output) {
    // Post-processing cleanup, metrics recording
    const duration = Date.now() - this.startTime;
    this.logger.info('Processing completed', {
      duration,
      outputCount: output.processedFiles?.length,
    });
  }

  async onError(error, input) {
    // Error logging, cleanup, notification
    this.logger.error('Stage processing failed', {
      error: error.message,
      inputFiles: input.files?.length,
    });

    // Clean up any resources
    this.cache?.clear();
  }

  async handleError(error, input) {
    // Error recovery logic
    if (this._isRecoverableError(error)) {
      this.logger.warn('Attempting error recovery', { error: error.message });

      return {
        ...input,
        files: input.files || [],
        recoveredFromError: true,
        errorMessage: error.message,
      };
    }

    // Not recoverable - rethrow
    throw error;
  }
}
```

### Hook Usage Patterns

**Initialization (`onInit`)**:

- Set up resources (caches, connections, etc.)
- Validate stage configuration
- Prepare shared data structures
- Register event listeners

**Pre-processing (`beforeRun`)**:

- Input preparation and normalization
- Resource allocation for current execution
- Progress tracking initialization
- Temporary state setup

**Post-processing (`afterRun`)**:

- Cleanup temporary resources
- Metrics collection and reporting
- Output validation and logging
- State persistence

**Error Handling (`onError`)**:

- Error logging and categorization
- Resource cleanup and state reset
- Error notification and alerting
- Diagnostic data collection

## Event Schema

The pipeline emits comprehensive events for monitoring, debugging, and integration. All events include timing and contextual information.

### Pipeline Events

```typescript
// Pipeline lifecycle events
'pipeline:start' => {
  inputCount: number;      // Files carried by the initial input
  stages: number;          // Total number of stages
  options: PipelineOptions; // Pipeline configuration
}

'pipeline:complete' => {
  resultCount: number;     // Files carried by the final output
  stats: PipelineStats;    // Complete pipeline statistics
}

'pipeline:error' => {
  error: Error;            // Pipeline-level error
  stats: PipelineStats;    // Statistics at time of failure
}
```

### Stage Events

```typescript
// Stage execution events
'stage:start' => {
  stage: string;           // Stage name
  index: number;           // Stage position in pipeline
  inputCount: number;      // Files carried into this stage
}

'stage:complete' => {
  stage: string;           // Stage name
  index: number;           // Stage position in pipeline
  duration: number;        // Execution time in milliseconds
  inputSize: number;       // Input data size metric
  outputSize: number;      // Output data size metric
  memoryUsage: MemoryUsage; // Memory consumption metrics
  timestamp: number;       // Completion timestamp
}

'stage:error' => {
  stage: string;           // Stage name that failed
  index: number;           // Stage position in pipeline
  error: Error;            // Error that occurred
}

'stage:recover' => {
  stage: string;           // Stage name that recovered
  index: number;           // Stage position in pipeline
  originalError: Error;    // Original error that occurred
  recoveredCount: number;  // Files the error handler returned — not the result
}
```

### Events carry metadata, never payloads

No lifecycle event carries the pipeline input or output. They used to: an
`onEvent` listener saw every file's content from every stage, including content
that had not yet reached the secrets guard, so an embedder that logged events
wrote unredacted credentials to its own logs while CopyTree reported that the
export had been redacted. `scan()` forwards these events verbatim to a caller's
`onEvent`, which is what made it an exposure rather than an inefficiency.

Raw values are available on `stage:debug`, emitted only when something is
listening:

```typescript
'stage:debug' => {
  stage: string;
  index: number;
  phase: 'start' | 'complete';
  input?: any;             // On 'start'
  output?: any;            // On 'complete'
}
```

`stage:debug` is diagnostic, not part of the stable event contract, and is not
forwarded by the SDK.

### Progress and Monitoring Events

```typescript
// Progress tracking events
'stage:progress' => {
  stage: string;           // Stage reporting progress
  progress: number;        // Progress percentage (0-100)
  message?: string;        // Optional progress message
  timestamp: number;       // Progress report timestamp
}

// File processing events (throttled for performance)
'file:batch' => {
  stage: string;           // Stage processing files
  count: number;           // Number of files processed
  lastFile: string;        // Path of most recent file
  action: string;          // Action performed (e.g., 'processed', 'transformed')
  timestamp: number;       // Batch completion timestamp
}

// Stage logging events
'stage:log' => {
  stage: string;           // Stage that logged
  message: string;         // Log message
  level: string;           // Log level (info, warn, error, debug)
  timestamp: number;       // Log timestamp
}
```

### Event Usage Examples

```javascript
// Monitor pipeline progress
pipeline.on('stage:complete', (data) => {
  console.log(`Stage ${data.stage} completed in ${data.duration}ms`);
  console.log(`Memory delta: ${data.memoryUsage.delta.heapUsed} bytes`);
});

// Handle recoverable errors
pipeline.on('stage:recover', (data) => {
  console.log(`Stage ${data.stage} recovered from: ${data.originalError.message}`);
});

// Track file processing
pipeline.on('file:batch', (data) => {
  console.log(`${data.stage}: processed ${data.count} files`);
});
```

## Error Handling Architecture

CopyTree implements a multi-layered error handling system with automatic recovery capabilities.

### Error Flow

1. **Stage Validation** → Process execution → Error recovery
2. **`validate()`** → **`process()`** → **`onError()`** → **`handleError()`**
3. Pipeline continues if recovery succeeds or `continueOnError` is enabled

### Error Types and Recovery

```javascript
// Example error handling implementation
class TransformStage extends Stage {
  async handleError(error, input) {
    // Categorize error for recovery decision
    const isRecoverable = this._isRecoverableError(error);

    if (isRecoverable && input?.files) {
      this.log('Attempting recovery by skipping transformation', 'warn');

      // Return valid result to continue pipeline
      return {
        ...input,
        stats: {
          ...input.stats,
          transformedCount: 0,
          transformErrors: input.files.length,
          recoveredFromError: true,
        },
      };
    }

    // Not recoverable - rethrow for pipeline error handling
    throw error;
  }

  _isRecoverableError(error) {
    const recoverableTypes = [
      'TransformError', // Transformation failures
      'ENOTFOUND', // Network connectivity issues
      'ETIMEDOUT', // Request timeouts
      'ECONNRESET', // Connection resets
    ];

    return recoverableTypes.some(
      (type) => error.name === type || error.code === type || error.message.includes(type),
    );
  }
}
```

### Recovery Patterns

**Graceful Degradation**:

- Return partial results when possible
- Skip problematic items while preserving valid ones
- Maintain pipeline flow with reduced functionality

**Retry Mechanisms**:

- Implement exponential backoff for transient failures
- Retry with different parameters or configurations
- Fail fast after maximum retry attempts

**Resource Recovery**:

- Clean up allocated resources on error
- Reset internal state for subsequent processing
- Release locks and connections properly

## Performance and Metrics System

### Built-in Metrics Collection

The pipeline automatically collects comprehensive performance metrics:

```typescript
interface StageMetrics {
  inputSize: number; // Number of input items
  outputSize: number; // Number of output items
  memoryUsage: {
    before: NodeMemoryUsage; // Memory before stage execution
    after: NodeMemoryUsage; // Memory after stage execution
    delta: {
      // Memory usage differences
      rss: number; // Resident set size delta
      heapUsed: number; // Used heap delta
      heapTotal: number; // Total heap delta
    };
  };
  timestamp: number; // Stage completion timestamp
}
```

### Performance Targets

Based on the project requirements in `CLAUDE.md`:

- **Throughput**: Process 10,000 files in < 30 seconds
- **Memory Usage**: < 500MB for large projects
- **Project Size**: Support projects up to 100MB total size
- **Reads are not chunked**: every file is read whole by `FileLoadingStage`.
  There is no size above which CopyTree switches to a streaming read, and the
  transformer that once claimed to provide one buffered the entire file anyway.
  `--size-gate`, `--max-total-size` and `--max-files` are what bound memory

### Performance Optimization Patterns

**Memory Management**:

```javascript
class MemoryEfficientStage extends Stage {
  async process(input) {
    // Process files in batches to control memory usage
    const batchSize = this.config.get('stage.batchSize', 100);
    const results = [];

    for (let i = 0; i < input.files.length; i += batchSize) {
      const batch = input.files.slice(i, i + batchSize);
      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);

      // Force garbage collection for large batches
      if (global.gc && batch.length > 50) {
        global.gc();
      }
    }

    return { ...input, files: results };
  }
}
```

**Concurrency Control**:

```javascript
class ConcurrentStage extends Stage {
  async process(input) {
    // Use p-limit for controlled concurrency
    const limit = pLimit(this.options.maxConcurrency || 5);

    const promises = input.files.map((file) => limit(() => this.processFile(file)));

    const results = await Promise.all(promises);
    return { ...input, files: results };
  }
}
```

## Stage Implementation Best Practices

### Required Methods

Every stage must implement:

- **`process(input)`**: Main processing logic
- **Constructor**: Initialize stage with options

### Recommended Methods

For robust stages, implement:

- **`validate(input)`**: Input validation
- **`handleError(error, input)`**: Error recovery
- **`onInit(context)`**: Resource initialization

### Validation Patterns

```javascript
validate(input) {
  // Check required fields
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Input must be an object', this.name, input);
  }

  // Validate file array
  if (!Array.isArray(input.files)) {
    throw new ValidationError('Input must contain files array', this.name, input);
  }

  // Check file limit
  const maxFiles = this.config.get('app.maxFiles', 10000);
  if (input.files.length > maxFiles) {
    throw new ValidationError(
      `Too many files: ${input.files.length} > ${maxFiles}`,
      this.name,
      input
    );
  }

  return true;
}
```

### Logging and Progress

```javascript
async process(input) {
  this.log(`Processing ${input.files.length} files`, 'info');
  const startTime = Date.now();

  const results = [];

  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i];

    // Emit progress every 10% or 100 files
    if (i % Math.max(1, Math.floor(input.files.length / 10)) === 0) {
      this.emitProgress((i / input.files.length) * 100, `Processing ${file.path}`);
    }

    // Emit file events (throttled automatically)
    this.emitFileEvent(file.path, 'processing');

    const result = await this.processFile(file);
    results.push(result);
  }

  this.log(`Completed processing in ${this.getElapsedTime(startTime)}`, 'info');
  return { ...input, files: results };
}
```

## Integration Patterns

### Stage Registry

For dynamic stage loading and management:

```javascript
class StageRegistry {
  constructor() {
    this.stages = new Map();
  }

  register(name, stageClass) {
    this.stages.set(name, stageClass);
  }

  create(name, options) {
    const StageClass = this.stages.get(name);
    if (!StageClass) {
      throw new Error(`Unknown stage: ${name}`);
    }
    return new StageClass(options);
  }
}
```

### Pipeline Composition

```javascript
// Compose pipeline from configuration
function createPipeline(config) {
  const pipeline = new Pipeline(config.pipelineOptions);

  const stages = config.stages.map((stageConfig) => {
    const StageClass = stageRegistry.get(stageConfig.name);
    return new StageClass(stageConfig.options);
  });

  return pipeline.through(stages);
}
```

### Event Integration

```javascript
// Integrate with external monitoring systems
pipeline.on('stage:complete', (data) => {
  // Send metrics to monitoring service
  metrics.timing(`pipeline.stage.${data.stage}.duration`, data.duration);
  // `memoryUsage` is null unless memory sampling is on (`measureMemory`, or
  // COPYTREE_PERFORMANCE=true), which it is not by default — so this example
  // threw as written.
  if (data.memoryUsage) {
    metrics.gauge(`pipeline.stage.${data.stage}.memory`, data.memoryUsage.delta.heapUsed);
  }
});

pipeline.on('pipeline:error', (data) => {
  // Alert on pipeline failures
  alerting.error('Pipeline failed', {
    error: data.error.message,
    duration: data.stats.duration,
    completedStages: data.stats.stagesCompleted,
  });
});
```

## Testing Architecture

### Stage Testing Patterns

```javascript
// Example stage test
describe('FileDiscoveryStage', () => {
  let stage;

  beforeEach(() => {
    stage = new FileDiscoveryStage({ basePath: '/test' });
  });

  it('should discover files correctly', async () => {
    const input = { basePath: '/test/fixtures' };
    const result = await stage.process(input);

    expect(result.files).toBeDefined();
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.basePath).toBe('/test/fixtures');
  });

  it('should handle errors gracefully', async () => {
    const input = { basePath: '/nonexistent' };

    if (typeof stage.handleError === 'function') {
      const result = await stage.handleError(new Error('Path not found'), input);
      expect(result).toBeDefined();
    } else {
      await expect(stage.process(input)).rejects.toThrow();
    }
  });
});
```

### Pipeline Integration Tests

```javascript
describe('Pipeline Integration', () => {
  it('should process files through multiple stages', async () => {
    const pipeline = new Pipeline({ continueOnError: false });

    pipeline.through([FileDiscoveryStage, TransformStage, OutputFormattingStage]);

    const result = await pipeline.process({ basePath: testFixturePath });

    expect(result.output).toBeDefined();
    expect(result.outputFormat).toBe('xml');
  });
});
```

## Migration and Versioning

### Stage Interface Evolution

When evolving stage interfaces:

1. **Maintain backward compatibility** in base Stage class
2. **Add optional methods** rather than changing existing signatures
3. **Use feature detection** rather than version checking
4. **Provide migration guides** for breaking changes

### Configuration Evolution

```javascript
// Handle configuration schema changes
class ModernStage extends Stage {
  constructor(options = {}) {
    super(options);

    // Handle legacy configuration format
    if (options.oldConfigKey) {
      this.config = this._migrateLegacyConfig(options);
    } else {
      this.config = options;
    }
  }

  _migrateLegacyConfig(options) {
    return {
      newConfigKey: options.oldConfigKey,
      ...options,
    };
  }
}
```

## Conclusion

CopyTree's architecture provides a robust, extensible foundation for file processing workflows. The combination of lifecycle hooks, comprehensive error handling, and event-driven communication enables:

- **Reliable processing** with automatic error recovery
- **Performance monitoring** with detailed metrics collection
- **Flexible composition** through stage-based architecture
- **Easy debugging** with comprehensive event emission
- **Scalable operation** within budgets the caller sets

This architecture supports CopyTree's performance targets while maintaining code clarity and extensibility for future enhancements.

---

**Related Documentation:**

- [CLI Reference](../cli/copytree-reference.md) - Command-line interface
- [Troubleshooting Guide](../usage/troubleshooting.md) - Common issues and solutions
