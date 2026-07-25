/**
 * Exclusion accounting.
 *
 * Every run can answer "what didn't make it, and why". Reasons are stable
 * machine-readable keys, never prose: they cross process boundaries and get
 * rendered by switch statements in consuming applications.
 *
 * Aggregate counts are always collected and cost nothing extra (they are
 * incremented at the point of the decision that was already being made).
 * The per-file detail list is only retained under `explain: true`.
 */

/**
 * Stable exclusion reason keys.
 *
 * These are part of the public API. Values must not change once released;
 * new reasons are additive.
 *
 * @readonly
 * @enum {string}
 */
export const EXCLUSION_REASONS = Object.freeze({
  /** Matched a rule in a `.gitignore` file (root or nested) */
  GITIGNORE: 'gitignore',
  /** Matched a rule in a `.copytreeignore` file (root or nested) */
  COPYTREEIGNORE: 'copytreeignore',
  /** Matched the user's global gitignore (`core.excludesFile`) */
  GLOBAL_GITIGNORE: 'globalGitignore',
  /** Matched a rule in `.git/info/exclude` */
  GIT_INFO_EXCLUDE: 'gitInfoExclude',
  /** Matched `globalExcludedFiles` / `globalExcludedDirectories` from config */
  CONFIG_EXCLUDE: 'configExclude',
  /** Matched a caller-supplied `exclude` pattern */
  OPTION_EXCLUDE: 'optionExclude',
  /** Did not match the caller-supplied `filter` / include patterns */
  FILTER_PATTERN: 'filterPattern',
  /** Excluded because `--no-tests` was requested */
  TEST_EXCLUDE: 'testExclude',
  /** Known-binary extension, excluded from content */
  BINARY_EXTENSION: 'binaryExtension',
  /** Larger than the hard size gate, never opened */
  SIZE_GATE: 'sizeGate',
  /** Dropped because the total size budget was exhausted */
  TOTAL_SIZE_BUDGET: 'totalSizeBudget',
  /** Dropped because the file count budget was exhausted */
  FILE_COUNT_BUDGET: 'fileCountBudget',
  /** Dropped because the character budget was exhausted */
  CHAR_BUDGET: 'charBudget',
  /** Outside the requested `scope` entries */
  SCOPE_FILTER: 'scopeFilter',
  /** Filtered out by a git filter (`modified` / `changed`) */
  GIT_FILTER: 'gitFilter',
  /** Removed as a duplicate of another file */
  DUPLICATE: 'duplicate',
  /** Could not be read (permissions, broken symlink, I/O error) */
  UNREADABLE: 'unreadable',
  /** Matched a secret-prone filename pattern (`.env`, `*.pem`, ...) */
  SECRET_FILE: 'secretFile',
  /** Too large for the secret scanner to inspect, so not emitted unscanned */
  SECRET_UNSCANNABLE: 'secretUnscannable',
  /** A symlink resolved outside the real repository root, or could not be resolved */
  SYMLINK_ESCAPE: 'symlinkEscape',
});

const ALL_REASONS = Object.values(EXCLUSION_REASONS);

/**
 * Map an ignore-layer kind to its exclusion reason.
 * @param {string} kind - Layer kind recorded by the walker
 * @returns {string} Exclusion reason key
 */
export function reasonForLayerKind(kind) {
  switch (kind) {
    case 'gitignore':
      return EXCLUSION_REASONS.GITIGNORE;
    case 'copytreeignore':
      return EXCLUSION_REASONS.COPYTREEIGNORE;
    case 'global-gitignore':
      return EXCLUSION_REASONS.GLOBAL_GITIGNORE;
    case 'git-info-exclude':
      return EXCLUSION_REASONS.GIT_INFO_EXCLUDE;
    case 'option-exclude':
      return EXCLUSION_REASONS.OPTION_EXCLUDE;
    case 'test-exclude':
      return EXCLUSION_REASONS.TEST_EXCLUDE;
    case 'config-exclude':
    default:
      return EXCLUSION_REASONS.CONFIG_EXCLUDE;
  }
}

/**
 * @typedef {Object} ExclusionDetail
 * @property {string} path - POSIX path relative to the scan root
 * @property {number} size - File size in bytes (0 when unknown)
 * @property {string} reason - One of {@link EXCLUSION_REASONS}
 * @property {string} [rule] - The pattern that matched, when known
 * @property {string} [ruleSource] - The ignore file and line that produced the rule
 */

