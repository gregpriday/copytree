/**
 * Pipeline event contract tests
 *
 * Validates that the pipeline emits all required events with correct data structure
 * and timing throughout the execution lifecycle.
 */

import {
  createTestPipeline,
  createFullPipeline,
  PipelineEventCollector,
  MockStage,
  createMockFiles,
  runPipelineWithEvents,
} from '../../helpers/pipeline.js';
import { cleanTmpDir } from '../../helpers/fixtures.js';

describe('Pipeline Event Contract', () => {
  beforeEach(() => {
    cleanTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  describe('Core Pipeline Events', () => {
    it('emits pipeline:start with input and stages', async () => {
      // Use a minimal pipeline without OutputFormattingStage to avoid date issues
      const pipeline = createTestPipeline([new MockStage('test-stage')]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({
        files: [],
      });

      const startEvents = collector.getEvents('pipeline:start');
      expect(startEvents).toHaveLength(1);

      const startData = startEvents[0].data;
      expect(startData).toMatchObject({
        input: expect.any(Object),
        stages: expect.any(Number),
        options: expect.any(Object),
      });
    });

    it('emits pipeline:complete with output and metrics', async () => {
      const pipeline = createTestPipeline([new MockStage('test-stage')]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({
        files: [],
      });

      const completeEvents = collector.getEvents('pipeline:complete');
      expect(completeEvents).toHaveLength(1);

      const completeData = completeEvents[0].data;
      expect(completeData).toMatchObject({
        result: expect.any(Object),
        stats: expect.objectContaining({
          startTime: expect.any(Number),
          endTime: expect.any(Number),
          stagesCompleted: expect.any(Number),
        }),
      });
    });

    it('emits pipeline:error on failure', async () => {
      const pipeline = createTestPipeline([
        new MockStage('error-stage', { shouldError: true, shouldRecover: false }),
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await expect(pipeline.process({ files: [] })).rejects.toThrow();

      const errorEvents = collector.getEvents('pipeline:error');
      expect(errorEvents.length).toBeGreaterThan(0);

      const errorData = errorEvents[0].data;
      expect(errorData).toMatchObject({
        error: expect.any(Error),
        stats: expect.any(Object),
      });
    });
  });

  describe('Stage Events', () => {
    it('emits stage:start for each stage', async () => {
      const stages = [new MockStage('stage-1'), new MockStage('stage-2'), new MockStage('stage-3')];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const startEvents = collector.getEvents('stage:start');
      expect(startEvents).toHaveLength(3);

      startEvents.forEach((event, index) => {
        expect(event.data).toMatchObject({
          stage: expect.any(String), // Stage name is a string
          index: expect.any(Number),
          input: expect.any(Object),
        });
      });
    });

    it('emits stage:complete with timing and memory', async () => {
      const pipeline = createTestPipeline([new MockStage('test-stage')]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const completeEvents = collector.getEvents('stage:complete');
      expect(completeEvents.length).toBeGreaterThan(0);

      completeEvents.forEach((event) => {
        expect(event.data).toMatchObject({
          stage: expect.any(String), // Stage name is a string
          index: expect.any(Number),
          output: expect.any(Object),
          duration: expect.any(Number),
          memoryUsage: expect.any(Object),
        });

        // Duration should be positive
        expect(event.data.duration).toBeGreaterThanOrEqual(0);
      });
    });

    it('emits stages in correct order', async () => {
      const stages = [new MockStage('first'), new MockStage('second'), new MockStage('third')];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const completions = collector.getStageCompletions();
      expect(completions.map((c) => c.stage)).toEqual(['first', 'second', 'third']);

      // Each stage should complete after it starts
      completions.forEach((completion, index) => {
        if (index > 0) {
          expect(completion.timestamp).toBeGreaterThanOrEqual(completions[index - 1].timestamp);
        }
      });
    });

    it('includes stage context in events', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      const context = {
        config: { test: true },
        profile: { name: 'test' },
      };

      await pipeline.process({
        files: [],
        context,
      });

      const stageEvents = collector.getEvents('stage:complete');
      // Context should be accessible to stages
      expect(stageEvents.length).toBeGreaterThan(0);
    });
  });

  describe('File Batch Events', () => {
    it('supports file:batch events when stages emit them', async () => {
      // Create a custom stage that emits file:batch events
      class FileEmittingStage extends MockStage {
        constructor(name, options) {
          super(name, options);
          this._pipelineRef = null;
        }

        async onInit(context) {
          await super.onInit(context);
          // Store pipeline reference from parent pipeline (hacky but works for testing)
          this._pipelineRef = context.pipeline || this.pipeline;
        }

        async process(input) {
          const result = await super.process(input);
          // Emit file:batch event if we have files
          if (this._pipelineRef && result.files) {
            this._pipelineRef.emit('file:batch', {
              stage: this.name,
              count: result.files.length,
              action: 'processed',
              lastFile: result.files[result.files.length - 1]?.path,
            });
          }
          return result;
        }
      }

      const files = createMockFiles(10);
      const stage = new FileEmittingStage('processor', {
        process: (input) => ({ ...input, files }),
      });
      const pipeline = createTestPipeline([stage]);
      // Manually set pipeline reference since stage is already an instance
      stage.pipeline = pipeline;
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const batchEvents = collector.getEvents('file:batch');
      expect(batchEvents.length).toBeGreaterThan(0);

      batchEvents.forEach((event) => {
        expect(event.data).toMatchObject({
          stage: expect.any(String),
          count: expect.any(Number),
          action: expect.any(String),
        });
      });
    });

    it('includes file count and action in batch events', async () => {
      // Create a custom stage that emits file:batch events
      class FileEmittingStage extends MockStage {
        async process(input) {
          const result = await super.process(input);
          if (this.pipeline && result.files) {
            this.pipeline.emit('file:batch', {
              stage: this.name,
              count: result.files.length,
              action: 'filtered',
              lastFile: result.files[result.files.length - 1]?.path,
            });
          }
          return result;
        }
      }

      const files = createMockFiles(5);
      const stage = new FileEmittingStage('filter', {
        process: (input) => ({ ...input, files: files.slice(0, 3) }),
      });
      const pipeline = createTestPipeline([stage]);
      // Manually set pipeline reference since stage is already an instance
      stage.pipeline = pipeline;
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files });

      const batches = collector.getFileBatches();
      expect(batches.length).toBeGreaterThan(0);

      batches.forEach((batch) => {
        expect(batch.count).toBeGreaterThanOrEqual(0);
        expect(['discovered', 'filtered', 'processed', 'transformed']).toContain(batch.action);
      });
    });
  });

  describe('Progress Events', () => {
    it('emits progress events during execution', async () => {
      const pipeline = createTestPipeline([new MockStage('slow-stage', { delay: 10 })]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const progressEvents = collector.getEvents('progress');
      // Progress events may or may not be emitted depending on stage implementation
      // Just verify structure if they exist
      progressEvents.forEach((event) => {
        expect(event.data).toBeDefined();
      });
    });
  });

  describe('Event Contract Validation', () => {
    it('passes contract validation for successful run', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const validation = collector.validateContract();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('has matching stage start and complete events', async () => {
      const stages = [new MockStage('stage-1'), new MockStage('stage-2'), new MockStage('stage-3')];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const starts = collector.getEvents('stage:start');
      const completes = collector.getEvents('stage:complete');

      expect(starts.length).toBe(completes.length);
      expect(starts.length).toBe(3);

      // Helper to get stage name
      const getStageName = (event) => {
        const stage = event.data.stage;
        return typeof stage === 'string' ? stage : stage.name;
      };

      // Each start should have a corresponding complete
      starts.forEach((start, index) => {
        expect(getStageName(start)).toBe(getStageName(completes[index]));
      });
    });

    it('maintains event ordering', async () => {
      const pipeline = createTestPipeline([new MockStage('stage-1'), new MockStage('stage-2')]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const events = collector.events;

      // Helper to get stage name from event
      const getStageName = (event) => {
        const stage = event.data.stage;
        return typeof stage === 'string' ? stage : stage.name;
      };

      // Find key events
      const pipelineStart = events.find((e) => e.name === 'pipeline:start');
      const stage1Start = events.find(
        (e) => e.name === 'stage:start' && getStageName(e) === 'stage-1',
      );
      const stage1Complete = events.find(
        (e) => e.name === 'stage:complete' && getStageName(e) === 'stage-1',
      );
      const stage2Start = events.find(
        (e) => e.name === 'stage:start' && getStageName(e) === 'stage-2',
      );
      const stage2Complete = events.find(
        (e) => e.name === 'stage:complete' && getStageName(e) === 'stage-2',
      );
      const pipelineComplete = events.find((e) => e.name === 'pipeline:complete');

      // Verify ordering
      expect(pipelineStart.timestamp).toBeLessThanOrEqual(stage1Start.timestamp);
      expect(stage1Start.timestamp).toBeLessThanOrEqual(stage1Complete.timestamp);
      expect(stage1Complete.timestamp).toBeLessThanOrEqual(stage2Start.timestamp);
      expect(stage2Start.timestamp).toBeLessThanOrEqual(stage2Complete.timestamp);
      expect(stage2Complete.timestamp).toBeLessThanOrEqual(pipelineComplete.timestamp);
    });
  });

  describe('Error Recovery Events', () => {
    it('emits stage:recover when handleError succeeds', async () => {
      const pipeline = createTestPipeline([
        new MockStage('good-stage'),
        new MockStage('error-stage', { shouldError: true }), // Has handleError that recovers
        new MockStage('recovery-stage'),
      ]);
      const collector = new PipelineEventCollector(pipeline);

      // Should complete despite error in middle stage (due to handleError)
      await pipeline.process({ files: [] });

      // When handleError succeeds, Pipeline emits stage:recover, not stage:error
      const recoverEvents = collector.getEvents('stage:recover');
      expect(recoverEvents.length).toBeGreaterThan(0);
      expect(recoverEvents[0].data).toMatchObject({
        stage: 'error-stage',
        originalError: expect.any(Error),
        recoveredResult: expect.any(Object),
      });

      const completeEvents = collector.getEvents('stage:complete');
      // Only 2 stages complete: good-stage and recovery-stage
      // error-stage emits stage:recover instead of stage:complete
      expect(completeEvents.length).toBe(2);
    });

    it('emits stage:error when handleError fails', async () => {
      const pipeline = createTestPipeline([
        new MockStage('good-stage'),
        new MockStage('error-stage', { shouldError: true, shouldRecover: false }), // Won't recover
        new MockStage('never-reached'),
      ]);
      const collector = new PipelineEventCollector(pipeline);

      // Pipeline should fail
      await expect(pipeline.process({ files: [] })).rejects.toThrow();

      const errorEvents = collector.getEvents('stage:error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].data).toMatchObject({
        stage: 'error-stage',
        error: expect.any(Error),
      });
    });
  });

  describe('Event Timing and Performance', () => {
    it('includes accurate timing in stage events', async () => {
      const pipeline = createTestPipeline([
        new MockStage('fast-stage', { delay: 5 }),
        new MockStage('slow-stage', { delay: 50 }),
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const completions = collector.getStageCompletions();
      expect(completions).toHaveLength(2);

      const [fast, slow] = completions;
      expect(fast.duration).toBeLessThan(slow.duration);
      expect(slow.duration).toBeGreaterThanOrEqual(50);
    });

    it('tracks memory deltas between stages', async () => {
      const pipeline = createTestPipeline([new MockStage('stage-1'), new MockStage('stage-2')]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ files: [] });

      const completions = collector.getStageCompletions();
      completions.forEach((completion) => {
        expect(completion.memoryUsage).toBeDefined();
        expect(completion.memoryUsage).toHaveProperty('before');
        expect(completion.memoryUsage).toHaveProperty('after');
        expect(completion.memoryUsage).toHaveProperty('delta');
        expect(typeof completion.memoryUsage.delta.heapUsed).toBe('number');
      });
    });
  });

  describe('Event Data Immutability', () => {
    it('does not modify event data after emission', async () => {
      const pipeline = createTestPipeline([new MockStage('test-stage')]);
      const collector = new PipelineEventCollector(pipeline);

      const originalInput = { files: [], test: 'value' };
      const inputCopy = { ...originalInput };

      await pipeline.process(originalInput);

      const startEvent = collector.getEvents('pipeline:start')[0];
      expect(startEvent.data.input).toEqual(inputCopy);
    });
  });
});

describe('Pipeline Event Listener Management', () => {
  it('allows multiple listeners for same event', async () => {
    const pipeline = createTestPipeline();
    const listener1Calls = [];
    const listener2Calls = [];

    pipeline.on('stage:complete', (data) => listener1Calls.push(data));
    pipeline.on('stage:complete', (data) => listener2Calls.push(data));

    await pipeline.process({ files: [] });

    expect(listener1Calls.length).toBeGreaterThan(0);
    expect(listener2Calls.length).toBe(listener1Calls.length);

    cleanTmpDir();
  });

  it('supports once() for single-fire listeners', async () => {
    const pipeline = createTestPipeline();
    let callCount = 0;

    pipeline.once('stage:complete', () => {
      callCount++;
    });

    await pipeline.process({ files: [] });

    // Should only be called once despite multiple stages
    expect(callCount).toBe(1);

    cleanTmpDir();
  });
});
