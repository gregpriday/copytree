import { EventEmitter } from 'events';
import { createRunPipeline } from '../../../../src/ui/hooks/usePipeline.js';

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
      expect.objectContaining({ type: 'success', message: expect.stringContaining('Completed stage') }),
    );

    // Listeners must be removed once the run finishes.
    expect(pipeline.listenerCount('pipeline:start')).toBe(0);
    expect(pipeline.listenerCount('stage:start')).toBe(0);
    expect(pipeline.listenerCount('pipeline:complete')).toBe(0);
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
    expect(pipeline.listenerCount('pipeline:start')).toBe(0);
    expect(pipeline.listenerCount('pipeline:error')).toBe(0);
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
});
