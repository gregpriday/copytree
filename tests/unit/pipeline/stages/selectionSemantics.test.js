import SortFilesStage from '../../../../src/pipeline/stages/SortFilesStage.js';
import BudgetStage from '../../../../src/pipeline/stages/BudgetStage.js';
import CharLimitStage from '../../../../src/pipeline/stages/CharLimitStage.js';
import DeduplicateFilesStage from '../../../../src/pipeline/stages/DeduplicateFilesStage.js';

/**
 * Build a minimal file entry.
 * @param {string} path - POSIX relative path
 * @param {Object} [extra] - Additional fields
 * @returns {Object} File entry
 */
function file(path, extra = {}) {
  return { path, absolutePath: `/repo/${path}`, size: 0, ...extra };
}

/**
 * Run a stage and return the resulting paths in order.
 * @param {Object} stage - Stage instance
 * @param {Object} input - Pipeline input
 * @returns {Promise<string[]>} Ordered paths
 */
async function pathsFrom(stage, input) {
  const result = await stage.process(input);
  return result.files.map((entry) => entry.path);
}

describe('sort determinism', () => {
  // Sort order is not cosmetic: budgets truncate from the tail, so whatever the
  // sort leaves tied is decided by array position, which traces back to
  // filesystem enumeration order.
  test('breaks case-only ties instead of leaving them to array order', async () => {
    const stage = new SortFilesStage({ sortBy: 'path' });

    const forward = await pathsFrom(stage, {
      files: [file('README.md'), file('readme.md')],
    });
    const reversed = await pathsFrom(stage, {
      files: [file('readme.md'), file('README.md')],
    });

    expect(forward).toEqual(reversed);
  });

  test('breaks same-basename ties when sorting by name', async () => {
    const stage = new SortFilesStage({ sortBy: 'name' });

    const forward = await pathsFrom(stage, {
      files: [file('b/index.js'), file('a/index.js')],
    });
    const reversed = await pathsFrom(stage, {
      files: [file('a/index.js'), file('b/index.js')],
    });

    expect(forward).toEqual(['a/index.js', 'b/index.js']);
    expect(reversed).toEqual(forward);
  });

  test('sorts by the size field, not only by raw fs.Stats', async () => {
    // Files that reach the sort from the SDK carry `size` but no `stats`.
    // Reading only `stats.size` sorted every one of them as zero.
    const stage = new SortFilesStage({ sortBy: 'size' });

    const sorted = await pathsFrom(stage, {
      files: [file('big.txt', { size: 900 }), file('small.txt', { size: 10 })],
    });

    expect(sorted).toEqual(['small.txt', 'big.txt']);
  });

  test('orders numeric names naturally', async () => {
    const stage = new SortFilesStage({ sortBy: 'path' });

    const sorted = await pathsFrom(stage, {
      files: [file('file10.js'), file('file2.js'), file('file1.js')],
    });

    expect(sorted).toEqual(['file1.js', 'file2.js', 'file10.js']);
  });
});

describe('total size budget', () => {
  // Greedy fitting, documented as such: a file that does not fit is skipped and
  // later, smaller files are still considered.
  test('keeps a later small file after skipping one that does not fit', async () => {
    const stage = new BudgetStage({ maxTotalSize: 7 });

    const result = await stage.process({
      files: [file('a', { size: 6 }), file('b', { size: 6 }), file('c', { size: 1 })],
    });

    expect(result.files.map((entry) => entry.path)).toEqual(['a', 'c']);
    expect(result.stats.truncatedBy).toBe('maxTotalSize');
    expect(result.stats.truncatedCount).toBe(1);
  });

  test('keeps a file that sits exactly on the limit', async () => {
    const stage = new BudgetStage({ maxTotalSize: 10 });

    const result = await stage.process({
      files: [file('a', { size: 10 })],
    });

    expect(result.files).toHaveLength(1);
    expect(result.stats.truncated).toBeUndefined();
  });

  test('drops an oversized first file, because a maximum is a maximum', async () => {
    const stage = new BudgetStage({ maxTotalSize: 5 });

    const result = await stage.process({
      files: [file('huge', { size: 500 })],
    });

    expect(result.files).toHaveLength(0);
    expect(result.stats.budgetExceeded).toBeUndefined();
  });

  test('reports an oversized first file separately from truncation, when asked to keep it', async () => {
    // The overshoot is opt-in, and has to be visible rather than looking like a
    // clean run.
    const stage = new BudgetStage({ maxTotalSize: 5, retainOversizedFirstFile: true });

    const result = await stage.process({
      files: [file('huge', { size: 500 })],
    });

    expect(result.files).toHaveLength(1);
    expect(result.stats.oversizedFirstFileRetained).toBe(true);
    expect(result.stats.budgetExceeded).toBe(true);
  });
});

