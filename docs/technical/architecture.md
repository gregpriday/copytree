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

## PipelineContext Contract

The PipelineContext provides stages with access to shared resources and pipeline state. Every stage receives this context during initialization and can use it throughout its lifecycle.

```typescript
interface PipelineContext {
  logger: Logger;           // Child logger instance for the stage
  options: PipelineOptions; // Pipeline configuration options
  stats: PipelineStats;     // Live pipeline statistics and metrics  
  config: ConfigManager;    // Application configuration access
  pipeline: Pipeline;       // Reference to parent pipeline for event emission
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
  continueOnError: boolean;    // Continue processing after stage failures
  emitProgress: boolean;       // Enable progress event emission
  parallel: boolean;           // Enable parallel stage processing
  maxConcurrency: number;      // Maximum concurrent operations
  // ... additional stage-specific options
}
```

### PipelineStats Shape

```typescript
interface PipelineStats {
  startTime: number | null;           // Pipeline start timestamp
  endTime: number | null;             // Pipeline completion timestamp
  stagesCompleted: number;            // Number of stages completed successfully
  stagesFailed: number;               // Number of stages that failed
  errors: Array<StageError>;          // Collection of stage errors
  perStageTimings: Record<string, number>;    // Timing data per stage
  perStageMetrics: Record<string, StageMetrics>; // Detailed metrics per stage
  totalStageTime: number;             // Total processing time across all stages
  averageStageTime: number;           // Average processing time per stage
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
      outputCount: output.processedFiles?.length 
    });
  }

  async onError(error, input) {
    // Error logging, cleanup, notification
    this.logger.error('Stage processing failed', { 
      error: error.message, 
      inputFiles: input.files?.length 
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
        errorMessage: error.message
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
  input: any;              // Initial pipeline input
  stages: number;          // Total number of stages
  options: PipelineOptions; // Pipeline configuration
}

'pipeline:complete' => {
  result: any;             // Final pipeline output
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
  input: any;              // Input data for this stage
}

'stage:complete' => {
  stage: string;           // Stage name
  index: number;           // Stage position in pipeline
  output: any;             // Stage output data
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
  recoveredResult: any;    // Result returned by error handler
}
```

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
      'TransformError',      // Transformation failures
      'ENOTFOUND',           // Network connectivity issues
      'ETIMEDOUT',           // Request timeouts
      'ECONNRESET',          // Connection resets
    ];
    
    return recoverableTypes.some(type => 
      error.name === type || 
      error.code === type || 
      error.message.includes(type)
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
  inputSize: number;           // Number of input items
  outputSize: number;          // Number of output items
  memoryUsage: {
    before: NodeMemoryUsage;   // Memory before stage execution
    after: NodeMemoryUsage;    // Memory after stage execution
    delta: {                   // Memory usage differences
      rss: number;             // Resident set size delta
      heapUsed: number;        // Used heap delta
      heapTotal: number;       // Total heap delta
    }
  };
  timestamp: number;           // Stage completion timestamp
}
```

### Performance Targets

Based on the project requirements in `CLAUDE.md`:

- **Throughput**: Process 10,000 files in < 30 seconds
- **Memory Usage**: < 500MB for large projects
- **Project Size**: Support projects up to 100MB total size
- **Streaming**: Stream files > 10MB for memory efficiency

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
    
    const promises = input.files.map(file => 
      limit(() => this.processFile(file))
    );
    
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
  
  const stages = config.stages.map(stageConfig => {
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
  metrics.gauge(`pipeline.stage.${data.stage}.memory`, data.memoryUsage.delta.heapUsed);
});

pipeline.on('pipeline:error', (data) => {
  // Alert on pipeline failures
  alerting.error('Pipeline failed', {
    error: data.error.message,
    duration: data.stats.duration,
    completedStages: data.stats.stagesCompleted
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
    
    pipeline.through([
      FileDiscoveryStage,
      ProfileFilterStage,
      TransformStage,
      OutputFormattingStage
    ]);
    
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
      ...options
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
- **Scalable operation** with memory-efficient processing

This architecture supports CopyTree's performance targets while maintaining code clarity and extensibility for future enhancements.

---

**Related Documentation:**
- [ESM/CommonJS Compatibility](./esm-commonjs-compatibility.md) - Module system architecture
- [CLI Reference](../cli/copytree-reference.md) - Command-line interface
- [Profile System](../profiles/profile-overview.md) - File filtering architecture
- [Troubleshooting Guide](../usage/troubleshooting.md) - Common issues and solutions