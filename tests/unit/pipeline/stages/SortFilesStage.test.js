// Use dynamic import for module under test
let SortFilesStage;

beforeAll(async () => {
  const sortFilesStageModule = await import('../../../../src/pipeline/stages/SortFilesStage.js');
  SortFilesStage = sortFilesStageModule.default;
});

describe('SortFilesStage', () => {
  let stage;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set default values', () => {
      stage = new SortFilesStage();
      expect(stage.sortBy).toBe('path');
      expect(stage.order).toBe('asc');
    });

    it('should accept custom sort and order', () => {
      stage = new SortFilesStage('size', 'desc');
      expect(stage.sortBy).toBe('size');
      expect(stage.order).toBe('desc');
    });
  });

  describe('process', () => {
    const createTestFiles = () => ({
      files: [
        { relativePath: 'b-file.js', stats: { size: 200, mtime: new Date('2024-01-02') } },
        { relativePath: 'a-file.js', stats: { size: 100, mtime: new Date('2024-01-01') } },
        { relativePath: 'c-file.js', stats: { size: 300, mtime: new Date('2024-01-03') } },
        { relativePath: 'sub/d-file.js', stats: { size: 50, mtime: new Date('2024-01-04') } },
      ],
    });

    it('should sort by path (default)', async () => {
      stage = new SortFilesStage();
      const input = createTestFiles();

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'a-file.js',
        'b-file.js',
        'c-file.js',
        'sub/d-file.js',
      ]);
    });

    it('should sort by size', async () => {
      stage = new SortFilesStage('size');
      const input = createTestFiles();

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'sub/d-file.js', // 50
        'a-file.js', // 100
        'b-file.js', // 200
        'c-file.js', // 300
      ]);
    });

    it('should sort by modified time', async () => {
      stage = new SortFilesStage('modified');
      const input = createTestFiles();

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'a-file.js', // 2024-01-01 (oldest first in asc order)
        'b-file.js', // 2024-01-02
        'c-file.js', // 2024-01-03
        'sub/d-file.js', // 2024-01-04
      ]);
    });

    it('should sort by modified time descending', async () => {
      stage = new SortFilesStage('modified', 'desc');
      const input = createTestFiles();

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'sub/d-file.js', // 2024-01-04 (newest first in desc order)
        'c-file.js', // 2024-01-03
        'b-file.js', // 2024-01-02
        'a-file.js', // 2024-01-01
      ]);
    });

    it('should sort by name only', async () => {
      stage = new SortFilesStage('name');
      const input = createTestFiles();

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'a-file.js',
        'b-file.js',
        'c-file.js',
        'sub/d-file.js', // d-file.js comes after c-file.js
      ]);
    });

    it('should sort by extension', async () => {
      stage = new SortFilesStage('extension');
      const input = {
        files: [
          { relativePath: 'doc.pdf' },
          { relativePath: 'script.js' },
          { relativePath: 'image.png' },
          { relativePath: 'readme' },
        ],
      };

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'readme', // no extension comes first
        'script.js', // .js
        'doc.pdf', // .pdf
        'image.png', // .png
      ]);
    });

    it('should sort by depth', async () => {
      stage = new SortFilesStage('depth');
      const input = {
        files: [
          { relativePath: 'a/b/c/file.js' },
          { relativePath: 'a/file.js' },
          { relativePath: 'file.js' },
          { relativePath: 'a/b/file.js' },
        ],
      };

      const result = await stage.process(input);

      expect(result.files.map((f) => f.relativePath)).toEqual([
        'file.js', // depth 1
        'a/file.js', // depth 2
        'a/b/file.js', // depth 3
        'a/b/c/file.js', // depth 4
      ]);
    });

    it('should handle files without stats', async () => {
      stage = new SortFilesStage('size');
      const input = {
        files: [
          { relativePath: 'has-size.js', stats: { size: 100 } },
          { relativePath: 'no-stats.js' }, // no stats object
          { relativePath: 'zero-size.js', stats: { size: 0 } },
        ],
      };

      const result = await stage.process(input);

      // Files without size should be treated as 0
      expect(result.files.map((f) => f.relativePath)).toEqual([
        'no-stats.js',
        'zero-size.js',
        'has-size.js',
      ]);
    });

    it('should handle empty file list', async () => {
      stage = new SortFilesStage();
      const input = { files: [] };
      const result = await stage.process(input);
      expect(result.files).toEqual([]);
    });

    it('should maintain file objects integrity', async () => {
      stage = new SortFilesStage();
      const input = {
        files: [{ relativePath: 'test.js', content: 'test content', custom: 'prop' }],
      };

      const result = await stage.process(input);

      expect(result.files[0]).toEqual({
        relativePath: 'test.js',
        content: 'test content',
        custom: 'prop',
      });
    });

    it('should not mutate original array', async () => {
      stage = new SortFilesStage('size');
      const input = createTestFiles();
      const originalOrder = input.files.map((f) => f.relativePath);

      await stage.process(input);

      // Original array should remain unchanged
      expect(input.files.map((f) => f.relativePath)).toEqual(originalOrder);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      stage = new SortFilesStage();
    });

    it('should validate correct input', () => {
      const input = { files: [] };
      expect(() => stage.validate(input)).not.toThrow();
    });

    it('should throw on invalid input object', () => {
      expect(() => stage.validate(null)).toThrow('Input must be an object');
      expect(() => stage.validate('string')).toThrow('Input must be an object');
    });

    it('should throw on missing files array', () => {
      expect(() => stage.validate({})).toThrow('Input must have a files array');
      expect(() => stage.validate({ files: 'not array' })).toThrow('Input must have a files array');
    });

    it('should throw on invalid sortBy option', () => {
      stage = new SortFilesStage('invalid');
      expect(() => stage.validate({ files: [] })).toThrow('Invalid sortBy option: invalid');
    });

    it('should throw on invalid order option', () => {
      stage = new SortFilesStage('path', 'invalid');
      expect(() => stage.validate({ files: [] })).toThrow('Invalid order option: invalid');
    });
  });

  describe('compareByPath', () => {
    beforeEach(() => {
      stage = new SortFilesStage();
    });

    it('should handle case-insensitive path sorting', () => {
      const result = stage.compareByPath({ relativePath: 'ZZZ.js' }, { relativePath: 'aaa.js' });
      expect(result).toBeGreaterThan(0);
    });

    it('should handle numeric sorting correctly', () => {
      const result = stage.compareByPath(
        { relativePath: 'file2.js' },
        { relativePath: 'file10.js' },
      );
      expect(result).toBeLessThan(0); // file2 should come before file10
    });
  });
});
