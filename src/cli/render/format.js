/**
 * Shared rendering primitives for the query commands.
 *
 * Pure functions: they take a model and return a string. They do not write to
 * streams, read configuration, or look at whether stdout is a terminal. That is
 * what makes them testable without a subprocess, and what keeps every report
 * identical whether it goes to a pipe, a file or a screen.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Human-readable byte count.
 *
 * Deliberately deterministic: no locale-aware separators, because these strings
 * are compared in golden tests and read by agents.
 *
 * @param {number} bytes - Byte count
 * @returns {string} e.g. `540 KB`
 */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;

  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < UNITS.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/**
 * Approximate token count, in the units people quote them in.
 * @param {number} tokens - Token estimate
 * @returns {string} e.g. `~171k tokens`
 */
export function formatTokens(tokens) {
  const value = Number(tokens) || 0;
  if (value < 1000) return `~${value} tokens`;
  return `~${Math.round(value / 1000)}k tokens`;
}

/**
 * Render a fixed-width table.
 *
 * @param {Array<{key: string, label: string, align?: 'left'|'right'}>} columns - Column definitions
 * @param {Array<Object>} rows - Row objects keyed by column key
 * @param {Object} [options={}] - Options
 * @param {string} [options.indent=''] - Leading indent for every line
 * @returns {string[]} Rendered lines, header first
 */
export function table(columns, rows, options = {}) {
  const indent = options.indent ?? '';
  const widths = columns.map((column) =>
    rows.reduce(
      (widest, row) => Math.max(widest, String(row[column.key] ?? '').length),
      column.label.length,
    ),
  );

  const line = (cells) =>
    indent +
    cells
      .map((cell, index) =>
        columns[index].align === 'right'
          ? String(cell).padStart(widths[index])
          : String(cell).padEnd(widths[index]),
      )
      .join('  ')
      .trimEnd();

  return [
    line(columns.map((column) => column.label)),
    ...rows.map((row) => line(columns.map((column) => row[column.key] ?? ''))),
  ];
}

/**
 * Render a Markdown table.
 * @param {Array<{key: string, label: string, align?: 'left'|'right'}>} columns - Columns
 * @param {Array<Object>} rows - Rows
 * @returns {string[]} Markdown lines
 */
export function markdownTable(columns, rows) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const rule = `|${columns.map((column) => (column.align === 'right' ? '---:' : '---')).join('|')}|`;
  const body = rows.map(
    (row) => `| ${columns.map((column) => String(row[column.key] ?? '')).join(' | ')} |`,
  );
  return [header, rule, ...body];
}

/**
 * Serialize a report as JSON with a trailing newline.
 *
 * Property order follows insertion order, which is stable for these models
 * because they are built by literal, so a JSON report diffs cleanly.
 *
 * @param {Object} model - Report model
 * @returns {string} JSON text
 */
export function json(model) {
  return `${JSON.stringify(model, null, 2)}\n`;
}
