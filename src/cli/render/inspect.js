/**
 * `copytree inspect` report rendering.
 *
 * Inspect answers structural and environmental questions. It is not an export
 * preview and deliberately does not pretend to be one — `plan` owns that, and
 * conflating the two is how a reader ends up trusting the wrong number.
 */

import { formatBytes, formatTokens, json, markdownTable, table } from './format.js';

/** Schema identifier for the machine-readable inspection. */
export const INSPECT_SCHEMA = 'copytree-inspect@1';

/**
 * Build the inspection model.
 *
 * @param {Object} params - Inputs
 * @param {import('../../selection/selection.js').SelectionPlan} params.plan - Effective plan
 * @param {Object} params.aggregates - Directory and extension aggregates
 * @param {Array} params.tree - Aggregate tree nodes
 * @param {string} params.version - CopyTree version
 * @param {Array} [params.configWarnings] - Configuration load warnings
 * @param {boolean} [params.withoutCopytreeignore] - Whether the baseline view was requested
 * @returns {Object} `copytree-inspect@1` model
 */
export function buildInspectModel({
  plan,
  aggregates,
  tree,
  version,
  configWarnings = [],
  withoutCopytreeignore = false,
  paths = null,
}) {
  return {
    schema: INSPECT_SCHEMA,
    root: plan.root,
    copytreeVersion: version,
    contentRead: false,
    withoutCopytreeignore,
    profile: {
      name: plan.profile.name,
      source: plan.profile.source,
      include: plan.profile.include,
      exclude: plan.profile.exclude,
      forceInclude: plan.profile.forceInclude,
      options: plan.profile.options,
    },
    budgets: Object.fromEntries(
      Object.entries(plan.budgets).map(([key, entry]) => [
        key,
        { value: entry.value, source: entry.source },
      ]),
    ),
    ruleSources: plan.ruleSources,
    counts: {
      candidates: plan.stats.candidates,
      selected: plan.stats.selected,
      selectedBytes: plan.stats.selectedBytes,
      excluded: plan.stats.excludedTotal,
      excludedByReason: Object.fromEntries(
        Object.entries(plan.stats.excludedByReason).filter(([, count]) => count > 0),
      ),
      estimatedTokens: plan.stats.estimatedTokens,
    },
    directories: aggregates.directories,
    extensions: aggregates.extensions,
    rootFiles: aggregates.rootFiles,
    ...(paths ? { paths } : {}),
    tree,
    scopes: plan.scopes,
    configWarnings,
  };
}

/**
 * Render an inspection as text.
 *
 * @param {Object} model - Inspection model
 * @param {Object} [options={}] - Rendering options
 * @param {string} [options.view='summary'] - Which view to render
 * @param {boolean} [options.allPaths=false] - List every candidate path
 * @returns {string} Report text
 */
