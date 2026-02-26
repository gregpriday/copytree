import fs from 'fs-extra';
import path from 'path';
import FileLoader from '../../../src/utils/fileLoader.js';
import { summarize, reset } from '../../../src/utils/fsErrorReport.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

function createLoader(basePath, options = {}) {
  return new FileLoader({
    basePath,
    config: {
      copytree: {
        fs: {
          retryAttempts: 1,
          retryDelay: 1,
          maxDelay: 1,
        },
      },
    },
    ...options,
  });
}

describe('FileLoader (real)', () => {
  beforeEach(() => {
    reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('detectFileType maps common extension families', () => {
    const loader = createLoader(process.cwd());

    expect(loader.detectFileType('app.js', '')).toBe('javascript');
    expect(loader.detectFileType('config.json', '')).toBe('json');
    expect(loader.detectFileType('README.md', '')).toBe('markdown');
    expect(loader.detectFileType('styles.css', '')).toBe('css');
  });

  test('detectFileType falls back to text or unknown', () => {
    const loader = createLoader(process.cwd());

    expect(loader.detectFileType('file.custom', 'plain text content')).toBe('text');
    expect(loader.detectFileType('file.custom', Buffer.from([0x00, 0x01]))).toBe('unknown');
  });

  test('isTextContent handles string and binary-like content', () => {
    const loader = createLoader(process.cwd());

    expect(loader.isTextContent('hello world')).toBe(true);
    expect(loader.isTextContent('hello\u0001world')).toBe(false);
    expect(loader.isTextContent(Buffer.from('abc'))).toBe(false);
  });

  test('loadFiles uses default include/exclude and respects hidden-file option', async () => {
    await withTempDir('file-loader-loadfiles-defaults', async (tmpDir) => {
      await fs.writeFile(path.join(tmpDir, 'visible.txt'), 'visible');
      await fs.writeFile(path.join(tmpDir, '.hidden.txt'), 'hidden');

      const hiddenOff = createLoader(tmpDir, { includeHidden: false });
      const filesWithoutHidden = await hiddenOff.loadFiles();
      const namesWithoutHidden = filesWithoutHidden.map((f) => f.relativePath);
      expect(namesWithoutHidden).toContain('visible.txt');
      expect(namesWithoutHidden).not.toContain('.hidden.txt');

      const hiddenOn = createLoader(tmpDir, { includeHidden: true });
      const filesWithHidden = await hiddenOn.loadFiles();
      const namesWithHidden = filesWithHidden.map((f) => f.relativePath);
      expect(namesWithHidden).toContain('visible.txt');
      expect(namesWithHidden).toContain('.hidden.txt');
    });
  });

  test('loadFile skips files over maxFileSize', async () => {
    await withTempDir('file-loader-large-file', async (tmpDir) => {
      const largePath = path.join(tmpDir, 'big.txt');
      await fs.writeFile(largePath, '0123456789');

      const loader = createLoader(tmpDir, { maxFileSize: 5 });
      const result = await loader.loadFile('big.txt');

      expect(result).toBeNull();
    });
  });

  test('loadFile skips directories (EISDIR path)', async () => {
    await withTempDir('file-loader-eisdir', async (tmpDir) => {
      await fs.ensureDir(path.join(tmpDir, 'subdir'));
      const loader = createLoader(tmpDir);

      const result = await loader.loadFile('subdir');

      expect(result).toBeNull();
      expect(summarize().permanent).toBeGreaterThanOrEqual(1);
    });
  });

  test('loadFile falls back to binary buffer when UTF-8 read is invalid', async () => {
    await withTempDir('file-loader-binary-fallback-success', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'blob.dat');
      await fs.writeFile(filePath, Buffer.from([0x01, 0x02, 0x03]));

      const loader = createLoader(tmpDir);

      const readSpy = jest.spyOn(fs, 'readFile');
      readSpy
        .mockImplementationOnce(async () => {
          throw new Error('Invalid UTF-8');
        })
        .mockImplementationOnce(async () => Buffer.from([0x01, 0x02, 0x03]));

      const result = await loader.loadFile('blob.dat');

      expect(result).toBeDefined();
      expect(result.isBinary).toBe(true);
      expect(Buffer.isBuffer(result.content)).toBe(true);
      expect(result.type).toBe('binary');
    });
  });

  test('loadFile returns null when binary fallback also fails with retryable error', async () => {
    await withTempDir('file-loader-binary-fallback-fail', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'blob.dat');
      await fs.writeFile(filePath, Buffer.from([0x01, 0x02, 0x03]));

      const loader = createLoader(tmpDir, {
        config: {
          copytree: {
            fs: {
              retryAttempts: 1,
              retryDelay: 1,
              maxDelay: 1,
            },
          },
        },
      });

      let callCount = 0;
      jest.spyOn(fs, 'readFile').mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Invalid bytes');
        }
        throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      });

      const result = await loader.loadFile('blob.dat');

      expect(result).toBeNull();
      expect(summarize().failed).toBeGreaterThanOrEqual(1);
    });
  });
});
