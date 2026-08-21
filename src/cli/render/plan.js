/**
 * `copytree plan` report rendering.
 *
 * The plan answers six questions — what, in what order, with what outcome,
 * under which budget, at what size, and why not — and the report is arranged in
 * that order because that is the order they get asked in.
 */

import { formatBytes, formatTokens, json, table } from './format.js';
import { MANIFEST_OUTCOMES } from '../../utils/manifest.js';

/** Schema identifier for the machine-readable plan. */
export const PLAN_SCHEMA = 'copytree-plan@1';

/** Outcome rows, in the order the summary lists them. */
const OUTCOME_ORDER = [
  MANIFEST_OUTCOMES.INCLUDED,
  MANIFEST_OUTCOMES.STRUCTURE_ONLY,
  MANIFEST_OUTCOMES.BINARY_PLACEHOLDER,
  MANIFEST_OUTCOMES.TRUNCATED,
];

/**
 * Build the plan model, shared by every renderer.
 *
 * @param {import('../../selection/selection.js').SelectionPlan} plan - Selection plan
 * @param {Object} request - Canonical request
 * @param {Object} [options={}] - Model options
 * @param {boolean} [options.reproducible=false] - Omit volatile fields
 * @returns {Object} `copytree-plan@1` model
 */
export function buildPlanModel(plan, request, options = {}) {
  const manifestByPath = new Map(plan.manifest.map((entry) => [entry.path, entry]));

  const entries = plan.selected.map((file) => {
    const manifest = manifestByPath.get(file.path);
    const entry = {
      path: file.path,
      size: file.size || 0,
      decision: 'selected',
      outcome: manifest?.outcome ?? MANIFEST_OUTCOMES.INCLUDED,
    };
    if (!options.reproducible && manifest?.modified) entry.modified = manifest.modified;
    if (file.alwaysInclude) entry.forced = true;
    return entry;
  });

  const excludedEntries = plan.excluded.map((detail) => {
    const source = splitRuleSource(detail.ruleSource);
    return {
      path: detail.path,
      size: detail.size || 0,
      decision: 'excluded',
      reason: detail.reason,
      ...(detail.rule ? { rule: detail.rule } : {}),
      ...(source.file ? { ruleSource: source.file } : {}),
      ...(source.line !== null ? { ruleLine: source.line } : {}),
      ...(detail.isDirectory ? { isDirectory: true } : {}),
    };
  });

  return {
    schema: PLAN_SCHEMA,
    root: plan.root,
    // Required by `copytree-plan@1`, and omitted only under `--reproducible`,
    // which section 16.4 defines as the mode that drops volatile metadata so a
    // report can be compared byte for byte.
    ...(options.reproducible ? {} : { generatedAt: new Date().toISOString() }),
    profile: { name: plan.profile.name, source: plan.profile.source },
    selection: {
      scopes: plan.scopes.requested,
      includes: request.selection.includes,
      excludes: request.selection.excludes,
      forceIncludes: request.selection.forceIncludes,
      sort: request.selection.sort,
      order: request.selection.order,
    },
    budgets: {
      sizeGateBytes: plan.budgets.sizeGate.value === false ? null : plan.budgets.sizeGate.value,
      maxTotalSizeBytes: plan.budgets.maxTotalSize.value,
      maxFiles: plan.budgets.maxFiles.value,
      maxChars: plan.budgets.maxChars.value,
      retainOversizedFirstFile: plan.budgets.retainOversizedFirstFile.value === true,
    },
    exactness: plan.exactness,
    contentRead: false,
    summary: {
      candidates: plan.stats.candidates,
      selected: plan.stats.selected,
      selectedBytes: plan.stats.selectedBytes,
      estimatedOutputChars: plan.stats.estimatedOutputChars,
      estimatedTokens: plan.stats.estimatedTokens,
      excludedByReason: nonZero(plan.stats.excludedByReason),
      byOutcome: countByOutcome(plan.manifest),
      truncated: plan.stats.truncated,
      truncatedBy: plan.stats.truncatedBy,
      truncatedCount: plan.stats.truncatedCount,
      // Why `selectedBytes` can exceed `maxTotalSizeBytes` with nothing
      // truncated. Without these the plan showed an overshoot and no reason for
      // it, which reads as the budget simply not working.
      ...(plan.stats.budgetExceeded ? { budgetExceeded: true } : {}),
      ...(plan.stats.oversizedFirstFileRetained ? { oversizedFirstFileRetained: true } : {}),
    },
    reportTruncation: {
      truncated: plan.stats.decisionsTruncated,
      omittedEntries: plan.stats.decisionsOmitted,
      ...(plan.stats.decisionsTruncated
        ? { reason: 'decision-ledger ceiling reached; narrow the run with --scope' }
        : {}),
    },
    // One array, as `PlanEntryV1` declares: every entry carries its own
    // `decision`. Excluded entries appear only when the caller asked for them
    // (`--explain` or `--all`), because retaining a decision per candidate is
    // the expensive half of planning.
    entries: [...entries, ...excludedEntries],
  };
}

