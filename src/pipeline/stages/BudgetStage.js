import Stage from '../Stage.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';

/**
 * BudgetStage - Enforces `maxFileCount` and `maxTotalSize`.
 *
 * Runs after sorting, so the drop order is whatever `sort` established rather
 * than filesystem enumeration order. "Keep the recently-touched files when the
 * budget bites" is only meaningful if the drop order is defined.
 *
 * Precedence when several budgets bite at once: `maxFileCount` is applied first
 * (it is a hard cap on how many entries may appear), then `maxTotalSize` trims
 * what survived. Truncation is always reported, never silent — a silently
 * truncated context is worse than an error, because the agent confidently
 * answers from a partial repository.
 *
 * `maxTotalSize` uses a **greedy-fitting** policy, not a prefix cut: a file that
 * does not fit is skipped and later, smaller files are still considered. Given
 * sizes 6, 6, 1 under a 7-byte budget, the result is the first and third files,
 * not just the first. The alternative (stop at the first file that does not fit)
 * wastes budget whenever one large file sits in the middle of the sorted order.
 *
 * One exception: if the very first file alone exceeds the budget it is kept
 * anyway, because returning nothing is a worse answer than overshooting. That
 * case is reported as `stats.oversizedFirstFileRetained`.
 */
class BudgetStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.maxFileCount = normalizeLimit(options.maxFileCount);
    this.maxTotalSize = normalizeLimit(options.maxTotalSize);
  }

  async process(input) {
    const files = input.files || [];

    if (files.length === 0 || (this.maxFileCount === null && this.maxTotalSize === null)) {
      return input;
    }

    const startTime = Date.now();
    const report = input.exclusionReport;

    let kept = files;
    let droppedByCount = 0;
    let droppedBySize = 0;
    let truncatedBy = null;

    // 1. File count budget
    if (this.maxFileCount !== null && kept.length > this.maxFileCount) {
      const dropped = kept.slice(this.maxFileCount);
      kept = kept.slice(0, this.maxFileCount);
      droppedByCount = dropped.length;
      truncatedBy = 'maxFileCount';

      for (const file of dropped) {
        report?.add({
          path: file.path,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.FILE_COUNT_BUDGET,
          rule: `maxFileCount:${this.maxFileCount}`,
        });
      }
    }

    // 2. Total size budget
    let totalSize = 0;
    let budgetExceeded = false;
    if (this.maxTotalSize !== null) {
      const within = [];
      const dropped = [];

      for (const file of kept) {
        const size = file.size || 0;
        if (totalSize + size > this.maxTotalSize && within.length > 0) {
          dropped.push(file);
          continue;
        }
        // The first file is always kept even if it alone exceeds the budget:
        // returning nothing at all is a worse answer than returning one file.
        // That overshoot is reported rather than hidden — see budgetExceeded.
        within.push(file);
        totalSize += size;
      }

      budgetExceeded = totalSize > this.maxTotalSize;

      if (dropped.length > 0) {
        kept = within;
        droppedBySize = dropped.length;
        truncatedBy = truncatedBy ?? 'maxTotalSize';

        for (const file of dropped) {
          report?.add({
            path: file.path,
            size: file.size || 0,
            reason: EXCLUSION_REASONS.TOTAL_SIZE_BUDGET,
            rule: `maxTotalSize:${this.maxTotalSize}`,
          });
        }
      }
    } else {
      totalSize = kept.reduce((sum, file) => sum + (file.size || 0), 0);
    }

    const truncatedCount = droppedByCount + droppedBySize;

    if (truncatedCount > 0) {
      this.log(
        `Budget applied: kept ${kept.length} of ${files.length} files ` +
          `(${droppedByCount} over count budget, ${droppedBySize} over size budget) ` +
          `in ${this.getElapsedTime(startTime)}`,
        'info',
      );
    }

    if (budgetExceeded) {
      this.log(
        `Total size budget exceeded: kept ${totalSize} bytes against a budget of ` +
          `${this.maxTotalSize}. A single file larger than the budget is kept rather than ` +
          `returning nothing.`,
        'warn',
      );
    }

    return {
      ...input,
      files: kept,
      stats: {
        ...input.stats,
        budgetedSize: totalSize,
        // Set when the retained set is larger than maxTotalSize, which happens
        // only when the very first file alone exceeds it. Named separately from
        // `truncated` because they mean opposite things: one says files were
        // dropped, the other says the budget was overshot to avoid returning
        // nothing at all.
        // ...and therefore this branch must not set `truncated`. It did, which
        // contradicted the sentence above: a caller saw `truncated: true` with
        // no `truncatedCount` and no `truncatedBy`, describing a run where
        // nothing was dropped. When files were dropped as well, the branch below
        // sets it.
        ...(budgetExceeded ? { budgetExceeded: true, oversizedFirstFileRetained: true } : {}),
        ...(truncatedCount > 0
          ? {
              truncated: true,
              truncatedCount,
              truncatedBy,
              truncatedByCountBudget: droppedByCount,
              truncatedBySizeBudget: droppedBySize,
            }
          : {}),
      },
    };
  }

  /**
   * Budgets must never fail a run. If enforcement throws, pass the files through
   * untouched rather than losing the whole context.
   */
  async handleError(error, input) {
    this.log(`Budget enforcement failed: ${error.message}, passing files through`, 'warn');
    return input;
  }

  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }
    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }
    return true;
  }
}

/**
 * Normalize a budget option into a positive number or null.
 * @param {*} value - Raw option value
 * @returns {number|null} Positive limit, or null when disabled
 */
function normalizeLimit(value) {
  if (value === undefined || value === null || value === false) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export default BudgetStage;
