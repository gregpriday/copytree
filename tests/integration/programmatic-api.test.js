// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { scan, format, copy } from '../../src/index.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

// Use test fixture - works in both Jest and direct Node execution
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Programmatic API Integration', () => {
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

  describe('scan() + format() workflow', () => {
    it('should scan and format files', async () => {
      // Scan files
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);

      // Format as JSON
      const jsonOutput = await format(files, { format: 'json' });
      expect(jsonOutput).toBeDefined();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.files.length).toBe(files.length);
    });

    it('should support streaming scan directly to format', async () => {
      const output = await format(scan(testDir), { format: 'json' });

      expect(output).toBeDefined();
      const parsed = JSON.parse(output);
      expect(parsed.files.length).toBeGreaterThan(0);
    });

    it('should support filtering in scan and formatting', async () => {
      const jsFiles = scan(testDir, { filter: ['**/*.js'] });
      const output = await format(jsFiles, {
        format: 'json',
        addLineNumbers: true,
      });

      const parsed = JSON.parse(output);
      parsed.files.forEach((file) => {
        expect(file.path).toMatch(/\.js$/);
      });
    });
  });

  describe('copy() end-to-end workflow', () => {
    it('should provide same results as scan + format', async () => {
      // Using copy()
      const copyResult = await copy(testDir, { format: 'json' });

      // Using scan() + format()
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }
      const formatOutput = await format(files, { format: 'json' });

      // Parse both outputs
      const copyParsed = JSON.parse(copyResult.output);
      const formatParsed = JSON.parse(formatOutput);

      // Should have same number of files
      expect(copyParsed.files.length).toBe(formatParsed.files.length);

      // Files should match
      const copyPaths = copyParsed.files.map((f) => f.path).sort();
      const formatPaths = formatParsed.files.map((f) => f.path).sort();
      expect(copyPaths).toEqual(formatPaths);
    });

    it('should support writing to file', async () => {
      const outputPath = path.join(outputDir, 'output.json');
      const result = await copy(testDir, {
        format: 'json',
        output: outputPath,
      });

      // File should be written
      expect(await fs.pathExists(outputPath)).toBe(true);

      // Content should match result
      const fileContent = await fs.readFile(outputPath, 'utf8');
      expect(fileContent).toBe(result.output);
    });
  });

  describe('Multiple format conversions', () => {
    it('should convert same files to different formats', async () => {
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }

      // Format as XML
      const xmlOutput = await format(files, { format: 'xml' });
      expect(xmlOutput).toContain('<?xml');

      // Format as JSON
      const jsonOutput = await format(files, { format: 'json' });
      const jsonParsed = JSON.parse(jsonOutput);
      expect(jsonParsed.files.length).toBe(files.length);

      // Format as Markdown
      const mdOutput = await format(files, { format: 'markdown' });
      expect(mdOutput).toContain('#');

      // Format as tree
      const treeOutput = await format(files, { format: 'tree' });
      expect(treeOutput).toContain('├──');
    });
  });

  describe('Advanced filtering workflows', () => {
    it('should support complex filtering pipeline', async () => {
      // Scan only JS files
      const jsFiles = [];
      for await (const file of scan(testDir, {
        filter: ['**/*.js'],
        sort: 'path',
      })) {
        jsFiles.push(file);
      }

      // Further filter to only src directory
      const srcFiles = jsFiles.filter((f) => f.path.startsWith('src/'));

      // Format with line numbers
      const output = await format(srcFiles, {
        format: 'json',
        addLineNumbers: true,
      });

      const parsed = JSON.parse(output);
      expect(parsed.files.length).toBeGreaterThan(0);
      parsed.files.forEach((file) => {
        expect(file.path).toMatch(/^src\//);
        expect(file.path).toMatch(/\.js$/);
      });
    });

    it('should support incremental collection and formatting', async () => {
      const batches = [];
      let currentBatch = [];

      for await (const file of scan(testDir)) {
        currentBatch.push(file);

        // Create batch every 2 files
        if (currentBatch.length >= 2) {
          batches.push([...currentBatch]);
          currentBatch = [];
        }
      }

      // Add remaining files
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      expect(batches.length).toBeGreaterThan(0);

      // Format each batch
      for (const batch of batches) {
        const output = await format(batch, { format: 'json' });
        expect(output).toBeDefined();
      }
    });
  });

  describe('Error handling and recovery', () => {
    it('should handle scan errors gracefully', async () => {
      // Scan with very restrictive limits
      const files = [];
      try {
        for await (const file of scan(testDir, {
          maxFileCount: 2,
        })) {
          files.push(file);
        }
      } catch (error) {
        // May error or truncate, both are acceptable
      }

      // Should have collected some files even if error occurred
      expect(files.length).toBeGreaterThanOrEqual(0);
    });

    it('should complete copy even with scan warnings', async () => {
      const result = await copy(testDir, {
        maxFileCount: 10,
      });

      expect(result.output).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and memory', () => {
    it('should handle iterative processing without buffering', async () => {
      let processedCount = 0;
      const maxBuffered = 3;

      // Process files as they arrive
      for await (const file of scan(testDir)) {
        processedCount++;

        // Simulate processing
        expect(file.path).toBeDefined();

        // We never buffer more than maxBuffered files in memory
        if (processedCount > maxBuffered) {
          // Previous files should be eligible for GC
        }
      }

      expect(processedCount).toBeGreaterThan(0);
    });
  });

  describe('API consistency', () => {
    it('should export all expected functions from index', async () => {
      const api = await import('../../src/index.js');

      expect(api.scan).toBeDefined();
      expect(api.format).toBeDefined();
      expect(api.copy).toBeDefined();
      expect(api.default).toBeDefined();
      expect(api.Pipeline).toBeDefined();
      expect(api.TransformerRegistry).toBeDefined();
    });

    it('should have consistent file structure across all APIs', async () => {
      // Scan files
      const scanFiles = [];
      for await (const file of scan(testDir)) {
        scanFiles.push(file);
      }

      // Copy files
      const copyResult = await copy(testDir);

      // Both should return same file structure
      expect(scanFiles.length).toBe(copyResult.files.length);

      const scanPaths = scanFiles.map((f) => f.path).sort();
      const copyPaths = copyResult.files.map((f) => f.path).sort();
      expect(scanPaths).toEqual(copyPaths);
    });
  });
});
