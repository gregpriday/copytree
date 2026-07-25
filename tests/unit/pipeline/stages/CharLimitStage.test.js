import CharLimitStage, {
  truncateAtLineBoundary,
} from '../../../../src/pipeline/stages/CharLimitStage.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../../../src/utils/exclusionReport.js';

const makeInput = (files, extra = {}) => ({ basePath: '/repo', files, stats: {}, ...extra });

describe('truncateAtLineBoundary', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');

  it('cuts at a line boundary and marks the cut', () => {
    const result = truncateAtLineBoundary(lines, 100);

    const body = result.content.slice(0, result.content.indexOf('\n… ['));
    expect(body.split('\n').every((line) => /^line \d+$/.test(line))).toBe(true);
    expect(result.content).toContain(`of ${result.totalLines} lines`);
    expect(result.totalLines).toBe(20);
    expect(result.droppedLines).toBeGreaterThan(0);
  });

  it('stays within the budget', () => {
    for (const budget of [60, 100, 200, 500]) {
      const result = truncateAtLineBoundary(lines, budget);
      if (result) expect(result.content.length).toBeLessThanOrEqual(budget);
    }
  });

  it('falls back to a marked mid-line cut when no whole line fits', () => {
    // A minified bundle is one enormous line; returning nothing would be worse
    // than returning its first few hundred characters.
    const oneLongLine = 'x'.repeat(5000);
    const result = truncateAtLineBoundary(oneLongLine, 200);

    expect(result).not.toBeNull();
    expect(result.content).toContain('truncated mid-line');
    expect(result.content.length).toBeLessThanOrEqual(200);
  });

  it('returns null when the budget cannot even hold a marker', () => {
    expect(truncateAtLineBoundary(lines, 5)).toBeNull();
    expect(truncateAtLineBoundary(lines, 0)).toBeNull();
    expect(truncateAtLineBoundary(lines, -1)).toBeNull();
  });

  it('never emits a trailing unpaired surrogate', () => {
    // Consumers chunk this output at arbitrary offsets; a lone surrogate there
    // is decoding damage they cannot recover from.
    const withEmoji = `${'a'.repeat(80)}😀${'b'.repeat(200)}`;
    const result = truncateAtLineBoundary(withEmoji, 120);

    const body = result.content.slice(0, result.content.indexOf('\n… ['));
    const last = body.charCodeAt(body.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });
});

describe('CharLimitStage', () => {
  it('passes small files through untouched', async () => {
    const stage = new CharLimitStage({ limit: 1000 });
    const files = [{ path: 'a.js', size: 5, content: 'small' }];

    const result = await stage.process(makeInput(files));

    expect(result.files[0].content).toBe('small');
    expect(result.files[0].truncated).toBeUndefined();
    expect(result.stats.truncated).toBeUndefined();
  });

  it('spends the budget across files in order, then truncates', async () => {
    const stage = new CharLimitStage({ limit: 120 });
    const files = [
      { path: 'a.js', size: 50, content: 'a'.repeat(50) },
      { path: 'b.js', size: 500, content: Array.from({ length: 30 }, () => 'bbbb').join('\n') },
      { path: 'c.js', size: 50, content: 'c'.repeat(50) },
    ];

    const result = await stage.process(makeInput(files));

    expect(result.files[0].content).toBe('a'.repeat(50));
    expect(result.files[1].truncated).toBe(true);
    // Everything after the budget is exhausted is dropped, not silently emptied
    expect(result.files).toHaveLength(2);
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.truncatedFiles).toBe(1);
    expect(result.stats.skippedFiles).toBe(1);
  });

  it('records dropped files in the exclusion report', async () => {
    const report = new ExclusionReport();
    const stage = new CharLimitStage({ limit: 60 });
    const files = [
      { path: 'a.js', size: 50, content: 'a'.repeat(50) },
      { path: 'b.js', size: 50, content: 'b'.repeat(50) },
    ];

    await stage.process(makeInput(files, { exclusionReport: report }));

    expect(report.byReason[EXCLUSION_REASONS.CHAR_BUDGET]).toBeGreaterThan(0);
  });

  it('leaves files without string content alone', async () => {
    const stage = new CharLimitStage({ limit: 10 });
    const buffer = Buffer.from([1, 2, 3]);
    const files = [{ path: 'a.pdf', size: 3, content: buffer }, { path: 'b.js' }];

    const result = await stage.process(makeInput(files));

    expect(result.files).toHaveLength(2);
    expect(result.files[0].content).toBe(buffer);
  });

  describe('planning mode (dry run)', () => {
    it('applies the budget using byte size when content is absent', async () => {
      const stage = new CharLimitStage({ limit: 100, plan: true });
      const files = [
        { path: 'a.js', size: 60 },
        { path: 'b.js', size: 80 },
        { path: 'c.js', size: 10 },
      ];

      const result = await stage.process(makeInput(files));

      // a fits, b is marked truncated at the boundary, c never gets a chance
      expect(result.files.map((f) => f.path)).toEqual(['a.js', 'b.js']);
      expect(result.files[1].truncated).toBe(true);
      expect(result.files[1].originalLength).toBe(80);
      expect(result.stats.skippedFiles).toBe(1);
    });

    it('does not materialize content', async () => {
      const stage = new CharLimitStage({ limit: 10, plan: true });
      const result = await stage.process(makeInput([{ path: 'a.js', size: 500 }]));
      expect(result.files[0].content).toBeUndefined();
    });
  });
});
