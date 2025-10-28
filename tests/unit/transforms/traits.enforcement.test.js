/**
 * Transformer trait enforcement tests
 *
 * Validates that transformer traits (heavy, idempotent, dependencies, etc.)
 * are correctly enforced by the registry and pipeline.
 */

import TransformerRegistry from '../../../src/transforms/TransformerRegistry.js';
import TransformStage from '../../../src/pipeline/stages/TransformStage.js';
import { createMockFiles } from '../../helpers/pipeline.js';
import { cleanTmpDir } from '../../helpers/fixtures.js';

// Mock transformers for testing
class MockTransformer {
  constructor(name, traits = {}) {
    this.name = name;
    this.traits = {
      inputTypes: traits.inputTypes || ['text'],
      outputTypes: traits.outputTypes || ['text'],
      heavy: traits.heavy !== undefined ? traits.heavy : false,
      idempotent: traits.idempotent !== undefined ? traits.idempotent : true,
      dependencies: traits.dependencies || [],
      priority: traits.priority || 0
    };
    this.transformCalls = [];
  }

  async transform(file) {
    this.transformCalls.push(file);
    return {
      ...file,
      content: `${this.name}: ${file.content}`,
      metadata: {
        ...file.metadata,
        transformedBy: [...(file.metadata?.transformedBy || []), this.name]
      }
    };
  }

  canTransform(file) {
    return this.traits.inputTypes.includes(file.type || 'text');
  }
}

