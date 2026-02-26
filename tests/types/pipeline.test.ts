/**
 * Type Tests for Pipeline Classes
 *
 * These tests verify that Pipeline and Stage TypeScript type definitions are correct.
 * They don't run at runtime - they're checked by `tsc --noEmit`.
 *
 * If this file compiles without errors, the types are correct.
 */

import {
  Pipeline,
  Stage,
  PipelineOptions,
  PipelineContext,
  PipelineStats,
  PipelineEvent,
  PipelineEventType,
  PipelineEventData,
  StageOptions,
  StageMetrics,
  StageError,
  MemoryUsage,
  StageStartEvent,
  StageCompleteEvent,
  StageErrorEvent,
  StageRecoverEvent,
  StageProgressEvent,
  FileBatchEvent,
  StageLogEvent,
  PipelineStartEvent,
  PipelineCompleteEvent,
  PipelineErrorEvent,
  ConfigManager,
  Logger,
  ProgressCallback,
  FileResult,
} from 'copytree';

// ============================================================================
// Pipeline Statistics Tests
// ============================================================================

function testPipelineStats() {
  const stats: PipelineStats = {
    startTime: Date.now(),
    endTime: Date.now() + 1000,
    stagesCompleted: 5,
    stagesFailed: 1,
    errors: [
      {
        stage: 'TransformStage',
        error: 'Transform failed',
        stack: 'Error: Transform failed\n  at ...',
      },
    ],
    perStageTimings: {
      FileDiscoveryStage: 100,
      FileLoadingStage: 200,
    },
    perStageMetrics: {
      FileDiscoveryStage: {
        inputSize: 0,
        outputSize: 100,
        memoryUsage: {
          before: { rss: 1000, heapUsed: 500, heapTotal: 1000 } as NodeJS.MemoryUsage,
          after: { rss: 1100, heapUsed: 600, heapTotal: 1100 } as NodeJS.MemoryUsage,
          delta: { rss: 100, heapUsed: 100, heapTotal: 100 },
        },
        timestamp: Date.now(),
      },
    },
    totalStageTime: 300,
    averageStageTime: 50,
    duration: 1000,
    successRate: 0.83,
  };

  // Test StageError shape
  const error: StageError = {
    stage: 'TestStage',
    error: 'Something went wrong',
  };

  // Test StageMetrics shape
  const metrics: StageMetrics = {
    inputSize: 100,
    outputSize: 95,
    memoryUsage: {
      before: { rss: 1000, heapUsed: 500, heapTotal: 1000 } as NodeJS.MemoryUsage,
      after: { rss: 1100, heapUsed: 600, heapTotal: 1100 } as NodeJS.MemoryUsage,
      delta: { rss: 100, heapUsed: 100, heapTotal: 100 },
    },
    timestamp: Date.now(),
  };

  // Test MemoryUsage shape
  const memUsage: MemoryUsage = {
    before: { rss: 1000, heapUsed: 500, heapTotal: 1000 } as NodeJS.MemoryUsage,
    after: { rss: 1100, heapUsed: 600, heapTotal: 1100 } as NodeJS.MemoryUsage,
    delta: { rss: 100, heapUsed: 100, heapTotal: 100 },
  };
}

// ============================================================================
// Pipeline Event Tests
// ============================================================================

