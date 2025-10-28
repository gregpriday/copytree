/**
 * Pipeline API drift guard tests
 *
 * Ensures that the Pipeline API remains stable and prevents regressions
 * like the .addStage()/.run() issue we encountered.
 */

import Pipeline from '../../../src/pipeline/Pipeline.js';

describe('Pipeline API Surface', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new Pipeline();
  });

  describe('Core Methods', () => {
    it('exposes .through() method for adding stages', () => {
      expect(typeof pipeline.through).toBe('function');
    });

    it('exposes .process() method for executing pipeline', () => {
      expect(typeof pipeline.process).toBe('function');
    });

    it('does NOT expose legacy .addStage() method', () => {
      expect(pipeline.addStage).toBeUndefined();
    });

    it('does NOT expose legacy .run() method', () => {
      expect(pipeline.run).toBeUndefined();
    });

    it('.through() returns pipeline for chaining', () => {
      const result = pipeline.through([]);
      expect(result).toBe(pipeline);
    });

    it('.through() accepts single stage', () => {
      const mockStage = { process: async (input) => input };
      expect(() => {
        pipeline.through(mockStage);
      }).not.toThrow();
    });

    it('.through() accepts array of stages', () => {
      const mockStages = [
        { process: async (input) => input },
        { process: async (input) => input }
      ];
      expect(() => {
        pipeline.through(mockStages);
      }).not.toThrow();
    });
  });

  describe('Pipeline Properties', () => {
    it('has stages array', () => {
      expect(Array.isArray(pipeline.stages)).toBe(true);
    });

    it('has options object', () => {
      expect(typeof pipeline.options).toBe('object');
      expect(pipeline.options).not.toBeNull();
    });

    it('has stats object', () => {
      expect(typeof pipeline.stats).toBe('object');
      expect(pipeline.stats).not.toBeNull();
    });

    it('has context object', () => {
      expect(typeof pipeline.context).toBe('object');
      expect(pipeline.context).not.toBeNull();
    });

    it('stats includes expected properties', () => {
      expect(pipeline.stats).toMatchObject({
        startTime: null,
        endTime: null,
        stagesCompleted: 0,
        stagesFailed: 0,
        errors: expect.any(Array)
      });
    });
  });

  describe('Event Emitter', () => {
    it('extends EventEmitter', () => {
      expect(typeof pipeline.on).toBe('function');
      expect(typeof pipeline.emit).toBe('function');
      expect(typeof pipeline.once).toBe('function');
      expect(typeof pipeline.removeListener).toBe('function');
    });

    it('can register event listeners', () => {
      const listener = jest.fn();
      pipeline.on('test-event', listener);
      pipeline.emit('test-event', { data: 'test' });
      expect(listener).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('Configuration Options', () => {
    it('accepts continueOnError option', () => {
      const p = new Pipeline({ continueOnError: true });
      expect(p.options.continueOnError).toBe(true);
    });

    it('accepts emitProgress option', () => {
      const p = new Pipeline({ emitProgress: false });
      expect(p.options.emitProgress).toBe(false);
    });

    it('accepts parallel option', () => {
      const p = new Pipeline({ parallel: true });
      expect(p.options.parallel).toBe(true);
    });

    it('accepts maxConcurrency option', () => {
      const p = new Pipeline({ maxConcurrency: 10 });
      expect(p.options.maxConcurrency).toBe(10);
    });

    it('has sensible defaults', () => {
      expect(pipeline.options).toMatchObject({
        continueOnError: expect.any(Boolean),
        emitProgress: expect.any(Boolean),
        parallel: expect.any(Boolean),
        maxConcurrency: expect.any(Number)
      });

      expect(pipeline.options.maxConcurrency).toBeGreaterThan(0);
    });
  });

  describe('Method Signatures', () => {
    it('.process() is async and returns a promise', async () => {
      const mockStage = {
        process: async (input) => ({ ...input, processed: true })
      };

      pipeline.through(mockStage);

      const result = pipeline.process({ test: true });
      expect(result).toBeInstanceOf(Promise);

      const output = await result;
      expect(output).toBeDefined();
    });

    it('.through() signature matches expected', () => {
      // .through(stages) where stages is Array|Function|Object
      expect(pipeline.through.length).toBe(1);
    });
  });

  describe('API Stability Assertions', () => {
    it('maintains backward compatibility with documented API', () => {
      // These are the ONLY methods that should be public
      const expectedMethods = ['through', 'process'];

      for (const method of expectedMethods) {
        expect(typeof pipeline[method]).toBe('function');
      }
    });

    it('does not expose internal methods', () => {
      // These should be private (prefixed with _) or not exist
      const internalMethods = ['addStage', 'run', 'execute', 'init'];

      for (const method of internalMethods) {
        if (pipeline[method]) {
          // If it exists, it should start with _
          expect(method.startsWith('_')).toBe(true);
        }
      }
    });

    it('constructor signature is stable', () => {
      // Constructor should accept optional options object
      expect(() => new Pipeline()).not.toThrow();
      expect(() => new Pipeline({})).not.toThrow();
      expect(() => new Pipeline({ continueOnError: true })).not.toThrow();
    });
  });

  describe('Error Cases', () => {
    it('handles invalid stage gracefully', async () => {
      pipeline.through(null);

      // Should not throw immediately
      expect(pipeline.stages).toEqual([null]);
    });

    it('processes with empty stages', async () => {
      const input = { data: 'test' };
      const output = await pipeline.process(input);

      // With no stages, output should be input
      expect(output).toEqual(input);
    });
  });

  describe('Chaining Pattern', () => {
    it('supports fluent API for stage registration', () => {
      const stage1 = { process: async (i) => i };
      const stage2 = { process: async (i) => i };
      const stage3 = { process: async (i) => i };

      // Should allow chaining
      const result = pipeline
        .through(stage1)
        .through(stage2)
        .through(stage3);

      expect(result).toBe(pipeline);
      expect(pipeline.stages).toHaveLength(3);
    });
  });
});

describe('Pipeline API Documentation Examples', () => {
  it('basic usage example works', async () => {
    const pipeline = new Pipeline();

    const stage1 = {
      process: async (input) => {
        return { ...input, step1: true };
      }
    };

    const stage2 = {
      process: async (input) => {
        return { ...input, step2: true };
      }
    };

    pipeline.through([stage1, stage2]);

    const output = await pipeline.process({ start: true });

    expect(output).toEqual({
      start: true,
      step1: true,
      step2: true
    });
  });

  it('chaining example works', async () => {
    const pipeline = new Pipeline();

    pipeline
      .through({ process: async (i) => ({ ...i, a: 1 }) })
      .through({ process: async (i) => ({ ...i, b: 2 }) })
      .through({ process: async (i) => ({ ...i, c: 3 }) });

    const output = await pipeline.process({});

    expect(output).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('event subscription example works', async () => {
    const pipeline = new Pipeline();
    const events = [];

    pipeline.on('pipeline:start', (data) => {
      events.push({ type: 'start', data });
    });

    pipeline.on('pipeline:complete', (data) => {
      events.push({ type: 'complete', data });
    });

    pipeline.through({ process: async (i) => i });

    await pipeline.process({ test: true });

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('start');
    expect(events[1].type).toBe('complete');
  });
});
