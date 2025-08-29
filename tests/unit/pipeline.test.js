// Use dynamic imports for modules under test
let Pipeline, Stage;
let AddOneStage, MultiplyByTwoStage, ErrorStage;

beforeAll(async () => {
  const pipelineModule = await import('../../src/pipeline/Pipeline.js');
  const stageModule = await import('../../src/pipeline/Stage.js');

  Pipeline = pipelineModule.default;
  Stage = stageModule.default;

  // Mock stages for testing
  class AddOneStageImpl extends Stage {
    async process(input) {
      return input + 1;
    }
  }

  class MultiplyByTwoStageImpl extends Stage {
    async process(input) {
      return input * 2;
    }
  }

  class ErrorStageImpl extends Stage {
    async process(input) {
      throw new Error('Test error');
    }
  }

  AddOneStage = AddOneStageImpl;
  MultiplyByTwoStage = MultiplyByTwoStageImpl;
  ErrorStage = ErrorStageImpl;
});

describe('Pipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new Pipeline();
  });

  test('should process stages sequentially', async () => {
    pipeline.through([AddOneStage, MultiplyByTwoStage]);

    const result = await pipeline.process(5);

    // (5 + 1) * 2 = 12
    expect(result).toBe(12);
  });

  test('should support Laravel-style syntax', async () => {
    const result = await Pipeline.create()
      .send(10)
      .through([AddOneStage, MultiplyByTwoStage])
      .thenReturn();

    // (10 + 1) * 2 = 22
    expect(result).toBe(22);
  });

  test('should emit events during processing', async () => {
    const events = [];

    pipeline.on('pipeline:start', (data) => events.push({ type: 'start', data }));
    pipeline.on('stage:complete', (data) => events.push({ type: 'stage', data }));
    pipeline.on('pipeline:complete', (data) => events.push({ type: 'complete', data }));

    pipeline.through([AddOneStage]);
    await pipeline.process(1);

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('start');
    expect(events[1].type).toBe('stage');
    expect(events[2].type).toBe('complete');
  });

  test('should handle errors appropriately', async () => {
    pipeline.through([AddOneStage, ErrorStage, MultiplyByTwoStage]);

    await expect(pipeline.process(1)).rejects.toThrow('Test error');
  });

  test('should continue on error when configured', async () => {
    pipeline = new Pipeline({ continueOnError: true });
    pipeline.through([AddOneStage, ErrorStage, MultiplyByTwoStage]);

    const result = await pipeline.process(1);

    // Should process first stage (1 + 1 = 2), skip error stage, then multiply (2 * 2 = 4)
    expect(result).toBe(4); // (1 + 1) * 2
  });

  test('should track statistics', async () => {
    // Add a small delay stage to ensure duration is measurable
    class DelayStage extends Stage {
      async process(input) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return input;
      }
    }

    pipeline.through([AddOneStage, DelayStage, MultiplyByTwoStage]);
    await pipeline.process(1);

    const stats = pipeline.getStats();

    expect(stats.stagesCompleted).toBe(3);
    expect(stats.stagesFailed).toBe(0);
    expect(stats.duration).toBeGreaterThan(0);
    expect(stats.successRate).toBe(1);
  });

  test('should support function stages', async () => {
    const addThree = async (input) => input + 3;
    const double = async (input) => input * 2;

    pipeline.through([addThree, double]);
    const result = await pipeline.process(5);

    // (5 + 3) * 2 = 16
    expect(result).toBe(16);
  });
});