function testPipelineEvents() {
  // Test all event types
  const eventTypes: PipelineEventType[] = [
    'pipeline:start',
    'pipeline:complete',
    'pipeline:error',
    'stage:start',
    'stage:complete',
    'stage:error',
    'stage:recover',
    'stage:progress',
    'file:batch',
    'stage:log',
  ];

  // Test StageStartEvent
  const stageStart: StageStartEvent = {
    stage: 'FileDiscoveryStage',
    index: 0,
    input: { basePath: './src' },
  };

  // Test StageCompleteEvent
  const stageComplete: StageCompleteEvent = {
    stage: 'FileDiscoveryStage',
    index: 0,
    output: { files: [] },
    duration: 100,
    inputSize: 0,
    outputSize: 100,
    memoryUsage: {
      before: { rss: 1000, heapUsed: 500, heapTotal: 1000 } as NodeJS.MemoryUsage,
      after: { rss: 1100, heapUsed: 600, heapTotal: 1100 } as NodeJS.MemoryUsage,
      delta: { rss: 100, heapUsed: 100, heapTotal: 100 },
    },
    timestamp: Date.now(),
  };

  // Test StageErrorEvent
  const stageError: StageErrorEvent = {
    stage: 'TransformStage',
    index: 2,
    error: new Error('Transform failed'),
  };

  // Test StageRecoverEvent
  const stageRecover: StageRecoverEvent = {
    stage: 'TransformStage',
    index: 2,
    originalError: new Error('Transform failed'),
    recoveredResult: { files: [], recoveredFromError: true },
  };

  // Test StageProgressEvent
  const stageProgress: StageProgressEvent = {
    stage: 'FileLoadingStage',
    progress: 50,
    message: 'Loading files...',
    timestamp: Date.now(),
  };

  // Test FileBatchEvent
  const fileBatch: FileBatchEvent = {
    stage: 'FileLoadingStage',
    count: 20,
    lastFile: 'src/index.ts',
    action: 'loaded',
    timestamp: Date.now(),
  };

  // Test StageLogEvent
  const stageLog: StageLogEvent = {
    stage: 'TransformStage',
    message: 'Processing file...',
    level: 'info',
    timestamp: Date.now(),
  };

  // Test PipelineStartEvent
  const pipelineStart: PipelineStartEvent = {
    input: { basePath: './src' },
    stages: 5,
    options: { continueOnError: true },
  };

  // Test PipelineCompleteEvent
  const pipelineComplete: PipelineCompleteEvent = {
    result: { output: '<xml/>' },
    stats: {
      startTime: Date.now(),
      endTime: Date.now(),
      stagesCompleted: 5,
      stagesFailed: 0,
      errors: [],
      perStageTimings: {},
      perStageMetrics: {},
      totalStageTime: 500,
      averageStageTime: 100,
    },
  };

  // Test PipelineErrorEvent
  const pipelineError: PipelineErrorEvent = {
    error: new Error('Pipeline failed'),
    stats: {
      startTime: Date.now(),
      endTime: Date.now(),
      stagesCompleted: 2,
      stagesFailed: 1,
      errors: [{ stage: 'TestStage', error: 'Failed' }],
      perStageTimings: {},
      perStageMetrics: {},
      totalStageTime: 200,
      averageStageTime: 100,
    },
  };

  // Test PipelineEvent wrapper
  const event: PipelineEvent = {
    type: 'stage:complete',
    data: stageComplete,
  };

  // Test PipelineEventData union type
  const eventData: PipelineEventData = stageComplete;
}

// ============================================================================
// Pipeline Class Tests
// ============================================================================

async function testPipelineClass() {
  // Create pipeline with options
  const options: PipelineOptions = {
    continueOnError: true,
    emitProgress: true,
    parallel: false,
    maxConcurrency: 5,
    onProgress: (progress) => console.log(progress.percent),
  };
  const pipeline = new Pipeline(options);

  // Create pipeline with config
  const config = await ConfigManager.create();
  const pipelineWithConfig = new Pipeline({ config });

  // Test through() method
  class CustomStage extends Stage {
    async process(input: unknown): Promise<unknown> {
      return input;
    }
  }
  pipeline.through(new CustomStage());
  pipeline.through([new CustomStage(), new CustomStage()]);

  // Test fluent chaining
  const chainedPipeline = new Pipeline()
    .through(new CustomStage())
    .through([new CustomStage()]);

  // Test process() method with generics
  interface Input {
    basePath: string;
    files: FileResult[];
  }
  interface Output {
    output: string;
    files: FileResult[];
  }
  const result = await pipeline.process<Input, Output>({ basePath: './src', files: [] });
  const output: string = result.output;

  // Test getStats() method
  const stats: PipelineStats = pipeline.getStats();

  // Test typed event listeners
  pipeline.on('pipeline:start', (data: PipelineStartEvent) => {
    console.log('Pipeline started with', data.stages, 'stages');
  });

  pipeline.on('pipeline:complete', (data: PipelineCompleteEvent) => {
    console.log('Pipeline completed in', data.stats.duration, 'ms');
  });

  pipeline.on('pipeline:error', (data: PipelineErrorEvent) => {
    console.error('Pipeline failed:', data.error.message);
  });

  pipeline.on('stage:start', (data: StageStartEvent) => {
    console.log('Stage', data.stage, 'starting');
  });

  pipeline.on('stage:complete', (data: StageCompleteEvent) => {
    console.log('Stage', data.stage, 'completed in', data.duration, 'ms');
  });

  pipeline.on('stage:error', (data: StageErrorEvent) => {
    console.error('Stage', data.stage, 'failed:', data.error.message);
  });

  pipeline.on('stage:recover', (data: StageRecoverEvent) => {
    console.log('Stage', data.stage, 'recovered from:', data.originalError.message);
  });

  pipeline.on('stage:progress', (data: StageProgressEvent) => {
    console.log('Stage', data.stage, 'progress:', data.progress, '%');
  });

  pipeline.on('file:batch', (data: FileBatchEvent) => {
    console.log('Stage', data.stage, 'processed', data.count, 'files');
  });

  pipeline.on('stage:log', (data: StageLogEvent) => {
    console.log(`[${data.stage}] ${data.level}: ${data.message}`);
  });

  // Test generic event listener
  pipeline.on('custom:event', (...args: unknown[]) => {
    console.log('Custom event:', args);
  });

  // Test once() method
  pipeline.once('pipeline:complete', (data: PipelineCompleteEvent) => {
    console.log('First completion');
  });

  // Test emit() method
  const hadListeners: boolean = pipeline.emit('custom:event', { data: 'test' });

  // Test removeListener() method
  const listener = (data: PipelineCompleteEvent) => console.log(data);
  pipeline.on('pipeline:complete', listener);
  pipeline.removeListener('pipeline:complete', listener);

  // Test static create() method
  const staticPipeline = Pipeline.create({ continueOnError: true });

  // Test send() fluent interface
  const sendResult = await pipeline
    .send({ basePath: './src', files: [] })
    .through([new CustomStage()])
    .thenReturn();

  const sendResultWithCallback = await pipeline
    .send({ basePath: './src', files: [] })
    .through([new CustomStage()])
    .then((result) => result);
}

