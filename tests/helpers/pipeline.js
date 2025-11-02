/**
 * Pipeline testing helpers
 *
 * Utilities for setting up and testing the pipeline system.
 */

import Pipeline from '../../src/pipeline/Pipeline.js';
import FileDiscoveryStage from '../../src/pipeline/stages/FileDiscoveryStage.js';
import FileLoadingStage from '../../src/pipeline/stages/FileLoadingStage.js';
import TransformStage from '../../src/pipeline/stages/TransformStage.js';
import OutputFormattingStage from '../../src/pipeline/stages/OutputFormattingStage.js';
import EventEmitter from 'events';

/**
 * Create a minimal pipeline for testing
 */
export function createTestPipeline(stages = null, options = {}) {
  const pipeline = new Pipeline(options);

  if (stages === null) {
    // Default minimal stages
    stages = [new FileDiscoveryStage(), new FileLoadingStage(), new OutputFormattingStage()];
  }

  // Use .through() to add stages (Pipeline API)
  pipeline.through(stages);

  return pipeline;
}

/**
 * Create a full pipeline with all stages
 */
export async function createFullPipeline(options = {}) {
  const { ConfigManager } = await import('../../src/config/ConfigManager.js');
  const config = await ConfigManager.getInstance();

  const { ProfileLoader } = await import('../../src/profiles/ProfileLoader.js');
  const profileLoader = new ProfileLoader(config);

  const profile = options.profile || (await profileLoader.load('default'));

  // Import all stages
  const GitFilterStage = (await import('../../src/pipeline/stages/GitFilterStage.js')).default;
  const ProfileFilterStage = (await import('../../src/pipeline/stages/ProfileFilterStage.js'))
    .default;
  const AlwaysIncludeStage = (await import('../../src/pipeline/stages/AlwaysIncludeStage.js'))
    .default;
  const ExternalSourceStage = (await import('../../src/pipeline/stages/ExternalSourceStage.js'))
    .default;
  const LimitStage = (await import('../../src/pipeline/stages/LimitStage.js')).default;
  const CharLimitStage = (await import('../../src/pipeline/stages/CharLimitStage.js')).default;
  const InstructionsStage = (await import('../../src/pipeline/stages/InstructionsStage.js'))
    .default;
  const NPMStage = (await import('../../src/pipeline/stages/NPMStage.js')).default;
  const ComposerStage = (await import('../../src/pipeline/stages/ComposerStage.js')).default;
  const DeduplicateFilesStage = (await import('../../src/pipeline/stages/DeduplicateFilesStage.js'))
    .default;
  const SortFilesStage = (await import('../../src/pipeline/stages/SortFilesStage.js')).default;
  const StreamingOutputStage = (await import('../../src/pipeline/stages/StreamingOutputStage.js'))
    .default;

  const pipeline = new Pipeline();

  // Add all 16 stages in order using .through()
  pipeline.through([
    new FileDiscoveryStage(),
    new GitFilterStage(),
    new ProfileFilterStage(),
    new AlwaysIncludeStage(),
    new ExternalSourceStage(),
    new LimitStage(),
    new FileLoadingStage(),
    new TransformStage(),
    new CharLimitStage(),
    new InstructionsStage(),
    new NPMStage(),
    new ComposerStage(),
    new DeduplicateFilesStage(),
    new SortFilesStage(),
    new OutputFormattingStage(),
    new StreamingOutputStage(),
  ]);

  return pipeline;
}

/**
 * Event collector for pipeline testing
 */
export class PipelineEventCollector extends EventEmitter {
  constructor(pipeline) {
    super();
    this.pipeline = pipeline;
    this.events = [];

    // Collect all events
    const eventNames = [
      'pipeline:start',
      'pipeline:complete',
      'pipeline:error',
      'stage:start',
      'stage:complete',
      'stage:error',
      'stage:recover',
      'file:batch',
      'progress',
    ];

    for (const eventName of eventNames) {
      pipeline.on(eventName, (data) => {
        this.events.push({
          name: eventName,
          timestamp: Date.now(),
          data,
        });
        this.emit(eventName, data);
      });
    }
  }

  /**
   * Get all events of a specific type
   */
  getEvents(name) {
    return this.events.filter((e) => e.name === name);
  }

  /**
   * Get events matching a filter
   */
  filter(predicate) {
    return this.events.filter(predicate);
  }

  /**
   * Clear collected events
   */
  clear() {
    this.events = [];
  }