describe('character budget', () => {
  test('treats a zero limit as a real budget rather than as unset', async () => {
    const stage = new CharLimitStage({ limit: 0 });

    const result = await stage.process({
      files: [file('a.txt', { content: 'hello' })],
    });

    expect(result.files).toHaveLength(0);
  });

  test('never cuts a surrogate pair in half', async () => {
    // An emoji is two UTF-16 code units. A budget landing between them would
    // emit a lone surrogate, which is not valid text for any consumer.
    const stage = new CharLimitStage({ limit: 3 });

    const result = await stage.process({
      files: [file('a.txt', { content: 'ab😀cd' })],
    });

    const emitted = result.files[0]?.content ?? '';
    for (let i = 0; i < emitted.length; i++) {
      const code = emitted.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = emitted.charCodeAt(i + 1);
        expect(next >= 0xdc00 && next <= 0xdfff).toBe(true);
        i++;
      } else {
        expect(code >= 0xdc00 && code <= 0xdfff).toBe(false);
      }
    }
  });
});

describe('deduplication', () => {
  test('does not treat two binaries as duplicates of each other', async () => {
    // Both carry the same placeholder text, which says they were both replaced
    // by a placeholder, not that they are the same file.
    const stage = new DeduplicateFilesStage();

    const result = await stage.process({
      files: [
        file('a.png', { content: '[Binary file]', isBinary: true }),
        file('b.jpg', { content: '[Binary file]', isBinary: true }),
      ],
    });

    expect(result.files).toHaveLength(2);
  });

  test('does not treat two structure-only files as duplicates', async () => {
    const stage = new DeduplicateFilesStage();

    const result = await stage.process({
      files: [
        file('a/package-lock.json', { content: '[omitted]', binaryCategory: 'structure-only' }),
        file('b/package-lock.json', { content: '[omitted]', binaryCategory: 'structure-only' }),
      ],
    });

    expect(result.files).toHaveLength(2);
  });

  test('still removes genuinely identical text files', async () => {
    const stage = new DeduplicateFilesStage();

    const result = await stage.process({
      files: [file('a.txt', { content: 'same' }), file('b.txt', { content: 'same' })],
    });

    expect(result.files.map((entry) => entry.path)).toEqual(['a.txt']);
  });

  test('keeps the last occurrence, in place, when keepFirst is false', async () => {
    const stage = new DeduplicateFilesStage({ keepFirst: false });

    const result = await stage.process({
      files: [
        file('a.txt', { content: 'same' }),
        file('middle.txt', { content: 'other' }),
        file('z.txt', { content: 'same' }),
      ],
    });

    // Position is preserved so the surrounding sort order still holds.
    expect(result.files.map((entry) => entry.path)).toEqual(['z.txt', 'middle.txt']);
  });

  test('uses sha256 rather than md5 as the content identity', async () => {
    const stage = new DeduplicateFilesStage();
    expect(stage.hashAlgorithm).toBe('sha256');
    expect(stage.calculateHash('abc')).toHaveLength(64);
  });
});
