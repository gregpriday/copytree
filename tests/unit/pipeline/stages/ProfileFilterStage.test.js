import { jest } from '@jest/globals';

jest.mock('../../../../src/config/ConfigManager.js', () => ({
  config: () => ({
    get: jest.fn((_key, defaultValue) => defaultValue),
  }),
}));

import ProfileFilterStage from '../../../../src/pipeline/stages/ProfileFilterStage.js';

describe('ProfileFilterStage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('filters files matching exclusion patterns', async () => {
    const stage = new ProfileFilterStage({
      exclude: ['*.log', 'dist/**'],
      filter: [],
    });

    const input = {
      files: [
        { path: 'src/index.js' },
        { path: 'error.log' },
        { path: 'dist/bundle.js' },
        { path: 'README.md' },
      ],
      stats: {},
    };

    const result = await stage.process(input);

    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path)).toEqual(['src/index.js', 'README.md']);
  });

  test('includes only files matching filter patterns', async () => {
    const stage = new ProfileFilterStage({
      exclude: [],
      filter: ['**/*.js'],
    });

    const input = {
      files: [{ path: 'src/index.js' }, { path: 'README.md' }, { path: 'style.css' }],
      stats: {},
    };

    const result = await stage.process(input);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.js');
  });

  test('always includes files marked with alwaysInclude flag', async () => {
    const stage = new ProfileFilterStage({
      exclude: ['*.md'],
      filter: [],
    });

    const input = {
      files: [{ path: 'README.md', alwaysInclude: true }, { path: 'CHANGELOG.md' }],
      stats: {},
    };

    const result = await stage.process(input);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('README.md');
  });

  describe('case-insensitive matching on Windows', () => {
    let originalPlatform;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('matches mixed-case patterns on win32 for filter', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const stage = new ProfileFilterStage({
        exclude: [],
        filter: ['README.md'],
      });

      const input = {
        files: [{ path: 'README.MD' }, { path: 'readme.md' }, { path: 'Readme.Md' }],
        stats: {},
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(3);
    });

    test('matches mixed-case patterns on win32 for exclude', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const stage = new ProfileFilterStage({
        exclude: ['*.log'],
        filter: [],
      });

      const input = {
        files: [
          { path: 'error.log' },
          { path: 'ERROR.LOG' },
          { path: 'Error.Log' },
          { path: 'app.js' },
        ],
        stats: {},
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('app.js');
    });

    test('is case-sensitive on non-Windows platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const stage = new ProfileFilterStage({
        exclude: [],
        filter: ['README.md'],
      });

      const input = {
        files: [{ path: 'README.md' }, { path: 'README.MD' }],
        stats: {},
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('README.md');
    });
  });
});
