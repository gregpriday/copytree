/**
 * The one place `copy()` and `copyStream()` agree on what `result.stats` says.
 *
 * This lived in `copy.js`, and `copyStream.js` imported it from there — which
 * meant a caller who only ever streams still loaded the buffered copy path and
 * everything behind it, to reach one pure function that folds a summary object
 * into a stats object.
 */

import { pickForwardedStats } from './scan.js';

/**
 * Fold the scan summary into the shape `result.stats` exposes.
 *
 * Shared with `copyStream()` so the two entry points cannot drift on which
 * numbers they surface.
 *
 * @param {Object|null} summary - Summary emitted by the scan, if any
 * @param {Array<Object>} files - Selected files
 * @returns {Object} Stats fragment
 */
export function summaryStats(summary, files) {
  if (!summary) {
    return {
      noFilesMatched: files.length === 0,
      excluded: { total: 0, byReason: {} },
    };
  }

  return {
    noFilesMatched: summary.noFilesMatched,
    excluded: summary.excluded,
    ...(summary.truncated
      ? {
          truncated: true,
          truncatedCount: summary.truncatedCount,
          truncatedBy: summary.truncatedBy,
        }
      : { truncated: false }),
    ...(summary.budgetExceeded ? { budgetExceeded: true } : {}),
    ...(summary.scope ? { scope: summary.scope } : {}),
    ...pickForwardedStats(summary),
  };
}
