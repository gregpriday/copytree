import TransformStage from '../../../../src/pipeline/stages/TransformStage.js';
import { TransformError } from '../../../../src/utils/errors.js';

class TextTransformer {
  constructor(impl) {
    this.isHeavy = false;
    this.cacheEnabled = true;
    this.transform = jest.fn(impl);
  }
}

class HeavyTransformer {
  constructor(impl) {
    this.isHeavy = true;
    this.cacheEnabled = true;
    this.transform = jest.fn(impl);
  }

  async flush() {}
}

function makeRegistry(mapByPath, allTransformers = []) {
  return {
    getForFile(file) {
      if (mapByPath[file.path]) {
        return mapByPath[file.path];
      }
      throw new Error('No transformer');
    },
    getAllTransformers() {
      return allTransformers;
    },
  };
}

function makeCache({ cached = null } = {}) {
  return {
    get: jest.fn(async () => cached),
    set: jest.fn(async () => {}),
  };
}

describe('TransformStage (real)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes transformed, passthrough, null, and errored files with stats', async () => {
    const success = new TextTransformer(async (file) => ({
      ...file,
      content: 'transformed content',
      transformed: true,
      transformedBy: 'TextTransformer',
    }));

    const returnsNull = new TextTransformer(async () => null);

    const throws = new TextTransformer(async () => {
      throw new Error('boom');
    });

    const registry = makeRegistry({
      'a.txt': success,
      'c.txt': returnsNull,
      'd.txt': throws,
    });

    const stage = new TransformStage({
      registry,
      cache: makeCache(),
      maxConcurrency: 2,
    });

    const input = {
      files: [
        { path: 'a.txt', content: 'a' },
        { path: 'b.txt', content: 'b' },
        { path: 'c.txt', content: 'c' },
        { path: 'd.txt', content: 'd' },
      ],
      stats: { discoveredCount: 4 },
    };

    const result = await stage.process(input);

    expect(result.stats.transformedCount).toBe(1);
    expect(result.stats.transformErrors).toBe(1);

    expect(result.files[0].content).toBe('transformed content');
    expect(result.files[1]).toEqual(input.files[1]);
    expect(result.files[2]).toEqual(input.files[2]);
    expect(result.files[3].error).toBe('boom');
    expect(result.files[3].content).toContain('[Transform error: boom]');
  });

  test('uses cached heavy transform results and skips transform invocation', async () => {
    const heavy = new HeavyTransformer(async (file) => ({
      ...file,
      content: 'should-not-run',
      transformed: true,
    }));

    const cachedResult = {
      path: 'cached.txt',
      content: 'from-cache',
      transformed: true,
      transformedBy: 'HeavyTransformer',
    };

    const cache = makeCache({ cached: cachedResult });
    const registry = makeRegistry({ 'cached.txt': heavy }, [heavy]);

    const stage = new TransformStage({
      registry,
      cache,
      maxConcurrency: 1,
    });

    const result = await stage.process({
      files: [{ path: 'cached.txt', content: 'raw' }],
      stats: {},
    });

    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(heavy.transform).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();

    expect(result.files[0]).toEqual(cachedResult);
    expect(result.stats.transformedCount).toBe(1);
    expect(result.stats.transformErrors).toBe(0);
  });

  test('caches heavy transform misses and flushes registered batch transformers', async () => {
    const heavy = new HeavyTransformer(async (file) => ({
      ...file,
      content: 'heavy-output',
      transformed: true,
      transformedBy: 'HeavyTransformer',
    }));

    const flushSpy = jest.spyOn(heavy, 'flush').mockResolvedValue();

    const cache = makeCache({ cached: null });
    const registry = makeRegistry({ 'x.txt': heavy }, [heavy]);

    const stage = new TransformStage({
      registry,
      cache,
      maxConcurrency: 1,
    });

    const result = await stage.process({
      files: [{ path: 'x.txt', content: 'x' }],
      stats: {},
    });

    expect(heavy.transform).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set.mock.calls[0][0]).toEqual(expect.any(String));
    expect(cache.set.mock.calls[0][1]).toMatchObject({
      path: 'x.txt',
      content: 'heavy-output',
      transformed: true,
    });
    expect(flushSpy).toHaveBeenCalledTimes(1);

    expect(result.stats.transformedCount).toBe(1);
    expect(result.stats.transformErrors).toBe(0);
  });

  test('handleError recovers for recoverable errors and rethrows non-recoverable ones', async () => {
    const stage = new TransformStage({ cache: makeCache() });
    const input = { files: [{ path: 'a' }, { path: 'b' }], stats: { discoveredCount: 2 } };

    const recovered = await stage.handleError(new TransformError('transform failed', 't', 'a'), input);

    expect(recovered.stats.transformedCount).toBe(0);
    expect(recovered.stats.transformErrors).toBe(2);
    expect(recovered.stats.recoveredFromError).toBe(true);

    await expect(stage.handleError(new Error('totally fatal'), input)).rejects.toThrow('totally fatal');
  });

  test('getTransformerForFile honors enable flags and noCache mode', () => {
    const transformer = new TextTransformer(async (file) => file);
    const registry = makeRegistry({ 'f.txt': transformer });

    const disabledExact = new TransformStage({
      registry,
      transformers: { TextTransformer: { enabled: false } },
      cache: makeCache(),
    });
    expect(disabledExact.getTransformerForFile({ path: 'f.txt' })).toBeNull();

    const disabledLowercase = new TransformStage({
      registry,
      transformers: { texttransformer: { enabled: false } },
      cache: makeCache(),
    });
    expect(disabledLowercase.getTransformerForFile({ path: 'f.txt' })).toBeNull();

    const disabledShort = new TransformStage({
      registry,
      transformers: { text: { enabled: false } },
      cache: makeCache(),
    });
    expect(disabledShort.getTransformerForFile({ path: 'f.txt' })).toBeNull();

    const enabled = new TransformStage({
      registry,
      transformers: { text: { enabled: true } },
      noCache: true,
      cache: makeCache(),
    });
    const selected = enabled.getTransformerForFile({ path: 'f.txt' });

    expect(selected).toBe(transformer);
    expect(transformer.cacheEnabled).toBe(false);

    const noRegistry = new TransformStage({ cache: makeCache() });
    expect(noRegistry.getTransformerForFile({ path: 'f.txt' })).toBeNull();
  });

  test('returns null when registry lookup throws', () => {
    const stage = new TransformStage({
      registry: {
        getForFile() {
          throw new Error('lookup failed');
        },
      },
      cache: makeCache(),
    });

    expect(stage.getTransformerForFile({ path: 'missing.txt' })).toBeNull();
  });
});
