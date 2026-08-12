/**
 * `copytree ignore context` report rendering.
 *
 * This report exists for one reader: a model about to write a `.copytreeignore`
 * for a project it has never seen. So it shows the candidate tree *before*
 * CopyTree-specific exclusions, names the rules already in force, quantifies
 * what the current ignore file removes, and ends with the exact next commands —
 * and it never contains a byte of file content.
 */

import { formatBytes, formatTokens, json, markdownTable } from './format.js';

/** Schema identifier for the machine-readable ignore context. */
export const IGNORE_CONTEXT_SCHEMA = 'copytree-ignore-context@1';

/** What the candidate baseline does and does not apply, stated in the report. */
export const BASELINE_POLICY = Object.freeze([
  'root containment and hard safety exclusions applied',
  'built-in binary and junk classification applied',
  'global Git ignore applied',
  '.git/info/exclude applied',
  'root and nested .gitignore applied',
  '.copytreeignore NOT applied',
  'folder profile include/exclude NOT applied',
  'CLI excludes and aggregate budgets NOT applied',
  'secret-file exclusions NOT applied',
  'files above the size gate are labelled, not hidden',
]);

/**
 * Build the ignore-context model.
 *
 * @param {Object} params - Inputs
 * @param {string} params.root - Project root
 * @param {Object} params.baseline - Baseline selection plan
 * @param {Object} params.effective - Effective selection plan
 * @param {Object} params.aggregates - Baseline aggregates
 * @param {Array} params.tree - Baseline aggregate tree
 * @param {Object} params.currentIgnore - `{exists, path, valid, ruleCount}`
 * @param {Object} params.reportTruncation - `{truncated, omittedPaths, reason}`
 * @param {Array} [params.paths] - Full path list, when included
 * @returns {Object} `copytree-ignore-context@1` model
 */
export function buildIgnoreContextModel({
  root,
  baseline,
  attributed,
  effective,
  aggregates,
  tree,
  currentIgnore,
  reportTruncation,
  paths,
}) {
  const summarize = (plan) => ({
    files: plan.stats.selected,
    bytes: plan.stats.selectedBytes,
    estimatedTokens: plan.stats.estimatedTokens,
  });

  return {
    schema: IGNORE_CONTEXT_SCHEMA,
    root,
    contentRead: false,
    ignoreSyntax: 'gitignore',
    pathModel: 'POSIX, relative to the project root',
    baselinePolicy: [...BASELINE_POLICY],
    activeRuleSources: baseline.ruleSources,
    currentIgnore,
    baseline: summarize(baseline),
    effective: summarize(effective),
    // Attributed to `.copytreeignore` alone. The gap between this and
    // `effective` is the profile, the CLI excludes and the budgets, which are
    // not the ignore file's doing.
    removedByCurrentIgnore: {
      files: Math.max(0, baseline.stats.selected - (attributed ?? effective).stats.selected),
      bytes: Math.max(
        0,
        baseline.stats.selectedBytes - (attributed ?? effective).stats.selectedBytes,
      ),
    },
    directories: aggregates.directories,
    extensions: aggregates.extensions,
    rootFiles: aggregates.rootFiles,
    tree,
    ...(paths ? { paths } : {}),
    reportTruncation,
    nextCommands: ['copytree ignore check .', 'copytree plan .'],
  };
}

/**
 * Render the ignore context as Markdown.
 * @param {Object} model - Context model
 * @returns {string} Markdown report
 */