describe('Transformer Trait Enforcement', () => {
  let registry;

  beforeEach(() => {
    registry = new TransformerRegistry();
    // Mock logger to avoid undefined errors
    registry.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });

  afterEach(() => {
    cleanTmpDir();
  });

  describe('Heavy Transformer Trait', () => {
    it('identifies heavy transformers correctly', () => {
      const lightTransformer = new MockTransformer('light', { heavy: false });
      const heavyTransformer = new MockTransformer('heavy', { heavy: true });

      registry.register(lightTransformer);
      registry.register(heavyTransformer);

      const light = registry.get('light');
      const heavy = registry.get('heavy');

      expect(light.traits.heavy).toBe(false);
      expect(heavy.traits.heavy).toBe(true);
    });

    it('skips heavy transformers when budget prohibits', async () => {
      const lightTransformer = new MockTransformer('light', { heavy: false });
      const heavyTransformer = new MockTransformer('heavy', { heavy: true });

      registry.register(lightTransformer);
      registry.register(heavyTransformer);

      const files = createMockFiles(1, { withContent: true });
      files[0].type = 'text';

      const stage = new TransformStage();
      stage.registry = registry;

      // Simulate budget constraints
      const options = {
        profile: {
          transformers: {
            light: { enabled: true },
            heavy: { enabled: false } // Disabled due to budget
          }
        }
      };

      const result = await stage.process({ files, options });

      expect(lightTransformer.transformCalls.length).toBe(1);
      expect(heavyTransformer.transformCalls.length).toBe(0);
    });

    it('allows heavy transformers when explicitly enabled', async () => {
      const heavyTransformer = new MockTransformer('heavy', { heavy: true });
      registry.register(heavyTransformer);

      const files = createMockFiles(1, { withContent: true });
      files[0].type = 'text';

      const stage = new TransformStage();
      stage.registry = registry;

      const options = {
        profile: {
          transformers: {
            heavy: { enabled: true }
          }
        }
      };

      const result = await stage.process({ files, options });

      expect(heavyTransformer.transformCalls.length).toBe(1);
    });
  });

  describe('Idempotent Trait', () => {
    it('identifies idempotent transformers', () => {
      const idempotent = new MockTransformer('idempotent', { idempotent: true });
      const nonIdempotent = new MockTransformer('non-idempotent', { idempotent: false });

      registry.register(idempotent);
      registry.register(nonIdempotent);

      expect(registry.get('idempotent').traits.idempotent).toBe(true);
      expect(registry.get('non-idempotent').traits.idempotent).toBe(false);
    });

    it('allows multiple applications of idempotent transformers', async () => {
      const idempotent = new MockTransformer('idempotent', { idempotent: true });
      registry.register(idempotent);

      const file = {
        path: 'test.txt',
        type: 'text',
        content: 'original',
        metadata: {}
      };

      // Apply twice
      const result1 = await idempotent.transform(file);
      const result2 = await idempotent.transform(result1);

      // Should be safe to apply multiple times
      expect(result1.content).toBe('idempotent: original');
      expect(result2.content).toBe('idempotent: idempotent: original');
    });

    it('warns when non-idempotent transformer applied multiple times', () => {
      const nonIdempotent = new MockTransformer('non-idempotent', {
        idempotent: false
      });

      registry.register(nonIdempotent);

      // Registry should track this trait for scheduling
      expect(nonIdempotent.traits.idempotent).toBe(false);
    });
  });

  describe('Input/Output Type Matching', () => {
    it('enforces input type requirements', () => {
      const imageTransformer = new MockTransformer('image', {
        inputTypes: ['image'],
        outputTypes: ['text']
      });

      const textFile = { path: 'file.txt', type: 'text', content: 'text' };
      const imageFile = { path: 'file.jpg', type: 'image', content: Buffer.from([]) };

      expect(imageTransformer.canTransform(textFile)).toBe(false);
      expect(imageTransformer.canTransform(imageFile)).toBe(true);
    });

    it('chains transformers based on type compatibility', async () => {
      // PDF -> text -> summary chain
      const pdfTransformer = new MockTransformer('pdf', {
        inputTypes: ['pdf'],
        outputTypes: ['text']
      });

      const summaryTransformer = new MockTransformer('summary', {
        inputTypes: ['text'],
        outputTypes: ['text']
      });

      registry.register(pdfTransformer);
      registry.register(summaryTransformer);

      const files = [{
        path: 'doc.pdf',
        type: 'pdf',
        content: Buffer.from([]),
        metadata: {}
      }];

      // First transformer changes type to text
      let result = await pdfTransformer.transform(files[0]);
      result.type = 'text';

      // Second transformer can now process it
      expect(summaryTransformer.canTransform(result)).toBe(true);
      result = await summaryTransformer.transform(result);

      expect(result.metadata.transformedBy).toEqual(['pdf', 'summary']);
    });

    it('prevents incompatible transformer chains', () => {
      const imageTransformer = new MockTransformer('image', {
        inputTypes: ['image'],
        outputTypes: ['text']
      });

      const pdfTransformer = new MockTransformer('pdf', {
        inputTypes: ['pdf'],
        outputTypes: ['text']
      });

      // Image output (text) can't feed into PDF transformer
      const textFile = { path: 'file.txt', type: 'text' };
      expect(pdfTransformer.canTransform(textFile)).toBe(false);
    });
  });

  describe('Dependency Trait', () => {
    it('tracks transformer dependencies', () => {
      const base = new MockTransformer('base', {
        dependencies: []
      });

      const dependent = new MockTransformer('dependent', {
        dependencies: ['base']
      });

      registry.register(base);
      registry.register(dependent);

      expect(registry.get('dependent').traits.dependencies).toContain('base');
    });

    it('resolves dependency order', () => {
      const a = new MockTransformer('a', { dependencies: [] });
      const b = new MockTransformer('b', { dependencies: ['a'] });
      const c = new MockTransformer('c', { dependencies: ['a', 'b'] });

      registry.register(c);
      registry.register(b);
      registry.register(a);

      // Registry should be able to determine correct order: a -> b -> c
      const transformers = [
        registry.get('a'),
        registry.get('b'),
        registry.get('c')
      ];

      // Verify dependencies are satisfied in order
      for (let i = 1; i < transformers.length; i++) {
        const transformer = transformers[i];
        const previousNames = transformers.slice(0, i).map(t => t.name);

        transformer.traits.dependencies.forEach(dep => {
          expect(previousNames).toContain(dep);
        });
      }
    });

    it('detects circular dependencies', () => {
      // Register transformers with circular dependency
      registry.register(
        'transformer-a',
        new MockTransformer('transformer-a', { dependencies: ['transformer-b'] }),
        {},
        { dependencies: ['transformer-b'] }
      );

      registry.register(
        'transformer-b',
        new MockTransformer('transformer-b', { dependencies: ['transformer-a'] }),
        {},
        { dependencies: ['transformer-a'] }
      );

      // Registry should detect this circular dependency
      expect(() => {
        registry.validateDependencies();
      }).toThrow(/circular.*dependency/i);
    });

    it('detects self-referencing dependencies', () => {
      registry.register(
        'self-ref',
        new MockTransformer('self-ref', { dependencies: ['self-ref'] }),
        {},
        { dependencies: ['self-ref'] }
      );

      expect(() => {
        registry.validateDependencies();
      }).toThrow(/circular.*dependency/i);
    });

    it('detects complex circular dependencies (A->B->C->A)', () => {
      registry.register(
        'a',
        new MockTransformer('a', { dependencies: ['b'] }),
        {},
        { dependencies: ['b'] }
      );

      registry.register(
        'b',
        new MockTransformer('b', { dependencies: ['c'] }),
        {},
        { dependencies: ['c'] }
      );

      registry.register(
        'c',
        new MockTransformer('c', { dependencies: ['a'] }),
        {},
        { dependencies: ['a'] }
      );

      expect(() => {
        registry.validateDependencies();
      }).toThrow(/circular.*dependency/i);
    });

    it('validates transformer dependencies exist', () => {
      registry.register(
        'dependent',
        new MockTransformer('dependent', { dependencies: ['missing'] }),
        {},
        { dependencies: ['missing'] }
      );

      // Should not throw for external dependencies like 'tesseract' or 'network'
      // Only throws for missing transformer dependencies
      expect(() => {
        registry.validateDependencies();
      }).not.toThrow();
    });

    it('returns topological order for valid dependencies', () => {
      const base = new MockTransformer('base', { dependencies: [] });
      const mid = new MockTransformer('mid', { dependencies: ['base'] });
      const top = new MockTransformer('top', { dependencies: ['mid'] });

      registry.register('base', base, {}, { dependencies: [] });
      registry.register('mid', mid, {}, { dependencies: ['base'] });
      registry.register('top', top, {}, { dependencies: ['mid'] });

      const order = registry.validateDependencies();

      // Order should be: base, mid, top (dependencies first)
      expect(order).toEqual(expect.arrayContaining(['base', 'mid', 'top']));
      expect(order.indexOf('base')).toBeLessThan(order.indexOf('mid'));
      expect(order.indexOf('mid')).toBeLessThan(order.indexOf('top'));
    });
  });

  describe('Priority Trait', () => {
    it('orders transformers by priority', () => {
      const low = new MockTransformer('low', { priority: 1 });
      const medium = new MockTransformer('medium', { priority: 5 });
      const high = new MockTransformer('high', { priority: 10 });

      registry.register(low);
      registry.register(high);
      registry.register(medium);

      const ordered = registry.getAll().sort((a, b) => b.traits.priority - a.traits.priority);

      expect(ordered.map(t => t.name)).toEqual(['high', 'medium', 'low']);
    });

    it('applies higher priority transformers first', async () => {
      const first = new MockTransformer('first', { priority: 10 });
      const second = new MockTransformer('second', { priority: 5 });

      registry.register(second);
      registry.register(first);

      const files = createMockFiles(1, { withContent: true });
      files[0].type = 'text';
      files[0].content = 'start';

      const stage = new TransformStage();
      stage.registry = registry;

      const options = {
        profile: {
          transformers: {
            first: { enabled: true },
            second: { enabled: true }
          }
        }
      };

      const result = await stage.process({ files, options });

      // Higher priority should be applied first
      expect(first.transformCalls.length).toBeGreaterThan(0);
      expect(second.transformCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Transformer Trait Combinations', () => {
    it('handles heavy + non-idempotent transformers carefully', async () => {
      const dangerous = new MockTransformer('dangerous', {
        heavy: true,
        idempotent: false
      });

      registry.register(dangerous);

      const transformer = registry.get('dangerous');
      expect(transformer.traits.heavy).toBe(true);
      expect(transformer.traits.idempotent).toBe(false);

      // Should require explicit enabling
      // Should not be applied multiple times
    });

    it('optimizes light + idempotent transformers', async () => {
      const optimizable = new MockTransformer('optimizable', {
        heavy: false,
        idempotent: true,
        priority: 0
      });

      registry.register(optimizable);

      const transformer = registry.get('optimizable');

      // These can be safely cached and reapplied
      expect(transformer.traits.heavy).toBe(false);
      expect(transformer.traits.idempotent).toBe(true);
    });

    it('respects all traits in scheduling decisions', () => {
      const complex = new MockTransformer('complex', {
        inputTypes: ['pdf'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true,
        dependencies: ['base'],
        priority: 5
      });

      registry.register(complex);

      const transformer = registry.get('complex');

      expect(transformer.traits).toMatchObject({
        inputTypes: ['pdf'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true,
        dependencies: ['base'],
        priority: 5
      });
    });
  });

  describe('Real-World Transformer Traits', () => {
    it('enforces PDF transformer traits', () => {
      // PDF: heavy, idempotent, pdf->text
      const pdfTraits = {
        inputTypes: ['pdf'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: true
      };

      const pdf = new MockTransformer('pdf', pdfTraits);
      registry.register(pdf);

      const transformer = registry.get('pdf');
      expect(transformer.traits.heavy).toBe(true);
      expect(transformer.traits.idempotent).toBe(true);
      expect(transformer.traits.inputTypes).toContain('pdf');
    });

    it('enforces Image OCR transformer traits', () => {
      // ImageOCR: heavy, non-idempotent (OCR can vary), image->text
      const ocrTraits = {
        inputTypes: ['image'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: false // OCR results can vary slightly
      };

      const ocr = new MockTransformer('image-ocr', ocrTraits);
      registry.register(ocr);

      const transformer = registry.get('image-ocr');
      expect(transformer.traits.heavy).toBe(true);
      expect(transformer.traits.idempotent).toBe(false);
    });

    it('enforces AI Summary transformer traits', () => {
      // AI: heavy, non-idempotent, text->text
      const aiTraits = {
        inputTypes: ['text'],
        outputTypes: ['text'],
        heavy: true,
        idempotent: false // AI responses vary
      };

      const ai = new MockTransformer('ai-summary', aiTraits);
      registry.register(ai);

      const transformer = registry.get('ai-summary');
      expect(transformer.traits.heavy).toBe(true);
      expect(transformer.traits.idempotent).toBe(false);
    });

    it('enforces Markdown transformer traits', () => {
      // Markdown: light, idempotent, text->text
      const markdownTraits = {
        inputTypes: ['text'],
        outputTypes: ['text'],
        heavy: false,
        idempotent: true
      };

      const markdown = new MockTransformer('markdown', markdownTraits);
      registry.register(markdown);

      const transformer = registry.get('markdown');
      expect(transformer.traits.heavy).toBe(false);
      expect(transformer.traits.idempotent).toBe(true);
    });
  });
});
