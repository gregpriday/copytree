/**
 * `copytree ignore context|check|init` — the ignore-authoring workflow.
 *
 * Three commands that compose into one loop: build the context, write the file,
 * validate it, then confirm with `plan`. The loop is the point. Authoring a
 * `.copytreeignore` used to mean combining debugging flags and inferring the
 * candidate tree from what came out the other end.
 *
 * All three are read-only except `ignore init --write`, which is the only
 * command in CopyTree that creates a file in the project.
 */

import path from 'path';
import fs from '../utils/fsx.js';
import { promises as fsp } from 'node:fs';
import { config as sharedConfig } from '../config/ConfigManager.js';
import { buildSelectionPlan, resolveTarget } from '../selection/selection.js';
import { aggregate, buildAggregateTree } from '../selection/aggregate.js';
import { analyseIgnoreFile, readIgnoreFile } from '../selection/ignoreCheck.js';
import { Feedback, writePayload } from '../cli/io.js';
import { PolicyError, ValidationError, ERROR_CODES } from '../utils/errors.js';
import { writeReferenceFile } from '../utils/outputDestination.js';
import {
  buildIgnoreContextModel,
  renderIgnoreContextJson,
  renderIgnoreContextMarkdown,
  renderIgnoreContextText,
} from '../cli/render/ignoreContext.js';
import {
  buildIgnoreCheckModel,
  renderIgnoreCheckJson,
  renderIgnoreCheckText,
} from '../cli/render/ignoreCheck.js';

/**
 * Above this many candidates the report switches to aggregates and says so.
 *
 * Chosen so an ordinary repository lists every path — which is what makes the
 * report useful — while a monorepo degrades to something an agent can still
 * read, with an exact command for the rest.
 */
const PATH_LIST_LIMIT = 2000;

/** The hard ceiling `--all-paths` is still bounded by. */
const ALL_PATHS_LIMIT = 50000;

/**
 * Run an `ignore` subcommand.
 *
 * @param {Object} request - Canonical request
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} The command's model
 */
export default async function ignoreCommand(request, context = {}) {
  switch (request.operation) {
    case 'ignore-context':
      return ignoreContext(request, context);
    case 'ignore-check':
      return ignoreCheck(request, context);
    case 'ignore-init':
      return ignoreInit(request, context);
    default:
      throw new ValidationError(
        `Unknown ignore operation: ${request.operation}`,
        'operation',
        request.operation,
        {
          code: ERROR_CODES.INVALID_OPTION,
        },
      );
  }
}

/**
 * Build the three plans an ignore report needs.
 *
 * - `baseline`: the candidate set before anything CopyTree-specific.
 * - `attributed`: the baseline plus `.copytreeignore`, and nothing else. This
 *   is what "removed by `.copytreeignore`" must be measured against; comparing
 *   the baseline with the full effective run credited the ignore file with
 *   every removal a profile, a CLI exclude or a budget had made, so a rule
 *   could be reported as removing files it never matched.
 * - `effective`: what a copy would actually select today.
 *
 * @param {string} root - Project root
 * @param {Object} request - Canonical request
 * @param {Object} config - Configuration manager
 * @returns {Promise<{baseline: Object, attributed: Object, effective: Object}>} All three
 */
async function buildBaselineAndEffective(root, request, config, onWarning) {
  // The baseline deliberately drops everything CopyTree-specific: no
  // `.copytreeignore`, no profile, no CLI excludes, no aggregate budgets. What
  // is left is exactly the set of areas an author might want to exclude.
  const baselineRequest = {
    ...request,
    selection: {
      ...request.selection,
      profileDisabled: true,
      profileName: null,
      includes: [],
      excludes: [],
      extensions: [],
      git: null,
      gitStatus: false,
      noTests: false,
    },
    budgets: { sizeGate: false, maxTotalSize: null, maxFiles: null, maxChars: null },
  };

  // The secrets policy is off for both candidate views. It is not one of the
  // baseline rules section 12.1.3 lists, and its scan-size ceiling would hide
  // exactly the large files an author most needs to see before writing an
  // ignore rule. `effective` keeps it, so its removals show up under
  // "removed by everything else" rather than being credited to a rule.
  const baseline = await buildSelectionPlan({
    root,
    request: baselineRequest,
    config,
    retention: { mode: 'counts' },
    skipCopytreeIgnore: true,
    secretsPolicy: 'off',
    onWarning,
  });

  // The baseline again, with `.copytreeignore` and nothing else. The difference
  // between the two is attributable to the ignore file, which is the whole
  // question the report is answering.
  const attributed = await buildSelectionPlan({
    root,
    request: baselineRequest,
    config,
    retention: { mode: 'counts' },
    secretsPolicy: 'off',
  });

  // The only one of the three plans that loads the project's profile, so it is
  // the one that can report a profile the loader had to reject.
  const effective = await buildSelectionPlan({
    root,
    request,
    config,
    retention: { mode: 'counts' },
    onWarning,
  });

  return { baseline, attributed, effective };
}

/**
 * `copytree ignore context`.
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Context model
 */
