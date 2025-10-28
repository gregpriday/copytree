import ProfileFilterStage from '../../../../src/pipeline/stages/ProfileFilterStage.js';

describe('ProfileFilterStage', () => {
  let stage;

  const createTestInput = () => ({
    files: [
      { path: 'src/file1.js', content: 'file1' },
      { path: 'src/file2.js', content: 'file2' },
      { path: 'test/test1.js', content: 'test1' },
      { path: 'docs/readme.md', content: 'readme' },
    ],
    stats: { totalFiles: 4 },
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const stage = new ProfileFilterStage();
      expect(stage.exclude).toEqual([]);
      expect(stage.filter).toEqual([]);
    });

    it('should accept custom options', () => {
      const stage = new ProfileFilterStage({
        exclude: ['**/*.test.js'],
        filter: ['src/**'],
      });

      expect(stage.exclude).toEqual(['**/*.test.js']);
      expect(stage.filter).toEqual(['src/**']);
    });
  });

  describe('process', () => {
    it('should pass through all files when no filters are set', async () => {
      stage = new ProfileFilterStage();
      const input = createTestInput();

      const result = await stage.process(input);

      expect(result.files).toHaveLength(4);
      expect(result.stats.excludedByProfile).toBe(0);
    });

    it('should exclude files matching exclude patterns', async () => {
      stage = new ProfileFilterStage({
        exclude: ['test/**'],
      });
      const input = createTestInput();

      const result = await stage.process(input);

      expect(result.files).toHaveLength(3);
      expect(result.files.map((f) => f.path)).not.toContain('test/test1.js');
      expect(result.stats.excludedByProfile).toBe(1);
    });

    it('should only include files matching filter patterns', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**'],
      });
      const input = createTestInput();

      const result = await stage.process(input);

      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.path)).toEqual(['src/file1.js', 'src/file2.js']);
      expect(result.stats.excludedByProfile).toBe(2);
    });

    it('should apply both filter and exclude patterns', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**', 'test/**'],
        exclude: ['test/**'],
      });
      const input = createTestInput();

      const result = await stage.process(input);

      // Should include src/** files but exclude test/** files
      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.path)).toEqual(['src/file1.js', 'src/file2.js']);
    });

    it('should handle multiple exclude patterns', async () => {
      stage = new ProfileFilterStage({
        exclude: ['test/**', 'docs/**'],
      });
      const input = createTestInput();

      const result = await stage.process(input);

      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.path)).toEqual(['src/file1.js', 'src/file2.js']);
      expect(result.stats.excludedByProfile).toBe(2);
    });

    it('should handle multiple filter patterns', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**', 'docs/**'],
      });
      const input = createTestInput();

      const result = await stage.process(input);

      expect(result.files).toHaveLength(3);
      expect(result.files.map((f) => f.path)).toContain('src/file1.js');
      expect(result.files.map((f) => f.path)).toContain('src/file2.js');
      expect(result.files.map((f) => f.path)).toContain('docs/readme.md');
    });
  });

  describe('alwaysInclude behavior', () => {
    it('should preserve files marked as alwaysInclude even when they match exclude patterns', async () => {
      stage = new ProfileFilterStage({
        exclude: ['test/**'],
      });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1' },
          { path: 'test/test1.js', content: 'test1', alwaysInclude: true },
          { path: 'test/test2.js', content: 'test2' },
        ],
        stats: { totalFiles: 3 },
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.path)).toContain('src/file1.js');
      expect(result.files.map((f) => f.path)).toContain('test/test1.js');
      expect(result.files.map((f) => f.path)).not.toContain('test/test2.js');
    });

    it('should preserve files marked as alwaysInclude even when they do not match filter patterns', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**'],
      });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1' },
          { path: 'test/test1.js', content: 'test1', alwaysInclude: true },
          { path: 'docs/readme.md', content: 'readme' },
        ],
        stats: { totalFiles: 3 },
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(2);
      expect(result.files.map((f) => f.path)).toContain('src/file1.js');
      expect(result.files.map((f) => f.path)).toContain('test/test1.js');
      expect(result.files.map((f) => f.path)).not.toContain('docs/readme.md');
    });

    it('should preserve files marked as alwaysInclude with both filter and exclude', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**'],
        exclude: ['**/*.test.js'],
      });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1' },
          { path: 'src/file1.test.js', content: 'test', alwaysInclude: true },
          { path: 'test/test1.js', content: 'test1', alwaysInclude: true },
          { path: 'docs/readme.md', content: 'readme' },
        ],
        stats: { totalFiles: 4 },
      };

      const result = await stage.process(input);

      // Should include src/file1.js (matches filter)
      // Should include src/file1.test.js (alwaysInclude overrides exclude)
      // Should include test/test1.js (alwaysInclude overrides filter)
      // Should NOT include docs/readme.md (no match, no alwaysInclude)
      expect(result.files).toHaveLength(3);
      expect(result.files.map((f) => f.path)).toContain('src/file1.js');
      expect(result.files.map((f) => f.path)).toContain('src/file1.test.js');
      expect(result.files.map((f) => f.path)).toContain('test/test1.js');
      expect(result.files.map((f) => f.path)).not.toContain('docs/readme.md');
    });

    it('should handle all files marked as alwaysInclude', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**'],
      });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1', alwaysInclude: true },
          { path: 'test/test1.js', content: 'test1', alwaysInclude: true },
          { path: 'docs/readme.md', content: 'readme', alwaysInclude: true },
        ],
        stats: { totalFiles: 3 },
      };

      const result = await stage.process(input);

      // All files should be preserved due to alwaysInclude
      expect(result.files).toHaveLength(3);
    });

    it('should handle no files marked as alwaysInclude with strict filter', async () => {
      stage = new ProfileFilterStage({
        filter: ['src/**'],
      });
      const input = {
        files: [
          { path: 'test/test1.js', content: 'test1' },
          { path: 'docs/readme.md', content: 'readme' },
        ],
        stats: { totalFiles: 2 },
      };

      const result = await stage.process(input);

      // No files match filter and none are marked as alwaysInclude
      expect(result.files).toHaveLength(0);
      expect(result.stats.excludedByProfile).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty file list', async () => {
      stage = new ProfileFilterStage({ exclude: ['**/*'] });
      const input = { files: [], stats: { totalFiles: 0 } };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(0);
      expect(result.stats.excludedByProfile).toBe(0);
    });

    it('should preserve other input properties', async () => {
      stage = new ProfileFilterStage({ exclude: ['test/**'] });
      const input = {
        ...createTestInput(),
        customProperty: 'value',
        metadata: { test: true },
      };

      const result = await stage.process(input);

      expect(result.customProperty).toBe('value');
      expect(result.metadata).toEqual({ test: true });
    });

    it('should handle files with dot in path for exclude patterns', async () => {
      stage = new ProfileFilterStage({
        exclude: ['**/*.test.js'],
      });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1' },
          { path: 'src/file1.test.js', content: 'test' },
        ],
        stats: { totalFiles: 2 },
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/file1.js');
    });
  });
});
