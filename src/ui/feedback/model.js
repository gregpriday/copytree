import {
  completionHeadline,
  exclusionLabel,
  formatCount,
  formatTokens,
  MATERIAL_REASONS,
  nameFiles,
  plural,
} from './messages.js';
import { formatBytes, formatDuration } from '../../utils/helpers.js';

/**
 * Semantic events a run emits.
 *
 * The event carries meaning; the renderer decides glyph, colour, wording and
 * detail level. That split is what lets the human reporter, the JSON reporter
 * and the tests all consume one thing.
 *
 * @readonly
 * @enum {string}
 */
/**
 * Schema identifier for `--log-format json` feedback.
 *
 * One object per line on stderr, each carrying this identifier, so a consumer
 * can detect a change to the shape rather than silently misreading one.
 */
export const FEEDBACK_SCHEMA = 'copytree-feedback@1';

export const FEEDBACK_EVENTS = Object.freeze({
  RUN_START: 'run.start',
  PHASE_CHANGE: 'phase.change',
  PROGRESS: 'progress',
  NOTICE: 'notice',
  WARNING: 'warning',
  RECOVERY: 'recovery',
  RUN_COMPLETE: 'run.complete',
  RUN_CANCELLED: 'run.cancelled',
  RUN_FAILED: 'run.failed',
});

/**
 * Stable warning codes.
 * @readonly
 * @enum {string}
 */
export const WARNING_CODES = Object.freeze({
  FILES_OMITTED: 'FILES_OMITTED',
  CONTENT_TRUNCATED: 'CONTENT_TRUNCATED',
  FILES_UNREADABLE: 'FILES_UNREADABLE',
  SECRETS_REDACTED: 'SECRETS_REDACTED',
  SECRETS_UNSCANNABLE: 'SECRETS_UNSCANNABLE',
  TRANSFORM_FAILED: 'TRANSFORM_FAILED',
  FS_ERRORS: 'FS_ERRORS',
  CLIPBOARD_FALLBACK: 'CLIPBOARD_FALLBACK',
  STAGE_RECOVERED: 'STAGE_RECOVERED',
});

/**
 * Which reason keys the budget warning is built from, and how they read.
 * `charBudget` is deliberately absent: shortening content is a different claim
 * from omitting files, and collapsing them loses the distinction that matters.
 */
const BUDGET_REASONS = ['totalSizeBudget', 'fileCountBudget', 'sizeGate'];

/**
 * Classify what happened during a run into warnings worth showing.
 *
 * The test is whether the fact could change the reader's decision to use the
 * output. Four thousand `node_modules` entries filtered out is the tool doing
 * its job; twelve files dropped by a size budget is the tool answering a
 * different question than the one that was asked.
 *
 * @param {Object} result - Pipeline result
 * @param {Object} [extra] - Facts the pipeline result does not carry
 * @param {Object} [extra.delivery] - Delivery result
 * @param {Object} [extra.fsErrors] - Filesystem error summary
 * @returns {Array<{code: string, message: string, data: Object}>} Material warnings
 */