  /**
   * Wait for a specific event
   */
  waitFor(eventName, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      const handler = (data) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.once(eventName, handler);
    });
  }

  /**
   * Get stage completion events in order
   */
  getStageCompletions() {
    return this.getEvents('stage:complete').map((e) => ({
      stage: typeof e.data.stage === 'string' ? e.data.stage : e.data.stage.name,
      duration: e.data.duration,
      memoryUsage: e.data.memoryUsage,
      timestamp: e.timestamp,
    }));
  }

  /**
   * Get file batch events
   */
  getFileBatches() {
    return this.getEvents('file:batch').map((e) => ({
      stage: e.data.stage,
      action: e.data.action,
      count: e.data.count,
      lastFile: e.data.lastFile,
    }));
  }

  /**
   * Validate pipeline event contract
   */
  validateContract() {
    const errors = [];

    // Must have pipeline:start and pipeline:complete
    const starts = this.getEvents('pipeline:start');
    const completes = this.getEvents('pipeline:complete');

    if (starts.length === 0) {
      errors.push('Missing pipeline:start event');
    }
    if (completes.length === 0) {
      errors.push('Missing pipeline:complete event');
    }

    // Each stage should have start and complete
    const stageStarts = this.getEvents('stage:start');
    const stageCompletes = this.getEvents('stage:complete');

    if (stageStarts.length !== stageCompletes.length) {
      errors.push(
        `Stage start/complete mismatch: ${stageStarts.length} starts, ${stageCompletes.length} completes`,
      );
    }

    // Stage events should have required fields
    for (const event of stageCompletes) {
      const { data } = event;
      if (!data.stage) errors.push('stage:complete missing stage');
      if (typeof data.duration !== 'number') errors.push('stage:complete missing duration');
      if (!data.memoryUsage) errors.push('stage:complete missing memoryUsage');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create mock files for testing
 */
export function createMockFiles(count = 10, options = {}) {
  const { prefix = 'file', extension = '.js', withContent = true, withGitStatus = false } = options;

  const files = [];

  for (let i = 0; i < count; i++) {
    const file = {
      path: `src/${prefix}${i}${extension}`,
      absolutePath: `/project/src/${prefix}${i}${extension}`,
      relativePath: `src/${prefix}${i}${extension}`,
      size: 100 + i * 10,
      modified: new Date('2025-01-01T00:00:00.000Z'),
      mtime: new Date('2025-01-01T00:00:00.000Z'),
      isDirectory: false,
    };

    if (withContent) {
      file.content = `// ${prefix}${i}\nexport default function() {}`;
    }

    if (withGitStatus) {
      file.gitStatus = i % 3 === 0 ? 'modified' : 'untracked';
    }

    files.push(file);
  }

  return files;
}

/**
 * Mock stage for testing
 */
export class MockStage {
  constructor(name, options = {}) {
    this.name = name;
    this.description = options.description || `Mock stage ${name}`;
    this.processFunc = options.process || ((input) => input);
    this.shouldError = options.shouldError || false;
    this.shouldRecover = options.shouldRecover !== false; // Default to true for graceful degradation
    this.delay = options.delay || 0;
    this.calls = [];
  }

  async onInit(context) {
    this.context = context;
  }

  async process(input) {
    this.calls.push({ input, timestamp: Date.now() });

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldError) {
      throw new Error(`Mock stage ${this.name} error`);
    }

    return this.processFunc(input);
  }

  async handleError(error, input) {
    if (!this.shouldRecover) {
      throw error; // Re-throw to fail the pipeline
    }
    return input; // Graceful degradation
  }

  log(message, level = 'info') {
    // Silent in tests
  }
}

/**
 * Assert stage input/output contract
 */
export function assertStageContract(stage, input, output) {
  const contracts = {
    FileDiscoveryStage: {
      input: () => true,
      output: (o) => Array.isArray(o.files) && o.files.length >= 0,
    },
    ProfileFilterStage: {
      input: (i) => Array.isArray(i.files),
      output: (o) => Array.isArray(o.files) && o.files.length <= input.files.length,
    },
    TransformStage: {
      input: (i) => Array.isArray(i.files) && i.files.every((f) => f.content !== undefined),
      output: (o) => Array.isArray(o.files),
    },
    LimitStage: {
      input: (i) => Array.isArray(i.files),
      output: (o) => Array.isArray(o.files) && o.files.length <= input.files.length,
    },
    DeduplicateFilesStage: {
      input: (i) => Array.isArray(i.files),
      output: (o) => Array.isArray(o.files) && o.files.length <= input.files.length,
    },
    SortFilesStage: {
      input: (i) => Array.isArray(i.files),
      output: (o) => Array.isArray(o.files) && o.files.length === input.files.length,
    },
  };

  const contract = contracts[stage.constructor.name];
  if (!contract) {
    return { valid: true, message: 'No contract defined' };
  }

  const inputValid = contract.input(input);
  const outputValid = contract.output(output);

  return {
    valid: inputValid && outputValid,
    inputValid,
    outputValid,
    message: !inputValid
      ? 'Input contract violated'
      : !outputValid
        ? 'Output contract violated'
        : 'Contract satisfied',
  };
}

/**
 * Run pipeline with event collection
 */
export async function runPipelineWithEvents(pipeline, input) {
  const collector = new PipelineEventCollector(pipeline);

  try {
    const output = await pipeline.run(input);
    return {
      output,
      events: collector.events,
      collector,
    };
  } catch (error) {
    return {
      error,
      events: collector.events,
      collector,
    };
  }
}

/**
 * Performance snapshot for pipeline
 */
export function capturePerformanceSnapshot() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    timestamp: Date.now(),
    memory: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
  };
}

/**
 * Calculate delta between performance snapshots
 */
export function calculatePerformanceDelta(before, after) {
  return {
    duration: after.timestamp - before.timestamp,
    memoryDelta: {
      heapUsed: after.memory.heapUsed - before.memory.heapUsed,
      heapTotal: after.memory.heapTotal - before.memory.heapTotal,
      external: after.memory.external - before.memory.external,
      rss: after.memory.rss - before.memory.rss,
    },
    cpuDelta: {
      user: after.cpu.user - before.cpu.user,
      system: after.cpu.system - before.cpu.system,
    },
  };
}