/**
 * Split a `file:line` rule source into its parts.
 * @param {string} ruleSource - Recorded rule source
 * @returns {{file: string, line: number|null}} Parsed source
 */
function splitRuleSource(ruleSource) {
  if (!ruleSource) return { file: null, line: null };
  const match = String(ruleSource).match(/^(.*):(\d+)$/);
  if (!match) return { file: String(ruleSource), line: null };
  return { file: match[1], line: Number(match[2]) };
}

/**
 * Drop zero counts so a report shows what happened, not what did not.
 * @param {Object} counts - Reason counts
 * @returns {Object} Non-zero counts
 */
function nonZero(counts) {
  const result = {};
  for (const [key, value] of Object.entries(counts || {})) {
    if (value > 0) result[key] = value;
  }
  return result;
}

/**
 * Count manifest entries by outcome, with bytes.
 * @param {Array} manifest - Manifest entries
 * @returns {Object} Per-outcome counts and bytes
 */
function countByOutcome(manifest) {
  const totals = {};
  for (const entry of manifest) {
    const bucket = (totals[entry.outcome] ??= { files: 0, bytes: 0 });
    bucket.files += 1;
    bucket.bytes += entry.size || 0;
  }
  return totals;
}

/**
 * Render the plan as text.
 *
 * @param {Object} model - Plan model
 * @param {Object} [options={}] - Rendering options
 * @param {boolean} [options.summary=false] - Summary only
 * @param {boolean} [options.explain=false] - Include excluded entries
 * @param {boolean} [options.all=false] - Include every candidate
 * @returns {string} Report text
 */
