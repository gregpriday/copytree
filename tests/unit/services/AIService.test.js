// AIService test - tests the mocked AIService functionality
// The real AIService is mocked globally in setup-mocks.js to avoid API key requirements

import { AIService, getAI } from '../../../src/services/AIService.js';

describe('AIService', () => {
  describe('Static Methods - Core functionality', () => {
    it('should have all required static methods', () => {
      expect(AIService.summarizeFile).toBeDefined();
      expect(AIService.describeImage).toBeDefined();
      expect(AIService.summarizeText).toBeDefined();
      expect(AIService.summarizeUnitTests).toBeDefined();
      expect(AIService.describeSVG).toBeDefined();
      expect(AIService.isAvailable).toBeDefined();
      expect(AIService.getProvider).toBeDefined();
      expect(AIService.getModel).toBeDefined();
      expect(AIService.forTask).toBeDefined();
    });

    it('should call async static methods successfully', async () => {
      const fileResult = await AIService.summarizeFile('test.js', 'content');
      const imageResult = await AIService.describeImage(Buffer.from('test'), 'image/png');
      const textResult = await AIService.summarizeText('test text');
      const testsResult = await AIService.summarizeUnitTests('test code');
      const svgResult = await AIService.describeSVG('<svg></svg>');
      
      expect(fileResult).toBe('Mocked file summary');
      expect(imageResult).toBe('Mocked image description');
      expect(textResult).toBe('Mocked text summary');
      expect(testsResult).toBe('Mocked unit test summary');
      expect(svgResult).toBe('Mocked SVG description');
    });

    it('should call synchronous static methods', () => {
      const available = AIService.isAvailable();
      const provider = AIService.getProvider();
      const model = AIService.getModel();
      
      expect(available).toBe(true);
      expect(provider).toBe('mock-provider');
      expect(model).toBe('mock-model');
    });

    it('should create AIService for task', () => {
      const service = AIService.forTask('codeDescription');
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AIService);
    });

    it('should create AIService for task with options', () => {
      const options = { temperature: 0.3 };
      const service = AIService.forTask('codeDescription', options);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AIService);
    });

    it('should throw error for unknown task', () => {
      expect(() => AIService.forTask('unknown-task')).toThrow('Unknown AI task: unknown-task');
    });
  });

  describe('Constructor', () => {
    it('should create AIService instances without error', () => {
      expect(() => new AIService()).not.toThrow();
      expect(() => new AIService({ model: 'test' })).not.toThrow();
    });

    it('should create instances that are defined', () => {
      const service1 = new AIService();
      const service2 = new AIService({ model: 'test' });
      
      expect(service1).toBeDefined();
      expect(service2).toBeDefined();
      expect(service1).toBeInstanceOf(AIService);
      expect(service2).toBeInstanceOf(AIService);
    });
  });

  describe('getAI function', () => {
    it('should return singleton AIService instance', () => {
      const ai1 = getAI();
      const ai2 = getAI();
      
      expect(ai1).toBeDefined();
      expect(ai2).toBeDefined();
      expect(ai1).toBe(ai2); // Should be same instance
      expect(ai1).toBeInstanceOf(AIService);
    });
  });

  describe('Transformer compatibility', () => {
    it('should support patterns used by AISummaryTransformer', () => {
      // This is the pattern used in AISummaryTransformer.js:
      // this.ai = AIService.forTask('codeDescription', options);
      const ai = AIService.forTask('codeDescription', { temperature: 0.3 });
      expect(ai).toBeDefined();
      expect(ai).toBeInstanceOf(AIService);
      
      // The transformer depends on this pattern working, which it does
      // The actual method calls would happen at runtime and are mocked globally
    });

    it('should support patterns used by BatchAISummaryTransformer', () => {
      // This is the pattern used in BatchAISummaryTransformer.js:
      // this.ai = AIService.forTask('codeDescription', options);
      const ai = AIService.forTask('codeDescription', { batchSize: 5 });
      expect(ai).toBeDefined();
      expect(ai).toBeInstanceOf(AIService);
      
      // The transformer depends on this pattern working, which it does
    });

    it('should create instances for transformer usage', () => {
      const instance = new AIService();
      
      // Instance creation works, which is what transformers need
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(AIService);
    });
  });

  describe('API Key Protection', () => {
    it('should not require real API keys', () => {
      // This test verifies that the service can be instantiated without
      // requiring actual API keys or making real network calls
      expect(() => new AIService()).not.toThrow();
      expect(() => AIService.forTask('codeDescription')).not.toThrow();
      expect(() => getAI()).not.toThrow();
    });

    it('should work without external dependencies', async () => {
      // Test that the static methods work without external services
      await expect(AIService.summarizeFile('test.js', 'content')).resolves.toBe('Mocked file summary');
      expect(AIService.isAvailable()).toBe(true);
      
      // Test that instances can be created without external services
      const service = new AIService();
      expect(service).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain all legacy static methods for transformer compatibility', () => {
      // All these methods should exist for backward compatibility
      const methods = [
        'summarizeFile',
        'describeImage', 
        'summarizeText',
        'summarizeUnitTests',
        'describeSVG',
        'isAvailable',
        'getProvider',
        'getModel',
        'forTask'
      ];
      
      for (const method of methods) {
        expect(AIService[method]).toBeDefined();
        expect(typeof AIService[method]).toBe('function');
      }
    });

    it('should support both instance and static usage patterns', async () => {
      // Static usage (legacy transformers)
      const staticResult = await AIService.summarizeFile('test.js', 'content');
      expect(staticResult).toBe('Mocked file summary');
      
      // Instance usage (modern transformers)
      const instance = AIService.forTask('codeDescription');
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(AIService);
      
      // Static methods work, instance creation works - this is what matters for transformers
    });
  });

  describe('Integration patterns', () => {
    it('should work with the patterns used in real transformer files', () => {
      // Pattern from AISummaryTransformer.js line 19:
      // this.ai = AIService.forTask('codeDescription', options);
      const aiService = AIService.forTask('codeDescription', { 
        temperature: 0.3,
        maxTokens: 2048 
      });
      
      expect(aiService).toBeDefined();
      expect(aiService).toBeInstanceOf(AIService);
      
      // Pattern from BatchAISummaryTransformer.js line 21:
      // this.ai = AIService.forTask('codeDescription', options);
      const batchAiService = AIService.forTask('codeDescription', {
        batchSize: 5,
        maxBatchSize: 200 * 1024
      });
      
      expect(batchAiService).toBeDefined();
      expect(batchAiService).toBeInstanceOf(AIService);
    });

    it('should provide singleton access pattern', () => {
      // Some parts of the codebase might use getAI() for singleton access
      const singleton1 = getAI();
      const singleton2 = getAI();
      
      expect(singleton1).toBeDefined();
      expect(singleton1).toBe(singleton2);
      expect(singleton1).toBeInstanceOf(AIService);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown-task specifically', () => {
      // Only 'unknown-task' is configured to throw in the mock
      expect(() => AIService.forTask('unknown-task')).toThrow('Unknown AI task: unknown-task');
    });

    it('should handle valid task names correctly', () => {
      // Valid task should work
      expect(() => AIService.forTask('codeDescription')).not.toThrow();
      
      // For testing purposes, the mock accepts any task except 'unknown-task'
      expect(() => AIService.forTask('someOtherTask')).not.toThrow();
    });
  });
});