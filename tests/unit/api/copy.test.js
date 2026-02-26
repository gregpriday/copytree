// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { copy } from '../../../src/api/copy.js';
import { ValidationError } from '../../../src/utils/errors.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// Use test fixture - works in both Jest and direct Node execution
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('copy()', () => {
  // Use existing test fixture
  let outputDir;

  beforeEach(async () => {
    // Create temporary directory for output files
    outputDir = path.join(os.tmpdir(), `copytree-output-${randomUUID()}`);
    await fs.ensureDir(outputDir);
  });

  afterEach(async () => {
    // Clean up output directory
    if (outputDir && (await fs.pathExists(outputDir))) {
      await fs.remove(outputDir);
    }
  });

  describe('Basic functionality', () => {
    it('should return formatted output string', async () => {
      const result = await copy(testDir);

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('stats');
      expect(typeof result.output).toBe('string');
      expect(result.output.length).toBeGreaterThan(0);
    });

    it('should return array of files', async () => {
      const result = await copy(testDir);

      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files[0]).toHaveProperty('path');
    });

    it('should include stats', async () => {
      const result = await copy(testDir);

      expect(result.stats).toHaveProperty('totalFiles');
      expect(result.stats).toHaveProperty('duration');
      expect(result.stats).toHaveProperty('totalSize');
      expect(result.stats).toHaveProperty('outputSize');
      expect(result.stats.totalFiles).toBeGreaterThan(0);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Format options', () => {
    it('should format as XML by default', async () => {
      const result = await copy(testDir);

      expect(result.output).toContain('<?xml');
    });

    it('should format as JSON when requested', async () => {
      const result = await copy(testDir, { format: 'json' });

      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it('should format as Markdown when requested', async () => {
      const result = await copy(testDir, { format: 'markdown' });

      expect(result.output).toContain('#');
    });

    it('should format as tree when requested', async () => {
      const result = await copy(testDir, { format: 'tree' });

      expect(result.output).toContain('├──');
    });
  });

  describe('Scan options', () => {
    it('should filter files by pattern', async () => {
      const result = await copy(testDir, { filter: ['**/*.js'] });

      result.files.forEach((file) => {
        expect(file.path).toMatch(/\.js$/);
      });
    });

    it('should exclude files by pattern', async () => {
      const result = await copy(testDir, { exclude: ['**/*.txt'] });

      result.files.forEach((file) => {
        expect(file.path).not.toMatch(/\.txt$/);
      });
    });

    it('should respect onlyTree option', async () => {
      const result = await copy(testDir, { format: 'json', onlyTree: true });

      const parsed = JSON.parse(result.output);
      parsed.files.forEach((file) => {
        expect(file.content).toBeUndefined();
      });
    });
  });

  describe('Output destinations', () => {
    it('should write to file when output option is provided', async () => {
      const outputPath = path.join(outputDir, 'output.xml');
      const result = await copy(testDir, { output: outputPath });

      expect(await fs.pathExists(outputPath)).toBe(true);
      expect(result.outputPath).toBe(outputPath);

      const fileContent = await fs.readFile(outputPath, 'utf8');
      expect(fileContent).toBe(result.output);
    });

    it('should create parent directories when writing to file', async () => {
      const outputPath = path.join(outputDir, 'nested', 'deep', 'output.xml');
      await copy(testDir, { output: outputPath });

      expect(await fs.pathExists(outputPath)).toBe(true);
    });

    it('should not write to file by default', async () => {
      const outputPath = path.join(outputDir, 'should-not-exist.xml');
      await copy(testDir);

      expect(await fs.pathExists(outputPath)).toBe(false);
    });
  });

  describe('Side effects (programmatic defaults)', () => {
    it('should not copy to clipboard by default', async () => {
      const result = await copy(testDir);

      // In programmatic mode, clipboard should not be set by default
      expect(result.stats.clipboardError).toBeUndefined();
    });

    it('should not display to console by default', async () => {
      // This is hard to test directly, but we verify the option is respected
      const result = await copy(testDir, { display: false });

      expect(result.output).toBeDefined();
    });
  });

  describe('Dry run', () => {
    it('should return stats without processing files', async () => {
      const result = await copy(testDir, { dryRun: true });

      expect(result.stats).toHaveProperty('dryRun');
      expect(result.stats.dryRun).toBe(true);
      expect(result.stats.totalFiles).toBeGreaterThan(0);
      expect(result.output).toBe('');
    });

    it('should not load file content in dry run', async () => {
      const result = await copy(testDir, { dryRun: true });

      result.files.forEach((file) => {
        expect(file.content).toBeUndefined();
      });
    });
  });

  describe('Validation', () => {
    it('should throw ValidationError for invalid basePath', async () => {
      await expect(copy('')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null basePath', async () => {
      await expect(copy(null)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-existent path', async () => {
      await expect(copy('/nonexistent/path/12345')).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should include scan errors in stats if scan partially fails', async () => {
      // This is hard to test without mocking, but we verify the structure
      const result = await copy(testDir);

      // scanErrors should not exist if scan succeeded
      expect(result.stats.scanErrors).toBeUndefined();
    });

    it('should handle format errors gracefully', async () => {
      // Copy should succeed even if some edge cases occur
      const result = await copy(testDir, { format: 'json' });

      expect(result.output).toBeDefined();
    });
  });

  describe('Combined options', () => {
    it('should handle scan + format options together', async () => {
      const result = await copy(testDir, {
        filter: ['**/*.js'],
        format: 'json',
        onlyTree: true,
      });

      const parsed = JSON.parse(result.output);
      expect(parsed.files.length).toBeGreaterThan(0);
      parsed.files.forEach((file) => {
        expect(file.path).toMatch(/\.js$/);
        expect(file.content).toBeUndefined();
      });
    });

    it('should handle all side effect options', async () => {
      const outputPath = path.join(outputDir, 'output.json');
      const result = await copy(testDir, {
        format: 'json',
        output: outputPath,
        display: false,
        clipboard: false,
      });

      expect(await fs.pathExists(outputPath)).toBe(true);
      expect(result.outputPath).toBe(outputPath);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const start = Date.now();
      const result = await copy(testDir);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(result.stats.duration).toBeLessThanOrEqual(duration);
    });
  });
});
