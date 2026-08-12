/**
 * `copytree explain` — the complete decision trace for named paths.
 *
 * Built on the same selection plan the copy would produce, plus a per-path
 * replay of the ignore stack. Both halves are needed: the plan knows whether a
 * file survived every stage, and only the layer replay can say which rule, in
 * which file, on which line, decided it.
 */

import path from 'path';
import micromatch from 'micromatch';
import { promises as fsp } from 'node:fs';
import { config as sharedConfig } from '../config/ConfigManager.js';
import { buildSelectionPlan, loadSelectionProfile, resolveRoot } from '../selection/selection.js';
import { tracePath } from '../utils/ignoreWalker.js';
import { isHardExcluded } from '../utils/hardExclusions.js';
import { toPosix } from '../utils/pathUtils.js';
import { Feedback, writePayload } from '../cli/io.js';
import {
  buildExplainModel,
  renderExplainJson,
  renderExplainText,
  traceSize,
} from '../cli/render/explain.js';

/**
 * Run the explain command.
 *
 * @param {Object} request - Canonical request, with `entries` on it
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} The explanation model
 */
export default async function explainCommand(request, context = {}) {
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();

  const root = await resolveRoot(request.target, {
    onClone: (url) => feedback.write(`Cloning ${url}`),
  });

  // Every decision, because a path the caller asked about may well be one the
  // ordinary top-fifty ledger would have dropped.
  const plan = await buildSelectionPlan({
    root,
    request,
    config: cfg,
    retention: { mode: 'all', maxEntries: cfg.get('copytree.exclusionReport.maxEntries', 100000) },
  });

  const selectedByPath = new Map(plan.selected.map((file) => [file.path, file]));
  const manifestByPath = new Map(plan.manifest.map((entry) => [entry.path, entry]));
  const excludedByPath = new Map(plan.excluded.map((entry) => [entry.path, entry]));

  const layers = await buildLayerStack({ root, request, config: cfg });

  const traces = [];
  for (const raw of request.entries) {
    traces.push(
      await traceEntry({
        raw,
        root,
        request,
        plan,
        layers,
        selectedByPath,
        manifestByPath,
        excludedByPath,
      }),
    );
  }

  feedback.detail(`Root: ${root}`);
  feedback.detail(`Traced ${traces.length} path${traces.length === 1 ? '' : 's'}`);

  const model = buildExplainModel({ root, traces });
  const text =
    request.report.format === 'json' ? renderExplainJson(model) : renderExplainText(model);

  const delivered = await writePayload(text, { output: request.report.output });
  if (delivered.destination === 'file') {
    feedback.write(`Explanation written to ${delivered.path}`);
  }

  return model;
}

/**
 * Build the same initial and final ignore layers the discovery stage builds.
 *
 * Constructed from the discovery stage itself rather than reimplemented, so the
 * explanation cannot drift from the decision it is explaining.
 *
 * @param {Object} params - Inputs
 * @returns {Promise<{initialLayers: Array, finalLayers: Array}>} Layer stacks
 */
async function buildLayerStack({ root, request, config }) {
  const profile = await loadSelectionProfile(root, request.selection);
  const { default: FileDiscoveryStage } = await import('../pipeline/stages/FileDiscoveryStage.js');

  const stage = new FileDiscoveryStage({
    config,
    basePath: root,
    profileExcludes: profile.exclude,
    excludes: request.selection.excludes,
    // The same discovery settings a run would use. Reconstructing the stage
    // with different ones would produce an explanation of a decision nobody
    // made.
    respectGitignore:
      profile.options.respectGitignore ?? config.get('copytree.respectGitignore', true),
    includeHidden: profile.options.includeHidden ?? config.get('copytree.includeHidden', false),
    followSymlinks: profile.options.followSymlinks ?? config.get('copytree.followSymlinks', false),
    forceInclude: [...request.selection.forceIncludes, ...profile.forceInclude],
  });

  // `.copytreeinclude` is part of the force-include set, and a trace that
  // omitted it would report "no match" for a file the run force-includes.
  await stage.loadCopytreeInclude();

  const initialLayers = await stage.buildInitialLayers({
    options: { tests: request.selection.noTests ? false : true },
  });
  return {
    initialLayers,
    finalLayers: stage.buildFinalLayers(),
    forceIncludes: stage.forceInclude,
  };
}

