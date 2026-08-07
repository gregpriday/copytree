import { EventEmitter } from 'events';
import { createRunPipeline } from '../../../../src/ui/hooks/usePipeline.js';

const PIPELINE_EVENTS = [
  'pipeline:start',
  'stage:start',
  'stage:complete',
  'stage:error',
  'stage:log',
  'stage:progress',
  'file:processed',
  'file:transformed',
  'file:loaded',
  'file:batch',
  'pipeline:complete',
  'pipeline:error',
];

const totalListeners = (pipeline) =>
  PIPELINE_EVENTS.reduce((sum, event) => sum + pipeline.listenerCount(event), 0);

class MockPipeline extends EventEmitter {
  constructor() {
    super();
    this.stages = [{ name: 'stageA' }, { name: 'stageB' }];
  }

  async process(input) {
    this.emit('pipeline:start', { stages: this.stages.length });
    this.emit('stage:start', { stage: 'stageA', index: 0 });
    this.emit('stage:complete', { stage: 'stageA', index: 0 });
    this.emit('pipeline:complete', { result: input, stats: {} });
    return input;
  }
}

describe('createRunPipeline', () => {
  let updateState;
  let addLog;

  beforeEach(() => {
    updateState = jest.fn();
    addLog = jest.fn();
  });

  test('attaches listeners before process() runs and detaches after it resolves', async () => {
    const runPipeline = createRunPipeline(updateState, addLog);
    const pipeline = new MockPipeline();

    const result = await runPipeline(pipeline, { basePath: '/tmp/project' });

    expect(result).toEqual({ basePath: '/tmp/project' });
    expect(updateState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true, currentStage: 'Starting pipeline...' }),
    );
    expect(updateState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: false, showResults: true }),
    );
    expect(addLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        message: expect.stringContaining('Starting pipeline'),
      }),
    );
    expect(addLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: expect.stringContaining('Completed:'),
      }),
    );

    // All 12 listeners must be removed once the run finishes.
    expect(totalListeners(pipeline)).toBe(0);
  });

  test('detaches listeners even when process() throws', async () => {
    const runPipeline = createRunPipeline(updateState, addLog);
    const pipeline = new EventEmitter();
    pipeline.stages = [{ name: 'stageA' }];
    pipeline.process = async () => {
      pipeline.emit('pipeline:start', { stages: 1 });
      throw new Error('boom');
    };

    await expect(runPipeline(pipeline, {})).rejects.toThrow('boom');

    expect(updateState).toHaveBeenCalledWith(
      expect.objectContaining({ isLoading: true, currentStage: 'Starting pipeline...' }),
    );
    expect(totalListeners(pipeline)).toBe(0);
  });

  test('debounces stage:progress updates instead of calling updateState synchronously', async () => {
    jest.useFakeTimers();
    try {
      const runPipeline = createRunPipeline(updateState, addLog);
      const pipeline = new EventEmitter();
      pipeline.stages = [{ name: 'stageA' }];
      pipeline.process = async () => {
        pipeline.emit('stage:progress', { stage: 'stageA', progress: 50, message: 'Halfway' });
        // Not yet flushed — debounced.
        expect(updateState).not.toHaveBeenCalledWith(
          expect.objectContaining({ currentStage: 'Halfway' }),
        );
        jest.advanceTimersByTime(30);
        expect(updateState).toHaveBeenCalledWith(
          expect.objectContaining({ currentStage: 'Halfway', progress: 50 }),
        );
        return 'ok';
      };

      await runPipeline(pipeline, {});
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancels a pending debounced update on cleanup so it never fires after the run resolves', async () => {
    jest.useFakeTimers();
    try {
      const runPipeline = createRunPipeline(updateState, addLog);
      const pipeline = new EventEmitter();
      pipeline.stages = [{ name: 'stageA' }];
      pipeline.process = async () => {
        // Emitted right before resolving — the 30ms debounce timer is still
        // pending when process() (and therefore runPipeline) resolves.
        pipeline.emit('stage:progress', { stage: 'stageA', progress: 90, message: 'Almost done' });
        return 'ok';
      };

      await runPipeline(pipeline, {});
      updateState.mockClear();

      jest.advanceTimersByTime(1000);
      expect(updateState).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
