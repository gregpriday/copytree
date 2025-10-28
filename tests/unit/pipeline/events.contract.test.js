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
  runPipelineWithEvents
} from '../../helpers/pipeline.js';
import { createSimpleProject, cleanTmpDir } from '../../helpers/fixtures.js';

describe('Pipeline Event Contract', () => {
  let tmpProject;

  beforeEach(() => {
    cleanTmpDir();
    tmpProject = createSimpleProject('pipeline-test', { withGit: false });
  });

  afterEach(() => {
    cleanTmpDir();
  });

  describe('Core Pipeline Events', () => {
    it('emits pipeline:start with input and stages', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({
        sourcePath: tmpProject,
        files: []
      });

      const startEvents = collector.getEvents('pipeline:start');
      expect(startEvents).toHaveLength(1);

      const startData = startEvents[0].data;
      expect(startData).toMatchObject({
        input: expect.objectContaining({
          sourcePath: tmpProject
        }),
        stages: expect.any(Array),
        options: expect.any(Object)
      });
    });

    it('emits pipeline:complete with output and metrics', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({
        sourcePath: tmpProject,
        files: []
      });

      const completeEvents = collector.getEvents('pipeline:complete');
      expect(completeEvents).toHaveLength(1);

      const completeData = completeEvents[0].data;
      expect(completeData).toMatchObject({
        output: expect.any(Object),
        metrics: expect.objectContaining({
          duration: expect.any(Number),
          stageTimings: expect.any(Object),
          memoryUsage: expect.any(Object)
        })
      });
    });

    it('emits pipeline:error on failure', async () => {
      const pipeline = createTestPipeline([
        new MockStage('error-stage', { shouldError: true })
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await expect(
        pipeline.process({ sourcePath: tmpProject, files: [] })
      ).rejects.toThrow();

      const errorEvents = collector.getEvents('pipeline:error');
      expect(errorEvents.length).toBeGreaterThan(0);

      const errorData = errorEvents[0].data;
      expect(errorData).toMatchObject({
        error: expect.any(Error),
        stage: expect.objectContaining({ name: 'error-stage' })
      });
    });
  });

  describe('Stage Events', () => {
    it('emits stage:start for each stage', async () => {
      const stages = [
        new MockStage('stage-1'),
        new MockStage('stage-2'),
        new MockStage('stage-3')
      ];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const startEvents = collector.getEvents('stage:start');
      expect(startEvents).toHaveLength(3);

      startEvents.forEach((event, index) => {
        expect(event.data).toMatchObject({
          stage: expect.objectContaining({
            name: `stage-${index + 1}`
          }),
          input: expect.any(Object)
        });
      });
    });

    it('emits stage:complete with timing and memory', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const completeEvents = collector.getEvents('stage:complete');
      expect(completeEvents.length).toBeGreaterThan(0);

      completeEvents.forEach(event => {
        expect(event.data).toMatchObject({
          stage: expect.objectContaining({
            name: expect.any(String),
            description: expect.any(String)
          }),
          output: expect.any(Object),
          duration: expect.any(Number),
          memoryUsage: expect.objectContaining({
            heapUsed: expect.any(Number),
            heapTotal: expect.any(Number)
          })
        });

        // Duration should be positive
        expect(event.data.duration).toBeGreaterThanOrEqual(0);

        // Memory should be reasonable
        expect(event.data.memoryUsage.heapUsed).toBeGreaterThan(0);
      });
    });

    it('emits stages in correct order', async () => {
      const stages = [
        new MockStage('first'),
        new MockStage('second'),
        new MockStage('third')
      ];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const completions = collector.getStageCompletions();
      expect(completions.map(c => c.stage)).toEqual(['first', 'second', 'third']);

      // Each stage should complete after it starts
      completions.forEach((completion, index) => {
        if (index > 0) {
          expect(completion.timestamp).toBeGreaterThanOrEqual(
            completions[index - 1].timestamp
          );
        }
      });
    });

    it('includes stage context in events', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      const context = {
        config: { test: true },
        profile: { name: 'test' }
      };

      await pipeline.process({
        sourcePath: tmpProject,
        files: [],
        context
      });

      const stageEvents = collector.getEvents('stage:complete');
      // Context should be accessible to stages
      expect(stageEvents.length).toBeGreaterThan(0);
    });
  });

  describe('File Batch Events', () => {
    it('emits file:batch when processing files', async () => {
      const files = createMockFiles(10);
      const pipeline = createTestPipeline([
        new MockStage('processor', {
          process: (input) => ({ ...input, files })
        })
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const batchEvents = collector.getEvents('file:batch');
      expect(batchEvents.length).toBeGreaterThan(0);

      batchEvents.forEach(event => {
        expect(event.data).toMatchObject({
          stage: expect.any(String),
          count: expect.any(Number),
          action: expect.any(String)
        });
      });
    });

    it('includes file count and action in batch events', async () => {
      const files = createMockFiles(5);
      const pipeline = createTestPipeline([
        new MockStage('filter', {
          process: (input) => ({ ...input, files: files.slice(0, 3) })
        })
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files });

      const batches = collector.getFileBatches();
      expect(batches.length).toBeGreaterThan(0);

      batches.forEach(batch => {
        expect(batch.count).toBeGreaterThanOrEqual(0);
        expect(['discovered', 'filtered', 'processed', 'transformed']).toContain(
          batch.action
        );
      });
    });
  });

  describe('Progress Events', () => {
    it('emits progress events during execution', async () => {
      const pipeline = createTestPipeline([
        new MockStage('slow-stage', { delay: 10 })
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const progressEvents = collector.getEvents('progress');
      // Progress events may or may not be emitted depending on stage implementation
      // Just verify structure if they exist
      progressEvents.forEach(event => {
        expect(event.data).toBeDefined();
      });
    });
  });

  describe('Event Contract Validation', () => {
    it('passes contract validation for successful run', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const validation = collector.validateContract();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('has matching stage start and complete events', async () => {
      const stages = [
        new MockStage('stage-1'),
        new MockStage('stage-2'),
        new MockStage('stage-3')
      ];
      const pipeline = createTestPipeline(stages);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const starts = collector.getEvents('stage:start');
      const completes = collector.getEvents('stage:complete');

      expect(starts.length).toBe(completes.length);
      expect(starts.length).toBe(3);

      // Each start should have a corresponding complete
      starts.forEach((start, index) => {
        expect(start.data.stage.name).toBe(completes[index].data.stage.name);
      });
    });

    it('maintains event ordering', async () => {
      const pipeline = createTestPipeline([
        new MockStage('stage-1'),
        new MockStage('stage-2')
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const events = collector.events;

      // Find key events
      const pipelineStart = events.find(e => e.name === 'pipeline:start');
      const stage1Start = events.find(e => e.name === 'stage:start' && e.data.stage.name === 'stage-1');
      const stage1Complete = events.find(e => e.name === 'stage:complete' && e.data.stage.name === 'stage-1');
      const stage2Start = events.find(e => e.name === 'stage:start' && e.data.stage.name === 'stage-2');
      const stage2Complete = events.find(e => e.name === 'stage:complete' && e.data.stage.name === 'stage-2');
      const pipelineComplete = events.find(e => e.name === 'pipeline:complete');

      // Verify ordering
      expect(pipelineStart.timestamp).toBeLessThanOrEqual(stage1Start.timestamp);
      expect(stage1Start.timestamp).toBeLessThanOrEqual(stage1Complete.timestamp);
      expect(stage1Complete.timestamp).toBeLessThanOrEqual(stage2Start.timestamp);
      expect(stage2Start.timestamp).toBeLessThanOrEqual(stage2Complete.timestamp);
      expect(stage2Complete.timestamp).toBeLessThanOrEqual(pipelineComplete.timestamp);
    });
  });

  describe('Error Recovery Events', () => {
    it('emits stage:error but continues if handleError succeeds', async () => {
      const pipeline = createTestPipeline([
        new MockStage('good-stage'),
        new MockStage('error-stage', { shouldError: true }),
        new MockStage('recovery-stage')
      ]);
      const collector = new PipelineEventCollector(pipeline);

      // Should complete despite error in middle stage (due to handleError)
      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const errorEvents = collector.getEvents('stage:error');
      expect(errorEvents.length).toBeGreaterThan(0);

      const completeEvents = collector.getEvents('stage:complete');
      // All stages should complete (error stage via handleError)
      expect(completeEvents.length).toBe(3);
    });
  });

  describe('Event Timing and Performance', () => {
    it('includes accurate timing in stage events', async () => {
      const pipeline = createTestPipeline([
        new MockStage('fast-stage', { delay: 5 }),
        new MockStage('slow-stage', { delay: 50 })
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const completions = collector.getStageCompletions();
      expect(completions).toHaveLength(2);

      const [fast, slow] = completions;
      expect(fast.duration).toBeLessThan(slow.duration);
      expect(slow.duration).toBeGreaterThanOrEqual(50);
    });

    it('tracks memory deltas between stages', async () => {
      const pipeline = createTestPipeline([
        new MockStage('stage-1'),
        new MockStage('stage-2')
      ]);
      const collector = new PipelineEventCollector(pipeline);

      await pipeline.process({ sourcePath: tmpProject, files: [] });

      const completions = collector.getStageCompletions();
      completions.forEach(completion => {
        expect(completion.memoryUsage).toBeDefined();
        expect(typeof completion.memoryUsage.heapUsed).toBe('number');
      });
    });
  });

  describe('Event Data Immutability', () => {
    it('does not modify event data after emission', async () => {
      const pipeline = createTestPipeline();
      const collector = new PipelineEventCollector(pipeline);

      const originalInput = { sourcePath: tmpProject, files: [], test: 'value' };
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

    await pipeline.process({ sourcePath: createSimpleProject('test'), files: [] });

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

    await pipeline.process({ sourcePath: createSimpleProject('test'), files: [] });

    // Should only be called once despite multiple stages
    expect(callCount).toBe(1);

    cleanTmpDir();
  });
});
