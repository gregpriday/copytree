import Stage from '../Stage.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { ValidationError, ERROR_CODES } from '../../utils/errors.js';

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
 * `maxTotalSize` is a maximum. A single file larger than the whole budget is
 * dropped like any other file that does not fit, and the selection can come
 * back empty — which is the honest answer to "give me at most 1MB" when the
 * only candidate is 40MB. It used to be kept regardless, on the reasoning that
 * returning nothing is unhelpful; the cost of that reasoning was that a caller
 * who set the budget to protect a context window or an API bill could be handed
 * forty times it, having asked for a maximum and been given a suggestion.
 *
 * Callers who do want the old behaviour ask for it by name, with
 * `retainOversizedFirstFile`. It is still reported, as
 * `stats.oversizedFirstFileRetained`.
 */
class BudgetStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Fatal. A budget is a direct instruction about how large the result may
    // be, and this stage used to answer a failure by returning every file
    // untouched — so `--max-total-size 2MB` could exit 0 having produced 40MB.
    // A safety control that disengages exactly when the subsystem enforcing it
    // is already in an unexpected state is worse than no control at all,
    // because the caller believes it held.
    this.fatal = true;
    this.maxFileCount = normalizeLimit(options.maxFileCount, 'maxFileCount');
    this.maxTotalSize = normalizeLimit(options.maxTotalSize, 'maxTotalSize');
    // Off by default: see the class comment. A budget that can be exceeded on
    // the caller's behalf is not a budget.
    this.retainOversizedFirstFile = options.retainOversizedFirstFile === true;
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
        const fits = totalSize + size <= this.maxTotalSize;
        // The opt-in exception, and only for the first file: keeping one
        // oversized file is a deliberate overshoot the caller asked for, and
        // it is reported as `oversizedFirstFileRetained`.
        const keepAnyway = this.retainOversizedFirstFile && within.length === 0;

        if (!fits && !keepAnyway) {
          dropped.push(file);
          continue;
        }

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
          `${this.maxTotalSize}, because retainOversizedFirstFile is set.`,
        'warn',
      );
    }

    return {
      ...input,
      files: kept,
      stats: {
        ...input.stats,
        budgetedSize: totalSize,
        // Set when the retained set is larger than maxTotalSize, which now
        // happens only under `retainOversizedFirstFile`. Named separately from
        // `truncated` because they mean opposite things: one says files were
        // dropped, the other says the budget was deliberately overshot.
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

  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new ValidationError('Input must be an object', 'BudgetStage', input);
    }
    if (!Array.isArray(input.files)) {
      throw new ValidationError('Input must have a files array', 'BudgetStage', input);
    }
    return true;
  }
}

/**
 * Normalize a budget option into a positive number or null.
 *
 * `undefined`, `null`, `false` and `0` all mean "no budget" — the convention
 * this codebase already uses for `sizeGate`, and the reason `--max-files 0` is
 * refused by the CLI parser rather than silently meaning "select nothing".
 *
 * Everything else must be a usable number. It used to be coerced and, on
 * failure, quietly turned into "no budget": `maxTotalSize: 'garbage'` from a
 * profile, `-1` from a typo, `Infinity` from a bad computation, all disabled
 * the cap the caller had asked for and reported a successful unbounded run.
 * That is the same fail-open a budget exists to prevent, arrived at from the
 * configuration side instead of the enforcement side.
 *
 * @param {*} value - Raw option value
 * @param {string} name - Option name, for the error
 * @returns {number|null} Positive limit, or null when disabled
 * @throws {ValidationError} If the value is neither a disabler nor a usable limit
 */
function normalizeLimit(value, name) {
  if (value === undefined || value === null || value === false || value === 0) return null;

  // A string is accepted because YAML and argv both deliver one, but it is
  // converted rather than parsed — `parseInt` reads `'12abc'` as `12`.
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (!Number.isSafeInteger(num) || num < 0) {
    throw new ValidationError(
      `${name} must be a non-negative whole number, received ${String(value)}`,
      'BudgetStage',
      value,
      { code: ERROR_CODES.INVALID_OPTION },
    );
  }

  return num === 0 ? null : num;
}

export default BudgetStage;