async function ignoreContext(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();
  const resolved = await resolveTarget(request, {
    onClone: (url) => feedback.write(`Cloning ${url}`),
  });
  const root = resolved.root;
  request = resolved.request;

  const { baseline, attributed, effective } = await buildBaselineAndEffective(
    root,
    request,
    cfg,
    (message) => feedback.write(message, { level: 'warn' }),
  );

  const report = request.report;
  const aggregates = aggregate(baseline.selected, {
    depth: 1,
    hints: report.hints !== false,
  });
  const tree = buildAggregateTree(baseline.selected, { depth: report.depth ?? 4 });

  const sizeGate = effective.budgets.sizeGate.value;
  const limit = report.allPaths ? ALL_PATHS_LIMIT : PATH_LIST_LIMIT;
  const includePaths = baseline.selected.length <= limit;
  const paths = includePaths
    ? baseline.selected.map((file) => ({
        path: file.path,
        size: file.size || 0,
        ...(typeof sizeGate === 'number' && file.size > sizeGate ? { overSizeGate: true } : {}),
      }))
    : undefined;

  const ignorePath = path.join(root, '.copytreeignore');
  const parsed = await readIgnoreFile(ignorePath).catch(() => ({
    exists: true,
    rules: [],
    warnings: [],
  }));

  const model = buildIgnoreContextModel({
    root,
    baseline,
    attributed,
    effective,
    aggregates,
    tree,
    currentIgnore: {
      exists: parsed.exists,
      path: ignorePath,
      valid: parsed.exists ? parsed.warnings.length === 0 : null,
      ruleCount: parsed.rules.length,
    },
    reportTruncation: {
      truncated: !includePaths,
      omittedPaths: includePaths ? 0 : baseline.selected.length,
      ...(includePaths
        ? {}
        : {
            reason: `candidate count ${baseline.selected.length} exceeds the ${limit}-path report limit`,
          }),
    },
    paths,
  });

  if (report.includeCurrentRules && parsed.exists) {
    model.currentIgnoreRules = parsed.rules.map((rule) => ({
      line: rule.line,
      pattern: rule.pattern,
      negation: rule.negation,
    }));
  }

  feedback.detail(`Root: ${root}`);
  feedback.detail(
    `Baseline ${baseline.stats.selected} candidates, effective ${effective.stats.selected} selected`,
  );

  const format = report.format ?? 'markdown';
  const text =
    format === 'json'
      ? renderIgnoreContextJson(model)
      : format === 'text'
        ? renderIgnoreContextText(model)
        : renderIgnoreContextMarkdown(model);

  if (report.reference) {
    const file = await writeReferenceFile(text, root, format === 'json' ? 'json' : 'markdown');
    const { default: clipboard } = await import('../utils/clipboard.js');
    try {
      await clipboard.copyFileReference(file);
      feedback.write(`Ignore context written to ${file} and copied as a file reference`);
    } catch (error) {
      feedback.write(
        `Ignore context written to ${file} (clipboard unavailable: ${error.message})`,
        {
          level: 'warn',
        },
      );
    }
    return model;
  }

  const delivered = await writePayload(text, { output: report.output });
  if (delivered.destination === 'file') {
    feedback.write(`Ignore context written to ${delivered.path}`);
  }

  return model;
}

/**
 * `copytree ignore check`.
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Check model
 */
async function ignoreCheck(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();
  const resolved = await resolveTarget(request, {
    onClone: (url) => feedback.write(`Cloning ${url}`),
  });
  const root = resolved.root;
  request = resolved.request;

  const ignorePath = path.join(root, '.copytreeignore');
  const parsed = await readIgnoreFile(ignorePath);
  const { baseline, attributed, effective } = await buildBaselineAndEffective(
    root,
    request,
    cfg,
    (message) => feedback.write(message, { level: 'warn' }),
  );

  const analysis = analyseIgnoreFile({
    root,
    ignorePath,
    file: parsed,
    baseline,
    // Rule-by-rule attribution is measured against the ignore-file-only plan;
    // budgets, profiles and CLI excludes are reported separately rather than
    // credited to a rule that did not cause them.
    attributed,
    effective,
    focusRule: request.report.rule ?? null,
    onDisk: await listRootRelativePaths(root),
  });

  const model = buildIgnoreCheckModel({
    analysis,
    baseline,
    attributed,
    effective,
    exists: parsed.exists,
    ruleCount: parsed.rules.length,
  });

  feedback.detail(`Root: ${root}`);
  feedback.detail(`Checked ${parsed.rules.length} rule${parsed.rules.length === 1 ? '' : 's'}`);

  const showRemoved = request.report.showRemoved === true;
  const showKept = request.report.showKept === true;
  const text =
    request.report.format === 'json'
      ? renderIgnoreCheckJson(model, { showRemoved, showKept })
      : renderIgnoreCheckText(model, { showRemoved, showKept });

  const delivered = await writePayload(text, { output: request.report.output });
  if (delivered.destination === 'file') {
    feedback.write(`Check written to ${delivered.path}`);
  }

  if (!model.valid) {
    throw new PolicyError('.copytreeignore has errors', 'ignore check', {
      suggestion: 'Fix the lines reported above, then run copytree ignore check again',
    });
  }

  if (request.policy.strict && model.warnings.length > 0) {
    throw new PolicyError(
      `${model.warnings.length} ignore warning${model.warnings.length === 1 ? '' : 's'} under --strict`,
      '--strict',
      { suggestion: 'Address the warnings, or drop --strict' },
    );
  }

  return model;
}

