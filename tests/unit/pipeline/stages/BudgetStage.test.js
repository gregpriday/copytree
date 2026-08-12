import BudgetStage from '../../../../src/pipeline/stages/BudgetStage.js';
import { ExclusionReport, EXCLUSION_REASONS } from '../../../../src/utils/exclusionReport.js';

const makeFiles = (sizes) =>
  sizes.map((size, index) => ({ path: `file${index}.js`, size, absolutePath: `/f${index}.js` }));

const makeInput = (files, extra = {}) => ({
  basePath: '/repo',
  files,
  stats: {},
  ...extra,
});

describe('BudgetStage', () => {
  it('passes everything through when no budget is set', async () => {
    const stage = new BudgetStage();
    const input = makeInput(makeFiles([10, 20, 30]));

    const result = await stage.process(input);

    expect(result.files).toHaveLength(3);
    expect(result.stats.truncated).toBeUndefined();
  });

  it('treats zero, negative, null and false as "no budget"', async () => {
    for (const value of [0, -1, null, false, undefined]) {
      const stage = new BudgetStage({ maxFileCount: value, maxTotalSize: value });
      const result = await stage.process(makeInput(makeFiles([10, 20])));
      expect(result.files).toHaveLength(2);
    }
  });

  it('enforces maxFileCount and reports the truncation', async () => {
    const stage = new BudgetStage({ maxFileCount: 2 });
    const result = await stage.process(makeInput(makeFiles([10, 20, 30, 40])));

    expect(result.files.map((f) => f.path)).toEqual(['file0.js', 'file1.js']);
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.truncatedCount).toBe(2);
    expect(result.stats.truncatedBy).toBe('maxFileCount');
  });

  it('enforces maxTotalSize and reports the truncation', async () => {
    const stage = new BudgetStage({ maxTotalSize: 45 });
    const result = await stage.process(makeInput(makeFiles([10, 20, 30, 40])));

    expect(result.files.map((f) => f.size)).toEqual([10, 20]);
    expect(result.stats.truncated).toBe(true);
    expect(result.stats.truncatedBy).toBe('maxTotalSize');
    expect(result.stats.budgetedSize).toBe(30);
  });

  it('keeps the first file even when it alone exceeds the size budget', async () => {
    // Returning nothing at all is a worse answer than returning one file.
    const stage = new BudgetStage({ maxTotalSize: 5 });
    const result = await stage.process(makeInput(makeFiles([100, 200])));

    expect(result.files).toHaveLength(1);
    expect(result.stats.truncatedCount).toBe(1);
  });

  it('applies the count budget before the size budget', async () => {
    const stage = new BudgetStage({ maxFileCount: 3, maxTotalSize: 35 });
    const result = await stage.process(makeInput(makeFiles([10, 20, 30, 40])));

    // Count trims to 3, then size trims that list to [10, 20]
    expect(result.files.map((f) => f.size)).toEqual([10, 20]);
    expect(result.stats.truncatedBy).toBe('maxFileCount');
    expect(result.stats.truncatedByCountBudget).toBe(1);
    expect(result.stats.truncatedBySizeBudget).toBe(1);
    expect(result.stats.truncatedCount).toBe(2);
  });

  it('drops from the tail, so the incoming order decides what survives', async () => {
    // The stage runs after sorting; it must not reorder or cherry-pick.
    const stage = new BudgetStage({ maxFileCount: 2 });
    const files = [
      { path: 'z.js', size: 1 },
      { path: 'a.js', size: 1 },
      { path: 'm.js', size: 1 },
    ];

    const result = await stage.process(makeInput(files));
    expect(result.files.map((f) => f.path)).toEqual(['z.js', 'a.js']);
  });

  it('records every dropped file in the exclusion report', async () => {
    const report = new ExclusionReport();
    const stage = new BudgetStage({ maxFileCount: 1, maxTotalSize: 5 });

    await stage.process(makeInput(makeFiles([10, 20, 30]), { exclusionReport: report }));

    expect(report.byReason[EXCLUSION_REASONS.FILE_COUNT_BUDGET]).toBe(2);
  });

  it('handles an empty file list', async () => {
    const stage = new BudgetStage({ maxFileCount: 5 });
    const input = makeInput([]);
    expect(await stage.process(input)).toBe(input);
  });

  it('fails the run rather than passing files through when enforcement breaks', async () => {
    const stage = new BudgetStage({ maxFileCount: 1 });

    // Marked fatal, and with no `handleError` to recover through. A budget
    // that disengages on error is a budget that stops binding exactly when
    // something has already gone wrong, and the caller is told nothing:
    // `--max-total-size 2MB` would exit 0 having produced far more than 2MB.
    expect(stage.fatal).toBe(true);
    expect(Object.hasOwn(BudgetStage.prototype, 'handleError')).toBe(false);

    const input = makeInput(makeFiles([1, 2]));
    await expect(stage.handleError(new Error('boom'), input)).rejects.toThrow('boom');
  });

  describe('validate', () => {
    it('rejects a non-object input', () => {
      const stage = new BudgetStage();
      expect(() => stage.validate(null)).toThrow('Input must be an object');
    });

    it('rejects input without a files array', () => {
      const stage = new BudgetStage();
      expect(() => stage.validate({})).toThrow('Input must have a files array');
    });

    it('accepts valid input', () => {
      const stage = new BudgetStage();
      expect(stage.validate({ files: [] })).toBe(true);
    });
  });
});
