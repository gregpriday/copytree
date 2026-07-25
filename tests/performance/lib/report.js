/**
 * Reporting and base-versus-candidate comparison.
 *
 * The output answers the question a benchmark exists to answer: which phase
 * changed, on what workload, by how much, at what memory cost, and without
 * changing what CopyTree produced.
 */

/** Metrics reported in the console table, in display order. */
const HEADLINE = ['wallMs', 'firstByteMs', 'firstFileMs', 'rssGrowthBytes', 'heapGrowthBytes'];

/**
 * @param {number} bytes - Byte count
 * @returns {string} Human-readable size
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
}

/**
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Human-readable duration
 */
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '-';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(2)} ms`;
}

/**
 * Render a run as an aligned console table.
 * @param {Object} run - Run record
 * @returns {string} Table text
 */
export function renderRun(run) {
  const rows = [['ID', 'Scenario', 'median', 'p95', 'CV%', 'RSS growth']];

  for (const result of run.results) {
    if (result.failed) {
      rows.push([result.id, result.title, 'FAILED', result.error.slice(0, 30), '', '']);
      continue;
    }
    const wall = result.summary.wallMs;
    const rss = result.summary.rssGrowthBytes;
    rows.push([
      result.id,
      result.title,
      formatMs(wall?.median),
      formatMs(wall?.p95),
      wall ? wall.cvPercent.toFixed(1) : '-',
      rss ? formatBytes(rss.median) : '-',
    ]);
  }

  return renderTable(rows);
}

/**
 * Compare a candidate run against a baseline run.
 *
 * Scenarios present in only one of the two are reported rather than dropped: a
 * silently missing scenario reads as "nothing regressed".
 *
 * @param {Object} baseline - Baseline run record
 * @param {Object} candidate - Candidate run record
 * @returns {Object} Comparison record
 */
export function compareRuns(baseline, candidate) {
  const byId = new Map(baseline.results.map((result) => [result.id, result]));
  const comparisons = [];
  const correctnessBreaks = [];

  for (const after of candidate.results) {
    const before = byId.get(after.id);
    if (!before) {
      comparisons.push({ id: after.id, title: after.title, status: 'new' });
      continue;
    }
    byId.delete(after.id);

    if (before.failed || after.failed) {
      comparisons.push({ id: after.id, title: after.title, status: 'failed' });
      continue;
    }

    // A faster run that produced different output is not a faster run.
    const changed = [];
    for (const key of ['manifestHash', 'normalizedOutputHash', 'selectedFiles', 'selectedBytes']) {
      const a = before.correctness?.[key];
      const b = after.correctness?.[key];
      if (a !== undefined && b !== undefined && a !== b) changed.push(key);
    }
    if (changed.length > 0) {
      correctnessBreaks.push({ id: after.id, title: after.title, changed });
    }

    const metrics = {};
    for (const key of HEADLINE) {
      const a = before.summary?.[key]?.median;
      const b = after.summary?.[key]?.median;
      if (a === undefined || b === undefined) continue;
      metrics[key] = {
        baseline: a,
        candidate: b,
        deltaAbs: Number((b - a).toFixed(3)),
        deltaPercent: a === 0 ? 0 : Number((((b - a) / a) * 100).toFixed(1)),
        improvementPercent: a === 0 ? 0 : Number((((a - b) / a) * 100).toFixed(1)),
      };
    }

    comparisons.push({
      id: after.id,
      title: after.title,
      domain: after.domain,
      status: changed.length > 0 ? 'output-changed' : 'ok',
      metrics,
    });
  }

  for (const missing of byId.values()) {
    comparisons.push({ id: missing.id, title: missing.title, status: 'missing' });
  }

  return {
    schemaVersion: 'copytree-bench-compare@1',
    baselineLabel: baseline.label,
    candidateLabel: candidate.label,
    sameEnvironment:
      baseline.environment.cpu === candidate.environment.cpu &&
      baseline.environment.node === candidate.environment.node,
    comparisons,
    correctnessBreaks,
  };
}

/**
 * Render a comparison as a markdown table.
 * @param {Object} comparison - Comparison record
 * @returns {string} Markdown
 */
export function renderComparison(comparison) {
  const lines = [];

  if (!comparison.sameEnvironment) {
    lines.push('> Baseline and candidate ran on different environments; treat with suspicion.');
    lines.push('');
  }

  lines.push('| ID | Scenario | Before | After | Change | Improvement |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');

  for (const entry of comparison.comparisons) {
    if (entry.status === 'new' || entry.status === 'missing' || entry.status === 'failed') {
      lines.push(`| ${entry.id} | ${entry.title} | - | - | ${entry.status} | - |`);
      continue;
    }
    const wall = entry.metrics.wallMs;
    if (!wall) continue;
    const sign = wall.deltaPercent > 0 ? '+' : '';
    lines.push(
      `| ${entry.id} | ${entry.title} | ${formatMs(wall.baseline)} | ${formatMs(wall.candidate)} ` +
        `| ${sign}${wall.deltaPercent}% | **${wall.improvementPercent > 0 ? `${wall.improvementPercent}% faster` : '-'}** |`,
    );
  }

  if (comparison.correctnessBreaks.length > 0) {
    lines.push('');
    lines.push('### Output changed (these are not valid speedups)');
    for (const entry of comparison.correctnessBreaks) {
      lines.push(`- ${entry.id} ${entry.title}: ${entry.changed.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render rows as a fixed-width table.
 * @param {string[][]} rows - Rows, first row is the header
 * @returns {string} Table text
 */
function renderTable(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  );

  const line = (row) =>
    row
      .map((cell, column) =>
        column <= 1
          ? String(cell ?? '').padEnd(widths[column])
          : String(cell ?? '').padStart(widths[column]),
      )
      .join('  ');

  const out = [line(rows[0]), widths.map((width) => '-'.repeat(width)).join('  ')];
  for (const row of rows.slice(1)) out.push(line(row));
  return out.join('\n');
}
