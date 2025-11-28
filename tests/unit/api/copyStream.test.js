// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { copyStream } from '../../../src/api/copyStream.js';
import { ValidationError } from '../../../src/utils/errors.js';
import path from 'path';

// Use test fixture - works in both Jest and direct Node execution
const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('copyStream()', () => {
  describe('Basic functionality', () => {
    it('should yield formatted output chunks', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const fullOutput = chunks.join('');
      expect(fullOutput.length).toBeGreaterThan(0);
    });

    it('should yield XML format by default', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir)) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('<?xml');
      expect(fullOutput).toContain('<ct:directory');
      expect(fullOutput).toContain('</ct:directory>');
    });

    it('should produce multiple chunks for larger output', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir)) {
        chunks.push(chunk);
      }

      // Should yield multiple chunks (header, files, footer)
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('Format options', () => {
    it('should format as JSON when requested', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'json' })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      expect(() => JSON.parse(fullOutput)).not.toThrow();
    });

    it('should format as Markdown when requested', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'markdown' })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('---'); // YAML front matter
      expect(fullOutput).toContain('# CopyTree Export');
    });

    it('should format as tree when requested', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'tree' })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('├──');
    });

    it('should format as NDJSON when requested', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'ndjson' })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      const lines = fullOutput.trim().split('\n');

      // Should have multiple JSON lines
      expect(lines.length).toBeGreaterThan(1);

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });

      // First line should be metadata
      const metadata = JSON.parse(lines[0]);
      expect(metadata.type).toBe('metadata');

      // Last line should be summary
      const summary = JSON.parse(lines[lines.length - 1]);
      expect(summary.type).toBe('summary');
    });

    it('should support md alias for markdown', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'md' })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      expect(fullOutput).toContain('# CopyTree Export');
    });
  });

  describe('Streaming guarantees', () => {
    it('should produce output equivalent to non-streaming copy', async () => {
      const { copy } = await import('../../../src/api/copy.js');

      // Get streaming output
      const chunks = [];
      for await (const chunk of copyStream(testDir, { format: 'json' })) {
        chunks.push(chunk);
      }
      const streamedOutput = chunks.join('');

      // Get buffered output
      const result = await copy(testDir, { format: 'json' });
      const bufferedOutput = result.output;

      // Parse both and compare structure (not exact match due to timestamps)
      const streamedParsed = JSON.parse(streamedOutput);
      const bufferedParsed = JSON.parse(bufferedOutput);

      expect(streamedParsed.files.length).toBe(bufferedParsed.files.length);
      expect(streamedParsed.metadata.fileCount).toBe(bufferedParsed.metadata.fileCount);
    });

    it('should allow early termination', async () => {
      let chunkCount = 0;
      const maxChunks = 2;

      for await (const chunk of copyStream(testDir)) {
        chunkCount++;
        if (chunkCount >= maxChunks) {
          break;
        }
      }

      expect(chunkCount).toBe(maxChunks);
    });
  });

  describe('Options', () => {
    it('should respect onlyTree option', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, { format: 'json', onlyTree: true })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      parsed.files.forEach((file) => {
        expect(file.content).toBeUndefined();
      });
    });

    it('should respect filter option', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, {
        format: 'json',
        filter: ['**/*.js'],
      })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      parsed.files.forEach((file) => {
        expect(file.path).toMatch(/\.js$/);
      });
    });

    it('should respect exclude option', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, {
        format: 'json',
        exclude: ['**/*.txt'],
      })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      parsed.files.forEach((file) => {
        expect(file.path).not.toMatch(/\.txt$/);
      });
    });

    it('should respect addLineNumbers option', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir, {
        format: 'json',
        addLineNumbers: true,
        filter: ['**/*.js'],
      })) {
        chunks.push(chunk);
      }

      const fullOutput = chunks.join('');
      const parsed = JSON.parse(fullOutput);

      // Find a non-binary file with content
      const fileWithContent = parsed.files.find((f) => f.content && !f.isBinary);
      if (fileWithContent) {
        // Line numbers format: "   1: "
        expect(fileWithContent.content).toMatch(/^\s*1:/);
      }
    });
  });

  describe('Validation', () => {
    it('should throw ValidationError for invalid basePath', async () => {
      const iterator = copyStream('');
      await expect(iterator.next()).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for null basePath', async () => {
      const iterator = copyStream(null);
      await expect(iterator.next()).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid format', async () => {
      const iterator = copyStream(testDir, { format: 'invalid' });
      await expect(iterator.next()).rejects.toThrow(ValidationError);
    });
  });

  describe('Performance', () => {
    it('should yield chunks incrementally', async () => {
      const chunks = [];

      for await (const chunk of copyStream(testDir)) {
        chunks.push(chunk);
      }

      // Should produce multiple chunks (header, files, footer)
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('')).toContain('<?xml');
    });

    it('should yield first chunk before consuming all input', async () => {
      const iterator = copyStream(testDir);
      const { value: firstChunk, done } = await iterator.next();

      // First chunk should be available immediately
      expect(done).toBe(false);
      expect(firstChunk).toBeDefined();
      expect(typeof firstChunk).toBe('string');
      expect(firstChunk.length).toBeGreaterThan(0);

      // Consume rest of iterator to clean up
      for await (const _ of { [Symbol.asyncIterator]: () => iterator }) {
        // Drain iterator
      }
    });
  });
});
