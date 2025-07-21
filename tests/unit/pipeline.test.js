const Pipeline = require('../../src/pipeline/Pipeline');
const Stage = require('../../src/pipeline/Stage');

// Mock stages for testing
class AddOneStage extends Stage {
  async process(input) {
    return input + 1;
  }
}

class MultiplyByTwoStage extends Stage {
  async process(input) {
    return input * 2;
  }
}

class ErrorStage extends Stage {
  async process(input) {
    throw new Error('Test error');
  }
}

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
    
    // Should process first stage but skip after error
    expect(result).toBe(2); // 1 + 1
  });

  test('should track statistics', async () => {
    pipeline.through([AddOneStage, MultiplyByTwoStage]);
    await pipeline.process(1);
    
    const stats = pipeline.getStats();
    
    expect(stats.stagesCompleted).toBe(2);
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