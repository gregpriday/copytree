import fs from 'fs-extra';
import path from 'path';
import FileLoadingStage from '../../../../src/pipeline/stages/FileLoadingStage.js';
import { withTempDir } from '../../../helpers/tempfs.js';
import { ERROR_CODES } from '../../../../src/utils/errors.js';
import { EXCLUSION_REASONS } from '../../../../src/utils/exclusionReport.js';

jest.unmock('../../../../src/utils/fsx.js');

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
  test('tolerates a configuration whose list settings are null', async () => {
    // A configuration file that writes `structureOnlyPatterns:` with no value
    // yields null, not an empty list. Every one of these settings is mapped or
    // indexed immediately afterwards, so the `|| []` fallbacks are the
    // difference between a normal run and a TypeError on the first file.
    await withTempDir('file-loading-null-config', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'a.txt');
      await fs.writeFile(absolutePath, 'plain text');

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': null,
          'copytree.binaryPolicy': null,
        }),
      });

      const result = await stage.loadFileContent({ path: 'a.txt', absolutePath });

      expect(result.content).toBe('plain text');
      expect(result.isBinary).toBe(false);
    });
  });

  test('names an uncategorised binary rather than leaving the reason blank', async () => {
    await withTempDir('file-loading-uncategorised', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'mystery.qqq');
      await fs.writeFile(absolutePath, Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe]));

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': [],
          'copytree.binaryFileAction': 'comment',
          'copytree.binaryPolicy': {},
        }),
      });

      const result = await stage.loadFileContent({ path: 'mystery.qqq', absolutePath });

      expect(result.isBinary).toBe(true);
      expect(result.excluded).toBe(true);
      // Whatever the detector called it, the reason is never empty.
      expect(result.excludedReason).toBeTruthy();
    });
  });

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

  test('represents a document as a binary placeholder, like any other binary', async () => {
    // Documents used to be loaded as raw bytes for a converter that was never
    // registered. The bytes then reached the secrets guard, which could not
    // scan them and dropped the file outright — so a PDF disappeared from the
    // export entirely rather than appearing as a placeholder.
    await withTempDir('file-loading-document', async (tmpDir) => {
      const absolutePath = path.join(tmpDir, 'doc.pdf');
      await fs.writeFile(absolutePath, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]));

      const stage = new FileLoadingStage({
        config: makeConfig({
          'copytree.structureOnlyPatterns': [],
          'copytree.binaryPolicy': { document: 'placeholder' },
        }),
      });

      const result = await stage.loadFileContent({
        path: 'doc.pdf',
        absolutePath,
      });

      expect(result.isBinary).toBe(true);
      expect(result.binaryCategory).toBe('document');
      expect(Buffer.isBuffer(result.content)).toBe(false);
      expect(result.needsTransform).toBeFalsy();
    });
  });

  // A file with an unrecognised extension is classified from its bytes. Small
  // ones are read once and classified from that buffer; large ones fall back to
  // sniffing a bounded prefix first, so an enormous extensionless blob is never
  // pulled into memory in full just to be replaced by a placeholder. Both routes
  // have to reach the same verdict.
  describe('large-file classification fallback', () => {
    test('classifies a large unknown-extension text file as text without reading it whole', async () => {
      await withTempDir('file-loading-large-text', async (tmpDir) => {
        const absolutePath = path.join(tmpDir, 'huge.unknownext');
        const content = `${'const value = 1;\n'.repeat(60 * 1024)}`;
        await fs.writeFile(absolutePath, content);

        const stage = new FileLoadingStage({
          config: makeConfig({
            'copytree.structureOnlyPatterns': [],
            'copytree.binaryPolicy': {},
          }),
        });

        const result = await stage.loadFileContent({
          path: 'huge.unknownext',
          absolutePath,
          // Above the single-read ceiling, so the two-step path is taken.
          size: Buffer.byteLength(content),
        });

        expect(result.isBinary).toBe(false);
        expect(result.content).toBe(content);
      });
    });

    test('classifies a large unknown-extension binary file without loading it as text', async () => {
      await withTempDir('file-loading-large-binary', async (tmpDir) => {
        const absolutePath = path.join(tmpDir, 'huge.unknownext');
        const content = Buffer.alloc(600 * 1024, 0x00);
        await fs.writeFile(absolutePath, content);

        const stage = new FileLoadingStage({
          config: makeConfig({
            'copytree.structureOnlyPatterns': [],
            'copytree.binaryPolicy': {},
            'copytree.binaryPlaceholderText': '[BINARY]',
          }),
        });

        const result = await stage.loadFileContent({
          path: 'huge.unknownext',
          absolutePath,
          size: content.length,
        });

        expect(result.isBinary).toBe(true);
        expect(result.content).toBe('[BINARY]');
      });
    });

    test('reaches the same verdict either side of the single-read ceiling', async () => {
      await withTempDir('file-loading-ceiling-parity', async (tmpDir) => {
        const absolutePath = path.join(tmpDir, 'sample.unknownext');
        const content = 'plain text content\n'.repeat(64);
        await fs.writeFile(absolutePath, content);

        const stage = new FileLoadingStage({
          config: makeConfig({
            'copytree.structureOnlyPatterns': [],
            'copytree.binaryPolicy': {},
          }),
        });

        const base = { path: 'sample.unknownext', absolutePath };
        // A size far above the real one forces the sniff-then-read route; the
        // true size takes the single-read route.
        const viaSniff = await stage.loadFileContent({ ...base, size: 10 * 1024 * 1024 });
        const viaSingleRead = await stage.loadFileContent({
          ...base,
          size: Buffer.byteLength(content),
        });

        expect(viaSniff.isBinary).toBe(viaSingleRead.isBinary);
        expect(viaSniff.content).toBe(viaSingleRead.content);
      });
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

      const commentResult = stage.handleBinaryFile(
        { path: 'file.bin', absolutePath },
        det,
        'comment',
      );
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

  // An unreadable file used to come back with `content: '[Error loading file:
  // ...]'`. That is indistinguishable, to every consumer, from a source file
  // that happens to contain the sentence: the path appears in the tree, the
  // body looks like text, and the run exits 0. The stage is fatal, so the
  // failure propagates instead.
  test('throws rather than encoding a failed base64 read as content', async () => {
    const stage = new FileLoadingStage();

    await expect(
      stage.loadBinaryAsBase64(
        { path: 'missing.bin', absolutePath: '/definitely/missing.bin' },
        { category: 'other', name: 'RAW' },
      ),
    ).rejects.toThrow(/ENOENT|no such file/i);
  });

  test('throws rather than encoding a failed text read as content', async () => {
    const stage = new FileLoadingStage();

    await expect(
      stage.loadFileContent({
        path: 'missing.txt',
        absolutePath: '/definitely/missing.txt',
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.FILESYSTEM,
      path: '/definitely/missing.txt',
      operation: 'read',
    });
  });

  test('replaces an over-ceiling base64 file with a placeholder instead of inlining it', async () => {
    // Base64 inflates by a third on top of the raw bytes, and `maxBase64Size`
    // is a public configuration key that nothing enforced.
    const stage = new FileLoadingStage();
    const result = await stage.loadBinaryAsBase64(
      { path: 'huge.bin', absolutePath: '/definitely/missing.bin', size: 10_000 },
      { category: 'other', name: 'RAW' },
      null,
      1_000,
    );

    expect(result.isBinary).toBe(true);
    expect(result.encoding).not.toBe('base64');
    expect(result.content).toContain('too large to inline');
  });

  test('bounds base64 by the bytes actually read, not only by discovery metadata', async () => {
    // `file.size` comes from a stat taken at discovery: absent for a file
    // classified by extension alone, and stale for one that grew since. The
    // pre-read check avoids the read; this is the check that actually holds.
    const stage = new FileLoadingStage();
    // A stale `size` of 10 that passes the pre-read check, against 4096 bytes
    // actually present.
    const result = await stage.loadBinaryAsBase64(
      { path: 'grew.bin', absolutePath: '/nope/grew.bin', size: 10 },
      { category: 'other', name: 'RAW' },
      Buffer.alloc(4096),
      1_000,
    );

    expect(result.encoding).not.toBe('base64');
    expect(result.content).toContain('too large to inline');
  });

  test('rejects a binary policy the schema no longer accepts', async () => {
    const stage = new FileLoadingStage();

    // `load` and `omit` were in the schema's enum and fell through to
    // `placeholder`, so a closed enum quietly meant something other than what
    // it said.
    expect(() =>
      stage.handleBinaryFile({ path: 'a.bin' }, { category: 'other' }, 'load', {}),
    ).toThrow(/Unknown binary policy/);

    // And it stays a ValidationError through `loadFileContent`, rather than
    // being rewrapped as "Failed to read <path>" — which would blame the file
    // for a configuration mistake and send the reader to check permissions on
    // something perfectly readable.
    jest.spyOn(stage, 'resolveSettings').mockReturnValue({
      structureOnly: [],
      detectOptions: {},
      binaryPolicy: { image: 'load' },
      binaryAction: 'placeholder',
    });

    await expect(
      stage.loadFileContent({ path: 'a.png', absolutePath: '/nope/a.png', size: 1 }),
    ).rejects.toThrow(/Unknown binary policy/);
  });

  test('emits a comment stub for the comment policy', async () => {
    const stage = new FileLoadingStage();
    const result = stage.handleBinaryFile(
      { path: 'a.png' },
      { category: 'image', name: 'PNG' },
      'comment',
      {},
    );

    expect(result).toMatchObject({
      content: '',
      isBinary: true,
      excluded: true,
      excludedReason: 'image',
      binaryCategory: 'image',
    });
  });
});

describe('the skip binary policy', () => {
  it('drops the file and accounts for it rather than leaving a null in the array', async () => {
    // `handleBinaryFile` returns `null` for `skip` (`--binary omit`), and those
    // nulls used to travel the rest of the pipeline: every later stage and both
    // formatters had to remember to step around them, and the consumers that
    // forgot dereferenced null. Dropping them here also means the file is
    // still accounted for, instead of vanishing from the exclusion report.
    const stage = new FileLoadingStage();
    stage._config = {
      get: (key, fallback) => (key === 'copytree.binaryFileAction' ? 'skip' : fallback),
      set: () => {},
      has: () => false,
      all: () => ({}),
    };

    const added = [];
    const result = await stage.process({
      files: [{ path: 'a.png', absolutePath: '/nope/a.png', size: 12 }],
      exclusionReport: { add: (entry) => added.push(entry) },
    });

    expect(result.files).toEqual([]);
    expect(added).toEqual([
      expect.objectContaining({ path: 'a.png', reason: EXCLUSION_REASONS.BINARY_POLICY }),
    ]);
  });

  it('records a size of zero for a skipped file whose size is unknown', async () => {
    const stage = new FileLoadingStage();
    stage._config = {
      get: (key, fallback) => (key === 'copytree.binaryFileAction' ? 'skip' : fallback),
      set: () => {},
      has: () => false,
      all: () => ({}),
    };

    const added = [];
    await stage.process({
      files: [{ path: 'a.png', absolutePath: '/nope/a.png' }],
      exclusionReport: { add: (entry) => added.push(entry) },
    });

    expect(added[0].size).toBe(0);
  });
});

describe('cancellation', () => {
  it('propagates an abort instead of reporting it as an unreadable file', async () => {
    // A cancelled run is the caller's decision, not an I/O failure. Wrapping it
    // in a `FileSystemError` would report exit 1 for something that should be
    // 130, and would name a file that is perfectly readable.
    const stage = new FileLoadingStage();
    const abort = Object.assign(new Error('Operation aborted'), { name: 'AbortError' });

    jest.spyOn(stage, 'handleBinaryFile').mockImplementation(() => {
      throw abort;
    });
    jest.spyOn(stage, 'resolveSettings').mockReturnValue({
      structureOnly: [],
      detectOptions: {},
      binaryPolicy: {},
      binaryAction: 'placeholder',
    });

    await expect(
      stage.loadFileContent({ path: 'a.png', absolutePath: '/nope/a.png', size: 1 }),
    ).rejects.toBe(abort);
  });
});
