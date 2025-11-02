import NDJSONFormatter from '../../src/pipeline/formatters/NDJSONFormatter.js';
import OutputFormattingStage from '../../src/pipeline/stages/OutputFormattingStage.js';

describe('NDJSON Formatter', () => {
  // Mock stage for formatter tests
  const createMockStage = () => ({
    calculateTotalSize: (files) => files.reduce((sum, f) => sum + (f?.size || 0), 0),
    addLineNumbersToContent: (content) => {
      return content
        .split('\n')
        .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
        .join('\n');
    },
    config: {
      get: (key, defaultValue) => defaultValue,
    },
  });

  describe('format()', () => {
    it('should generate valid NDJSON with metadata, files, and summary', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            modified: new Date('2024-01-15T10:30:00Z'),
            isBinary: false,
            content: 'console.log("hello");',
          },
        ],
      };

      const output = await formatter.format(input);

      // Should end with newline
      expect(output.endsWith('\n')).toBe(true);

      // Parse each line as JSON
      const lines = output.trim().split('\n');
      expect(lines.length).toBe(3); // metadata, file, summary

      const records = lines.map((line) => JSON.parse(line));

      // Validate metadata record
      expect(records[0].type).toBe('metadata');
      expect(records[0].directory).toBe('/test');
      expect(records[0].fileCount).toBe(1);
      expect(records[0].totalSize).toBe(100);
      expect(records[0].profile).toBe('default');
      expect(records[0].generated).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Validate file record
      expect(records[1].type).toBe('file');
      expect(records[1].path).toBe('test.js');
      expect(records[1].size).toBe(100);
      expect(records[1].isBinary).toBe(false);
      expect(records[1].content).toBe('console.log("hello");');

      // Validate summary record
      expect(records[2].type).toBe('summary');
      expect(records[2].fileCount).toBe(1);
      expect(records[2].totalSize).toBe(100);
    });

    it('should parse each line independently', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          { path: 'a.js', size: 10, isBinary: false, content: 'a' },
          { path: 'b.js', size: 20, isBinary: false, content: 'b' },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');

      // Each line should be valid JSON independently
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it('should include git metadata when present', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        gitMetadata: {
          branch: 'main',
          lastCommit: {
            hash: 'abc123',
            message: 'Test commit',
          },
          hasUncommittedChanges: false,
          filterType: 'modified',
        },
        files: [],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const metadata = JSON.parse(lines[0]);

      expect(metadata.git).toBeDefined();
      expect(metadata.git.branch).toBe('main');
      expect(metadata.git.lastCommit.hash).toBe('abc123');
      expect(metadata.git.hasUncommittedChanges).toBe(false);
    });

    it('should include instructions when present', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        instructions: 'Test instructions',
        instructionsName: 'test-instr',
        files: [],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const metadata = JSON.parse(lines[0]);

      expect(metadata.instructions).toBeDefined();
      expect(metadata.instructions.name).toBe('test-instr');
      expect(metadata.instructions.content).toBe('Test instructions');
    });

    it('should respect onlyTree option', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage, onlyTree: true });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            isBinary: false,
            content: 'should not appear',
          },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const fileRecord = JSON.parse(lines[1]);

      expect(fileRecord.content).toBeUndefined();
    });

    it('should add line numbers when requested', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage, addLineNumbers: true });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 10,
            isBinary: false,
            content: 'line1\nline2',
          },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const fileRecord = JSON.parse(lines[1]);

      expect(fileRecord.content).toContain('   1: line1');
      expect(fileRecord.content).toContain('   2: line2');
    });

    it('should handle binary files with encoding', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'image.png',
            size: 500,
            isBinary: true,
            encoding: 'base64',
            binaryCategory: 'image',
            content: 'base64data==',
          },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const fileRecord = JSON.parse(lines[1]);

      expect(fileRecord.isBinary).toBe(true);
      expect(fileRecord.encoding).toBe('base64');
      expect(fileRecord.binaryCategory).toBe('image');
      expect(fileRecord.content).toBe('base64data==');
    });

    it('should include git status when present', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'modified.js',
            size: 100,
            isBinary: false,
            gitStatus: 'M',
            content: 'code',
          },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const fileRecord = JSON.parse(lines[1]);

      expect(fileRecord.gitStatus).toBe('M');
    });

    it('should handle truncated files', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'large.js',
            size: 1000,
            isBinary: false,
            content: 'truncated content',
            truncated: true,
            originalLength: 5000,
          },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const fileRecord = JSON.parse(lines[1]);

      expect(fileRecord.truncated).toBe(true);
      expect(fileRecord.originalLength).toBe(5000);
    });

    it('should handle multiple files', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          { path: 'a.js', size: 10, isBinary: false, content: 'a' },
          { path: 'b.js', size: 20, isBinary: false, content: 'b' },
          { path: 'c.js', size: 30, isBinary: false, content: 'c' },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');

      expect(lines.length).toBe(5); // metadata + 3 files + summary

      const records = lines.map((line) => JSON.parse(line));
      expect(records[0].type).toBe('metadata');
      expect(records[1].type).toBe('file');
      expect(records[2].type).toBe('file');
      expect(records[3].type).toBe('file');
      expect(records[4].type).toBe('summary');
    });

    it('should filter out null files', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          { path: 'a.js', size: 10, isBinary: false, content: 'a' },
          null,
          { path: 'b.js', size: 20, isBinary: false, content: 'b' },
        ],
      };

      const output = await formatter.format(input);
      const lines = output.trim().split('\n');
      const metadata = JSON.parse(lines[0]);

      expect(metadata.fileCount).toBe(2);
      expect(lines.length).toBe(4); // metadata + 2 files + summary
    });
  });

  describe('stream()', () => {
    it('should stream output line-by-line to writer', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [{ path: 'a.js', size: 10, isBinary: false, content: 'a' }],
      };

      const written = [];
      const writer = (line) => written.push(line);

      await formatter.stream(input, writer);

      // Should have written 3 lines (metadata, file, summary)
      expect(written.length).toBe(3);

      // Each line should end with newline
      written.forEach((line) => {
        expect(line.endsWith('\n')).toBe(true);
      });

      // Each line (minus newline) should be valid JSON
      written.forEach((line) => {
        expect(() => JSON.parse(line.trim())).not.toThrow();
      });
    });

    it('should throw if writer is not provided', async () => {
      const stage = createMockStage();
      const formatter = new NDJSONFormatter({ stage });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [],
      };

      await expect(formatter.stream(input, null)).rejects.toThrow(
        'NDJSONFormatter.stream requires a writer function',
      );
    });
  });

  describe('Integration with OutputFormattingStage', () => {
    it('should work through OutputFormattingStage', async () => {
      const stage = new OutputFormattingStage({ format: 'ndjson' });

      const input = {
        basePath: '/test',
        profile: { name: 'default' },
        files: [
          {
            path: 'test.js',
            size: 100,
            isBinary: false,
            content: 'test',
          },
        ],
      };

      const result = await stage.process(input);

      expect(result.outputFormat).toBe('ndjson');
      expect(result.output).toBeDefined();
      expect(result.outputSize).toBeGreaterThan(0);

      // Validate NDJSON structure
      const lines = result.output.trim().split('\n');
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });
  });
});
