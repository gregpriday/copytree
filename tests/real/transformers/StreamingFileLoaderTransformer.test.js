import fs from 'fs-extra';
import path from 'path';
import StreamingFileLoaderTransformer from '../../../src/transforms/transformers/StreamingFileLoaderTransformer.js';
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

describe('StreamingFileLoaderTransformer (real)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns existing content unchanged', async () => {
    const transformer = new StreamingFileLoaderTransformer();
    const file = { path: 'a.txt', absolutePath: '/tmp/a.txt', content: 'existing' };

    const result = await transformer.doTransform(file);

    expect(result).toBe(file);
  });

  test('returns streamingSkipped payload when file exceeds max size', async () => {
    await withTempDir('streaming-loader-max-size', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'big.txt');
      await fs.writeFile(absolutePath, '0123456789');

      const transformer = new StreamingFileLoaderTransformer({ maxSize: 5 });
      const result = await transformer.doTransform({
        path: 'big.txt',
        absolutePath,
      });

      expect(result.streamingSkipped).toBe(true);
      expect(result.content).toContain('File too large');
      expect(result.transformed).toBe(true);
    });
  });

  test('handles binary actions: skip, placeholder, and base64', async () => {
    await withTempDir('streaming-loader-binary-actions', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'image.png');
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
      await fs.writeFile(absolutePath, bytes);

      const skip = new StreamingFileLoaderTransformer();
      skip.config = makeConfig({ 'copytree.binaryFileAction': 'skip' });
      const skipResult = await skip.doTransform({ path: 'image.png', absolutePath });
      expect(skipResult).toBeNull();

      const placeholder = new StreamingFileLoaderTransformer();
      placeholder.config = makeConfig({
        'copytree.binaryFileAction': 'placeholder',
        'copytree.binaryPlaceholderText': '[BINARY]',
      });
      const placeholderResult = await placeholder.doTransform({ path: 'image.png', absolutePath });
      expect(placeholderResult.content).toBe('[BINARY]');
      expect(placeholderResult.isBinary).toBe(true);

      const base64 = new StreamingFileLoaderTransformer();
      base64.config = makeConfig({ 'copytree.binaryFileAction': 'base64' });
      const base64Result = await base64.doTransform({ path: 'image.png', absolutePath });
      expect(base64Result.encoding).toBe('base64');
      expect(base64Result.content).toBe(bytes.toString('base64'));
      expect(base64Result.transformedBy).toBe('StreamingFileLoaderTransformer');
    });
  });

  test('streams text file content', async () => {
    await withTempDir('streaming-loader-text', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'doc.txt');
      await fs.writeFile(absolutePath, 'line1\nline2');

      const transformer = new StreamingFileLoaderTransformer();
      const result = await transformer.doTransform({
        path: 'doc.txt',
        absolutePath,
      });

      expect(result.content).toBe('line1\nline2');
      expect(result.isBinary).toBe(false);
      expect(result.transformed).toBe(true);
    });
  });

  test('returns error payload when file read fails', async () => {
    const transformer = new StreamingFileLoaderTransformer();
    transformer.logger = { error: jest.fn() };

    const result = await transformer.doTransform({
      path: 'missing.txt',
      absolutePath: '/definitely/missing.txt',
    });

    expect(result.transformed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.content).toContain('[Error reading file:');
    expect(transformer.logger.error).toHaveBeenCalledTimes(1);
  });

  test('isBinaryFile uses size, extension, and content heuristics', async () => {
    await withTempDir('streaming-loader-binary-detect', async (tmpDir) => {
      const emptyPath = path.join(tmpDir, 'empty.dat');
      await fs.writeFile(emptyPath, '');

      const pngPath = path.join(tmpDir, 'img.png');
      await fs.writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const nullBytePath = path.join(tmpDir, 'nullbyte.dat');
      await fs.writeFile(nullBytePath, Buffer.from([0x41, 0x00, 0x42, 0x43]));

      const textLikePath = path.join(tmpDir, 'textlike.dat');
      await fs.writeFile(textLikePath, Buffer.from('mostly text\nwith lines\n'));

      const transformer = new StreamingFileLoaderTransformer();

      const emptyStats = await fs.stat(emptyPath);
      const pngStats = await fs.stat(pngPath);
      const nullByteStats = await fs.stat(nullBytePath);
      const textLikeStats = await fs.stat(textLikePath);

      expect(await transformer.isBinaryFile(emptyPath, emptyStats.size)).toBe(false);
      expect(await transformer.isBinaryFile(pngPath, pngStats.size)).toBe(true);
      expect(await transformer.isBinaryFile(nullBytePath, nullByteStats.size)).toBe(true);
      expect(await transformer.isBinaryFile(textLikePath, textLikeStats.size)).toBe(false);
    });
  });

  test('streamTextFile and streamToBase64 reject on missing paths', async () => {
    const transformer = new StreamingFileLoaderTransformer();

    await expect(transformer.streamTextFile('/definitely/missing.txt')).rejects.toBeDefined();
    await expect(transformer.streamToBase64('/definitely/missing.bin')).rejects.toBeDefined();
  });
});
