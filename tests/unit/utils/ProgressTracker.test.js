import { EventEmitter } from 'events';
import { ProgressTracker } from '../../../src/utils/ProgressTracker.js';

/**
 * Create a mock pipeline (EventEmitter) for testing.
 */
function createMockPipeline() {
  return new EventEmitter();
}

describe('ProgressTracker', () => {
  let pipeline;
  let updates;
  let tracker;

  beforeEach(() => {
    pipeline = createMockPipeline();
    updates = [];
  });

  afterEach(() => {
    pipeline.removeAllListeners();
  });

  describe('constructor', () => {
    it('accepts totalStages and onProgress', () => {
      tracker = new ProgressTracker({
        totalStages: 5,
        onProgress: () => {},
      });
      expect(tracker.totalStages).toBe(5);
    });

    it('defaults onProgress to no-op when not provided', () => {
      tracker = new ProgressTracker({ totalStages: 3 });
      // Should not throw
      expect(() => tracker.onProgress({ percent: 0, message: '' })).not.toThrow();
    });

    it('defaults throttleMs to 100', () => {
      tracker = new ProgressTracker({ totalStages: 1 });
      expect(tracker.throttleMs).toBe(100);
    });

    it('accepts custom throttleMs', () => {
      tracker = new ProgressTracker({ totalStages: 1, throttleMs: 50 });
      expect(tracker.throttleMs).toBe(50);
    });
  });

  describe('attach()', () => {
    it('listens to pipeline events after attach', () => {
      tracker = new ProgressTracker({
        totalStages: 2,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);

      pipeline.emit('pipeline:start', {});
      expect(updates.length).toBe(1);
      expect(updates[0]).toEqual({ percent: 0, message: 'Starting...' });
    });
  });

  describe('progress lifecycle', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        totalStages: 2,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);
    });

    it('emits 0% on pipeline:start', () => {
      pipeline.emit('pipeline:start', {});
      expect(updates[0]).toEqual({ percent: 0, message: 'Starting...' });
    });

    it('emits 100% on pipeline:complete', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('pipeline:complete', {});
      const last = updates[updates.length - 1];
      expect(last.percent).toBe(100);
      expect(last.message).toBe('Complete');
    });

    it('reports progress on stage:start', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'FileDiscoveryStage', index: 0 });
      const stageStart = updates.find((u) => u.message === 'Discovering files...');
      expect(stageStart).toBeDefined();
      expect(stageStart.percent).toBe(0);
    });

    it('reports progress on stage:complete', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:complete', { stage: 'FileDiscoveryStage', index: 0 });
      const stageComplete = updates.find((u) => u.message === 'Completed Discovering files');
      expect(stageComplete).toBeDefined();
      expect(stageComplete.percent).toBe(50); // 1/2 stages complete
    });

    it('reaches 100% after all stages and pipeline:complete', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'FileDiscoveryStage', index: 0 });
      pipeline.emit('stage:complete', { stage: 'FileDiscoveryStage', index: 0 });
      pipeline.emit('stage:start', { stage: 'FileLoadingStage', index: 1 });
      pipeline.emit('stage:complete', { stage: 'FileLoadingStage', index: 1 });
      pipeline.emit('pipeline:complete', {});

      const last = updates[updates.length - 1];
      expect(last.percent).toBe(100);
    });

    it('reports file:batch events with file path', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'FileDiscoveryStage', index: 0 });
      pipeline.emit('file:batch', {
        stage: 'FileDiscoveryStage',
        count: 50,
        lastFile: 'src/index.js',
        action: 'discovered',
      });

      const batchUpdate = updates.find((u) => u.message === 'Processing src/index.js');
      expect(batchUpdate).toBeDefined();
    });

    it('reports stage:progress events', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'TransformStage', index: 0 });
      pipeline.emit('stage:progress', {
        stage: 'TransformStage',
        progress: 50,
        message: 'Transforming 50 files...',
      });

      const progressUpdate = updates.find((u) => u.message === 'Transforming 50 files...');
      expect(progressUpdate).toBeDefined();
      expect(progressUpdate.percent).toBe(25); // 50% of first stage = 50/100 * 1/2 = 25%
    });
  });

  describe('monotonic progress', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        totalStages: 4,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);
    });

    it('never emits a percent lower than a previous one', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'Stage1', index: 0 });
      pipeline.emit('stage:complete', { stage: 'Stage1', index: 0 });
      pipeline.emit('stage:start', { stage: 'Stage2', index: 1 });
      pipeline.emit('stage:complete', { stage: 'Stage2', index: 1 });
      pipeline.emit('stage:start', { stage: 'Stage3', index: 2 });
      pipeline.emit('stage:complete', { stage: 'Stage3', index: 2 });
      pipeline.emit('stage:start', { stage: 'Stage4', index: 3 });
      pipeline.emit('stage:complete', { stage: 'Stage4', index: 3 });
      pipeline.emit('pipeline:complete', {});

      for (let i = 1; i < updates.length; i++) {
        expect(updates[i].percent).toBeGreaterThanOrEqual(updates[i - 1].percent);
      }
    });
  });

  describe('throttling', () => {
    it('throttles rapid emissions', () => {
      tracker = new ProgressTracker({
        totalStages: 1,
        onProgress: (p) => updates.push(p),
        throttleMs: 500, // High throttle for testing
      });
      tracker.attach(pipeline);

      pipeline.emit('pipeline:start', {}); // Forced, always emitted
      pipeline.emit('stage:start', { stage: 'Stage1', index: 0 });
      pipeline.emit('file:batch', { stage: 'Stage1', count: 1, lastFile: 'a.js' });
      pipeline.emit('file:batch', { stage: 'Stage1', count: 2, lastFile: 'b.js' });
      pipeline.emit('file:batch', { stage: 'Stage1', count: 3, lastFile: 'c.js' });
      pipeline.emit('file:batch', { stage: 'Stage1', count: 4, lastFile: 'd.js' });

      // pipeline:start is forced, stage:start gets through, but subsequent
      // rapid file:batch events within 500ms should be throttled
      expect(updates.length).toBeLessThan(6);
    });

    it('always emits start (0%) and complete (100%) regardless of throttle', () => {
      tracker = new ProgressTracker({
        totalStages: 1,
        onProgress: (p) => updates.push(p),
        throttleMs: 999999, // Very high throttle
      });
      tracker.attach(pipeline);

      pipeline.emit('pipeline:start', {});
      pipeline.emit('pipeline:complete', {});

      expect(updates.length).toBe(2);
      expect(updates[0].percent).toBe(0);
      expect(updates[1].percent).toBe(100);
    });
  });

  describe('stage name formatting', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        totalStages: 1,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);
    });

    it('formats known stage names', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'FileDiscoveryStage', index: 0 });
      expect(updates[1].message).toBe('Discovering files...');
    });

    it('passes through unknown stage names', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'CustomStage', index: 0 });
      expect(updates[1].message).toBe('CustomStage...');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        totalStages: 2,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);
    });

    it('file:batch without lastFile uses count message', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'FileDiscoveryStage', index: 0 });
      pipeline.emit('file:batch', {
        stage: 'FileDiscoveryStage',
        count: 42,
        lastFile: null,
        action: 'discovered',
      });

      const batchUpdate = updates.find((u) => u.message === 'Processed 42 files');
      expect(batchUpdate).toBeDefined();
    });

    it('stage:progress without message uses stage name', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:start', { stage: 'TransformStage', index: 0 });
      pipeline.emit('stage:progress', {
        stage: 'TransformStage',
        progress: 50,
        // message intentionally omitted
      });

      const progressUpdate = updates.find((u) => u.message === 'Transforming files...');
      expect(progressUpdate).toBeDefined();
    });

    it('swallows exceptions thrown by onProgress callback', () => {
      const throwingTracker = new ProgressTracker({
        totalStages: 1,
        onProgress: () => {
          throw new Error('callback error');
        },
        throttleMs: 0,
      });
      const mockPipeline = new EventEmitter();
      throwingTracker.attach(mockPipeline);

      // Should not throw
      expect(() => {
        mockPipeline.emit('pipeline:start', {});
        mockPipeline.emit('pipeline:complete', {});
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      tracker = new ProgressTracker({
        totalStages: 3,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);
    });

    it('emits on pipeline:error', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:complete', { stage: 'Stage1', index: 0 });
      pipeline.emit('pipeline:error', { error: new Error('fail') });

      const errorUpdate = updates.find((u) => u.message === 'Error occurred');
      expect(errorUpdate).toBeDefined();
    });

    it('does not emit after pipeline has already completed', () => {
      pipeline.emit('pipeline:start', {});
      pipeline.emit('pipeline:complete', {});
      const countAfterComplete = updates.length;

      pipeline.emit('pipeline:error', { error: new Error('late error') });
      // No additional update since already finished
      expect(updates.length).toBe(countAfterComplete);
    });
  });

  describe('percent calculation accuracy', () => {
    it('calculates correct percent for 3-stage pipeline', () => {
      tracker = new ProgressTracker({
        totalStages: 3,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);

      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:complete', { stage: 'S1', index: 0 });
      pipeline.emit('stage:complete', { stage: 'S2', index: 1 });
      pipeline.emit('stage:complete', { stage: 'S3', index: 2 });
      pipeline.emit('pipeline:complete', {});

      // After 1 stage: 33%, after 2: 67%, after 3: 99% (capped), then 100%
      const percents = updates.map((u) => u.percent);
      expect(percents[0]).toBe(0);
      expect(percents[percents.length - 1]).toBe(100);
    });

    it('caps progress at 99 before pipeline:complete', () => {
      tracker = new ProgressTracker({
        totalStages: 1,
        onProgress: (p) => updates.push(p),
        throttleMs: 0,
      });
      tracker.attach(pipeline);

      pipeline.emit('pipeline:start', {});
      pipeline.emit('stage:complete', { stage: 'S1', index: 0 });

      // After the only stage completes, percent should be 99 (not 100)
      const stageCompleteUpdate = updates.find((u) => u.message === 'Completed S1');
      expect(stageCompleteUpdate.percent).toBeLessThanOrEqual(99);
    });
  });
});
