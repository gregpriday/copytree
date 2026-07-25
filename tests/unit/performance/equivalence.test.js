/**
 * Equivalence tests for the performance optimisations.
 *
 * Each of these pins a claim that a faster implementation produces exactly what
 * the slower one produced. They exist because the failure mode of a performance
 * change is silent: output that is subtly reordered, or content that is subtly
 * different, still looks like a successful speedup on a stopwatch.
 */

import SortFilesStage from '../../../src/pipeline/stages/SortFilesStage.js';
import { detectFromBuffer, categorizeByExt } from '../../../src/utils/BinaryDetector.js';
import OutputFormattingStage from '../../../src/pipeline/stages/OutputFormattingStage.js';

/**
 * Build file entries with names chosen to stress collation: mixed case, digit
 * runs of differing length, and accented characters.
 * @param {number} count - How many entries
 * @returns {Object[]} File entries
 */
function collationFixtures(count) {
  const names = [
    'File10.js',
    'file9.js',
    'FILE2.js',
    'file1.js',
    'éclair.js',
    'Eclair.js',
    'a-1.js',
    'a-10.js',
    'a-2.js',
    'Z.js',
    'a.js',
  ];
  const files = [];
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length];
    files.push({ path: `dir${i % 7}/${name}`, size: i, stats: { size: i } });
  }
  return files;
}

describe('sort ordering is unchanged by the collator hoist', () => {
  it('matches localeCompare with numeric + base sensitivity on tricky names', async () => {
    const files = collationFixtures(200);
    const stage = new SortFilesStage({ sortBy: 'path', order: 'asc' });

    const result = await stage.process({ basePath: '/repo', files, stats: {} });

    // The reference is the exact call the stage used to make per comparison.
    const expected = [...files].sort((a, b) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
    );

    expect(result.files.map((f) => f.path)).toEqual(expected.map((f) => f.path));
  });

  it('reverses cleanly for descending order', async () => {
    // Distinct paths only. Under `sensitivity: 'base'` some names compare equal
    // (`Eclair.js` and `éclair.js`), and a stable sort leaves tied elements in
    // input order whichever direction it runs, so descending is the reverse of
    // ascending only when there are no ties to preserve.
    const files = Array.from({ length: 50 }, (_, i) => ({
      path: `dir/file-${String(i).padStart(3, '0')}.js`,
      size: i,
    }));

    const ascending = await new SortFilesStage({ sortBy: 'path', order: 'asc' }).process({
      basePath: '/repo',
      files,
      stats: {},
    });
    const descending = await new SortFilesStage({ sortBy: 'path', order: 'desc' }).process({
      basePath: '/repo',
      files,
      stats: {},
    });

    expect(descending.files.map((f) => f.path)).toEqual(
      [...ascending.files].reverse().map((f) => f.path),
    );
  });

  it('orders by depth identically to the split-based count', async () => {
    const files = [
      { path: 'a/b/c/d.js', size: 1 },
      { path: 'a.js', size: 2 },
      { path: 'a/b.js', size: 3 },
      { path: 'a/b/c.js', size: 4 },
    ];

    const result = await new SortFilesStage({ sortBy: 'depth', order: 'asc' }).process({
      basePath: '/repo',
      files,
      stats: {},
    });

    const expected = [...files].sort((a, b) => a.path.split('/').length - b.path.split('/').length);

    expect(result.files.map((f) => f.path)).toEqual(expected.map((f) => f.path));
  });
});

describe('buffer-based binary detection agrees with the sampling path', () => {
  it('reads plain source as text', () => {
    const buffer = Buffer.from('const a = 1;\nexport default a;\n');
    expect(detectFromBuffer('/x/module.unknownext', buffer).isBinary).toBe(false);
  });

  it('still decides a known binary extension without looking at bytes', () => {
    // Deliberately hands it text: the extension has to win, or a 3 GB video
    // would be classified by reading it.
    const buffer = Buffer.from('this is not really a video');
    const result = detectFromBuffer('/x/clip.mp4', buffer);
    expect(result.isBinary).toBe(true);
    expect(result.reason).toBe('extension');
  });

  it('detects a null byte anywhere in the sample', () => {
    const buffer = Buffer.concat([Buffer.from('text'), Buffer.from([0x00]), Buffer.from('more')]);
    const result = detectFromBuffer('/x/blob.unknownext', buffer);
    expect(result.isBinary).toBe(true);
    expect(result.reason).toBe('null-byte');
  });

  it('detects by magic number ahead of the ratio heuristic', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    const result = detectFromBuffer('/x/image.unknownext', png);
    expect(result.category).toBe('image');
    expect(result.reason).toBe('magic');
  });

  it('never classifies source extensions as binary', () => {
    for (const ext of ['.ts', '.h', '.m', '.html', '.svg']) {
      expect(categorizeByExt(ext)).toBeNull();
    }
  });
});

describe('line numbering is unchanged by the format pre-parse', () => {
  /**
   * @param {string} format - Line number format
   * @param {string} content - Content to number
   * @returns {string} Result from the reference implementation
   */
  function reference(format, content) {
    return content
      .split('\n')
      .map((line, index) => {
        const lineNumber = (index + 1).toString();
        return format.replace('%d', lineNumber).replace('%4d', lineNumber.padStart(4)) + line;
      })
      .join('\n');
  }

  it.each(['%4d: ', '%d: ', '%d| ', 'no-placeholder '])(
    'matches the reference for format %p',
    (format) => {
      const stage = new OutputFormattingStage({ format: 'xml' });
      stage.lineNumberFormat = format;

      const content = Array.from({ length: 1200 }, (_, i) => `line ${i}`).join('\n');

      expect(stage.addLineNumbersToContent(content)).toBe(reference(format, content));
    },
  );

  it('returns falsy content untouched', () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    expect(stage.addLineNumbersToContent('')).toBe('');
    expect(stage.addLineNumbersToContent(null)).toBeNull();
  });
});
