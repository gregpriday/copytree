/**
 * `copytree inspect` — understand a project and the CopyTree environment.
 *
 * Reads no ordinary file contents. Configuration, profile and ignore files are
 * read because their contents are the subject of the inspection, which is a
 * different thing from reading the project's source.
 */

import { config as sharedConfig } from '../config/ConfigManager.js';
import { buildSelectionPlan, resolveTarget } from '../selection/selection.js';
import { aggregate, buildAggregateTree } from '../selection/aggregate.js';
import { Feedback, writePayload } from '../cli/io.js';
import { VERSION } from '../version.js';
import {
  buildInspectModel,
  renderInspectJson,
  renderInspectMarkdown,
  renderInspectText,
} from '../cli/render/inspect.js';

/**
 * Run the inspect command.
 *
 * @param {Object} request - Canonical request
 * @param {Object} [context={}] - Execution context
 * @returns {Promise<Object>} The inspection model
 */
export default async function inspectCommand(request, context = {}) {
  const startedAt = Date.now();
  const feedback = new Feedback({ feedback: request.feedback });
  feedback.notices(context.notices);

  const cfg = sharedConfig();
  await cfg.loadConfiguration();

  const resolved = await resolveTarget(request, {
    onClone: (url) => feedback.write(`Cloning ${url}`),
  });
  const root = resolved.root;
  request = resolved.request;

  const report = request.report;
  const plan = await buildSelectionPlan({
    root,
    request,
    config: cfg,
    onWarning: (message) => feedback.write(message, { level: 'warn' }),
    retention: { mode: 'counts' },
    skipCopytreeIgnore: report.withoutCopytreeignore === true,
  });

  const aggregates = aggregate(plan.selected, { depth: 1 });
  const tree = buildAggregateTree(plan.selected, { depth: report.depth ?? 4 });

  const model = buildInspectModel({
    plan,
    aggregates,
    tree,
    paths: report.allPaths
      ? plan.selected.map((file) => ({ path: file.path, size: file.size || 0 }))
      : null,
    version: VERSION,
    configWarnings: (cfg.getLoadErrors?.() ?? []).map(
      (entry) => `${entry.scope}: ${entry.message ?? entry.error}`,
    ),
    withoutCopytreeignore: report.withoutCopytreeignore === true,
  });

  const format = report.format ?? 'text';
  const text =
    format === 'json'
      ? renderInspectJson(model)
      : format === 'markdown'
        ? renderInspectMarkdown(model, { view: report.view, allPaths: report.allPaths })
        : renderInspectText(model, { view: report.view, allPaths: report.allPaths });

  feedback.detail(`Root: ${root}`);
  feedback.detail(`Profile: ${plan.profile.name} (${plan.profile.source ?? 'none found'})`);
  feedback.detail(
    `Inspected ${plan.stats.selected} files in ${Date.now() - startedAt}ms, contents unread`,
  );

  const delivered = await writePayload(text, { output: report.output });
  if (delivered.destination === 'file') {
    feedback.write(`Inspection written to ${delivered.path}`);
  }

  return model;
}
