import fs from 'fs-extra';
import path from 'path';
import FileLoaderTransformer from '../../../src/transforms/transformers/FileLoaderTransformer.js';
import { withTempDir } from '../../helpers/tempfs.js';

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

describe('FileLoaderTransformer (real)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns file as-is when content is already loaded', async () => {
    const transformer = new FileLoaderTransformer();
    const file = { path: 'a.txt', absolutePath: '/tmp/a.txt', content: 'existing' };

    const result = await transformer.doTransform(file);

    expect(result).toBe(file);
  });

  test('loads text file content from disk', async () => {
    await withTempDir('file-loader-transformer-text', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'note.txt');
      await fs.writeFile(absolutePath, 'hello transformer');

      const transformer = new FileLoaderTransformer({ encoding: 'utf8' });

      const result = await transformer.doTransform({
        path: 'note.txt',
        absolutePath,
        isBinary: false,
      });

      expect(result.content).toBe('hello transformer');
      expect(result.transformed).toBe(false);
      expect(result.transformedBy).toBe('FileLoaderTransformer');
    });
  });

  test('handles binary file actions: skip, placeholder, and base64', async () => {
    await withTempDir('file-loader-transformer-binary-actions', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'blob.bin');
      const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      await fs.writeFile(absolutePath, bytes);

      const skipTransformer = new FileLoaderTransformer();
      skipTransformer.config = makeConfig({ 'copytree.binaryFileAction': 'skip' });
      const skipResult = await skipTransformer.doTransform({
        path: 'blob.bin',
        absolutePath,
        isBinary: true,
      });
      expect(skipResult).toBeNull();

      const placeholderTransformer = new FileLoaderTransformer();
      placeholderTransformer.config = makeConfig({
        'copytree.binaryFileAction': 'placeholder',
        'copytree.binaryPlaceholderText': '[PLACEHOLDER]',
      });
      const placeholderResult = await placeholderTransformer.doTransform({
        path: 'blob.bin',
        absolutePath,
        isBinary: true,
      });
      expect(placeholderResult.content).toBe('[PLACEHOLDER]');
      expect(placeholderResult.transformedBy).toBe('FileLoaderTransformer');

      const base64Transformer = new FileLoaderTransformer();
      base64Transformer.config = makeConfig({ 'copytree.binaryFileAction': 'base64' });
      const base64Result = await base64Transformer.doTransform({
        path: 'blob.bin',
        absolutePath,
        isBinary: true,
      });

      expect(base64Result.content).toBe(bytes.toString('base64'));
      expect(base64Result.transformed).toBe(false);
      expect(base64Result.transformedBy).toBe('FileLoaderTransformer');
    });
  });

  test('returns formatted error payload when disk read fails', async () => {
    const transformer = new FileLoaderTransformer();
    transformer.logger = { error: jest.fn() };

    const result = await transformer.doTransform({
      path: 'missing.txt',
      absolutePath: '/definitely/missing.txt',
      isBinary: false,
    });

    expect(result.error).toBeDefined();
    expect(result.transformed).toBe(false);
    expect(result.content).toContain('[Error loading file:');
    expect(transformer.logger.error).toHaveBeenCalledTimes(1);
  });

  test('validateInput throws without absolutePath', () => {
    const transformer = new FileLoaderTransformer();

    expect(() => transformer.validateInput({ path: 'x.txt' })).toThrow('File absolute path is required');
  });
});
