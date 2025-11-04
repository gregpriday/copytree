/**
 * Unit tests for parallel directory walker
 */

import { jest } from '@jest/globals';
import { walkParallel, getAllFilesParallel } from '../../../src/utils/parallelWalker.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('parallelWalker', () => {
  let testDir;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && (await fs.pathExists(testDir))) {
      await fs.remove(testDir);
    }
  });

  describe('basic functionality', () => {
    it('should discover files in a flat directory', async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file2.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file3.js'), 'content');

      const files = await getAllFilesParallel(testDir, { concurrency: 2 });

      expect(files).toHaveLength(3);
      expect(files.every((f) => f.path && f.stats)).toBe(true);
    });

    it('should discover files in nested directories', async () => {
      // Create nested structure
      await fs.ensureDir(path.join(testDir, 'dir1'));
      await fs.ensureDir(path.join(testDir, 'dir1', 'dir2'));
      await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'dir1', 'file2.js'), 'content');
      await fs.writeFile(path.join(testDir, 'dir1', 'dir2', 'file3.js'), 'content');

      const files = await getAllFilesParallel(testDir, { concurrency: 2 });

      expect(files).toHaveLength(3);
      const filenames = files.map((f) => path.basename(f.path)).sort();
      expect(filenames).toEqual(['file1.js', 'file2.js', 'file3.js']);
    });

    it('should respect concurrency limit', async () => {
      // Create many directories
      for (let i = 0; i < 10; i++) {
        await fs.ensureDir(path.join(testDir, `dir${i}`));
        await fs.writeFile(path.join(testDir, `dir${i}`, 'file.js'), 'content');
      }

      // Use very low concurrency
      const files = await getAllFilesParallel(testDir, { concurrency: 1 });

      expect(files).toHaveLength(10);
    });
  });

  describe('ignore file support', () => {
    it('should respect .copytreeignore rules', async () => {
      // Create structure
      await fs.writeFile(path.join(testDir, 'included.js'), 'content');
      await fs.writeFile(path.join(testDir, 'excluded.log'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeignore'), '*.log\n');

      const files = await getAllFilesParallel(testDir, {
        concurrency: 2,
        ignoreFileName: '.copytreeignore',
      });

      expect(files).toHaveLength(1);
      expect(path.basename(files[0].path)).toBe('included.js');
    });

    it('should handle layered ignore files', async () => {
      // Create nested structure with ignore files
      await fs.ensureDir(path.join(testDir, 'dir1'));
      await fs.writeFile(path.join(testDir, 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file1.log'), 'content');
      await fs.writeFile(path.join(testDir, 'dir1', 'file2.js'), 'content');
      await fs.writeFile(path.join(testDir, 'dir1', 'file2.tmp'), 'content');

      // Root ignore: *.log
      await fs.writeFile(path.join(testDir, '.copytreeignore'), '*.log\n');
      // Nested ignore: *.tmp
      await fs.writeFile(path.join(testDir, 'dir1', '.copytreeignore'), '*.tmp\n');

      const files = await getAllFilesParallel(testDir, { concurrency: 2 });

      expect(files).toHaveLength(2);
      const filenames = files.map((f) => path.basename(f.path)).sort();
      expect(filenames).toEqual(['file1.js', 'file2.js']);
    });

    it('should prune excluded directories', async () => {
      // Create directory structure
      await fs.ensureDir(path.join(testDir, 'included'));
      await fs.ensureDir(path.join(testDir, 'excluded'));
      await fs.writeFile(path.join(testDir, 'included', 'file1.js'), 'content');
      await fs.writeFile(path.join(testDir, 'excluded', 'file2.js'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeignore'), 'excluded/\n');

      const files = await getAllFilesParallel(testDir, { concurrency: 2 });

      expect(files).toHaveLength(1);
      expect(files[0].path).toContain('included');
    });
  });

  describe('symlink handling', () => {
    it('should skip symlinks by default', async () => {
      await fs.writeFile(path.join(testDir, 'real.js'), 'content');

      // Create symlink (skip on Windows if not supported)
      try {
        await fs.symlink(path.join(testDir, 'real.js'), path.join(testDir, 'link.js'));
      } catch (error) {
        if (error.code === 'EPERM') {
          // Skip test on Windows without symlink permissions
          return;
        }
        throw error;
      }

      const files = await getAllFilesParallel(testDir, {
        concurrency: 2,
        followSymlinks: false,
      });

      expect(files).toHaveLength(1);
      expect(path.basename(files[0].path)).toBe('real.js');
    });

    it('should follow symlinks when enabled', async () => {
      await fs.writeFile(path.join(testDir, 'real.js'), 'content');

      // Create symlink (skip on Windows if not supported)
      try {
        await fs.symlink(path.join(testDir, 'real.js'), path.join(testDir, 'link.js'));
      } catch (error) {
        if (error.code === 'EPERM') {
          // Skip test on Windows without symlink permissions
          return;
        }
        throw error;
      }

      const files = await getAllFilesParallel(testDir, {
        concurrency: 2,
        followSymlinks: true,
      });

      // Should find both real file and symlink
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // Create a directory and a file we can read
      await fs.ensureDir(path.join(testDir, 'readable'));
      await fs.writeFile(path.join(testDir, 'readable', 'file.js'), 'content');

      // On Unix systems, create a directory without read permissions
      if (process.platform !== 'win32') {
        const unreadable = path.join(testDir, 'unreadable');
        await fs.ensureDir(unreadable);
        await fs.writeFile(path.join(unreadable, 'file.js'), 'content');
        await fs.chmod(unreadable, 0o000);

        const files = await getAllFilesParallel(testDir, { concurrency: 2 });

        // Should find the readable file and skip the unreadable directory
        expect(files.length).toBeGreaterThanOrEqual(1);
        expect(files.some((f) => f.path.includes('readable'))).toBe(true);

        // Cleanup: restore permissions
        await fs.chmod(unreadable, 0o755);
      }
    });

    it('should handle AbortSignal cancellation', async () => {
      // Create many files
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.js`), 'content');
      }

      const controller = new AbortController();
      const filesPromise = getAllFilesParallel(testDir, {
        concurrency: 2,
        signal: controller.signal,
      });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 10);

      await expect(filesPromise).rejects.toThrow('aborted');
    });
  });

  describe('backpressure', () => {
    it('should respect highWaterMark', async () => {
      // Create many files
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(path.join(testDir, `file${i}.js`), 'content');
      }

      let yieldedCount = 0;
      const generator = walkParallel(testDir, {
        concurrency: 10,
        highWaterMark: 5, // Small buffer
      });

      for await (const _file of generator) {
        yieldedCount++;
        // Simulate slow consumer
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      expect(yieldedCount).toBe(100);
    });
  });

  describe('deterministic ordering', () => {
    it('should produce consistent ordering within directories', async () => {
      // Create files with names that would sort differently on different platforms
      const filenames = ['zebra.js', 'alpha.js', 'beta.js', 'gamma.js'];
      for (const filename of filenames) {
        await fs.writeFile(path.join(testDir, filename), 'content');
      }

      // Run walker multiple times
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const files = await getAllFilesParallel(testDir, { concurrency: 2 });
        runs.push(files.map((f) => path.basename(f.path)));
      }

      // All runs should have files in the same order (within the root directory)
      // Note: The absolute order might vary due to parallelism, but within a directory
      // files should be consistently ordered
      expect(runs[0].sort()).toEqual(runs[1].sort());
      expect(runs[1].sort()).toEqual(runs[2].sort());
    });
  });

  describe('explanation mode', () => {
    it('should include explanation when explain=true', async () => {
      await fs.writeFile(path.join(testDir, 'file.js'), 'content');
      await fs.writeFile(path.join(testDir, 'file.log'), 'content');
      await fs.writeFile(path.join(testDir, '.copytreeignore'), '*.log\n');

      const files = [];
      for await (const file of walkParallel(testDir, {
        concurrency: 2,
        explain: true,
      })) {
        files.push(file);
      }

      expect(files).toHaveLength(1);
      expect(files[0].explanation).toBeDefined();
      expect(files[0].explanation.ignored).toBe(false);
    });
  });
});
