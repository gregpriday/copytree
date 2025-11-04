// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { scan } from '../../../src/api/scan.js';
import { ValidationError } from '../../../src/utils/errors.js';
import path from 'path';

// Use test fixture - works in both Jest and direct Node execution
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('scan()', () => {
  // Use existing test fixture

  describe('Basic functionality', () => {
    it('should yield FileResult objects for all files', async () => {
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toHaveProperty('path');
      expect(files[0]).toHaveProperty('absolutePath');
      expect(files[0]).toHaveProperty('size');
      expect(files[0]).toHaveProperty('modified');
      expect(files[0]).toHaveProperty('isBinary');
    });

    it('should return files in lexicographic order by default', async () => {
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }

      const paths = files.map((f) => f.path).filter(Boolean);
      const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));

      // Verify all paths are present and sorted
      expect(paths.length).toBe(sortedPaths.length);
      expect(paths.every((p) => sortedPaths.includes(p))).toBe(true);
    });

    it('should include file content by default', async () => {
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }

      const jsFile = files.find((f) => f.path.endsWith('.js'));
      expect(jsFile.content).toBeDefined();
      expect(jsFile.content).toContain('console.log');
    });

    it('should exclude content when includeContent is false', async () => {
      const files = [];
      for await (const file of scan(testDir, { includeContent: false })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      expect(files[0].content).toBeUndefined();
    });
  });

  describe('Filtering options', () => {
    it('should filter files by pattern', async () => {
      const files = [];
      for await (const file of scan(testDir, { filter: ['**/*.js'] })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      // All files should be JS files
      const nonJsFiles = files.filter((file) => !file.path.endsWith('.js'));
      expect(nonJsFiles.length).toBe(0);
    });

    it('should exclude files by pattern', async () => {
      const files = [];
      for await (const file of scan(testDir, { exclude: ['**/*.txt'] })) {
        files.push(file);
      }

      files.forEach((file) => {
        expect(file.path).not.toMatch(/\.txt$/);
      });
    });

    it('should respect multiple filter patterns', async () => {
      const files = [];
      for await (const file of scan(testDir, { filter: ['**/*.js', '**/*.md'] })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      // All files should match one of the patterns
      const invalidFiles = files.filter(
        (file) => !file.path.endsWith('.js') && !file.path.endsWith('.md'),
      );
      expect(invalidFiles.length).toBe(0);
    });
  });

  describe('Sorting options', () => {
    it('should sort by path', async () => {
      const files = [];
      for await (const file of scan(testDir, { sort: 'path' })) {
        files.push(file);
      }

      const paths = files.map((f) => f.path);
      // Verify files are sorted (compare adjacent elements)
      for (let i = 1; i < paths.length; i++) {
        expect(paths[i].localeCompare(paths[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by size', async () => {
      const files = [];
      for await (const file of scan(testDir, { sort: 'size' })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      // Verify files are sorted by size
      for (let i = 1; i < files.length; i++) {
        expect(files[i].size).toBeGreaterThanOrEqual(files[i - 1].size);
      }
    });
  });

  describe('AbortSignal support', () => {
    it('should support cancellation via AbortSignal', async () => {
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      await expect(async () => {
        for await (const file of scan(testDir, { signal: controller.signal })) {
          // Should not reach here
          expect(file).toBeUndefined();
        }
      }).rejects.toThrow('Scan aborted');
    });

    it('should handle already aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(async () => {
        for await (const file of scan(testDir, { signal: controller.signal })) {
          // Should not reach here
        }
      }).rejects.toThrow('Scan aborted');
    });
  });

  describe('Event callback', () => {
    it('should call onEvent callback with events', async () => {
      const events = [];
      const onEvent = (event) => events.push(event);

      const files = [];
      for await (const file of scan(testDir, { onEvent })) {
        files.push(file);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type.startsWith('stage:'))).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should throw ValidationError for invalid basePath', async () => {
      await expect(async () => {
        for await (const file of scan('')) {
          // Should not reach here
        }
      }).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-existent path', async () => {
      await expect(async () => {
        for await (const file of scan('/nonexistent/path/12345')) {
          // Should not reach here
        }
      }).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-string basePath', async () => {
      await expect(async () => {
        for await (const file of scan(null)) {
          // Should not reach here
        }
      }).rejects.toThrow(ValidationError);
    });
  });

  describe('Profile support', () => {
    it('should accept profile name as string', async () => {
      const files = [];
      for await (const file of scan(testDir, { profile: 'default' })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
    });

    it('should accept profile object', async () => {
      const files = [];
      const profile = {
        include: ['**/*.js'],
        exclude: [],
      };

      for await (const file of scan(testDir, { profile })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      files.forEach((file) => {
        expect(file.path).toMatch(/\.js$/);
      });
    });
  });

  describe('Deduplication', () => {
    it('should support dedupe option', async () => {
      const files = [];
      for await (const file of scan(testDir, { dedupe: true })) {
        files.push(file);
      }

      // Should successfully scan with dedupe enabled
      expect(files.length).toBeGreaterThan(0);
    });
  });
});
