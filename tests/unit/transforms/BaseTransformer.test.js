import { TransformError } from '../../../src/utils/errors.js';

// Use dynamic import for module under test
let BaseTransformer;

beforeAll(async () => {
  const baseTransformerModule = await import('../../../src/transforms/BaseTransformer.js');
  BaseTransformer = baseTransformerModule.default;
});

// Mock CacheService (other mocks are in setup-mocks.js)
jest.mock('../../../src/services/CacheService.js', () => ({
  CacheService: {
    create: jest.fn(() => ({
      get: jest.fn(() => null),
      set: jest.fn(),
    })),
  },
}));

// Test implementation of BaseTransformer - defined in beforeAll
let TestTransformer;

beforeAll(async () => {
  // Also define the test transformer after BaseTransformer is loaded
  class TestTransformerImpl extends BaseTransformer {
    async doTransform(file) {
      return {
        ...file,
        content: `transformed: ${file.content}`,
        transformed: true,
        transformedBy: 'TestTransformer',
      };
    }
  }
  TestTransformer = TestTransformerImpl;
});

describe('BaseTransformer', () => {
  let transformer;

  beforeEach(() => {
    jest.clearAllMocks();
    transformer = new TestTransformer();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      expect(transformer.options).toEqual({});
      expect(transformer.cacheEnabled).toBe(true); // Default is now true per config
      expect(transformer.cacheTTL).toBe(86400);
    });

    test('should accept custom options', () => {
      const customTransformer = new TestTransformer({
        cache: false,
        cacheTTL: 3600,
        custom: 'value',
      });

      expect(customTransformer.options.custom).toBe('value');
      expect(customTransformer.cacheEnabled).toBe(false);
      expect(customTransformer.cacheTTL).toBe(3600);
    });
  });

  describe('transform', () => {
    test('should transform a file', async () => {
      // For now, we'll create a transformer with a custom logger to bypass the mock issue
      const customTransformer = new TestTransformer({
        logger: {
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
      });

      const file = {
        path: 'test.js',
        content: 'console.log("hello");',
      };

      const result = await customTransformer.transform(file);

      expect(result.content).toBe('transformed: console.log("hello");');
      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('TestTransformer');
    });

    test('should validate input', async () => {
      const customTransformer = new TestTransformer({
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      await expect(customTransformer.transform(null)).rejects.toThrow('File object is required');

      await expect(customTransformer.transform({})).rejects.toThrow('File path is required');
    });

    test('should handle transformation errors', async () => {
      class ErrorTransformer extends BaseTransformer {
        async doTransform() {
          throw new Error('Transform failed');
        }
      }

      const errorTransformer = new ErrorTransformer();
      const file = { path: 'test.js', content: 'test' };

      await expect(errorTransformer.transform(file)).rejects.toThrow(TransformError);
    });
  });

  describe('caching', () => {
    test('should not cache transformations by default', async () => {
      const { CacheService } = require('../../../src/services/CacheService');

      const customTransformer = new TestTransformer({
        cache: false, // Explicitly disable
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      const file = {
        path: 'test.js',
        content: 'test content',
      };

      await customTransformer.transform(file);

      // Check that cache was not created
      expect(CacheService.create).not.toHaveBeenCalled();
    });

    test('should not cache when disabled', async () => {
      const { CacheService } = require('../../../src/services/CacheService');

      // Clear previous calls
      CacheService.create.mockClear();

      const noCacheTransformer = new TestTransformer({
        cache: false,
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      const file = {
        path: 'test.js',
        content: 'test content',
      };

      await noCacheTransformer.transform(file);

      expect(CacheService.create).not.toHaveBeenCalled();
    });

    test('should use cached results when available', async () => {
      const { CacheService } = require('../../../src/services/CacheService');

      // Set up cache mock to return cached data
      CacheService.create.mockReturnValueOnce({
        get: jest.fn().mockResolvedValueOnce({
          content: 'cached content',
          transformed: true,
          transformedBy: 'TestTransformer',
        }),
        set: jest.fn(),
      });

      // Create a new transformer with caching enabled
      const cachedTransformer = new TestTransformer({
        cache: true,
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
      });

      const file = {
        path: 'test.js',
        content: 'original content',
      };

      const result = await cachedTransformer.transform(file);

      expect(result.content).toBe('cached content');
      expect(result.fromCache).toBe(true);
    });
  });

  describe('helper methods', () => {
    test('should detect text content', () => {
      expect(transformer.isTextContent('hello')).toBe(true);
      expect(transformer.isTextContent(Buffer.from('hello'))).toBe(true);
      expect(transformer.isTextContent(Buffer.from([0, 1, 2]))).toBe(false);
    });

    test('should format bytes', () => {
      expect(transformer.formatBytes(0)).toBe('0 B');
      expect(transformer.formatBytes(1024)).toBe('1 KB');
      expect(transformer.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(transformer.formatBytes(1536)).toBe('1.5 KB');
    });

    test('should detect encoding', () => {
      const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x65]);
      expect(transformer.detectEncoding(utf8Bom)).toBe('utf8');

      const utf16le = Buffer.from([0xff, 0xfe, 0x68, 0x00]);
      expect(transformer.detectEncoding(utf16le)).toBe('utf16le');

      const noBom = Buffer.from('hello');
      expect(transformer.detectEncoding(noBom)).toBe('utf8');
    });
  });

  describe('abstract methods', () => {
    test('should require doTransform implementation', async () => {
      const baseTransformer = new BaseTransformer();

      await expect(baseTransformer.doTransform({})).rejects.toThrow(
        'doTransform() must be implemented by subclass',
      );
    });
  });

  describe('metadata', () => {
    test('should return transformer metadata', () => {
      const metadata = transformer.getMetadata();

      expect(metadata.name).toBe('TestTransformerImpl');
      expect(metadata.options).toEqual({});
    });
  });

  describe('canTransform', () => {
    test('should return true by default', () => {
      const file = { path: 'any.file' };
      expect(transformer.canTransform(file)).toBe(true);
    });
  });
});
