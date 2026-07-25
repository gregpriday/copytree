import fs from 'fs-extra';
import path from 'path';
import {
  detect,
  isConvertibleDocument,
  categorizeByExt,
} from '../../../src/utils/BinaryDetector.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

describe('BinaryDetector', () => {
  test('returns error classification when an unknown-extension file cannot be read', async () => {
    const result = await detect('/definitely/not/found.unknownext');
    expect(result.isBinary).toBe(false);
    expect(result.category).toBe('text');
    expect(result.reason).toBe('error');
    expect(result.error).toBeDefined();
  });

  test('classifies a known extension without touching the filesystem', async () => {
    // No file exists at this path. A known-binary extension is decided from the
    // path alone, so there is no open(), no read(), and no error.
    const result = await detect('/definitely/not/found.mp4');
    expect(result.isBinary).toBe(true);
    expect(result.category).toBe('video');
    expect(result.reason).toBe('extension');
    expect(result.error).toBeUndefined();
  });

  test('detects PNG by magic number when the extension is unknown', async () => {
    await withTempDir('binary-detector-png', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'image.unknownext');
      await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      const result = await detect(filePath);
      expect(result.isBinary).toBe(true);
      expect(result.category).toBe('image');
      expect(result.reason).toBe('magic');
      expect(result.name).toBe('PNG');
    });
  });

  test('classifies by extension when category is known', async () => {
    await withTempDir('binary-detector-ext', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'font.ttf');
      await fs.writeFile(filePath, 'plain text but font extension');

      const result = await detect(filePath, { sampleBytes: 64, nonPrintableThreshold: 0.9 });
      expect(result.isBinary).toBe(true);
      expect(result.category).toBe('font');
      expect(result.reason).toBe('extension');
    });
  });

  test('detects binary via null-byte heuristic', async () => {
    await withTempDir('binary-detector-null', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'payload.foo');
      await fs.writeFile(filePath, Buffer.from([0x41, 0x42, 0x00, 0x43]));

      const result = await detect(filePath, { sampleBytes: 16 });
      expect(result.isBinary).toBe(true);
      expect(result.reason).toBe('null-byte');
    });
  });

  test('detects binary via non-printable ratio heuristic', async () => {
    await withTempDir('binary-detector-ratio', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'blob.unknown');
      await fs.writeFile(filePath, Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]));

      const result = await detect(filePath, { sampleBytes: 16, nonPrintableThreshold: 0.3 });
      expect(result.isBinary).toBe(true);
      expect(result.reason).toBe('ratio');
      expect(result.category).toBe('other');
    });
  });

  test('classifies plain text as non-binary', async () => {
    await withTempDir('binary-detector-text', async (tmpDir) => {
      const filePath = path.join(tmpDir, 'notes.txtx');
      await fs.writeFile(filePath, 'hello\nworld\n');

      const result = await detect(filePath, { sampleBytes: 64, nonPrintableThreshold: 0.2 });
      expect(result.isBinary).toBe(false);
      expect(result.category).toBe('text');
      expect(result.reason).toBe('textual');
    });
  });

  test('isConvertibleDocument returns expected values', () => {
    expect(isConvertibleDocument('document', '.pdf')).toBe(true);
    expect(isConvertibleDocument('document', '.DOCX')).toBe(true);
    expect(isConvertibleDocument('image', '.png')).toBe(false);
    expect(isConvertibleDocument('document', '.xls')).toBe(false);
  });

  test('HTML is source code, not a convertible document', () => {
    expect(categorizeByExt('.html')).toBeNull();
    expect(categorizeByExt('.htm')).toBeNull();
    expect(isConvertibleDocument('document', '.html')).toBe(false);
  });

  test.each([
    ['.ts', 'TypeScript, not MPEG transport stream'],
    ['.m', 'Objective-C'],
    ['.h', 'C header'],
    ['.d', 'D source'],
    ['.r', 'R source'],
    ['.pl', 'Perl'],
    ['.rs', 'Rust'],
    ['.sh', 'shell'],
    ['.sql', 'SQL'],
    ['.svelte', 'Svelte component'],
    ['.md', 'Markdown'],
    ['.yml', 'YAML'],
  ])('never classifies %s as binary (%s)', (ext) => {
    expect(categorizeByExt(ext)).toBeNull();
  });

  test('a user config group cannot promote a source extension to binary', () => {
    // The guard is not advisory: the failure mode is silent and severe, so a
    // config that lists `.ts` under `video` is ignored rather than obeyed.
    expect(categorizeByExt('.ts', { video: ['.ts', '.mp4'] })).toBeNull();
    expect(categorizeByExt('.mp4', { video: ['.ts', '.mp4'] })).toBe('video');
  });

  test.each([
    ['.mp4', 'video'],
    ['.mp3', 'audio'],
    ['.webp', 'image'],
    ['.psd', 'design'],
    ['.blend', 'model3d'],
    ['.woff2', 'font'],
    ['.zst', 'archive'],
    ['.dmg', 'diskImage'],
    ['.vsix', 'package'],
    ['.wasm', 'executable'],
    ['.heapsnapshot', 'debug'],
    ['.sqlite3', 'database'],
    ['.safetensors', 'mlWeights'],
    ['.parquet', 'dataBlob'],
    ['.pdf', 'document'],
    ['.pem', 'cert'],
  ])('classifies %s as %s', (ext, category) => {
    expect(categorizeByExt(ext)).toBe(category);
  });
});
