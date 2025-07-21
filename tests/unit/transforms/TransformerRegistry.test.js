const TransformerRegistry = require('../../../src/transforms/TransformerRegistry');
const BaseTransformer = require('../../../src/transforms/BaseTransformer');
const { TransformError } = require('../../../src/utils/errors');

// Mock transformer for testing
class TestTransformer extends BaseTransformer {
  constructor(options = {}) {
    super('test-transformer', options);
  }

  async canTransform(filePath) {
    return filePath.endsWith('.test');
  }

  async transform(filePath, content, metadata) {
    return {
      content: `transformed: ${content}`,
      metadata: { ...metadata, transformed: true }
    };
  }
}

describe('TransformerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new TransformerRegistry();
  });

  describe('constructor', () => {
    test('should create empty registry', () => {
      expect(registry.transformers.size).toBe(0);
    });

    test('should initialize maps', () => {
      expect(registry.extensionMap).toBeInstanceOf(Map);
      expect(registry.mimeTypeMap).toBeInstanceOf(Map);
      expect(registry.defaultTransformer).toBeNull();
    });
  });

  describe('register', () => {
    test('should register transformer with name', () => {
      const transformer = new TestTransformer();
      registry.register('test-transformer', transformer);
      
      expect(registry.has('test-transformer')).toBe(true);
      expect(registry.get('test-transformer')).toBe(transformer);
    });

    test('should register with options', () => {
      const transformer = new TestTransformer();
      const options = { priority: 5, enabled: true };
      registry.register('test-transformer', transformer, options);
      
      const entry = registry.transformers.get('test-transformer');
      expect(entry.options.priority).toBe(5);
      expect(entry.options.enabled).toBe(true);
    });

    test('should register extensions', () => {
      const transformer = new TestTransformer();
      const options = { extensions: ['.test', 'another'] };
      registry.register('test-transformer', transformer, options);
      
      expect(registry.extensionMap.has('.test')).toBe(true);
      expect(registry.extensionMap.has('.another')).toBe(true);
      expect(registry.extensionMap.get('.test')).toContain('test-transformer');
    });

    test('should register MIME types', () => {
      const transformer = new TestTransformer();
      const options = { mimeTypes: ['text/test', 'application/test'] };
      registry.register('test-transformer', transformer, options);
      
      expect(registry.mimeTypeMap.has('text/test')).toBe(true);
      expect(registry.mimeTypeMap.get('text/test')).toContain('test-transformer');
    });

    test('should set as default', () => {
      const transformer = new TestTransformer();
      const options = { isDefault: true };
      registry.register('test-transformer', transformer, options);
      
      expect(registry.defaultTransformer).toBe('test-transformer');
    });
  });

  describe('get', () => {
    test('should get registered transformer', () => {
      const transformer = new TestTransformer();
      registry.register('test-transformer', transformer);
      
      expect(registry.get('test-transformer')).toBe(transformer);
    });

    test('should throw error for non-existent transformer', () => {
      expect(() => registry.get('non-existent')).toThrow(TransformError);
    });
  });

  describe('has', () => {
    test('should check if transformer exists', () => {
      registry.register('test-transformer', new TestTransformer());
      
      expect(registry.has('test-transformer')).toBe(true);
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('getForFile', () => {
    test('should get transformer for file by extension', () => {
      const transformer = new TestTransformer();
      registry.register('test-transformer', transformer, { 
        extensions: ['.test'] 
      });
      
      const result = registry.getForFile({ path: 'file.test' });
      expect(result).toBe(transformer);
    });

    test('should get transformer for file by MIME type', () => {
      const transformer = new TestTransformer();
      registry.register('test-transformer', transformer, { 
        mimeTypes: ['text/test'] 
      });
      
      const result = registry.getForFile({ 
        path: 'file.unknown', 
        mimeType: 'text/test' 
      });
      expect(result).toBe(transformer);
    });

    test('should return null for unhandled file', () => {
      const result = registry.getForFile({ path: 'file.unknown' });
      expect(result).toBeNull();
    });
  });

  describe('loadDefaults', () => {
    test('should load default transformers', () => {
      const initialSize = registry.transformers.size;
      registry.loadDefaults();
      
      // Should have loaded some default transformers
      expect(registry.transformers.size).toBeGreaterThan(initialSize);
    });
  });

  describe('extension handling', () => {
    test('should normalize extensions', () => {
      const transformer = new TestTransformer();
      registry.register('test-transformer', transformer, {
        extensions: ['test', '.test2'] // Mix with and without dots
      });
      
      expect(registry.extensionMap.has('.test')).toBe(true);
      expect(registry.extensionMap.has('.test2')).toBe(true);
    });

    test('should handle multiple transformers for same extension', () => {
      const transformer1 = new TestTransformer();
      const transformer2 = new TestTransformer();
      
      registry.register('transformer1', transformer1, { extensions: ['.txt'] });
      registry.register('transformer2', transformer2, { extensions: ['.txt'] });
      
      const transformers = registry.extensionMap.get('.txt');
      expect(transformers).toHaveLength(2);
      expect(transformers).toContain('transformer1');
      expect(transformers).toContain('transformer2');
    });
  });

  describe('priority handling', () => {
    test('should select transformer with highest priority', () => {
      const lowPriorityTransformer = new TestTransformer();
      const highPriorityTransformer = new TestTransformer();
      
      registry.register('low-priority', lowPriorityTransformer, { 
        extensions: ['.test'], 
        priority: 1 
      });
      registry.register('high-priority', highPriorityTransformer, { 
        extensions: ['.test'], 
        priority: 10 
      });
      
      const result = registry.getForFile({ path: 'file.test' });
      expect(result).toBe(highPriorityTransformer);
    });
  });

  describe('error handling', () => {
    test('should handle duplicate registration gracefully', () => {
      const transformer1 = new TestTransformer();
      const transformer2 = new TestTransformer();
      
      registry.register('test-transformer', transformer1);
      
      // Should not throw when overwriting
      expect(() => registry.register('test-transformer', transformer2)).not.toThrow();
      expect(registry.get('test-transformer')).toBe(transformer2);
    });
  });
});