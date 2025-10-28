/**
 * Real Transformer Traits Validation
 *
 * Validates that actual transformer implementations declare correct traits
 * matching their expected behavior (heavy, idempotent, dependencies, etc.)
 */

import TransformerRegistry from '../../../src/transforms/TransformerRegistry.js';

describe('Real Transformer Traits Validation', () => {
  let registry;

  beforeAll(async () => {
    // Load the default registry with all real transformers
    registry = await TransformerRegistry.createDefault();
  });

  describe('PDF Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('pdf');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['binary'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true,
        orderSensitive: false,
        stateful: false
      });
    });

    it('declares memory requirements', () => {
      const traits = registry.getTraits('pdf');
      expect(traits.requirements).toHaveProperty('memory');
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('pdf');
      expect(traits.tags).toContain('text-extraction');
      expect(traits.tags).toContain('document');
      expect(traits.tags).toContain('pdf');
    });
  });

  describe('Image Transformer (OCR)', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('image');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['binary'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true, // OCR results are deterministic for same input
        orderSensitive: false,
        stateful: false
      });
    });

    it('declares tesseract dependency', () => {
      const traits = registry.getTraits('image');
      expect(traits.dependencies).toContain('tesseract');
    });

    it('declares memory requirements', () => {
      const traits = registry.getTraits('image');
      expect(traits.requirements).toHaveProperty('memory');
      // Image OCR typically requires more memory than PDF
      expect(traits.requirements.memory).toBeTruthy();
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('image');
      expect(traits.tags).toContain('text-extraction');
      expect(traits.tags).toContain('image');
      expect(traits.tags).toContain('ocr');
    });

    it('conflicts with image-description', () => {
      const traits = registry.getTraits('image');
      expect(traits.conflictsWith).toContain('image-description');
    });
  });

  describe('Markdown Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('markdown');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['text'],
        outputTypes: ['text'],
        heavy: false,
        idempotent: true,
        orderSensitive: false,
        stateful: false
      });
    });

    it('has no external dependencies', () => {
      const traits = registry.getTraits('markdown');
      expect(traits.dependencies).toHaveLength(0);
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('markdown');
      expect(traits.tags).toContain('text-processing');
      expect(traits.tags).toContain('markdown');
    });
  });

  describe('AI Summary Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('ai-summary');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['text'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true, // Same input should produce similar output
        orderSensitive: false,
        stateful: false
      });
    });

    it('requires network dependency', () => {
      const traits = registry.getTraits('ai-summary');
      expect(traits.dependencies).toContain('network');
    });

    it('requires API key', () => {
      const traits = registry.getTraits('ai-summary');
      expect(traits.requirements.apiKey).toBe(true);
      expect(traits.requirements.network).toBe(true);
    });

    it('declares significant memory requirements', () => {
      const traits = registry.getTraits('ai-summary');
      expect(traits.requirements.memory).toBeTruthy();
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('ai-summary');
      expect(traits.tags).toContain('ai');
      expect(traits.tags).toContain('summary');
      expect(traits.tags).toContain('expensive');
    });

    it('conflicts with file-summary', () => {
      const traits = registry.getTraits('ai-summary');
      expect(traits.conflictsWith).toContain('file-summary');
    });
  });

  describe('File Loader Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('file-loader');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['any'],
        outputTypes: ['text', 'binary'],
        heavy: false,
        idempotent: true,
        orderSensitive: false,
        stateful: false
      });
    });

    it('is the default transformer', () => {
      expect(registry.defaultTransformer).toBe('file-loader');
    });

    it('has no dependencies', () => {
      const traits = registry.getTraits('file-loader');
      expect(traits.dependencies).toHaveLength(0);
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('file-loader');
      expect(traits.tags).toContain('loader');
      expect(traits.tags).toContain('default');
    });
  });

  describe('CSV Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('csv');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['text'],
        outputTypes: ['text'],
        heavy: false,
        idempotent: true,
        orderSensitive: false,
        stateful: false
      });
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('csv');
      expect(traits.tags).toContain('data-processing');
      expect(traits.tags).toContain('csv');
    });
  });

  describe('Binary Transformer', () => {
    it('is registered and has correct traits', () => {
      const traits = registry.getTraits('binary');

      expect(traits).toBeDefined();
      expect(traits).toMatchObject({
        inputTypes: ['binary'],
        outputTypes: ['text'],
        heavy: false,
        idempotent: true,
        orderSensitive: false,
        stateful: false
      });
    });

    it('has appropriate tags', () => {
      const traits = registry.getTraits('binary');
      expect(traits.tags).toContain('binary-handler');
    });
  });

  describe('Heavy vs Light Transformers', () => {
    it('correctly classifies heavy transformers', () => {
      const heavyTransformers = ['pdf', 'image', 'ai-summary'];

      for (const name of heavyTransformers) {
        const traits = registry.getTraits(name);
        expect(traits.heavy).toBe(true);
      }
    });

    it('correctly classifies light transformers', () => {
      const lightTransformers = ['file-loader', 'markdown', 'csv', 'binary'];

      for (const name of lightTransformers) {
        const traits = registry.getTraits(name);
        expect(traits.heavy).toBe(false);
      }
    });
  });

  describe('Idempotency Classification', () => {
    it('all registered transformers are idempotent', () => {
      const allNames = Array.from(registry.transformers.keys());

      for (const name of allNames) {
        const traits = registry.getTraits(name);
        // All current transformers should be idempotent
        expect(traits.idempotent).toBe(true);
      }
    });
  });

  describe('Dependency Validation', () => {
    it('external dependencies are documented', () => {
      const traits = registry.getTraits('image');
      expect(traits.dependencies).toContain('tesseract');

      const aiTraits = registry.getTraits('ai-summary');
      expect(aiTraits.dependencies).toContain('network');
    });

    it('no circular dependencies exist', () => {
      expect(() => {
        registry.validateDependencies();
      }).not.toThrow();
    });

    it('returns valid topological order', () => {
      const order = registry.validateDependencies();

      expect(Array.isArray(order)).toBe(true);
      expect(order.length).toBeGreaterThan(0);

      // All registered transformers should be in the order
      const allNames = Array.from(registry.transformers.keys());
      for (const name of allNames) {
        expect(order).toContain(name);
      }
    });
  });

  describe('Input/Output Type Compatibility', () => {
    it('PDF produces text for downstream consumption', () => {
      const pdfTraits = registry.getTraits('pdf');
      expect(pdfTraits.outputTypes).toContain('text');
    });

    it('Image OCR produces text for downstream consumption', () => {
      const imageTraits = registry.getTraits('image');
      expect(imageTraits.outputTypes).toContain('text');
    });

    it('text-processing transformers accept text input', () => {
      const textProcessors = ['markdown', 'ai-summary', 'csv'];

      for (const name of textProcessors) {
        const traits = registry.getTraits(name);
        expect(traits.inputTypes).toContain('text');
      }
    });

    it('file-loader accepts any input type', () => {
      const traits = registry.getTraits('file-loader');
      expect(traits.inputTypes).toContain('any');
    });
  });

  describe('Resource Requirements', () => {
    it('heavy transformers declare resource requirements', () => {
      const pdf = registry.getTraits('pdf');
      const image = registry.getTraits('image');
      const ai = registry.getTraits('ai-summary');

      expect(pdf.requirements).toBeDefined();
      expect(image.requirements).toBeDefined();
      expect(ai.requirements).toBeDefined();

      // AI requires the most resources
      expect(ai.requirements.apiKey).toBe(true);
      expect(ai.requirements.network).toBe(true);
    });

    it('light transformers have minimal requirements', () => {
      const markdown = registry.getTraits('markdown');
      const csv = registry.getTraits('csv');

      expect(Object.keys(markdown.requirements || {}).length).toBe(0);
      expect(Object.keys(csv.requirements || {}).length).toBe(0);
    });
  });

  describe('Transformer Tags', () => {
    it('transformers are appropriately tagged', () => {
      const pdf = registry.getTraits('pdf');
      const image = registry.getTraits('image');

      // Both extract text from non-text sources
      expect(pdf.tags).toContain('text-extraction');
      expect(image.tags).toContain('text-extraction');
    });

    it('expensive transformers are tagged', () => {
      const ai = registry.getTraits('ai-summary');
      expect(ai.tags).toContain('expensive');
    });
  });
});