export function renderInspectText(model, options = {}) {
  const view = options.view ?? 'summary';
  const want = (name) => view === 'all' || view === name;
  const lines = [];

  if (want('summary')) {
    lines.push(
      `CopyTree ${model.copytreeVersion} — inspection of ${model.root}`,
      `Profile: ${model.profile.name}${model.profile.source ? ` (${model.profile.source})` : ' (none found)'}`,
      `Selected: ${model.counts.selected} of ${model.counts.candidates} candidates, ` +
        `${formatBytes(model.counts.selectedBytes)}, ${formatTokens(model.counts.estimatedTokens)}`,
      `Excluded: ${model.counts.excluded}`,
      'File contents read: no',
      '',
    );
  }

  if (want('tree')) {
    lines.push('Tree:');
    lines.push(...renderTreeLines(model.tree, ''));
    lines.push('');
  }

  if (want('extensions')) {
    lines.push('Extensions:');
    lines.push(
      ...table(
        [
          { key: 'extension', label: 'Extension' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
        ],
        model.extensions.map((entry) => ({
          extension: entry.extension || '(none)',
          files: String(entry.files),
          bytes: formatBytes(entry.bytes),
        })),
        { indent: '  ' },
      ),
      '',
    );
  }

  if (want('rules')) {
    lines.push('Active rule sources, in evaluation order:');
    model.ruleSources.forEach((source, index) => {
      const count = source.ruleCount === null ? '' : ` — ${source.ruleCount} rules`;
      lines.push(`  ${index + 1}. [${source.position}] ${source.kind}: ${source.source}${count}`);
    });
    lines.push('');
  }

  if (want('profile')) {
    lines.push('Effective profile:');
    lines.push(`  name      ${model.profile.name}`);
    lines.push(`  source    ${model.profile.source ?? '(none — packaged defaults)'}`);
    lines.push(`  include   ${model.profile.include.join(', ') || '**/*'}`);
    lines.push(`  exclude   ${model.profile.exclude.join(', ') || '(none)'}`);
    lines.push(`  force     ${model.profile.forceInclude.join(', ') || '(none)'}`);
    lines.push('');
  }

  if (want('budgets')) {
    lines.push('Effective budgets:');
    lines.push(
      ...table(
        [
          { key: 'budget', label: 'Budget' },
          { key: 'value', label: 'Value', align: 'right' },
          { key: 'source', label: 'Source' },
        ],
        Object.entries(model.budgets).map(([key, entry]) => ({
          budget: key,
          value: describeBudgetValue(key, entry.value),
          source: entry.source,
        })),
        { indent: '  ' },
      ),
      '',
    );
  }

  if (view === 'summary' || view === 'all') {
    lines.push('Directories:');
    lines.push(
      ...table(
        [
          { key: 'path', label: 'Directory' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
          { key: 'hint', label: 'Hint' },
        ],
        model.directories.map((entry) => ({
          path: entry.path,
          files: String(entry.files),
          bytes: formatBytes(entry.bytes),
          hint: entry.hint ?? '',
        })),
        { indent: '  ' },
      ),
      '',
    );
  }

  if (options.allPaths) {
    lines.push('All candidate paths:');
    for (const entry of model.paths ?? []) {
      lines.push(`  ${entry.path} (${formatBytes(entry.size)})`);
    }
    lines.push('');
  }

  if (model.configWarnings.length > 0) {
    lines.push('Configuration warnings:');
    for (const warning of model.configWarnings) lines.push(`  ${warning}`);
    lines.push('');
  }

  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * Render an inspection as Markdown.
 * @param {Object} model - Inspection model
 * @param {Object} [options={}] - Rendering options
 * @returns {string} Markdown report
 */
export function renderInspectMarkdown(model, options = {}) {
  const view = options.view ?? 'summary';
  const want = (name) => view === 'all' || view === name;
  const lines = [
    `# CopyTree inspection — ${model.root}`,
    '',
    `- Schema: \`${model.schema}\``,
    `- CopyTree: ${model.copytreeVersion}`,
    `- Profile: ${model.profile.name}${model.profile.source ? ` (\`${model.profile.source}\`)` : ''}`,
    `- Selected: ${model.counts.selected} of ${model.counts.candidates} candidates`,
    '- File contents read: **no**',
    '',
  ];

  if (view === 'summary' || view === 'all') {
    lines.push('## Directories', '');
    lines.push(
      ...markdownTable(
        [
          { key: 'path', label: 'Directory' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
          { key: 'hint', label: 'Hint' },
        ],
        model.directories.map((entry) => ({
          path: `\`${entry.path}\``,
          files: entry.files,
          bytes: formatBytes(entry.bytes),
          hint: entry.hint ?? '',
        })),
      ),
      '',
    );
  }

  if (want('extensions')) {
    lines.push('## Extensions', '');
    lines.push(
      ...markdownTable(
        [
          { key: 'extension', label: 'Extension' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
        ],
        model.extensions.map((entry) => ({
          extension: `\`${entry.extension || '(none)'}\``,
          files: entry.files,
          bytes: formatBytes(entry.bytes),
        })),
      ),
      '',
    );
  }

  if (want('rules')) {
    lines.push('## Active rule sources', '');
    model.ruleSources.forEach((source, index) => {
      lines.push(`${index + 1}. \`${source.source}\` (${source.kind}, ${source.position})`);
    });
    lines.push('');
  }

  if (want('profile')) {
    lines.push('## Effective profile', '');
    lines.push(`- Name: ${model.profile.name}`);
    lines.push(`- Source: ${model.profile.source ? `\`${model.profile.source}\`` : 'none'}`);
    lines.push(`- Include: ${formatPatterns(model.profile.include, '**/*')}`);
    lines.push(`- Exclude: ${formatPatterns(model.profile.exclude, 'none')}`);
    lines.push(`- Force include: ${formatPatterns(model.profile.forceInclude, 'none')}`);
    lines.push('');
  }

  if (want('budgets')) {
    lines.push('## Effective budgets', '');
    lines.push(
      ...markdownTable(
        [
          { key: 'budget', label: 'Budget' },
          { key: 'value', label: 'Value', align: 'right' },
          { key: 'source', label: 'Source' },
        ],
        Object.entries(model.budgets).map(([key, entry]) => ({
          budget: `\`${key}\``,
          value: describeBudgetValue(key, entry.value),
          source: entry.source,
        })),
      ),
      '',
    );
  }

  if (want('tree')) {
    lines.push('## Tree', '', '```text', ...renderTreeLines(model.tree, ''), '```', '');
  }

  if (options.allPaths && model.paths) {
    lines.push('## All candidate paths', '', '```text');
    for (const entry of model.paths) {
      lines.push(`${entry.path} [${formatBytes(entry.size)}]`);
    }
    lines.push('```', '');
  }

  while (lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/**
 * Render an inspection as JSON.
 * @param {Object} model - Inspection model
 * @returns {string} JSON text
 */
export function renderInspectJson(model) {
  return json(model);
}

/**
 * Render aggregate tree nodes as indented text.
 * @param {Array} nodes - Tree nodes
 * @param {string} indent - Current indent
 * @returns {string[]} Lines
 */
export function renderTreeLines(nodes, indent) {
  const lines = [];
  for (const node of nodes) {
    if (node.isFile) {
      lines.push(`${indent}${node.name} [${formatBytes(node.bytes)}]`);
    } else {
      lines.push(
        `${indent}${node.name}/ [${node.files} file${node.files === 1 ? '' : 's'}, ${formatBytes(node.bytes)}]`,
      );
      lines.push(...renderTreeLines(node.children, `${indent}  `));
    }
  }
  return lines;
}

/**
 * Render a pattern list, or say plainly that there is none.
 * @param {string[]} patterns - Patterns
 * @param {string} fallback - What to say when the list is empty
 * @returns {string} Rendered list
 */
function formatPatterns(patterns, fallback) {
  if (!patterns || patterns.length === 0) return fallback;
  return patterns.map((pattern) => `\`${pattern}\``).join(', ');
}

/**
 * Present a budget value in the unit it is expressed in.
 * @param {string} key - Budget name
 * @param {number|false|null} value - Raw value
 * @returns {string} Rendered value
 */
function describeBudgetValue(key, value) {
  if (value === null || value === undefined) return 'unlimited';
  if (value === false) return 'disabled';
  if (key === 'maxFiles') return `${value} files`;
  if (key === 'maxChars') return `${value} chars`;
  return formatBytes(value);
}
