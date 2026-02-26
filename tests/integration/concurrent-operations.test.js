/**
 * Integration tests for concurrent CopyTree operations
 *
 * Verifies that multiple concurrent copy/scan operations can run
 * with isolated configurations without interference.
 *
 * @see https://github.com/gregpriday/copytree/issues/62
 */

// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { scan, copy } from '../../src/index.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import Pipeline from '../../src/pipeline/Pipeline.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// Use test fixture
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Concurrent Operations Integration', () => {
  let outputDir;

  beforeEach(async () => {
    outputDir = path.join(os.tmpdir(), `copytree-concurrent-${randomUUID()}`);
    await fs.ensureDir(outputDir);
  });

  afterEach(async () => {
    if (outputDir && (await fs.pathExists(outputDir))) {
      await fs.remove(outputDir);
    }
  });

  describe('ConfigManager isolation in copy()', () => {
    it('should allow concurrent copy operations with different configs', async () => {
      // Create two config instances
      const config1 = await ConfigManager.create();
      const config2 = await ConfigManager.create();

      // Set different values to verify isolation
      config1.set('test.operation', 'copy1');
      config2.set('test.operation', 'copy2');

      // Run concurrent copy operations
      const [result1, result2] = await Promise.all([
        copy(testDir, { config: config1, format: 'json' }),
        copy(testDir, { config: config2, format: 'json' }),
      ]);

      // Both operations should complete successfully
      expect(result1.files.length).toBeGreaterThan(0);
      expect(result2.files.length).toBeGreaterThan(0);

      // Results should be equivalent (same directory scanned)
      expect(result1.files.length).toBe(result2.files.length);

      // Config values should remain isolated
      expect(config1.get('test.operation')).toBe('copy1');
      expect(config2.get('test.operation')).toBe('copy2');
    });

    it('should handle many concurrent copy operations', async () => {
      const operationCount = 5;

      // Create configs and run concurrent operations
      const configs = new Array(operationCount);
      const operations = Array(operationCount)
        .fill(null)
        .map(async (_, i) => {
          const config = await ConfigManager.create();
          config.set('operation.id', `op-${i}`);
          configs[i] = config;
          return copy(testDir, { config, format: 'json' });
        });

      const results = await Promise.all(operations);

      // All operations should complete successfully
      results.forEach((result, i) => {
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.stats.totalFiles).toBe(results[0].stats.totalFiles);
      });

      // Verify configs remained isolated (no shared state)
      configs.forEach((config, i) => {
        expect(config.get('operation.id')).toBe(`op-${i}`);
      });
    });
  });

  describe('ConfigManager isolation in scan()', () => {
    it('should allow concurrent scan operations with different configs', async () => {
      const config1 = await ConfigManager.create();
      const config2 = await ConfigManager.create();

      // Set unique values to verify isolation
      config1.set('test.scan', 'scan1');
      config2.set('test.scan', 'scan2');

      // Run concurrent scans
      const scanPromise1 = (async () => {
        const files = [];
        for await (const file of scan(testDir, { config: config1 })) {
          files.push(file);
        }
        return files;
      })();

      const scanPromise2 = (async () => {
        const files = [];
        for await (const file of scan(testDir, { config: config2 })) {
          files.push(file);
        }
        return files;
      })();

      const [files1, files2] = await Promise.all([scanPromise1, scanPromise2]);

      // Both scans should complete with same results
      expect(files1.length).toBeGreaterThan(0);
      expect(files2.length).toBe(files1.length);

      // Verify configs remained isolated after scan operations
      expect(config1.get('test.scan')).toBe('scan1');
      expect(config2.get('test.scan')).toBe('scan2');
    });
  });

  describe('Pipeline config injection', () => {
    it('should accept config via constructor options', async () => {
      const config = await ConfigManager.create();
      config.set('pipeline.testValue', 'injected');

      const pipeline = new Pipeline({ config });

      // Pipeline should have the config instance
      expect(pipeline._configInstance).toBe(config);
    });

    it('should create isolated config if not provided', async () => {
      const pipeline1 = new Pipeline({});
      const pipeline2 = new Pipeline({});

      // Trigger initialization
      pipeline1.through([]);
      pipeline2.through([]);
      await pipeline1.process({});
      await pipeline2.process({});

      // Each pipeline should have its own config instance
      expect(pipeline1._configInstance).toBeDefined();
      expect(pipeline2._configInstance).toBeDefined();
      expect(pipeline1._configInstance).not.toBe(pipeline2._configInstance);
    });

    it('should pass config to stages via context', async () => {
      const config = await ConfigManager.create();
      config.set('test.stageValue', 'passed-to-stage');

      const pipeline = new Pipeline({ config });

      // Create a test stage that captures config
      let capturedConfig = null;
      const TestStage = class {
        constructor() {
          this.name = 'TestStage';
        }
        async onInit(context) {
          capturedConfig = context.config;
        }
        async process(input) {
          return input;
        }
      };

      pipeline.through([new TestStage()]);
      await pipeline.process({});

      // Stage should receive the config
      expect(capturedConfig).toBe(config);
      expect(capturedConfig.get('test.stageValue')).toBe('passed-to-stage');
    });
  });

  describe('concurrent operations with different formats', () => {
    it('should handle concurrent operations with different output formats', async () => {
      const formats = ['json', 'xml', 'markdown', 'tree'];

      const operations = formats.map(async (format) => {
        const config = await ConfigManager.create();
        config.set('test.format', format);
        return copy(testDir, { config, format });
      });

      const results = await Promise.all(operations);

      // All operations should complete
      results.forEach((result, i) => {
        expect(result.output).toBeDefined();
        expect(result.output.length).toBeGreaterThan(0);
      });

      // Verify different formats produced different outputs
      expect(results[0].output).toContain('{'); // JSON
      expect(results[1].output).toContain('<?xml'); // XML
      expect(results[2].output).toContain('#'); // Markdown
      expect(results[3].output).toMatch(/[├└]/); // Tree
    });
  });

  describe('error isolation between concurrent operations', () => {
    it('should isolate errors between concurrent operations', async () => {
      // One operation with invalid path, one with valid
      const validConfig = await ConfigManager.create();
      const invalidConfig = await ConfigManager.create();

      const results = await Promise.allSettled([
        copy(testDir, { config: validConfig, format: 'json' }),
        copy('/nonexistent/path', { config: invalidConfig, format: 'json' }),
      ]);

      // Valid operation should succeed
      expect(results[0].status).toBe('fulfilled');
      expect(results[0].value.files.length).toBeGreaterThan(0);

      // Invalid operation should fail
      expect(results[1].status).toBe('rejected');
    });
  });

  describe('API exports ConfigManager', () => {
    it('should export ConfigManager from index', async () => {
      const api = await import('../../src/index.js');
      expect(api.ConfigManager).toBeDefined();
      expect(typeof api.ConfigManager.create).toBe('function');
    });
  });
});