export function classifyWarnings(result = {}, extra = {}) {
  const warnings = [];
  const stats = result.stats || {};
  const excluded = result.exclusionReport?.toJSON?.() ?? stats.excluded ?? { byReason: {} };
  const byReason = excluded.byReason || {};

  const omitted = BUDGET_REASONS.reduce((sum, key) => sum + (byReason[key] || 0), 0);
  if (omitted > 0) {
    const parts = BUDGET_REASONS.filter((key) => byReason[key] > 0).map(
      (key) => `${formatCount(byReason[key])} ${exclusionLabel(key)}`,
    );
    warnings.push({
      code: WARNING_CODES.FILES_OMITTED,
      message: `${plural(omitted, 'file')} omitted — ${parts.join('; ')}`,
      data: { count: omitted, byReason: pick(byReason, BUDGET_REASONS) },
    });
  }

  // `charBudget` counts files dropped whole; `stats.truncatedFiles` counts the
  // ones that were shortened. Reading only the first missed the case of a
  // single partially-truncated file entirely, and described the files it did
  // count as "shortened" when they were omitted.
  const shortened = stats.truncatedFiles || 0;
  const droppedByChars = byReason.charBudget || 0;
  if (shortened > 0) {
    warnings.push({
      code: WARNING_CODES.CONTENT_TRUNCATED,
      message: `Content from ${plural(shortened, 'file')} was shortened to fit the character limit`,
      data: { count: shortened },
    });
  }
  if (droppedByChars > 0) {
    warnings.push({
      code: WARNING_CODES.FILES_OMITTED,
      message: `${plural(droppedByChars, 'file')} omitted once the character limit was reached`,
      data: { count: droppedByChars },
    });
  }

  if (byReason.unreadable > 0) {
    warnings.push({
      code: WARNING_CODES.FILES_UNREADABLE,
      message: `${plural(byReason.unreadable, 'file')} could not be read`,
      data: { count: byReason.unreadable },
    });
  }

  if (byReason.symlinkEscape > 0) {
    warnings.push({
      code: WARNING_CODES.FILES_OMITTED,
      message: `${plural(byReason.symlinkEscape, 'symlink')} pointed outside the project and were skipped`,
      data: { count: byReason.symlinkEscape },
    });
  }

  // Field names come from SecretsGuardStage's own stats block. They are read
  // directly rather than through an alias: the previous summary invented
  // `secretsRedacted` and `filesExcluded`, which exist nowhere, so it printed
  // zero redactions on every run that had them.
  //
  // A *successful* redaction is deliberately not a warning. The guard matched
  // something that looked like a credential and removed it — that is the
  // feature working, on a heuristic that is supposed to over-match. Repainting
  // a whole run yellow for it puts a hazard sign on the routine case and
  // teaches the reader to stop reading yellow, which is the one thing that
  // makes the genuinely material warnings below useless. It is reported as a
  // calm note instead; see `buildNotices`.
  const secrets = stats.secretsGuard || {};

  // A file the guard could not read is different from one it deliberately kept
  // out. Dropping `.env` is the policy working, and nearly every repository has
  // one — folding it in with the real gaps meant almost every run came back
  // yellow. A file too large or too binary to scan *is* a gap: it was excluded
  // without anyone establishing whether it needed to be.
  if (secrets.excludedUnscannable > 0) {
    const which = nameFiles(secrets.excludedUnscannablePaths, secrets.excludedUnscannable);
    warnings.push({
      code: WARNING_CODES.SECRETS_UNSCANNABLE,
      message: `${plural(secrets.excludedUnscannable, 'file')} could not be scanned for secrets and ${secrets.excludedUnscannable === 1 ? 'was' : 'were'} left out${which ? `: ${which}` : ''}`,
      data: { count: secrets.excludedUnscannable, paths: secrets.excludedUnscannablePaths },
    });
  }

  // A file whose secrets the guard could not remove is left out entirely, so
  // the warning is about the gap in the export, not about a credential in it.
  //
  // This used to be derived as `findings - redacted` and described as secrets
  // that "remain in the output". Neither half survives: the guard no longer
  // emits a file it could not clean, so nothing remains; and the subtraction
  // was never a count of anything, because `findings` counts detections while
  // `redacted` counts replaced regions — two findings over one credential are
  // one replacement, and an excluded file contributes findings and no
  // replacements at all. Every run that dropped a file therefore claimed the
  // credential had been published.
  if (secrets.excludedWithSecrets > 0) {
    const which = nameFiles(secrets.excludedWithSecretsPaths, secrets.excludedWithSecrets);
    warnings.push({
      code: WARNING_CODES.SECRETS_REDACTED,
      message:
        `${plural(secrets.excludedWithSecrets, 'file')} held a secret that could not be ` +
        `redacted and ${secrets.excludedWithSecrets === 1 ? 'was' : 'were'} left out` +
        `${which ? `: ${which}` : ''}`,
      data: {
        count: secrets.excludedWithSecrets,
        paths: secrets.excludedWithSecretsPaths,
      },
    });
  }

  if (stats.transformErrors > 0) {
    warnings.push({
      code: WARNING_CODES.TRANSFORM_FAILED,
      message: `${plural(stats.transformErrors, 'file')} could not be converted; an error marker stands in for their content`,
      data: { count: stats.transformErrors },
    });
  }

  // A stage that failed and carried on changed the answer. Recording it is
  // what stops `--changed <bad-ref>` from copying an entire repository and
  // exiting 0 with nothing to distinguish it from the diff that was asked for.
  for (const degradation of stats.degradations || []) {
    warnings.push({
      code: WARNING_CODES.STAGE_RECOVERED,
      message: degradation.message,
      data: { stage: degradation.stage },
    });
  }

  const fsErrors = extra.fsErrors || {};
  const fsFailed = (fsErrors.failed || 0) + (fsErrors.permanent || 0);
  if (fsFailed > 0) {
    warnings.push({
      code: WARNING_CODES.FS_ERRORS,
      message: `${plural(fsFailed, 'filesystem operation')} failed after retries`,
      data: { count: fsFailed },
    });
  }

  if (extra.delivery?.fallbackUsed) {
    warnings.push({
      code: WARNING_CODES.CLIPBOARD_FALLBACK,
      message: `Clipboard unavailable — output saved to ${extra.delivery.path}`,
      data: { path: extra.delivery.path, cause: extra.delivery.cause },
    });
  }

  return warnings;
}

