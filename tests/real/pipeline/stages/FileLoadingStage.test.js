import fs from 'fs-extra';
import path from 'path';
import FileLoadingStage from '../../../../src/pipeline/stages/FileLoadingStage.js';
import { withTempDir } from '../../../helpers/tempfs.js';

jest.unmock('fs-extra');

function makeConfig(overrides = {}) {
  return {
    get(key, defaultValue) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      return defaultValue;
    },
  };
}

describe('FileLoadingStage (real)', () => {
  test('returns structure-only placeholder when pattern matches', async () => {
    await withTempDir('file-loading-structure-only', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'package-lock.json');
      await fs.writeFile(absolutePath, '{"name":"x"}');

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': ['package-lock.json'],
        }),
      });

      const result = await stage.loadFileContent({
        path: 'package-lock.json',
        absolutePath,
      });

      expect(result.content).toContain('AI context optimization');
      expect(result.binaryCategory).toBe('structure-only');
      expect(result.isBinary).toBe(true);
    });
  });

  test('loads regular text files', async () => {
    await withTempDir('file-loading-text', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'readme.txt');
      await fs.writeFile(absolutePath, 'hello world');

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': [],
          'copytree.binaryPolicy': {},
        }),
      });

      const result = await stage.loadFileContent({
        path: 'readme.txt',
        absolutePath,
      });

      expect(result.content).toBe('hello world');
      expect(result.isBinary).toBe(false);
      expect(result.encoding).toBe('utf8');
    });
  });

  test('loads convertible binary documents as Buffer for transform stage', async () => {
    await withTempDir('file-loading-convert-doc', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'doc.pdf');
      await fs.writeFile(absolutePath, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]));

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': [],
          'copytree.binaryPolicy': { document: 'convert' },
        }),
      });

      const result = await stage.loadFileContent({
        path: 'doc.pdf',
        absolutePath,
      });

      expect(result.isBinary).toBe(true);
      expect(Buffer.isBuffer(result.content)).toBe(true);
      expect(result.binaryCategory).toBe('document');
    });
  });

  test('handles binary policy branches and base64 encoding', async () => {
    await withTempDir('file-loading-binary-policies', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'file.bin');
      await fs.writeFile(absolutePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.binaryPlaceholderText': '[BINARY_PLACEHOLDER]',
        }),
      });

      const det = { category: 'other', name: 'RAW' };

      expect(stage.handleBinaryFile({ path: 'file.bin', absolutePath }, det, 'skip')).toBeNull();

      const commentResult = stage.handleBinaryFile({ path: 'file.bin', absolutePath }, det, 'comment');
      expect(commentResult.excluded).toBe(true);
      expect(commentResult.excludedReason).toBe('other');

      const placeholderResult = stage.handleBinaryFile(
        { path: 'file.bin', absolutePath },
        det,
        'placeholder',
      );
      expect(placeholderResult.content).toBe('[BINARY_PLACEHOLDER]');

      const base64Result = await stage.handleBinaryFile(
        { path: 'file.bin', absolutePath },
        det,
        'base64',
      );
      expect(base64Result.encoding).toBe('base64');
      expect(base64Result.content).toBe(Buffer.from([0x00, 0x01, 0x02, 0x03]).toString('base64'));
    });
  });

  test('returns binary loading error object when base64 read fails', async () => {
    const stage = new FileLoadingStage();
    const result = await stage.loadBinaryAsBase64(
      { path: 'missing.bin', absolutePath: '/definitely/missing.bin' },
      { category: 'other', name: 'RAW' },
    );

    expect(result.isBinary).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.content).toContain('Error loading binary file');
  });

  test('returns file loading error object when text read fails', async () => {
    const stage = new FileLoadingStage();
    const result = await stage.loadFileContent({
      path: 'missing.txt',
      absolutePath: '/definitely/missing.txt',
    });

    expect(result.error).toBeDefined();
    expect(result.content).toContain('Error loading file');
  });
});
