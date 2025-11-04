/**
 * Integration tests for FileDiscoveryStage with parallel mode
 */

import { jest } from '@jest/globals';
import FileDiscoveryStage from '../../src/pipeline/stages/FileDiscoveryStage.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { config } from '../../src/config/ConfigManager.js';

describe('FileDiscoveryStage - Parallel Mode', () => {
  let testDir;
  let originalConfig;

  beforeAll(async () => {
    // Save original config
    originalConfig = config().get('copytree.discovery');
  });

  beforeEach(async () => {
    // Create a unique test directory
    testDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }

    // Restore config
    if (originalConfig !== undefined) {
      config().set('copytree.discovery', originalConfig);
    }
  });

  describe('parallel mode enabled', () => {
    beforeEach(() => {
      // Enable parallel mode
      config().set('copytree.discovery', {
        parallelEnabled: true,
        maxConcurrency: 5,
      });
    });

    it('should discover files using parallel walker', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content');
      await fs.ensureDir(path.join(testDir, 'dir1'));
      await fs.writeFile(path.join(testDir, 'dir1', 'file3.js'), 'content');

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(3);
      expect(result.stats.totalFiles).toBe(3);
    });

    it('should respect ignore files in parallel mode', async () => {
      // Create test structure
      await fs.writeFile(path.join(testDir, 'included.js'), 'content');
      await fs.writeFile(path.join(testDir, 'excluded.log'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeignore'), '*.log\n');

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('included.js');
    });

    it('should handle large directory structures', async () => {
      // Create many files across multiple directories
      const dirCount = 10;
      const filesPerDir = 10;

      for (let i = 0; i < dirCount; i++) {
        const dirPath = path.join(testDir, `dir${i}`);
        await fs.ensureDir(dirPath);
        for (let j = 0; j < filesPerDir; j++) {
          await fs.writeFile(path.join(dirPath, `file${j}.js`), 'content');
        }
      }

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(dirCount * filesPerDir);
    });

    it('should use configured concurrency level', async () => {
      // Set custom concurrency
      config().set('copytree.discovery.maxConcurrency', 10);

      // Create test files
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.js`), 'content');
      }

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(20);
    });
  });

  describe('parallel mode disabled (sequential)', () => {
    beforeEach(() => {
      // Disable parallel mode (default)
      config().set('copytree.discovery', {
        parallelEnabled: false,
      });
    });

    it('should discover files using sequential walker', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content');

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(2);
    });
  });

  describe('parallel vs sequential equivalence', () => {
    it('should produce same results in both modes', async () => {
      // Create complex test structure
      await fs.ensureDir(path.join(testDir, 'src'));
      await fs.ensureDir(path.join(testDir, 'tests'));
      await fs.writeFile(path.join(testDir, 'src', 'index.js'), 'content');
      await fs.writeFile(path.join(testDir, 'src', 'utils.js'), 'content');
      await fs.writeFile(path.join(testDir, 'tests', 'test.js'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeignore'), 'temp/\n*.log\n');

      // Test with sequential mode
      config().set('copytree.discovery.parallelEnabled', false);
      const sequentialStage = new FileDiscoveryStage({ basePath: testDir });
      const sequentialResult = await sequentialStage.process({ basePath: testDir });
      const sequentialPaths = sequentialResult.files.map(f => f.path).sort();

      // Test with parallel mode
      config().set('copytree.discovery.parallelEnabled', true);
      const parallelStage = new FileDiscoveryStage({ basePath: testDir });
      const parallelResult = await parallelStage.process({ basePath: testDir });
      const parallelPaths = parallelResult.files.map(f => f.path).sort();

      // Should discover same files
      expect(parallelPaths).toEqual(sequentialPaths);
      expect(parallelResult.files.length).toBe(sequentialResult.files.length);
    });
  });

  describe('performance characteristics', () => {
    it('should complete discovery within reasonable time', async () => {
      // Create moderately large structure
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.js`), 'content');
      }

      config().set('copytree.discovery', {
        parallelEnabled: true,
        maxConcurrency: 10,
      });

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const startTime = Date.now();
      const result = await stage.process({ basePath: testDir });
      const duration = Date.now() - startTime;

      expect(result.files).toHaveLength(100);
      // Should complete in reasonable time (< 5 seconds for 100 files)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty directories', async () => {
      config().set('copytree.discovery.parallelEnabled', true);

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(0);
    });

    it('should handle deeply nested structures', async () => {
      // Create deep nesting
      let currentPath = testDir;
      for (let i = 0; i < 10; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.ensureDir(currentPath);
      }
      await fs.writeFile(path.join(currentPath, 'deep.js'), 'content');

      config().set('copytree.discovery.parallelEnabled', true);

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toContain('deep.js');
    });

    it('should handle special characters in filenames', async () => {
      const specialNames = [
        'file with spaces.js',
        'file-with-dashes.js',
        'file_with_underscores.js',
        'file.multiple.dots.js',
      ];

      for (const name of specialNames) {
        await fs.writeFile(path.join(testDir, name), 'content');
      }

      config().set('copytree.discovery.parallelEnabled', true);

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files).toHaveLength(specialNames.length);
      const discoveredNames = result.files.map(f => f.path).sort();
      expect(discoveredNames).toEqual(specialNames.sort());
    });
  });

  describe('force-include with parallel mode', () => {
    it('should handle force-include patterns in parallel mode', async () => {
      // Create files with .example pattern
      await fs.writeFile(path.join(testDir, '.example'), 'content');
      await fs.writeFile(path.join(testDir, 'regular.js'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeinclude'), '.example\n');

      config().set('copytree.discovery.parallelEnabled', true);

      const stage = new FileDiscoveryStage({ basePath: testDir });
      const result = await stage.process({ basePath: testDir });

      expect(result.files.length).toBeGreaterThanOrEqual(2);
      expect(result.files.some(f => f.path === '.example')).toBe(true);
      expect(result.files.some(f => f.path === 'regular.js')).toBe(true);
    });
  });
});