/**
 * Things worth mentioning that are not problems.
 *
 * The distinction that makes warnings mean anything: a note says "this happened,
 * you may want to know", a warning says "your output is not what you asked for".
 * Redacting a suspected credential belongs firmly in the first category — the
 * detector is tuned to over-match on purpose, so most redactions are the guard
 * being careful rather than a secret you were about to leak.
 *
 * @param {Object} result - Pipeline result
 * @returns {string[]} Notes to print under the headline, dimmed
 */
export function buildNotices(result = {}) {
  const notices = [];
  const secrets = result.stats?.secretsGuard || {};

  if (secrets.redacted > 0) {
    const which = nameFiles(secrets.redactedPaths, secrets.redactedPaths?.length || 0);
    notices.push(
      `${plural(secrets.redacted, 'possible secret')} redacted${which ? ` in ${which}` : ''}`,
    );
  }
  if (secrets.excludedSecretFiles > 0) {
    const which = nameFiles(secrets.excludedSecretFilePaths, secrets.excludedSecretFiles);
    notices.push(
      `${plural(secrets.excludedSecretFiles, 'secret-prone file')} left out${which ? `: ${which}` : ''}`,
    );
  }
  return notices;
}

/**
 * The metrics line that follows every completion headline.
 *
 * File count and estimated tokens always; byte size and duration only under
 * verbose, because for an AI-context tool "will this fit" is the question and
 * "how big is it on disk" is trivia.
 *
 * @param {Object} stats - Run statistics
 * @param {boolean} [verbose=false] - Include size and duration
 * @param {boolean} [includeFiles=true] - Include the file count. Set false when
 *   the headline already names it, so "Displayed 47 files — 47 files" cannot happen.
 * @returns {string[]} Metric fragments
 */
export function buildMetrics(stats = {}, verbose = false, includeFiles = true) {
  const metrics = includeFiles ? [plural(stats.files ?? 0, 'file')] : [];
  if (verbose && stats.outputBytes) {
    metrics.push(formatBytes(stats.outputBytes, 1));
  }
  metrics.push(formatTokens(stats.estimatedTokens ?? 0));
  if (verbose && stats.durationMs != null) {
    metrics.push(formatDuration(stats.durationMs));
  }
  return metrics;
}