/**
 * Trace one path from root containment down to the final verdict.
 *
 * @param {Object} params - Inputs
 * @returns {Promise<Object>} Trace entry
 */
async function traceEntry({
  raw,
  root,
  request,
  plan,
  layers,
  selectedByPath,
  manifestByPath,
  excludedByPath,
}) {
  const absolute = path.resolve(root, raw);
  const relative = toPosix(path.relative(root, absolute));
  const steps = [];

  // Segment-aware, like the walker's own containment test: `..` and `../x`
  // escape, but a directory legitimately named `..draft` does not.
  const contained = relative !== '' && relative !== '..' && !relative.startsWith('../');
  steps.push({
    id: 'root-containment',
    label: 'root containment',
    detail: contained ? 'inside the project root' : `outside ${root}`,
    verdict: contained ? 'pass' : 'fail',
  });

  if (!contained) {
    return { path: relative || raw, decision: 'excluded', reason: 'outsideRoot', steps };
  }

  const stat = await fsp.stat(absolute).catch(() => null);
  steps.push({
    id: 'exists',
    label: 'exists on disk',
    detail: stat
      ? stat.isDirectory()
        ? 'yes (directory)'
        : `yes (${traceSize(stat.size)})`
      : 'no',
    verdict: stat ? 'pass' : 'fail',
  });

  const hard = isHardExcluded(relative);
  steps.push({
    id: 'hard-exclusion',
    label: 'hard exclusion',
    detail: hard ? 'inside .git — never overrideable' : 'no match',
    verdict: hard ? 'fail' : 'pass',
  });

  const scopes = plan.scopes.resolved.map((entry) => toPosix(path.relative(root, entry)));
  const inScope =
    scopes.length === 0 ||
    scopes.some(
      (prefix) => prefix === '' || relative === prefix || relative.startsWith(`${prefix}/`),
    );
  steps.push({
    id: 'scope',
    label: 'scope membership',
    detail:
      scopes.length === 0
        ? 'no scope requested; the whole project is in scope'
        : inScope
          ? `within ${scopes.join(', ')}`
          : `outside ${scopes.join(', ')}`,
    verdict: inScope ? 'pass' : 'fail',
  });

  const profileIncludes = plan.profile.include.length > 0 ? plan.profile.include : ['**/*'];
  const profileMatched = micromatch.isMatch(relative, profileIncludes);
  steps.push({
    id: 'profile-include',
    label: 'profile include',
    detail: profileMatched ? `matched ${profileIncludes.join(', ')}` : 'no match',
    verdict: profileMatched ? 'pass' : 'fail',
  });

  const cliIncludes = request.selection.includes;
  const cliIncluded =
    cliIncludes.length === 0 || micromatch.isMatch(relative, cliIncludes, { dot: true });
  steps.push({
    id: 'cli-include',
    label: 'CLI include',
    detail:
      cliIncludes.length === 0
        ? 'no --include given; nothing to narrow'
        : cliIncluded
          ? `matched ${cliIncludes.join(', ')}`
          : `no match against ${cliIncludes.join(', ')}`,
    verdict: cliIncluded ? 'pass' : 'fail',
  });

  const trace = await tracePath(relative, root, {
    ignoreFileNames: ['.gitignore', '.copytreeignore'],
    initialLayers: layers.initialLayers,
    finalLayers: layers.finalLayers,
    isDirectory: Boolean(stat?.isDirectory()),
  });

  if (trace.steps.length === 0) {
    steps.push({
      id: 'ignore-rules',
      label: 'ignore rules',
      detail: 'no rule matched',
      verdict: 'pass',
    });
  } else {
    for (const step of trace.steps) {
      steps.push({
        id: 'ignore-rule',
        label: step.line
          ? `${sourceLabel(step.source, root)}:${step.line}`
          : sourceLabel(step.source, root),
        detail: `matched ${step.rule} -> ${step.verdict}`,
        verdict: step.verdict === 'exclude' ? 'fail' : 'pass',
        kind: step.kind,
        source: step.source,
        line: step.line,
        rule: step.rule,
        reason: step.reason,
      });
    }
  }

  // Includes `.copytreeinclude` and the configured dotfile force-includes, as
  // the run does.
  const forceIncludes = layers.forceIncludes ?? [];
  const forced =
    forceIncludes.length > 0 && micromatch.isMatch(relative, forceIncludes, { dot: true });
  steps.push({
    id: 'force-include',
    label: 'force include',
    detail: forced
      ? `matched ${forceIncludes.join(', ')}`
      : forceIncludes.length === 0
        ? 'no force-include patterns are active'
        : 'no match',
    verdict: forced ? 'pass' : 'neutral',
  });

  const extensions = request.selection.extensions;
  const ext = path.extname(relative).toLowerCase();
  const extMatched = extensions.length === 0 || extensions.includes(ext);
  steps.push({
    id: 'extension',
    label: 'extension filter',
    detail:
      extensions.length === 0
        ? 'no --ext given'
        : extMatched
          ? `${ext} accepted`
          : `${ext || '(none)'} not in ${extensions.join(', ')}`,
    verdict: extMatched ? 'pass' : 'fail',
  });

  const depth = relative.split('/').length - 1;
  const maxDepth = request.selection.maxDepth;
  const withinDepth = maxDepth === null || maxDepth === undefined || depth <= maxDepth;
  steps.push({
    id: 'depth',
    label: 'depth filter',
    detail:
      maxDepth === null || maxDepth === undefined
        ? `depth ${depth}; no --max-depth given`
        : `depth ${depth} vs max ${maxDepth}`,
    verdict: withinDepth ? 'pass' : 'fail',
  });

  const gate = plan.budgets.sizeGate.value;
  if (stat && !stat.isDirectory()) {
    const effective = forced ? plan.budgets.hardFileLimit.value : gate === false ? null : gate;
    steps.push({
      id: 'size-gate',
      label: 'size gate',
      detail:
        effective === null || effective === undefined
          ? `${traceSize(stat.size)} (no gate)`
          : `${traceSize(stat.size)} ${stat.size > effective ? '>' : '<='} ${traceSize(effective)}`,
      verdict: effective && stat.size > effective ? 'fail' : 'pass',
    });
  }

  const selected = selectedByPath.get(relative);
  if (selected) {
    const position = plan.selected.indexOf(selected) + 1;
    steps.push({
      id: 'budget',
      label: 'budget position',
      detail: `${position} of ${plan.selected.length} selected, sorted by ${request.selection.sort} ${request.selection.order}`,
      verdict: 'pass',
    });
    return {
      path: relative,
      decision: 'selected',
      outcome: manifestByPath.get(relative)?.outcome ?? 'included',
      size: selected.size ?? 0,
      forced: Boolean(selected.alwaysInclude),
      steps,
    };
  }

  const excluded = excludedByPath.get(relative);

  if (excluded?.reason === 'fileCountBudget' || excluded?.reason === 'totalSizeBudget') {
    steps.push({
      id: 'budget',
      label: 'budget position',
      detail:
        `dropped by the ${excluded.reason === 'fileCountBudget' ? 'file-count' : 'total-size'} ` +
        `budget after ${plan.selected.length} files, sorted by ${request.selection.sort} ${request.selection.order}`,
      verdict: 'fail',
    });
  }

  return {
    path: relative,
    decision: 'excluded',
    reason: excluded?.reason ?? (stat ? 'notSelected' : 'pathNotFound'),
    ...(excluded?.rule ? { rule: excluded.rule } : {}),
    ...(excluded?.ruleSource ? { ruleSource: excluded.ruleSource } : {}),
    size: excluded?.size ?? stat?.size ?? 0,
    steps,
  };
}

/**
 * Present a rule source relative to the root, so traces stay readable.
 * @param {string|null} source - Rule source
 * @param {string} root - Project root
 * @returns {string} Display label
 */
function sourceLabel(source, root) {
  if (!source) return 'ignore rule';
  if (source.startsWith(root)) return toPosix(path.relative(root, source)) || source;
  return source;
}