export function renderIgnoreContextMarkdown(model) {
  const lines = [
    '# CopyTree ignore-authoring context',
    '',
    `- Schema: \`${model.schema}\``,
    `- Root: \`${model.root}\``,
    '- File contents read: **no**',
    `- Existing \`.copytreeignore\`: ${model.currentIgnore.exists ? 'present' : 'absent'}`,
    '- Ignore syntax: Git ignore syntax; paths are POSIX and root-relative',
    '',
    '## Active baseline rules',
    '',
  ];

  model.baselinePolicy.forEach((entry, index) => lines.push(`${index + 1}. ${entry}`));
  lines.push('');

  lines.push('## Candidate overview', '');
  lines.push(
    ...markdownTable(
      [
        { key: 'path', label: 'Directory' },
        { key: 'files', label: 'Files', align: 'right' },
        { key: 'bytes', label: 'Bytes', align: 'right' },
        { key: 'extensions', label: 'Main extensions' },
        { key: 'hint', label: 'Hints' },
      ],
      model.directories.map((entry) => ({
        path: `\`${entry.path}\``,
        files: entry.files,
        bytes: formatBytes(entry.bytes),
        extensions: entry.mainExtensions
          .map((ext) => `${ext.extension || '(none)'} ${ext.count}`)
          .join(', '),
        hint: entry.hint ?? '',
      })),
    ),
    '',
  );

  if (model.rootFiles.length > 0) {
    lines.push('## Root files', '');
    for (const file of model.rootFiles) {
      const hint = file.hint ? ` — ${file.hint}` : '';
      lines.push(`- \`${file.path}\` (${formatBytes(file.size)})${hint}`);
    }
    lines.push('');
  }

  lines.push('## Candidate tree', '', '```text');
  lines.push(...renderContextTree(model.tree, ''));
  lines.push('```', '');

  if (model.paths) {
    lines.push('## All candidate paths', '', '```text');
    for (const entry of model.paths) {
      lines.push(
        `${entry.path} [${formatBytes(entry.size)}]${entry.overSizeGate ? ' (over size gate)' : ''}`,
      );
    }
    lines.push('```', '');
  }

  lines.push('## Existing `.copytreeignore` effect', '');
  if (model.currentIgnore.exists) {
    lines.push(
      `- Before: ${model.baseline.files} candidate files, ${formatBytes(model.baseline.bytes)} (${formatTokens(model.baseline.estimatedTokens)})`,
      `- After: ${model.effective.files} selected files, ${formatBytes(model.effective.bytes)} (${formatTokens(model.effective.estimatedTokens)})`,
      `- Removed by \`.copytreeignore\`: ${model.removedByCurrentIgnore.files} files, ${formatBytes(model.removedByCurrentIgnore.bytes)}`,
      '',
    );
  } else {
    lines.push(
      `- No \`.copytreeignore\` yet. The baseline above is what a copy would select today: ${model.baseline.files} files, ${formatBytes(model.baseline.bytes)} (${formatTokens(model.baseline.estimatedTokens)}).`,
      '',
    );
  }

  if (model.reportTruncation.truncated) {
    lines.push(
      '## Report truncation',
      '',
      `- ${model.reportTruncation.omittedPaths} paths omitted: ${model.reportTruncation.reason}`,
      '- Run `copytree ignore context . --all-paths` for the complete list.',
      '',
    );
  }

  lines.push('## Next steps', '');
  lines.push(`1. Create or edit \`${model.root}/.copytreeignore\`.`);
  model.nextCommands.forEach((command, index) => lines.push(`${index + 2}. Run \`${command}\`.`));
  lines.push('');

  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * Render the ignore context as plain text.
 * @param {Object} model - Context model
 * @returns {string} Text report
 */
export function renderIgnoreContextText(model) {
  const lines = [
    `CopyTree ignore-authoring context for ${model.root}`,
    `Schema: ${model.schema}`,
    'File contents read: no',
    `Existing .copytreeignore: ${model.currentIgnore.exists ? 'present' : 'absent'}`,
    '',
    'Active baseline rules:',
    ...model.baselinePolicy.map((entry, index) => `  ${index + 1}. ${entry}`),
    '',
    'Candidate directories:',
  ];

  for (const entry of model.directories) {
    const hint = entry.hint ? `  [${entry.hint}]` : '';
    lines.push(`  ${entry.path}  ${entry.files} files, ${formatBytes(entry.bytes)}${hint}`);
  }

  lines.push('', 'Candidate tree:');
  lines.push(...renderContextTree(model.tree, '  '));

  lines.push(
    '',
    `Baseline:  ${model.baseline.files} files, ${formatBytes(model.baseline.bytes)}`,
    `Effective: ${model.effective.files} files, ${formatBytes(model.effective.bytes)}`,
    `Removed:   ${model.removedByCurrentIgnore.files} files, ${formatBytes(model.removedByCurrentIgnore.bytes)}`,
  );

  if (model.reportTruncation.truncated) {
    lines.push(
      '',
      `${model.reportTruncation.omittedPaths} paths omitted: ${model.reportTruncation.reason}`,
      'Run: copytree ignore context . --all-paths',
    );
  }

  lines.push('', 'Next steps:');
  lines.push(`  1. Create or edit ${model.root}/.copytreeignore`);
  model.nextCommands.forEach((command, index) => lines.push(`  ${index + 2}. ${command}`));

  return `${lines.join('\n')}\n`;
}

/**
 * Render the ignore context as JSON.
 * @param {Object} model - Context model
 * @returns {string} JSON text
 */
export function renderIgnoreContextJson(model) {
  return json(model);
}

/**
 * Render aggregate tree nodes for the context report.
 * @param {Array} nodes - Tree nodes
 * @param {string} indent - Current indent
 * @returns {string[]} Lines
 */
function renderContextTree(nodes, indent) {
  const lines = [];
  for (const node of nodes) {
    if (node.isFile) {
      lines.push(`${indent}${node.name} [${formatBytes(node.bytes)}]`);
    } else {
      lines.push(
        `${indent}${node.name}/ [${node.files} file${node.files === 1 ? '' : 's'}, ${formatBytes(node.bytes)}]`,
      );
      lines.push(...renderContextTree(node.children, `${indent}  `));
    }
  }
  return lines;
}