/**
 * Build the structured model for a finished run.
 *
 * A run that produced usable but incomplete output says so in its headline
 * rather than printing a green success line followed by a yellow line that
 * reads as unrelated.
 *
 * @param {Object} params
 * @param {Object} params.delivery - Delivery result ({requested, actual, path, fallbackUsed})
 * @param {Object} params.stats - {files, outputBytes, estimatedTokens, durationMs}
 * @param {Array} [params.warnings=[]] - Warnings from {@link classifyWarnings}
 * @param {string[]} [params.notices=[]] - Calm notes from {@link buildNotices}
 * @param {boolean} [params.verbose=false] - Include secondary metrics
 * @returns {Object} Completion model
 */
export function buildCompletionModel({
  delivery,
  stats = {},
  warnings = [],
  notices = [],
  verbose = false,
}) {
  const fallback = warnings.find((w) => w.code === WARNING_CODES.CLIPBOARD_FALLBACK);

  if (fallback) {
    return {
      event: FEEDBACK_EVENTS.RUN_COMPLETE,
      status: 'warning',
      headline: `Clipboard unavailable — output saved to ${delivery?.path ?? 'a temporary file'}`,
      metrics: buildMetrics(stats, verbose),
      warnings: warnings.filter((w) => w !== fallback),
      notes: notices,
      details: { path: delivery?.path, destination: delivery?.actual },
      stats,
    };
  }

  const headline = completionHeadline({ ...delivery, files: stats.files });
  const status = warnings.length > 0 ? 'warning' : 'success';

  return {
    event: FEEDBACK_EVENTS.RUN_COMPLETE,
    status,
    headline: status === 'warning' ? `${headline} ${qualifier(warnings)}` : headline,
    metrics: buildMetrics(stats, verbose, delivery?.actual !== 'display'),
    warnings,
    notes: notices,
    details: { path: delivery?.path, destination: delivery?.actual },
    stats,
  };
}

/**
 * The phrase appended to a headline when the result is usable but changed.
 * @param {Array} warnings - Material warnings
 * @returns {string} Qualifier phrase
 * @private
 */
function qualifier(warnings) {
  const codes = new Set(warnings.map((w) => w.code));
  if (codes.has(WARNING_CODES.SECRETS_REDACTED)) return 'with unredactable files left out';
  if (codes.has(WARNING_CODES.FILES_OMITTED)) return 'with limits';
  if (codes.has(WARNING_CODES.CONTENT_TRUNCATED)) return 'with truncation';
  return 'with warnings';
}

/**
 * Build the model for a dry run.
 *
 * A preview did select, sort and budget; it simply read nothing and wrote
 * nothing. Saying "no files were processed" understates it, and a green tick
 * overstates it — hence the neutral status.
 *
 * @param {Object} params
 * @param {Object} params.stats - Run statistics
 * @param {Array} [params.warnings=[]] - Material warnings
 * @param {boolean} [params.explain=false] - Whether --explain was passed
 * @param {boolean} [params.verbose=false] - Include secondary metrics
 * @returns {Object} Completion model
 */
export function buildDryRunModel({ stats = {}, warnings = [], explain = false, verbose = false }) {
  const details = ['No content was read and no output was written'];
  if (warnings.length > 0 && !explain) {
    details.push('Use --dry-run --explain to see why files were omitted');
  }
  return {
    event: FEEDBACK_EVENTS.RUN_COMPLETE,
    status: 'neutral',
    headline: 'Preview',
    metrics: buildMetrics(stats, verbose),
    warnings,
    notes: details,
    stats,
  };
}

/**
 * Build the model for a run that matched nothing.
 *
 * Empty is a valid outcome, not a failure — the programmatic API already draws
 * that line via `stats.noFilesMatched`, and the CLI must not contradict it.
 *
 * @param {Object} [params] - What else the run found out
 * @param {Array} [params.warnings=[]] - Material warnings, which are the likely cause
 * @returns {Object} Completion model
 */
