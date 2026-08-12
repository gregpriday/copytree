/**
 * `copytree explain` report rendering.
 *
 * The trace answers both directions of the question — "why is this missing?"
 * and "why is this unexpectedly present?" — so every step is listed whether it
 * mattered or not. A step that did not fire is evidence too.
 */

import { formatBytes, json } from './format.js';

/** Schema identifier for the machine-readable explanation. */
export const EXPLAIN_SCHEMA = 'copytree-explain@1';

/**
 * Build the explanation model.
 *
 * @param {Object} params - Inputs
 * @param {string} params.root - Project root
 * @param {Array} params.traces - Per-entry traces
 * @returns {Object} `copytree-explain@1` model
 */
export function buildExplainModel({ root, traces }) {
  return { schema: EXPLAIN_SCHEMA, root, contentRead: false, entries: traces };
}

/**
 * Render an explanation as text.
 * @param {Object} model - Explanation model
 * @returns {string} Report text
 */
export function renderExplainText(model) {
  const lines = [];

  for (const entry of model.entries) {
    lines.push(`@${entry.path}`);

    const width = entry.steps.reduce((widest, step) => Math.max(widest, step.label.length), 0);
    for (const step of entry.steps) {
      lines.push(`  ${step.label.padEnd(width)}  ${step.detail}`);
    }

    const verdict =
      entry.decision === 'selected'
        ? `included${entry.outcome && entry.outcome !== 'included' ? ` (${entry.outcome})` : ''}`
        : `excluded: ${entry.reason ?? 'not a candidate'}`;
    lines.push(`  ${'final decision'.padEnd(width)}  ${verdict}`);
    lines.push('');
  }

  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * Render an explanation as JSON.
 * @param {Object} model - Explanation model
 * @returns {string} JSON text
 */
export function renderExplainJson(model) {
  return json(model);
}

/**
 * Format a byte size for a trace step.
 * @param {number} bytes - Size
 * @returns {string} Rendered size
 */
export function traceSize(bytes) {
  return formatBytes(bytes);
}
