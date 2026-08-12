/**
 * `copytree plan` — the exact selection, without reading a single file body.
 *
 * A preview whose answer differs from the run it previews is worse than no
 * preview, so this builds the same selection plan the copy command does, from
 * the same stages, in the same order. The only difference is what happens
 * afterwards: nothing.
 */

import { config as sharedConfig } from '../config/ConfigManager.js';
import { buildSelectionPlan, resolveTarget } from '../selection/selection.js';
import { Feedback, writePayload } from '../cli/io.js';
import { PolicyError } from '../utils/errors.js';
import {
  buildPlanModel,
  renderPlanJson,
  renderPlanNdjson,
  renderPlanText,
} from '../cli/render/plan.js';

/**
 * Run the plan command.
 *
 * @param {Object} request - Canonical request from the CLI parser
 * @param {Object} [context={}] - Execution context
 * @param {Array} [context.notices] - Parse-time notices
 * @returns {Promise<Object>} The plan model
 */
export default async function planCommand(request, context = {}) {
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
  // A plan that lists excluded entries needs every decision, not the largest
  // fifty. Ordinary planning does not pay for that.
  const retention =
    report.explain || report.all
      ? { mode: 'all', maxEntries: cfg.get('copytree.exclusionReport.maxEntries', 100000) }
      : { mode: 'counts' };

  const plan = await buildSelectionPlan({
    root,
    request,
    config: cfg,
    retention,
    onWarning: (message) => feedback.write(message, { level: 'warn' }),
  });

  const model = buildPlanModel(plan, request, { reproducible: report.reproducible });
  if (report.summary) model.entries = [];

  const format = report.format ?? 'text';
  const text =
    format === 'json'
      ? renderPlanJson(model)
      : format === 'ndjson'
        ? renderPlanNdjson(model)
        : renderPlanText(model, {
            summary: report.summary,
            explain: report.explain,
            all: report.all,
          });

  feedback.detail(`Root: ${root}`);
  feedback.detail(`Profile: ${plan.profile.name} (${plan.profile.source ?? 'none found'})`);
  feedback.detail(
    `Planned ${plan.stats.selected} of ${plan.stats.candidates} candidates in ${Date.now() - startedAt}ms`,
  );

  const delivered = await writePayload(text, { output: report.output });
  if (delivered.destination === 'file') {
    feedback.write(`Plan written to ${delivered.path}`);
  }

  if (request.policy.failEmpty && model.summary.selected === 0) {
    throw new PolicyError('No files were selected', '--fail-empty', {
      suggestion: 'Check --scope, --include and ignore rules, or drop --fail-empty',
    });
  }

  if (request.policy.failOnTruncation && model.summary.truncated) {
    throw new PolicyError(
      `${model.summary.truncatedCount} files were dropped by the ${model.summary.truncatedBy} budget`,
      '--fail-on-truncation',
      { suggestion: 'Raise the budget, narrow the selection, or drop --fail-on-truncation' },
    );
  }

  return model;
}
