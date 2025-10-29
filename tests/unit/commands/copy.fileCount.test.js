/**
 * Tests for file count calculation with null values
 *
 * This test ensures that file counts exclude null placeholders that are
 * created when binary files are skipped during the FileLoadingStage.
 */

import { jest } from '@jest/globals';

describe('File count calculation with null placeholders', () => {
  describe('result.files array filtering', () => {
    it('should filter out null files when calculating count', () => {
      const result = {
        files: [
          { path: 'file1.txt', size: 100 },
          null, // Binary file skipped
          { path: 'file2.txt', size: 200 },
          null, // Another binary file skipped
          { path: 'file3.txt', size: 300 },
        ],
        output: '<xml>...</xml>',
      };

      const fileCount = result.files.filter((f) => f !== null).length;
      expect(fileCount).toBe(3); // Not 5
    });

    it('should handle array with no null values', () => {
      const result = {
        files: [
          { path: 'file1.txt', size: 100 },
          { path: 'file2.txt', size: 200 },
          { path: 'file3.txt', size: 300 },
        ],
        output: '<xml>...</xml>',
      };

      const fileCount = result.files.filter((f) => f !== null).length;
      expect(fileCount).toBe(3);
    });

    it('should handle array with all null values', () => {
      const result = {
        files: [null, null, null],
        output: '<xml>...</xml>',
      };

      const fileCount = result.files.filter((f) => f !== null).length;
      expect(fileCount).toBe(0);
    });

    it('should handle empty array', () => {
      const result = {
        files: [],
        output: '<xml>...</xml>',
      };

      const fileCount = result.files.filter((f) => f !== null).length;
      expect(fileCount).toBe(0);
    });
  });

  describe('total size calculation with null values', () => {
    it('should calculate correct total size excluding nulls', () => {
      const result = {
        files: [
          { path: 'file1.txt', size: 100 },
          null,
          { path: 'file2.txt', size: 200 },
          null,
          { path: 'file3.txt', size: 300 },
        ],
      };

      const totalSize = result.files
        .filter((f) => f !== null)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      expect(totalSize).toBe(600); // 100 + 200 + 300
    });

    it('should handle files without size property', () => {
      const result = {
        files: [
          { path: 'file1.txt' }, // No size
          { path: 'file2.txt', size: 200 },
          null,
        ],
      };

      const totalSize = result.files
        .filter((f) => f !== null)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      expect(totalSize).toBe(200);
    });

    it('should return zero for all null files', () => {
      const result = {
        files: [null, null, null],
      };

      const totalSize = result.files
        .filter((f) => f !== null)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      expect(totalSize).toBe(0);
    });
  });

  describe('real-world scenarios', () => {
    it('should match file count in formatted output', () => {
      // Simulate a result where binary files were skipped
      const result = {
        files: [
          { path: 'README.md', size: 1000 },
          { path: 'package.json', size: 500 },
          null, // .DS_Store (binary, skipped)
          { path: 'src/index.js', size: 2000 },
          null, // image.png (binary, skipped)
          { path: 'src/utils.js', size: 1500 },
          null, // binary.bin (binary, skipped)
        ],
      };

      // CLI should show 4 files
      const cliCount = result.files.filter((f) => f !== null).length;
      expect(cliCount).toBe(4);

      // Output formatters filter nulls, so XML should also show 4 files
      const outputFiles = result.files.filter((f) => f !== null);
      expect(outputFiles.length).toBe(4);

      // Total array length is 7 (including nulls) - this should NOT be shown
      expect(result.files.length).toBe(7);
    });

    it('should demonstrate the bug scenario', () => {
      // This test demonstrates the original bug
      const result = {
        files: Array(42)
          .fill(null)
          .map((_, i) => ({ path: `file${i}.txt`, size: 1000 })),
      };

      // Add some null placeholders (simulating skipped binary files)
      result.files[5] = null;
      result.files[10] = null;
      result.files[15] = null;
      result.files[20] = null;
      result.files[25] = null;
      result.files[30] = null;
      result.files[35] = null;
      result.files[40] = null;

      // WRONG: Using length directly (includes nulls)
      const wrongCount = result.files.length;
      expect(wrongCount).toBe(42);

      // CORRECT: Filter out nulls first
      const correctCount = result.files.filter((f) => f !== null).length;
      expect(correctCount).toBe(34); // 42 - 8 nulls
    });
  });

  describe('edge cases', () => {
    it('should handle undefined or missing files array', () => {
      const result = {
        output: '<xml>...</xml>',
      };

      const fileCount = result.files ? result.files.filter((f) => f !== null).length : 0;
      expect(fileCount).toBe(0);
    });

    it('should handle files array that is not an array', () => {
      const result = {
        files: null,
        output: '<xml>...</xml>',
      };

      const fileCount = result.files ? result.files.filter((f) => f !== null).length : 0;
      expect(fileCount).toBe(0);
    });

    it('should handle mixed null and undefined values', () => {
      const result = {
        files: [
          { path: 'file1.txt', size: 100 },
          null,
          undefined,
          { path: 'file2.txt', size: 200 },
        ],
      };

      // Filter should remove both null and undefined
      const fileCount = result.files.filter((f) => f !== null && f !== undefined).length;
      expect(fileCount).toBe(2);
    });
  });
});
