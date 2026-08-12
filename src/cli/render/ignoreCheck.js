/**
 * `copytree ignore check` report rendering.
 *
 * The report leads with the verdict, then the before/after, then where the
 * removals landed, then the warnings. That order matters: someone who has just
 * written an ignore file wants to know whether they took too much before they
 * want to know which line was redundant.
 */

import { formatBytes, formatTokens, json, table } from './format.js';

/** Schema identifier for the machine-readable check. */
export const IGNORE_CHECK_SCHEMA = 'copytree-ignore-check@1';

/**
 * Build the ignore-check model.
 *
 * @param {Object} params - Inputs
 * @param {Object} params.analysis - Result from `analyseIgnoreFile`
 * @param {Object} params.baseline - Baseline plan
 * @param {Object} params.effective - Effective plan
 * @param {boolean} params.exists - Whether an ignore file was found
 * @param {number} params.ruleCount - Rules parsed
 * @returns {Object} `copytree-ignore-check@1` model
 */
export function buildIgnoreCheckModel({
  analysis,
  baseline,
  attributed,
  effective,
  exists,
  ruleCount,
}) {
  return {
    schema: IGNORE_CHECK_SCHEMA,
    root: analysis.root,
    ignorePath: analysis.ignorePath,
    exists,
    valid: analysis.valid,
    ruleCount,
    before: {
      files: baseline.stats.selected,
      bytes: baseline.stats.selectedBytes,
      estimatedTokens: baseline.stats.estimatedTokens,
    },
    // "After" is the ignore file's own effect. What the profile, the CLI
    // excludes and the budgets then remove is reported separately, because
    // crediting it to a rule that never matched is how someone deletes the
    // wrong line trying to get a file back.
    after: {
      files: (attributed ?? effective).stats.selected,
      bytes: (attributed ?? effective).stats.selectedBytes,
      estimatedTokens: (attributed ?? effective).stats.estimatedTokens,
    },
    effective: {
      files: effective.stats.selected,
      bytes: effective.stats.selectedBytes,
      estimatedTokens: effective.stats.estimatedTokens,
    },
    removedByOthers: {
      files: (analysis.removedByOthers ?? []).length,
      bytes: (analysis.removedByOthers ?? []).reduce((total, entry) => total + entry.size, 0),
    },
    removed: {
      files: analysis.removed.length,
      bytes: analysis.removed.reduce((total, entry) => total + entry.size, 0),
    },
    removedByArea: analysis.removedByArea,
    perRule: analysis.perRule,
    errors: analysis.errors,
    warnings: analysis.warnings,
    removedPaths: analysis.removed.map((entry) => ({ path: entry.path, size: entry.size })),
    keptPaths: analysis.kept.map((entry) => ({ path: entry.path, size: entry.size })),
    nextCommands: ['copytree plan .'],
  };
}

/**
 * Render the check as text.
 *
 * @param {Object} model - Check model
 * @param {Object} [options={}] - Rendering options
 * @param {boolean} [options.showRemoved=false] - List every removed path
 * @param {boolean} [options.showKept=false] - List every retained path
 * @returns {string} Report text
 */
export function renderIgnoreCheckText(model, options = {}) {
  const lines = [];

  if (!model.exists) {
    lines.push(
      `No .copytreeignore in ${model.root}`,
      `A copy would select ${model.after.files} files, ${formatBytes(model.after.bytes)} (${formatTokens(model.after.estimatedTokens)}).`,
      '',
      'Next: copytree ignore init . --template source',
    );
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    model.valid
      ? `.copytreeignore is valid (${model.ruleCount} rule${model.ruleCount === 1 ? '' : 's'})`
      : '.copytreeignore has errors',
    '',
    `Before .copytreeignore: ${model.before.files} files, ${formatBytes(model.before.bytes)}, ${formatTokens(model.before.estimatedTokens)}`,
    `After .copytreeignore:  ${model.after.files} files, ${formatBytes(model.after.bytes)}, ${formatTokens(model.after.estimatedTokens)}`,
    `Removed:                ${model.removed.files} file${model.removed.files === 1 ? '' : 's'}, ${formatBytes(model.removed.bytes)}`,
    '',
  );

  if (model.removedByOthers.files > 0) {
    lines.push(
      `A profile, --exclude, the secret policy or a budget removes a further ${model.removedByOthers.files} ` +
        `file${model.removedByOthers.files === 1 ? '' : 's'} ` +
        `(${formatBytes(model.removedByOthers.bytes)}), leaving ${model.effective.files} selected.`,
      '',
    );
  }

  if (model.removedByArea.length > 0) {
    lines.push('Removed by top-level area:');
    lines.push(
      ...table(
        [
          { key: 'area', label: 'Area' },
          { key: 'files', label: 'Files', align: 'right' },
          { key: 'bytes', label: 'Bytes', align: 'right' },
        ],
        model.removedByArea.map((entry) => ({
          area: entry.area,
          files: String(entry.files),
          bytes: formatBytes(entry.bytes),
        })),
        { indent: '  ' },
      ),
      '',
    );
  }

  if (model.errors.length > 0) {
    lines.push('Errors:');
    for (const error of model.errors) {
      lines.push(`  ${error.line ? `line ${error.line}: ` : ''}${error.message} [${error.code}]`);
    }
    lines.push('');
  }

  if (model.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of model.warnings) {
      lines.push(
        `  ${warning.line ? `line ${warning.line}: ` : ''}${warning.message} [${warning.code}]`,
      );
    }
    lines.push('');
  }

  if (options.showRemoved && model.removedPaths.length > 0) {
    lines.push('Removed paths:');
    for (const entry of model.removedPaths) {
      lines.push(`  ${entry.path} (${formatBytes(entry.size)})`);
    }
    lines.push('');
  }

  if (options.showKept && model.keptPaths.length > 0) {
    lines.push('Kept paths:');
    for (const entry of model.keptPaths) {
      lines.push(`  ${entry.path} (${formatBytes(entry.size)})`);
    }
    lines.push('');
  }

  lines.push(`Next: ${model.nextCommands.join(', then ')}`);
  return `${lines.join('\n')}\n`;
}

/**
 * Render the check as JSON.
 * @param {Object} model - Check model
 * @param {Object} [options={}] - Rendering options
 * @returns {string} JSON text
 */
export function renderIgnoreCheckJson(model, options = {}) {
  const payload = { ...model };
  if (!options.showRemoved) delete payload.removedPaths;
  if (!options.showKept) delete payload.keptPaths;
  return json(payload);
}
