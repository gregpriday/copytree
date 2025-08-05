// Mock minimatch before requiring the stage
jest.mock('minimatch', () => ({
  minimatch: jest.fn()
}));

// Static import for mocked modules
import { minimatch } from 'minimatch';

// Use dynamic import for module under test
let AlwaysIncludeStage;

beforeAll(async () => {
  const alwaysIncludeStageModule = await import('../../../../src/pipeline/stages/AlwaysIncludeStage.js');
  AlwaysIncludeStage = alwaysIncludeStageModule.default;
});

describe('AlwaysIncludeStage', () => {
  let stage;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default minimatch mock implementation
    minimatch.mockImplementation((path, pattern, options) => {
      // Simple glob matching for tests
      if (pattern === '*.config.js') return path.endsWith('.config.js');
      if (pattern === '*.md') return path.endsWith('.md');
      if (pattern === '*.MD') return path.endsWith('.MD');
      if (pattern === '*.js') return path.endsWith('.js');
      if (pattern === 'src/**/*.js') return path.startsWith('src/') && path.endsWith('.js');
      if (pattern === 'src/**/*') return path.startsWith('src/');
      if (pattern === 'test[0-9].js') return /test[0-9]\.js/.test(path);
      return false;
    });
  });

  describe('constructor', () => {
    it('should accept array of patterns', () => {
      stage = new AlwaysIncludeStage(['README.md', '*.config.js']);
      expect(stage.alwaysPatterns).toEqual(['README.md', '*.config.js']);
    });

    it('should convert single pattern to array', () => {
      stage = new AlwaysIncludeStage('README.md');
      expect(stage.alwaysPatterns).toEqual(['README.md']);
    });

    it('should default to empty array', () => {
      stage = new AlwaysIncludeStage();
      expect(stage.alwaysPatterns).toEqual([]);
    });
  });

  describe('process', () => {
    it('should mark files matching always patterns', async () => {
      stage = new AlwaysIncludeStage(['README.md', '*.config.js']);
      const input = {
        files: [
          { relativePath: 'README.md', content: 'readme' },
          { relativePath: 'app.config.js', content: 'config' },
          { relativePath: 'src/utils.js', content: 'utils' },
          { relativePath: 'test.js', content: 'test' }
        ]
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(4);
      expect(result.files[0]).toMatchObject({
        relativePath: 'README.md',
        alwaysInclude: true
      });
      expect(result.files[1]).toMatchObject({
        relativePath: 'app.config.js',
        alwaysInclude: true
      });
      expect(result.files[2]).not.toHaveProperty('alwaysInclude');
      expect(result.files[3]).not.toHaveProperty('alwaysInclude');
    });

    it('should handle glob patterns', async () => {
      stage = new AlwaysIncludeStage(['src/**/*.js', '*.md']);
      const input = {
        files: [
          { relativePath: 'src/index.js' },
          { relativePath: 'src/utils/helper.js' },
          { relativePath: 'README.md' },
          { relativePath: 'test.txt' }
        ]
      };

      const result = await stage.process(input);

      const markedFiles = result.files.filter(f => f.alwaysInclude);
      expect(markedFiles).toHaveLength(3);
      expect(markedFiles.map(f => f.relativePath)).toEqual([
        'src/index.js',
        'src/utils/helper.js',
        'README.md'
      ]);
    });

    it('should handle exact matches', async () => {
      stage = new AlwaysIncludeStage(['src/index.js']);
      const input = {
        files: [
          { relativePath: 'src/index.js' },
          { relativePath: 'index.js' },
          { relativePath: 'src/index.ts' }
        ]
      };

      const result = await stage.process(input);

      expect(result.files[0].alwaysInclude).toBe(true);
      expect(result.files[1]).not.toHaveProperty('alwaysInclude');
      expect(result.files[2]).not.toHaveProperty('alwaysInclude');
    });

    it('should match by basename', async () => {
      stage = new AlwaysIncludeStage(['package.json']);
      const input = {
        files: [
          { relativePath: 'package.json' },
          { relativePath: 'src/package.json' },
          { relativePath: 'package.lock' }
        ]
      };

      const result = await stage.process(input);

      expect(result.files[0].alwaysInclude).toBe(true);
      expect(result.files[1].alwaysInclude).toBe(true);
      expect(result.files[2]).not.toHaveProperty('alwaysInclude');
    });

    it('should handle empty patterns', async () => {
      stage = new AlwaysIncludeStage([]);
      const input = {
        files: [
          { relativePath: 'test.js' }
        ]
      };

      const result = await stage.process(input);

      expect(result).toEqual(input);
      expect(result.files[0]).not.toHaveProperty('alwaysInclude');
    });

    it('should return alwaysPatterns in output', async () => {
      const patterns = ['*.md', 'LICENSE'];
      stage = new AlwaysIncludeStage(patterns);
      const input = { files: [] };

      const result = await stage.process(input);

      expect(result.alwaysPatterns).toEqual(patterns);
    });

    it('should maintain file object integrity', async () => {
      stage = new AlwaysIncludeStage(['test.js']);
      const input = {
        files: [
          { relativePath: 'test.js', content: 'content', size: 100, custom: 'prop' }
        ]
      };

      const result = await stage.process(input);

      expect(result.files[0]).toEqual({
        relativePath: 'test.js',
        content: 'content',
        size: 100,
        custom: 'prop',
        alwaysInclude: true
      });
    });

    it('should handle case-sensitive matching on non-Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      stage = new AlwaysIncludeStage(['*.MD']);
      const input = {
        files: [
          { relativePath: 'README.md' },
          { relativePath: 'README.MD' }
        ]
      };

      const result = await stage.process(input);

      expect(result.files[0]).not.toHaveProperty('alwaysInclude');
      expect(result.files[1].alwaysInclude).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('matchesAlwaysPatterns', () => {
    it('should detect glob patterns', () => {
      stage = new AlwaysIncludeStage(['*.js', 'src/**/*', 'test[0-9].js']);
      
      expect(stage.matchesAlwaysPatterns({ relativePath: 'test.js' })).toBe(true);
      expect(stage.matchesAlwaysPatterns({ relativePath: 'src/deep/file.js' })).toBe(true);
      expect(stage.matchesAlwaysPatterns({ relativePath: 'test1.js' })).toBe(true);
    });

    it('should handle path contains matching', () => {
      stage = new AlwaysIncludeStage(['config']);
      
      expect(stage.matchesAlwaysPatterns({ relativePath: 'src/config/app.js' })).toBe(true);
      expect(stage.matchesAlwaysPatterns({ relativePath: 'config.js' })).toBe(true);
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      stage = new AlwaysIncludeStage();
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
  });
});