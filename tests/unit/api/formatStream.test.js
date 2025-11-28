// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { formatStream } from '../../../src/api/formatStream.js';
import { scan } from '../../../src/api/scan.js';
import { format } from '../../../src/api/format.js';
import { ValidationError } from '../../../src/utils/errors.js';
import path from 'path';

// Use test fixture
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

// Helper to collect async iterator to array
async function collectChunks(asyncIterator) {
  const chunks = [];
  for await (const chunk of asyncIterator) {
    chunks.push(chunk);
  }
  return chunks;
}

// Helper to collect files from scan
async function collectFiles(basePath, options = {}) {
  const files = [];
  for await (const file of scan(basePath, options)) {
    files.push(file);
  }
  return files;
}

describe('formatStream()', () => {
  describe('Basic functionality', () => {
    it('should yield formatted output chunks', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(formatStream(files, { basePath: testDir }));

      expect(chunks.length).toBeGreaterThan(0);
      const fullOutput = chunks.join('');
      expect(fullOutput.length).toBeGreaterThan(0);
    });

    it('should accept async iterables', async () => {
      const filesIterator = scan(testDir);
      const chunks = await collectChunks(formatStream(filesIterator, { basePath: testDir }));

      expect(chunks.length).toBeGreaterThan(0);
      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('<?xml');
    });

    it('should yield XML format by default', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(formatStream(files, { basePath: testDir }));

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('<?xml');
      expect(fullOutput).toContain('<ct:directory');
    });
  });

  describe('Format options', () => {
    it('should format as JSON when requested', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'json', basePath: testDir }),
      );

      const fullOutput = chunks.join('');
      expect(() => JSON.parse(fullOutput)).not.toThrow();
    });

    it('should format as Markdown when requested', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'markdown', basePath: testDir }),
      );

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('---'); // YAML front matter
      expect(fullOutput).toContain('# CopyTree Export');
      expect(fullOutput).toContain('## Directory Tree');
    });

    it('should format as tree when requested', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'tree', basePath: testDir }),
      );

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('├──');
    });

    it('should format as NDJSON when requested', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'ndjson', basePath: testDir }),
      );

      const fullOutput = chunks.join('');
      const lines = fullOutput.trim().split('\n');

      expect(lines.length).toBeGreaterThan(1);

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });

      // First line should be metadata
      const metadata = JSON.parse(lines[0]);
      expect(metadata.type).toBe('metadata');
    });

    it('should format as SARIF when requested', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'sarif', basePath: testDir }),
      );

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      expect(parsed.$schema).toContain('sarif');
      expect(parsed.version).toBe('2.1.0');
      expect(parsed.runs).toBeDefined();
      expect(parsed.runs[0].tool.driver.name).toBe('CopyTree');
    });
  });

  describe('Output equivalence', () => {
    it('should produce output equivalent to buffered format() for JSON', async () => {
      const files = await collectFiles(testDir);

      // Get streaming output
      const chunks = await collectChunks(
        formatStream(files, { format: 'json', basePath: testDir }),
      );
      const streamedOutput = chunks.join('');

      // Get buffered output
      const bufferedOutput = await format(files, { format: 'json', basePath: testDir });

      // Parse both and compare structure
      const streamedParsed = JSON.parse(streamedOutput);
      const bufferedParsed = JSON.parse(bufferedOutput);

      expect(streamedParsed.files.length).toBe(bufferedParsed.files.length);
      expect(streamedParsed.metadata.fileCount).toBe(bufferedParsed.metadata.fileCount);
    });

    it('should produce valid XML output', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(formatStream(files, { format: 'xml', basePath: testDir }));

      const fullOutput = chunks.join('');

      // Check basic XML structure
      expect(fullOutput).toMatch(/^<\?xml version="1\.0"/);
      expect(fullOutput).toContain('<ct:directory');
      expect(fullOutput).toContain('</ct:directory>');
      expect(fullOutput).toContain('<ct:metadata>');
      expect(fullOutput).toContain('</ct:metadata>');
      expect(fullOutput).toContain('<ct:files>');
      expect(fullOutput).toContain('</ct:files>');
    });

    it('should produce valid Markdown output', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'markdown', basePath: testDir }),
      );

      const fullOutput = chunks.join('');

      // Check YAML front matter
      const frontMatterMatch = fullOutput.match(/^---\n([\s\S]*?)\n---/);
      expect(frontMatterMatch).not.toBeNull();

      // Check sections
      expect(fullOutput).toContain('## Directory Tree');
      expect(fullOutput).toContain('## Files');
    });
  });

  describe('Options', () => {
    it('should respect onlyTree option', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'json', basePath: testDir, onlyTree: true }),
      );

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      parsed.files.forEach((file) => {
        expect(file.content).toBeUndefined();
      });
    });

    it('should respect addLineNumbers option', async () => {
      const files = await collectFiles(testDir, { filter: ['**/*.js'] });
      const chunks = await collectChunks(
        formatStream(files, { format: 'json', basePath: testDir, addLineNumbers: true }),
      );

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      const fileWithContent = parsed.files.find((f) => f.content && !f.isBinary);
      if (fileWithContent) {
        expect(fileWithContent.content).toMatch(/^\s*1:/);
      }
    });

    it('should respect instructions option', async () => {
      const files = await collectFiles(testDir);
      const instructions = 'These are test instructions';
      const chunks = await collectChunks(
        formatStream(files, { format: 'json', basePath: testDir, instructions }),
      );

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      expect(parsed.metadata.instructions).toBe(instructions);
    });

    it('should respect showSize option in tree format', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(
        formatStream(files, { format: 'tree', basePath: testDir, showSize: true }),
      );

      const fullOutput = chunks.join('');
      // Size should appear in parentheses
      expect(fullOutput).toMatch(/\(\d+(\.\d+)?\s*(B|KB|MB)\)/);
    });
  });

  describe('Streaming behavior', () => {
    it('should yield chunks incrementally', async () => {
      const files = await collectFiles(testDir);
      const chunks = await collectChunks(formatStream(files, { basePath: testDir }));

      // Should have multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should be a non-empty string
      chunks.forEach((chunk) => {
        expect(typeof chunk).toBe('string');
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    it('should allow early termination', async () => {
      const files = await collectFiles(testDir);
      let chunkCount = 0;
      const maxChunks = 2;

      for await (const chunk of formatStream(files, { basePath: testDir })) {
        chunkCount++;
        if (chunkCount >= maxChunks) {
          break;
        }
      }

      expect(chunkCount).toBe(maxChunks);
    });
  });

  describe('Validation', () => {
    it('should throw ValidationError for null files', async () => {
      const iterator = formatStream(null, { basePath: testDir });
      await expect(iterator.next()).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid format', async () => {
      const files = await collectFiles(testDir);
      const iterator = formatStream(files, { format: 'invalid', basePath: testDir });
      await expect(iterator.next()).rejects.toThrow(ValidationError);
    });
  });

  describe('Empty inputs', () => {
    it('should handle empty file array gracefully', async () => {
      // formatStream produces valid output even with empty arrays
      const chunks = await collectChunks(formatStream([], { format: 'json', basePath: testDir }));

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      expect(parsed.files.length).toBe(0);
      expect(parsed.metadata.fileCount).toBe(0);
    });

    it('should handle empty async iterable with valid NDJSON structure', async () => {
      async function* emptyGenerator() {
        // Yields nothing
      }

      const chunks = await collectChunks(
        formatStream(emptyGenerator(), { format: 'ndjson', basePath: testDir }),
      );

      // NDJSON should still have metadata and summary records even with no files
      const fullOutput = chunks.join('');
      const lines = fullOutput.trim().split('\n');

      expect(lines.length).toBe(2); // metadata + summary only
      const metadata = JSON.parse(lines[0]);
      const summary = JSON.parse(lines[1]);

      expect(metadata.type).toBe('metadata');
      expect(metadata.fileCount).toBe(0);
      expect(summary.type).toBe('summary');
      expect(summary.fileCount).toBe(0);
    });
  });
});