export function renderPlanText(model, options = {}) {
  const lines = [`Plan for ${model.root}`, `Profile: ${model.profile.name}`];

  lines.push(
    `Selected: ${model.summary.selected} file${model.summary.selected === 1 ? '' : 's'}, ` +
      `${formatBytes(model.summary.selectedBytes)}, ` +
      `${formatTokens(model.summary.estimatedTokens)} estimated`,
  );
  lines.push('');

  const outcomeRows = OUTCOME_ORDER.filter((outcome) => model.summary.byOutcome[outcome]).map(
    (outcome) => ({
      outcome,
      files: String(model.summary.byOutcome[outcome].files),
      bytes: formatBytes(model.summary.byOutcome[outcome].bytes),
    }),
  );

  for (const [reason, count] of Object.entries(model.summary.excludedByReason)) {
    outcomeRows.push({ outcome: `excluded: ${reason}`, files: String(count), bytes: '' });
  }

  if (outcomeRows.length > 0) {
    lines.push(
      ...table(
        [
          { key: 'outcome', label: 'Outcome' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
        ],
        outcomeRows,
      ),
      '',
    );
  }

  if (!options.summary) {
    if (model.entries.length > 0) {
      lines.push('Selected files:');
      lines.push(
        ...table(
          [
            { key: 'outcome', label: 'Outcome' },
            { key: 'path', label: 'Path' },
            { key: 'size', label: 'Size', align: 'right' },
          ],
          model.entries
            .filter((entry) => entry.decision === 'selected')
            .map((entry) => ({
              outcome: entry.forced ? `${entry.outcome} (forced)` : entry.outcome,
              path: entry.path,
              size: formatBytes(entry.size),
            })),
          { indent: '  ' },
        ),
        '',
      );
    }

    const excluded = model.entries.filter((entry) => entry.decision === 'excluded');
    if ((options.explain || options.all) && excluded.length > 0) {
      lines.push('Excluded entries:');
      lines.push(
        ...table(
          [
            { key: 'reason', label: 'Reason' },
            { key: 'path', label: 'Path' },
            { key: 'size', label: 'Size', align: 'right' },
            { key: 'rule', label: 'Rule' },
            { key: 'source', label: 'Source' },
          ],
          excluded.map((entry) => ({
            reason: entry.reason,
            path: entry.path,
            size: formatBytes(entry.size),
            rule: entry.rule ?? '',
            source: entry.ruleSource
              ? `${entry.ruleSource}${entry.ruleLine ? `:${entry.ruleLine}` : ''}`
              : '',
          })),
          { indent: '  ' },
        ),
        '',
      );
    }
  }

  if (model.summary.truncated) {
    // "Dropped" is only true of files the budget removed. The character budget
    // also *shortens* one file at the boundary and keeps it, and calling that a
    // drop made the count disagree with the manifest right above it.
    const shortened = (model.entries ?? []).filter((e) => e.outcome === 'truncated').length;
    const removed = Math.max(model.summary.truncatedCount - shortened, 0);
    const parts = [];

    if (removed > 0) parts.push(`${removed} file${removed === 1 ? '' : 's'} dropped`);
    if (shortened > 0) parts.push(`${shortened} file${shortened === 1 ? '' : 's'} cut short`);

    lines.push(`${parts.join(', ')} by the ${model.summary.truncatedBy} budget.`);
  }

  if (model.summary.oversizedFirstFileRetained) {
    lines.push(
      `The first file alone exceeds the total-size budget and was kept anyway, ` +
        `because retainOversizedFirstFile is set.`,
    );
  }

  if (model.reportTruncation.truncated) {
    lines.push(
      `Decision ledger truncated: ${model.reportTruncation.omittedEntries} decisions omitted.`,
    );
  }

  // The character budget *is* applied here, from byte size, so saying it needs
  // a real run was wrong twice over: it understated what the plan had done, and
  // it invited the reader to ignore a truncation the plan had already decided.
  lines.push(
    model.exactness.characterBudget === 'estimated-from-bytes'
      ? 'No file contents were read. The character budget was applied from byte size, so ' +
          'multi-byte text may fit more than shown. Dedupe effects require a real run.'
      : 'No file contents were read. Character-limit and dedupe effects require a real run.',
  );

  return `${lines.join('\n')}\n`;
}

/**
 * Render the plan as JSON.
 * @param {Object} model - Plan model
 * @returns {string} JSON text
 */
export function renderPlanJson(model) {
  return json(model);
}

/**
 * Render the plan as newline-delimited JSON.
 *
 * One header object carrying the summary, then one object per entry, so a
 * consumer can stream a very large plan without holding it all.
 *
 * @param {Object} model - Plan model
 * @param {Object} [options={}] - Rendering options
 * @param {boolean} [options.explain=false] - Include excluded entries
 * @returns {string} NDJSON text
 */
export function renderPlanNdjson(model) {
  const { entries, ...header } = model;
  const lines = [JSON.stringify({ ...header, type: 'summary' })];
  for (const entry of entries) lines.push(JSON.stringify({ type: 'entry', ...entry }));
  return `${lines.join('\n')}\n`;
}
