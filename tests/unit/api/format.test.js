import { format } from '../../../src/api/format.js';
import { ValidationError } from '../../../src/utils/errors.js';

describe('format()', () => {
  const sampleFiles = [
    {
      path: 'file1.js',
      absolutePath: '/test/file1.js',
      size: 100,
      modified: new Date('2024-01-01'),
      content: 'console.log("hello");',
      isBinary: false,
      encoding: 'utf8',
    },
    {
      path: 'file2.txt',
      absolutePath: '/test/file2.txt',
      size: 50,
      modified: new Date('2024-01-02'),
      content: 'text content',
      isBinary: false,
      encoding: 'utf8',
    },
    {
      path: 'subdir/file3.js',
      absolutePath: '/test/subdir/file3.js',
      size: 150,
      modified: new Date('2024-01-03'),
      content: 'function test() {}',
      isBinary: false,
      encoding: 'utf8',
    },
  ];

  describe('Basic functionality', () => {
    it('should format files as XML by default', async () => {
      const output = await format(sampleFiles);

      expect(output).toContain('<?xml');
      expect(output).toContain('directory'); // May be namespaced
      expect(output).toContain('file1.js');
    });

    it('should format files as JSON', async () => {
      const output = await format(sampleFiles, { format: 'json' });

      expect(output).toBeDefined();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('directory');
      expect(parsed).toHaveProperty('metadata');
      expect(parsed).toHaveProperty('files');
      expect(parsed.files.length).toBe(3);
    });

    it('should format files as Markdown', async () => {
      const output = await format(sampleFiles, { format: 'markdown' });

      expect(output).toContain('#');
      expect(output).toContain('file1.js');
    });

    it('should format files as tree view', async () => {
      const output = await format(sampleFiles, { format: 'tree' });

      expect(output).toContain('├──');
      expect(output).toContain('└──');
      expect(output).toContain('file1.js');
    });

    it('should format files as NDJSON', async () => {
      const output = await format(sampleFiles, { format: 'ndjson' });

      expect(output).toBeDefined();
      const lines = output.trim().split('\n');
      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it('should format files as SARIF', async () => {
      const output = await format(sampleFiles, { format: 'sarif' });

      expect(output).toBeDefined();
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('$schema');
      expect(parsed).toHaveProperty('runs');
    });
  });

  describe('Input types', () => {
    it('should accept array of files', async () => {
      const output = await format(sampleFiles);
      expect(output).toBeDefined();
    });

    it('should accept regular iterable', async () => {
      const iterable = {
        *[Symbol.iterator]() {
          yield* sampleFiles;
        },
      };

      const output = await format(iterable);
      expect(output).toBeDefined();
    });

    it('should accept async iterable', async () => {
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          for (const file of sampleFiles) {
            yield file;
          }
        },
      };

      const output = await format(asyncIterable);
      expect(output).toBeDefined();
    });
  });

  describe('Options', () => {
    it('should respect onlyTree option', async () => {
      const output = await format(sampleFiles, {
        format: 'json',
        onlyTree: true,
      });

      const parsed = JSON.parse(output);
      parsed.files.forEach((file) => {
        expect(file.content).toBeUndefined();
      });
    });

    it('should add line numbers when requested', async () => {
      const output = await format(sampleFiles, {
        format: 'json',
        addLineNumbers: true,
      });

      const parsed = JSON.parse(output);
      const firstFile = parsed.files[0];

      if (firstFile.content && !firstFile.isBinary) {
        expect(firstFile.content).toContain(':');
      }
    });

    it('should include instructions when provided', async () => {
      const instructions = 'Please review this code';
      const output = await format(sampleFiles, {
        format: 'json',
        instructions,
      });

      const parsed = JSON.parse(output);
      expect(parsed.metadata.instructions).toBe(instructions);
    });

    it('should show file sizes in tree view', async () => {
      const output = await format(sampleFiles, {
        format: 'tree',
        showSize: true,
      });

      expect(output).toContain('B');
    });

    it('should respect prettyPrint option for JSON', async () => {
      const compactOutput = await format(sampleFiles, {
        format: 'json',
        prettyPrint: false,
      });

      const prettyOutput = await format(sampleFiles, {
        format: 'json',
        prettyPrint: true,
      });

      // Pretty output should have more newlines
      const compactLines = compactOutput.split('\n').length;
      const prettyLines = prettyOutput.split('\n').length;
      expect(prettyLines).toBeGreaterThan(compactLines);
    });
  });

  describe('Format normalization', () => {
    it('should normalize "md" to "markdown"', async () => {
      const output = await format(sampleFiles, { format: 'md' });

      expect(output).toContain('#');
    });
  });

  describe('Validation', () => {
    it('should throw ValidationError for null files', async () => {
      await expect(format(null)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined files', async () => {
      await expect(format(undefined)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid format', async () => {
      await expect(
        format(sampleFiles, { format: 'invalid' }),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty file array', async () => {
      await expect(format([])).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for non-iterable input', async () => {
      await expect(format({ not: 'iterable' })).rejects.toThrow(ValidationError);
    });
  });

  describe('Edge cases', () => {
    it('should filter out null files', async () => {
      const filesWithNull = [...sampleFiles, null, null];

      const output = await format(filesWithNull, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.files.length).toBe(3);
    });

    it('should handle files with no content', async () => {
      const filesWithoutContent = sampleFiles.map((f) => ({
        ...f,
        content: undefined,
      }));

      const output = await format(filesWithoutContent, { format: 'json' });
      expect(output).toBeDefined();
    });

    it('should handle binary files', async () => {
      const binaryFile = {
        path: 'image.png',
        absolutePath: '/test/image.png',
        size: 1024,
        modified: new Date(),
        content: '[Binary content]',
        isBinary: true,
        encoding: 'binary',
      };

      const output = await format([binaryFile], { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.files[0].isBinary).toBe(true);
    });
  });

  describe('Metadata', () => {
    it('should include file count in metadata', async () => {
      const output = await format(sampleFiles, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.metadata.fileCount).toBe(3);
    });

    it('should include total size in metadata', async () => {
      const output = await format(sampleFiles, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.metadata.totalSize).toBe(300);
    });

    it('should include generated timestamp', async () => {
      const output = await format(sampleFiles, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.metadata.generated).toBeDefined();
      expect(new Date(parsed.metadata.generated)).toBeInstanceOf(Date);
    });

    it('should include directory structure', async () => {
      const output = await format(sampleFiles, { format: 'json' });
      const parsed = JSON.parse(output);

      expect(parsed.metadata.directoryStructure).toBeDefined();
      expect(Array.isArray(parsed.metadata.directoryStructure)).toBe(true);
    });
  });
});