export function buildEmptyModel({ warnings = [] } = {}) {
  return {
    event: FEEDBACK_EVENTS.RUN_COMPLETE,
    // Material warnings are the interesting case here, not a footnote: a
    // project whose every file sat above the size gate matched nothing *because
    // of that*, and dropping the warnings left the reader hunting for a filter
    // problem that does not exist.
    status: warnings.length > 0 ? 'warning' : 'neutral',
    headline: 'No files matched',
    metrics: [],
    warnings,
    notes: ['Check --scope, --include and ignore rules.', 'Run: copytree plan . --explain'],
    stats: { files: 0 },
  };
}

/**
 * Build the model for a cancelled run.
 * @returns {Object} Completion model
 */
export function buildCancelledModel() {
  return {
    event: FEEDBACK_EVENTS.RUN_CANCELLED,
    status: 'neutral',
    headline: 'Cancelled',
    metrics: [],
    warnings: [],
  };
}

/**
 * Build the model for a failed run from an error description.
 * @param {Object} description - Result of `describeError()`
 * @returns {Object} Failure model
 */
export function buildFailureModel(description) {
  return {
    event: FEEDBACK_EVENTS.RUN_FAILED,
    status: 'error',
    headline: description.subject
      ? `${description.title}: ${description.subject}`
      : description.title,
    metrics: [],
    warnings: [],
    // The remediation, then the stable code — the four parts section 20 of the
    // CLI specification requires: title, subject, remediation, code. The code
    // is what a reader pastes into an issue and what a script greps for, so it
    // has to appear in the text output too, not only in the JSON feedback.
    // Including `UNKNOWN_ERROR`: a code the reader can quote is the point, and
    // an unclassified failure is exactly the case where an issue report needs
    // one most.
    notes: [
      ...(description.suggestion ? [description.suggestion] : []),
      `[${description.code ?? 'UNKNOWN_ERROR'}]`,
    ],
    code: description.code,
    // Deliberately no `details`. A typed error's details are whatever the
    // thrower found useful — a ConfigurationError carries the entire loaded
    // configuration — and the model is serialized verbatim into the NDJSON
    // feedback stream. That would have written a user's API keys into any log
    // capturing `--log-format json`. The stable `code` is the machine contract;
    // anything more must be redacted before it is worth adding back.
    subject: description.subject ?? undefined,
  };
}

/**
 * The verbose selection summary.
 *
 * Verbose is where the non-material categories belong: a reader who asked for
 * detail wants to see that four thousand entries were ignored, precisely
 * because that number is reassuring rather than alarming.
 *
 * @param {Object} result - Pipeline result
 * @returns {Array<{label: string, value: string}>} Summary rows
 */
export function buildSelectionSummary(result = {}) {
  const excluded = result.exclusionReport?.toJSON?.() ?? result.stats?.excluded ?? { byReason: {} };
  const rows = [];
  for (const [reason, count] of Object.entries(excluded.byReason || {})) {
    if (!count) continue;
    rows.push({
      label: exclusionLabel(reason),
      count,
      value: formatCount(count),
      material: MATERIAL_REASONS.includes(reason),
      reason,
    });
  }
  // Sort on the raw count, not the rendered one: `formatCount` produces
  // "4,102" and "20k", and subtracting those gives NaN, which left the order
  // down to whatever the comparator happened to do with it.
  return rows.sort((a, b) => Number(b.material) - Number(a.material) || b.count - a.count);
}

/**
 * Pick a subset of keys with non-zero values.
 * @private
 */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key]) out[key] = source[key];
  }
  return out;
}

export default {
  FEEDBACK_EVENTS,
  WARNING_CODES,
  classifyWarnings,
  buildCompletionModel,
  buildDryRunModel,
  buildEmptyModel,
  buildCancelledModel,
  buildFailureModel,
};