/**
 * Accumulates exclusion counts, and optionally per-file detail.
 */
export class ExclusionReport {
  /**
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.explain=false] - Retain per-file detail
   * @param {number} [options.topN=50] - How many of the largest exclusions to keep
   */
  constructor(options = {}) {
    this.explain = options.explain === true;
    this.topN = Number.isInteger(options.topN) && options.topN > 0 ? options.topN : 50;
    this.total = 0;
    this.byReason = Object.create(null);
    for (const reason of ALL_REASONS) {
      this.byReason[reason] = 0;
    }
    /** @type {ExclusionDetail[]} */
    this._details = [];
    // Path -> reason, so an exclusion can be reversed when a later stage
    // re-includes the file. Only tracked for files, and only for the reasons a
    // force-include can override, so this stays small.
    this._reasonsByPath = new Map();
  }

  /**
   * Record one exclusion.
   * @param {ExclusionDetail} detail - The exclusion
   */
  add(detail) {
    if (!detail || !detail.reason) return;

    this.total++;
    this.byReason[detail.reason] = (this.byReason[detail.reason] || 0) + 1;

    if (!detail.isDirectory && detail.path) {
      this._reasonsByPath.set(detail.path, detail.reason);
    }

    if (!this.explain) return;

    this._details.push({
      path: detail.path,
      size: detail.size || 0,
      reason: detail.reason,
      ...(detail.rule ? { rule: detail.rule } : {}),
      ...(detail.ruleSource ? { ruleSource: detail.ruleSource } : {}),
    });

    // Keep memory bounded on repositories with very large ignored trees.
    if (this._details.length > this.topN * 8) {
      this._compact();
    }
  }

  /**
   * Undo a previously recorded exclusion.
   *
   * A file can be excluded by an ignore rule and then force-included by
   * `always` / `.copytreeinclude`, which wins. Leaving the earlier record in
   * place would report a file as both included and excluded in the same run.
   *
   * @param {string} filePath - POSIX path relative to the scan root
   * @returns {boolean} True when a record was removed
   */
  remove(filePath) {
    if (!filePath) return false;

    const index = this._details.findIndex((detail) => detail.path === filePath);
    if (index !== -1) {
      const [removed] = this._details.splice(index, 1);
      this.total = Math.max(0, this.total - 1);
      this.byReason[removed.reason] = Math.max(0, (this.byReason[removed.reason] || 0) - 1);
      return true;
    }

    // Without `explain` there is no per-file detail to search, so the caller
    // records the reason alongside the path when it wants exact reversal.
    const reason = this._reasonsByPath?.get(filePath);
    if (reason === undefined) return false;

    this._reasonsByPath.delete(filePath);
    this.total = Math.max(0, this.total - 1);
    this.byReason[reason] = Math.max(0, (this.byReason[reason] || 0) - 1);
    return true;
  }

  /**
   * Fold another report into this one.
   * @param {ExclusionReport|Object} other - Report or serialized report
   */
  merge(other) {
    if (!other) return;

    this.total += other.total || 0;
    for (const [reason, count] of Object.entries(other.byReason || {})) {
      this.byReason[reason] = (this.byReason[reason] || 0) + count;
    }

    const details = other._details || other.largest || [];
    if (this.explain && details.length > 0) {
      this._details.push(...details);
      if (this._details.length > this.topN * 8) {
        this._compact();
      }
    }
  }

  /** @private */
  _compact() {
    this._details.sort((a, b) => b.size - a.size);
    this._details.length = Math.min(this._details.length, this.topN);
  }

  /**
   * Whether anything was excluded.
   * @returns {boolean} True when at least one exclusion was recorded
   */
  get isEmpty() {
    return this.total === 0;
  }

  /**
   * Serialize for `result.stats.excluded`.
   * @returns {{total: number, byReason: Object<string, number>, largest?: ExclusionDetail[]}} Report
   */
  toJSON() {
    const result = {
      total: this.total,
      byReason: { ...this.byReason },
    };

    if (this.explain) {
      this._compact();
      result.largest = this._details.slice(0, this.topN);
    }

    return result;
  }
}

export default ExclusionReport;