/**
 * Every path under the root, ignoring CopyTree's own rules entirely.
 *
 * Used to tell "this rule is a typo" from "this rule is redundant because Git
 * already excluded it" — two warnings with opposite fixes, and no way to tell
 * them apart from the candidate set alone, because the candidate set is
 * precisely what Git has already filtered.
 *
 * Bounded, because a rule-redundancy hint is not worth walking `node_modules`.
 *
 * @param {string} root - Project root
 * @returns {Promise<string[]>} Root-relative POSIX paths
 */
async function listRootRelativePaths(root) {
  const { default: fastGlob } = await import('fast-glob');
  return fastGlob('**/*', {
    cwd: root,
    dot: true,
    onlyFiles: false,
    markDirectories: true,
    followSymbolicLinks: false,
    suppressErrors: true,
    ignore: ['.git/**', 'node_modules/**'],
    deep: 8,
  });
}

/** The conservative `source` template, filtered to areas that actually exist. */
const SOURCE_TEMPLATE_SECTIONS = [
  { title: 'Documentation and project notes', entries: ['docs/', 'documentation/', 'website/'] },
  { title: 'Tests and fixtures', entries: ['test/', 'tests/', '__tests__/', 'spec/'] },
  { title: 'Examples, demos and benchmarks', entries: ['examples/', 'demo/', 'benchmarks/'] },
  { title: 'Coverage and generated reports', entries: ['coverage/', 'reports/'] },
];

/**
 * `copytree ignore init`.
 *
 * Prints by default. Writing is `--write`, replacing is `--write --force`, and
 * both say what changed afterwards — because a command that silently rewrites
 * the file governing what an agent sees is not one anybody should have to run
 * twice to understand.
 *
 * @param {Object} request - Canonical request
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Result summary
 */
async function ignoreInit(request, context) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();
  const root = (await resolveTarget(request)).root;
  const ignorePath = path.join(root, '.copytreeignore');

  const report = request.report;
  const annotated = (report.format ?? 'annotated') === 'annotated';

  let content;
  if (report.template === 'source') {
    const present = new Set(
      (await fsp.readdir(root, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${entry.name}/`),
    );

    const lines = [];
    if (annotated) {
      lines.push(
        '# .copytreeignore — Git ignore syntax, evaluated after .gitignore',
        '# Only conventional areas that exist in this project are listed.',
        '# Validate with: copytree ignore check .',
        '',
      );
    }
    for (const section of SOURCE_TEMPLATE_SECTIONS) {
      const existing = section.entries.filter((entry) => present.has(entry));
      if (existing.length === 0) continue;
      if (annotated) lines.push(`# ${section.title}`);
      lines.push(...existing, '');
    }
    if (lines.length === 0) {
      lines.push('# No conventional non-source areas were found in this project.', '');
    }
    content = lines.join('\n');
  } else {
    content = annotated
      ? [
          '# .copytreeignore — Git ignore syntax, evaluated after .gitignore',
          '# Paths are POSIX and relative to this file.',
          '#',
          '# Build the inventory:  copytree ignore context .',
          '# Validate these rules: copytree ignore check .',
          '# Preview the export:   copytree plan .',
          '',
        ].join('\n')
      : '';
  }

  if (!report.write) {
    process.stdout.write(content.endsWith('\n') ? content : `${content}\n`);
    feedback.write(`Nothing written. Add --write to create ${ignorePath}`);
    return { written: false, path: ignorePath, content };
  }

  if ((await fs.pathExists(ignorePath)) && !report.force) {
    throw new ValidationError(`${ignorePath} already exists`, 'ignore-init', ignorePath, {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Add --force to replace it, or edit the existing file',
    });
  }

  await fs.writeFile(ignorePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  feedback.write(`Wrote ${ignorePath}`);

  // Validate what was just written, and say what it does. A starter file that
  // silently removes source is exactly the failure this command should catch.
  const parsed = await readIgnoreFile(ignorePath);
  const { baseline, attributed, effective } = await buildBaselineAndEffective(
    root,
    request,
    cfg,
    (message) => feedback.write(message, { level: 'warn' }),
  );
  const analysis = analyseIgnoreFile({
    root,
    ignorePath,
    file: parsed,
    baseline,
    attributed,
    effective,
    onDisk: await listRootRelativePaths(root),
  });
  const model = buildIgnoreCheckModel({
    analysis,
    baseline,
    attributed,
    effective,
    exists: true,
    ruleCount: parsed.rules.length,
  });

  process.stdout.write(renderIgnoreCheckText(model));
  return { written: true, path: ignorePath, check: model };
}