// ============================================================================
// Stage Class Tests
// ============================================================================

async function testStageClass() {
  // Create a custom stage
  class MyStage extends Stage {
    async process(input: unknown): Promise<unknown> {
      return { ...input as object, processed: true };
    }

    validate(input: unknown): boolean {
      return input !== null && typeof input === 'object';
    }

    async handleError(error: Error, input: unknown): Promise<unknown> {
      return { recoveredFromError: true };
    }

    async onInit(context: PipelineContext): Promise<void> {
      // Access context properties
      const logger: Logger = context.logger;
      const options: PipelineOptions = context.options;
      const stats: PipelineStats = context.stats;
      const config: ConfigManager = context.config;
      const pipeline: Pipeline = context.pipeline;

      logger.info('Stage initialized');
    }

    async beforeRun(input: unknown): Promise<void> {
      this.log('Before processing', 'debug');
    }

    async afterRun(output: unknown): Promise<void> {
      this.log('After processing', 'info');
    }

    async onError(error: Error, input: unknown): Promise<void> {
      this.log(`Error: ${error.message}`, 'error');
    }
  }

  // Test stage with options
  const stageOptions: StageOptions = {
    pipeline: new Pipeline(),
    customOption: true,
  };
  const stage = new MyStage(stageOptions);

  // Access stage properties
  const stageName: string = stage.name;

  // Test protected methods through subclass
  class TestStage extends Stage {
    async process(input: unknown): Promise<unknown> {
      // Test log method
      this.log('Processing...', 'info');
      this.log('Warning!', 'warn');
      this.log('Error!', 'error');
      this.log('Debug info', 'debug');

      // Test emitProgress
      this.emitProgress(50, 'Halfway done');

      // Test emitFileEvent
      this.emitFileEvent('src/index.ts', 'processed');

      // Test getElapsedTime
      const startTime = Date.now();
      const elapsed: string = this.getElapsedTime(startTime);

      // Test formatBytes
      const formatted: string = this.formatBytes(1024);

      return input;
    }
  }
}

// ============================================================================
// PipelineContext Tests
// ============================================================================

function testPipelineContext() {
  // Create a mock context
  const mockLogger: Logger = {
    logDebug: (msg: string, ...args: any[]) => {},
    info: (msg: string, ...args: any[]) => {},
    warn: (msg: string, ...args: any[]) => {},
    error: (msg: string, ...args: any[]) => {},
    success: (msg: string, ...args: any[]) => {},
    child: (name: string) => mockLogger,
    formatBytes: (bytes: number) => `${bytes} B`,
    formatDuration: (ms: number) => `${ms}ms`,
  };

  const context: PipelineContext = {
    logger: mockLogger,
    options: {
      continueOnError: true,
      emitProgress: true,
    },
    stats: {
      startTime: null,
      endTime: null,
      stagesCompleted: 0,
      stagesFailed: 0,
      errors: [],
      perStageTimings: {},
      perStageMetrics: {},
      totalStageTime: 0,
      averageStageTime: 0,
    },
    config: {} as ConfigManager,
    pipeline: new Pipeline(),
  };

  // Access context properties
  context.logger.info('Test message');
  const continueOnError: boolean | undefined = context.options.continueOnError;
  const stagesCompleted: number = context.stats.stagesCompleted;
}

// ============================================================================
// Logger Interface Tests
// ============================================================================

function testLoggerInterface() {
  const logger: Logger = {
    logDebug: (msg: string, ...args: any[]) => console.debug(msg, ...args),
    info: (msg: string, ...args: any[]) => console.info(msg, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(msg, ...args),
    error: (msg: string, ...args: any[]) => console.error(msg, ...args),
    success: (msg: string, ...args: any[]) => console.log('✓', msg, ...args),
    child: (name: string) => logger,
    formatBytes: (bytes: number) => {
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    },
    formatDuration: (ms: number) => `${ms}ms`,
  };

  // Test all logger methods
  logger.logDebug('Debug message');
  logger.info('Info message');
  logger.warn('Warning message');
  logger.error('Error message');
  logger.success('Success message');

  // Test child logger
  const childLogger: Logger = logger.child('MyStage');
  childLogger.info('Child logger message');

  // Test formatting methods
  const formattedBytes: string = logger.formatBytes(1024 * 1024);
  const formattedDuration: string = logger.formatDuration(1500);
}
