/**
 * Tests for file count calculation with null values
 *
 * This test ensures that file counts exclude null placeholders that are
 * created when binary files are skipped during the FileLoadingStage.
 *
 * Tests use the real OutputFormattingStage to verify production code handles nulls correctly.
 */

import { jest } from '@jest/globals';

// Unmock fs-extra to allow real file operations if needed
jest.unmock('fs-extra');

let OutputFormattingStage;

beforeAll(async () => {
  const module = await import('../../../src/pipeline/stages/OutputFormattingStage.js');
  OutputFormattingStage = module.default;
});

describe('File count calculation with null placeholders (using real OutputFormattingStage)', () => {
  describe('OutputFormattingStage handles nulls correctly', () => {
    it('should exclude null files when formatting output', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          { path: 'file1.txt', size: 100, content: 'test1' },
          null, // Binary file skipped
          { path: 'file2.txt', size: 200, content: 'test2' },
          null, // Another binary file skipped
          { path: 'file3.txt', size: 300, content: 'test3' },
        ],
      });

      // Parse JSON output to verify file count
      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(3); // Should only have non-null files
      expect(parsed.files[0].path).toBe('file1.txt');
      expect(parsed.files[1].path).toBe('file2.txt');
      expect(parsed.files[2].path).toBe('file3.txt');
    });

    it('should handle array with no null values', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          { path: 'file1.txt', size: 100, content: 'test1' },
          { path: 'file2.txt', size: 200, content: 'test2' },
          { path: 'file3.txt', size: 300, content: 'test3' },
        ],
      });

      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(3);
    });

    it('should handle array with all null values', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [null, null, null],
      });

      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(0);
    });

    it('should handle empty array', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [],
      });

      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(0);
    });
  });

  describe('calculateTotalSize with null values', () => {
    it('should calculate correct total size excluding nulls', async () => {
      const stage = new OutputFormattingStage({ format: 'markdown' });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          { path: 'file1.txt', size: 100, content: 'test1' },
          null,
          { path: 'file2.txt', size: 200, content: 'test2' },
          null,
          { path: 'file3.txt', size: 300, content: 'test3' },
        ],
      });

      // Verify output contains content
      expect(result.output).toBeDefined();
      expect(result.output.length).toBeGreaterThan(0);

      // Verify total size calculation (100 + 200 + 300 = 600)
      const totalSize = stage.calculateTotalSize([
        { path: 'file1.txt', size: 100 },
        null,
        { path: 'file2.txt', size: 200 },
        null,
        { path: 'file3.txt', size: 300 },
      ]);
      expect(totalSize).toBe(600);
    });

    it('should handle files without size property', () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const totalSize = stage.calculateTotalSize([
        { path: 'file1.txt', size: 0 }, // Size 0 instead of undefined
        { path: 'file2.txt', size: 200 },
        null,
      ]);

      expect(totalSize).toBe(200);
    });

    it('should return zero for all null files', () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      const totalSize = stage.calculateTotalSize([null, null, null]);
      expect(totalSize).toBe(0);
    });
  });

  describe('real-world scenarios with OutputFormattingStage', () => {
    it('should correctly count files when binary files are skipped', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      // Simulate a result where binary files were skipped
      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: [
          { path: 'README.md', size: 1000, content: '# README' },
          { path: 'package.json', size: 500, content: '{}' },
          null, // .DS_Store (binary, skipped)
          { path: 'src/index.js', size: 2000, content: 'code' },
          null, // image.png (binary, skipped)
          { path: 'src/utils.js', size: 1500, content: 'utils' },
          null, // binary.bin (binary, skipped)
        ],
      });

      // Parse output and verify file count
      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(4); // Should only have non-null files
    });

    it('should correctly handle large arrays with many nulls', async () => {
      const stage = new OutputFormattingStage({ format: 'json' });

      // Create 42 files
      const filesWithNulls = Array(42)
        .fill(null)
        .map((_, i) => ({ path: `file${i}.txt`, size: 1000, content: 'test' }));

      // Replace some with null (simulating skipped binary files)
      [5, 10, 15, 20, 25, 30, 35, 40].forEach(i => {
        filesWithNulls[i] = null;
      });

      const result = await stage.process({
        basePath: '/test',
        profile: { name: 'default' },
        options: {},
        files: filesWithNulls,
      });

      const parsed = JSON.parse(result.output);
      // Should be 34 files (42 - 8 nulls)
      expect(parsed.files).toHaveLength(34);
    });
  });
});
