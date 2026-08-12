/**
 * Run a copy, then say what happened.
 *
 * This is the only implementation of "copy this directory", and it selects
 * files through the same engine `plan`, `inspect`, `explain` and `ignore check`
 * use. A preview that predicts something the copy does not do is worse than no
 * preview, and the only way to guarantee it cannot happen is to have one
 * selection path.
 *
 * The shape is: build the selection stages, append the content stages, run the
 * pipeline, deliver the output, build one structured model of what happened,
 * hand it to one reporter. The reporter decides how a terminal, a log file or a
 * JSON consumer should see it.
 */

import path from 'path';
import Pipeline from '../pipeline/Pipeline.js';
import { logger } from '../utils/logger.js';
import {
  CommandError,
  CopyTreeError,
  ERROR_CODES,
  PolicyError,
  ValidationError,
  describeError,
  isAbortError,
} from '../utils/errors.js';
import { config as sharedConfig } from '../config/ConfigManager.js';
import { describeDestination, writeReferenceFile } from '../utils/outputDestination.js';
import { createReporter } from '../ui/feedback/Reporter.js';
import { PHASES, plural } from '../ui/feedback/messages.js';
import {
  buildCancelledModel,
  buildCompletionModel,
  buildEmptyModel,
  buildFailureModel,
  buildNotices,
  buildSelectionSummary,
  classifyWarnings,
} from '../ui/feedback/model.js';
import ProgressTracker from '../utils/ProgressTracker.js';
import fs from '../utils/fsx.js';
import { summarize as getFsErrorSummary, reset as resetFsErrors } from '../utils/fsErrorReport.js';
import { buildEstimates } from '../utils/estimate.js';
import {
  buildSelectionStages,
  loadSelectionProfile,
  resolveBudgets,
  resolveTarget,
} from '../selection/selection.js';
import { FORMATS } from '../cli/schema.js';
import { VERSION } from '../version.js';

const pkg = { version: VERSION };

/**
 * How a `--binary` policy maps onto the configured binary action.
 *
 * `default` is absent on purpose: it means "leave the configuration alone",
 * which is a different statement from any particular action.
 */
const BINARY_ACTIONS = Object.freeze({
  omit: 'skip',
  comment: 'comment',
  placeholder: 'placeholder',
  base64: 'base64',
  // `convert` runs the registered document converters and falls back to a
  // placeholder for the media they cannot read — it does not base64 arbitrary
  // binaries. The converting half is the `forceTransform` flag below; this is
  // only what happens to what is left.
  convert: 'placeholder',
});

/**
 * Run a copy.
 *
 * @param {Object} request - Canonical request from the CLI parser or an embedder
 * @param {Object} [context={}] - Execution context
 * @param {Array} [context.notices] - Parse-time deprecation and security notices
 * @returns {Promise<Object|undefined>} The pipeline result, when one was produced
 */
export default async function copyCommand(request, context = {}) {
  const startTime = Date.now();
  const reporter = createReporter(reporterOptionsFor(request));

  let profiler = null;
  let root = null;

  try {
    resetFsErrors();
    applyLoggingOptions(request.feedback);
    // The effective level depends on config files and COPYTREE_LOG_LEVEL, not
    // only on the flags, so it can only be read after the options are applied.
    // `--quiet` still wins outright.
    if (!request.feedback.quiet) {
      reporter.setLevel(effectiveReporterLevel());
    }

    // Deprecation and security notices are warnings, not run detail: they must
    // reach a user who did not pass --verbose, and stay silent under --quiet
    // and at an `error` log level.
    for (const notice of context.notices ?? []) {
      reporter.warn({ code: notice.code, message: notice.message });
    }

    reporter.start({
      command: 'copy',
      target: request.target,
      // Resolved without touching the filesystem, so the very first feedback
      // event names the directory the run is about rather than whatever
      // relative string the caller typed.
      root: /^https?:\/\//i.test(request.target) ? request.target : path.resolve(request.target),
      format: request.content.format,
      destination: deliveryKindFor(request.destination),
      dryRun: false,
    });
    reporter.phase(PHASES.PREPARE);

    if (request.profiler) {
      // Profiler.start() rolls back (disconnects) on partial failure, so a
      // throw during startup leaks nothing.
      const { Profiler } = await import('../utils/profiler.js');
      profiler = new Profiler({
        type: request.profiler.type,
        profileDir: request.profiler.outputDir,
      });
      await profiler.start();
    }

    // One instance, loaded once, and then handed to everything that needs it.
    const cfg = sharedConfig();
    await cfg.loadConfiguration();
    applyBinaryPolicy(cfg, request.content.binary);

    // A file target is permitted: the containing directory becomes the root and
    // the file becomes a scope entry, so ignore rules and emitted paths stay
    // anchored the way every other run anchors them.
    const resolved = await resolveTarget(request, {
      onClone: (url) => reporter.note(`Cloning ${url}`),
    });
    root = resolved.root;
    request = resolved.request;

    const profile = await loadSelectionProfile(root, request.selection, {
      onWarning: (message) => reporter.warn({ code: 'PROFILE_IGNORED', message }),
    });

    // A profile's `options.format` has to be resolved before anything reads the
    // format: it decides whether content stages run at all (`tree` never loads
    // a body), what the reference file is called, and what the reporter says.
    // Applied at the formatter only, it produced a tree document assembled by
    // loading, transforming and scanning every file, and saved as `.xml`.
    request = withEffectiveFormat(request, profile);

    const budgets = resolveBudgets(request, profile, cfg);

    const result = await runPipeline({
      root,
      request,
      profile,
      budgets,
      config: cfg,
      startTime,
      reporter,
    });

    if (profiler) {
      profiler = await finishProfiling(profiler, { result, request, startTime, reporter });
    }

    await writeSecretsReport(result, request, reporter);

    const delivery = await deliverOutput(result, request, root, reporter);

    const fsErrors = getFsErrorSummary();
    const warnings = classifyWarnings(result, { delivery, fsErrors });
    const notices = buildNotices(result);

    // A format nobody asked for, chosen from a filename, is worth stating: the
    // difference between `-o notes.md` giving Markdown and giving XML is not
    // something to discover by opening the file.
    if (request.content.formatInferred) {
      notices.push(`${request.content.format} inferred from the output file extension`);
    }
    const stats = reportRun({ reporter, result, request, delivery, warnings, notices, startTime });

    enforcePolicies({ request, result, delivery, fsErrors, stats });

    return result;
  } catch (error) {
    if (profiler) {
      try {
        await profiler.stop();
      } catch {
        // A profiler that will not stop must not replace the real error.
      }
    }

    // A user pressing Ctrl+C is not a failure, and printing a red error with a
    // stack for it is a small lie about what happened. The cancellation is
    // reported here, where the terminal is owned, and rethrown so the entry
    // point — which owns exit codes — can map it to 130.
    if (isAbortError(error)) {
      reporter.complete(buildCancelledModel());
      error.reported = true;
      throw error;
    }

    // A policy failure is the caller's own check reporting back. It is raised
    // to the entry point, which owns exit codes, rather than reported here as
    // an operational error.
    if (error instanceof PolicyError) throw error;

    const description = describeError(error, { basePath: root || process.cwd() });
    reporter.fail(buildFailureModel(description));
    // The reporter owns the terminal during a run and has already erased the
    // live line and printed this. The entry point must not print it again.
    error.reported = true;
    if (request.feedback.verbose || sharedConfig().get('app.verboseErrors', false)) {
      logger.debug(
        JSON.stringify(
          error instanceof CopyTreeError
            ? error.toJSON()
            : { message: error.message, stack: error.stack },
        ),
      );
    }
    throw error;
  } finally {
    reporter.close();
  }
}

/**
 * Translate the canonical feedback request into reporter configuration.
 * @param {Object} request - Canonical request
 * @returns {Object} Reporter options
 */
function reporterOptionsFor(request) {
  const feedback = request.feedback;
  return {
    // Feedback always goes to stderr, whatever the destination. That is what
    // keeps `copytree --stdout --format json | jq` valid while still showing
    // progress.
    stream: process.stderr,
    verbose: feedback.verbose,
    quiet: feedback.quiet,
    level: 'info',
    format: feedback.logFormat === 'json' ? 'json' : 'text',
    color: feedback.color === false ? 'never' : 'auto',
    context: {
      format: request.content.format,
      destination: deliveryKindFor(request.destination),
    },
  };
}

/**
 * The reporter's severity floor, taken from the logger's effective settings.
 * @returns {'info'|'warn'|'error'} Lowest severity worth reporting
 */
function effectiveReporterLevel() {
  if (logger.isLevelEnabled('info')) return 'info';
  if (logger.isLevelEnabled('warn')) return 'warn';
  return 'error';
}

/**
 * Apply feedback options to the shared logger.
 *
 * Logs are pinned to stderr for every destination: stdout belongs to the
 * requested document and nothing else.
 *
 * @param {Object} feedback - Canonical feedback request
 */
function applyLoggingOptions(feedback) {
  const logOptions = { destination: 'stderr' };
  if (feedback.logLevel) logOptions.level = feedback.logLevel;
  if (feedback.logFormat) logOptions.format = feedback.logFormat;
  if (feedback.color === false) logOptions.colorize = 'never';
  logger.configure(logOptions);
}

/**
 * The delivery label a destination corresponds to.
 *
 * `stdout` is one canonical destination with two renderings — buffered and
 * streamed — and the reporter has separate wording for each.
 *
 * @param {Object} destination - Canonical destination request
 * @returns {string} Reporter delivery kind
 */
function deliveryKindFor(destination) {
  if (destination.type === 'stdout') return destination.streamed ? 'stream' : 'display';
  return destination.type;
}

/**
 * Apply an explicit `--binary` policy to the configuration for this run.
 *
 * `--include-binary` used to be a boolean that named neither the action nor
 * the format's behaviour, so nobody could predict whether they were getting
 * base64, a placeholder or a comment.
 *
 * @param {Object} config - Loaded configuration
 * @param {string} policy - One of the `--binary` values
 */
function applyBinaryPolicy(config, policy) {
  if (!policy || policy === 'default') return;
  // Set on the run's configuration instance, which the CLI creates once per
  // process for exactly one copy. The formatters read the policy from
  // configuration, and threading it through five constructors to avoid one
  // assignment on an instance nothing else will use is the more fragile trade.
  const action = BINARY_ACTIONS[policy];
  if (!action) return;
  config.set('copytree.binaryFileAction', action);
  // Per-category overrides would silently outrank an explicit request.
  config.set('copytree.binaryPolicy', {});
}

/**
 * Assemble and run the pipeline, forwarding progress to the reporter.
 *
 * @param {Object} params - Inputs
 * @returns {Promise<Object>} Pipeline result
 */
async function runPipeline({ root, request, profile, budgets, config, startTime, reporter }) {
  const pipeline = new Pipeline({
    config,
    measureMemory: Boolean(request.profiler),
    continueOnError: true,
    emitProgress: true,
    quiet: reporter.quiet,
  });

  const stages = await buildPipelineStages({ root, request, profile, budgets, config });
  pipeline.through(stages);

  const tracker = new ProgressTracker({
    totalStages: stages.length,
    onProgress: (progress) => reporter.progress(progress),
  });
  tracker.attach(pipeline);

  pipeline.on('stage:recover', (data) => {
    reporter.recovery({
      stage: data.stage,
      message: `Continued past a failure in ${data.stage}: ${data.originalError?.message ?? 'unknown error'}`,
    });
  });

  const result = await pipeline.process({
    basePath: root,
    profile: { ...profile, name: profile.name },
    // Formatters read a handful of presentation decisions from here. They are
    // canonical fields, not raw CLI spellings.
    options: {
      tests: request.selection.noTests ? false : true,
      onlyTree: request.content.includeContent === false,
      withLineNumbers: request.content.lineNumbers,
      withGitStatus: request.selection.gitStatus || Boolean(request.selection.git),
      includeMetadata: request.content.metadata,
      reproducible: request.content.reproducible,
      charLimit: request.budgets.maxChars,
      noInstructions: !request.content.includeInstructions,
      instructions: request.content.instructions,
    },
    startTime,
    version: pkg.version,
  });

  result.pipelineStats = pipeline.getStats();
  return result;
}

/**
 * The full stage list: selection, then content.
 *
 * The selection half is built by the shared engine; nothing here re-decides
 * which files are in.
 *
 * @param {Object} params - Inputs
 * @returns {Promise<Array>} Ordered stages
 */
async function buildPipelineStages({ root, request, profile, budgets, config }) {
  const { stages } = await buildSelectionStages({
    root,
    request,
    profile,
    budgets,
    config,
    // Normal copy keeps aggregate counts; `--explain` upgrades that to the
    // largest exclusions with their rule and source. A complete decision ledger
    // is what `plan --explain` is for, and it is not free.
    retention: request.explain
      ? { mode: 'top', limit: config.get('copytree.exclusionReport.topN', 50) }
      : { mode: 'counts' },
  });

  if (request.content.includeContent) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(new FileLoadingStage({ encoding: 'utf8' }));

    // The registry is passed as a factory, not an instance: building it imports
    // every transformer module, and the stage decides from the selected files
    // whether it needs one at all.
    const { default: TransformStage } = await import('../pipeline/stages/TransformStage.js');
    stages.push(
      new TransformStage({
        registryFactory: async () => {
          const { default: TransformerRegistry } =
            await import('../transforms/TransformerRegistry.js');
          return TransformerRegistry.createDefault({ config });
        },
        transformers: profile.transformers || {},
        // `--binary convert` is a request for the converters to run, so the
        // stage's "is there anything worth building a registry for" shortcut is
        // not allowed to answer no.
        force: request.content.binary === 'convert',
        noCache: request.transformCache === false,
      }),
    );

    // Dedup after loading, because duplicates are decided by content hash and
    // there is no content before this point. Before the secrets guard, because
    // redaction destroys the distinction it hashes on.
    if (request.selection.dedupe) {
      const { default: DeduplicateFilesStage } =
        await import('../pipeline/stages/DeduplicateFilesStage.js');
      stages.push(new DeduplicateFilesStage());
    }
  }

  // Secret scanning AFTER transformation, so what gets scanned is what gets
  // emitted: a converted document can surface a credential that was not present
  // in the bytes on disk.
  //
  // Outside the content block, because two of its exclusions — the secret-prone
  // filename list and the scan size ceiling — are decidable without content. A
  // `--format tree` or `--no-content` run that skipped the stage entirely
  // emitted `.env` in its structure while `plan` correctly predicted it gone.
  if (request.security.secrets !== 'off') {
    const { default: SecretsGuardStage } = await import('../pipeline/stages/SecretsGuardStage.js');
    stages.push(
      new SecretsGuardStage({
        enabled: true,
        planOnly: !request.content.includeContent,
        redactionMode:
          request.security.redaction || config.get('secretsGuard.redactionMode', 'typed'),
        failOnSecrets: request.security.secrets === 'fail',
      }),
    );
  }

  // Nullish rather than truthy, so `--max-chars 0` is honoured as a budget.
  if (request.budgets.maxChars != null) {
    const { default: CharLimitStage } = await import('../pipeline/stages/CharLimitStage.js');
    stages.push(new CharLimitStage({ limit: request.budgets.maxChars }));
  }

  if (request.content.includeInstructions) {
    const { default: InstructionsStage } = await import('../pipeline/stages/InstructionsStage.js');
    stages.push(new InstructionsStage());
  }

  const format = request.content.format;

  if (request.destination.streamed) {
    const { default: StreamingOutputStage } =
      await import('../pipeline/stages/StreamingOutputStage.js');
    stages.push(
      new StreamingOutputStage({
        format,
        addLineNumbers: request.content.lineNumbers,
        prettyPrint: true,
        includeMetadata: request.content.metadata,
        reproducible: request.content.reproducible,
        // The path, not an open stream: the stage opens it once it is about to
        // write, so assembling the pipeline never touches the filesystem.
        outputPath: request.destination.type === 'file' ? request.destination.path : null,
      }),
    );
  } else {
    const { default: OutputFormattingStage } =
      await import('../pipeline/stages/OutputFormattingStage.js');
    stages.push(
      new OutputFormattingStage({
        format,
        addLineNumbers: request.content.lineNumbers,
        prettyPrint: true,
        includeMetadata: request.content.metadata,
        reproducible: request.content.reproducible,
        // `--no-content` controls content, not format. `--format tree` is what
        // renders a tree.
        onlyTree: request.content.includeContent === false,
      }),
    );
  }

  return stages;
}

/**
 * Fold a profile's declared output format into the request.
 *
 * Precedence: CLI over profile over the packaged default. Returns the request
 * unchanged when the CLI named a format or the profile did not.
 *
 * @param {Object} request - Canonical request
 * @param {Object} profile - Effective profile
 * @returns {Object} Request with the effective format
 */
function withEffectiveFormat(request, profile) {
  if (request.content.formatExplicit) return request;

  const format = normalizeProfileFormat(profile.options.format);
  if (!format || format === request.content.format) return request;

  return {
    ...request,
    content: {
      ...request.content,
      format,
      // `--format tree` never emits file bodies, however the format was chosen.
      includeContent: format === 'tree' ? false : request.content.includeContent,
    },
  };
}

/**
 * Normalize a profile's declared output format.
 * @param {*} format - Raw profile value
 * @returns {string|null} Canonical format name, or null when absent or unknown
 */
function normalizeProfileFormat(format) {
  if (typeof format !== 'string') return null;
  const canonical = format.toLowerCase() === 'md' ? 'markdown' : format.toLowerCase();
  return FORMATS.includes(canonical) ? canonical : null;
}

/**
 * Stop the profiler and write its report.
 * @returns {Promise<null>} Always null, so the caller cannot double-stop
 */
async function finishProfiling(profiler, { result, request, startTime, reporter }) {
  const duration = Date.now() - startTime;
  const savedTimestamp = profiler.timestamp;
  let profileFiles = {};
  try {
    profileFiles = await profiler.stop();
  } catch {
    // A profiler that fails to stop must not fail the copy it was measuring.
  }

  const pipelineStats = result.pipelineStats || {};
  const { writeProfilingReport } = await import('../utils/profiler.js');
  const reportPath = await writeProfilingReport({
    profileDir: request.profiler.outputDir,
    timestamp: savedTimestamp,
    duration,
    version: pkg.version,
    command: `copytree debug profile ${request.target} --type ${request.profiler.type}`,
    files: {
      total: result.files?.length ?? 0,
      processed: result.files?.filter((file) => file !== null).length ?? 0,
      excluded: result.stats?.excludedFiles ?? 0,
    },
    memory: process.memoryUsage(),
    perStageTimings: pipelineStats.perStageTimings || {},
    perStageMetrics: pipelineStats.perStageMetrics || {},
    profileFiles,
  });

  reporter.note(`Profile report saved: ${reportPath}`);
  if (profileFiles.cpu) reporter.note(`CPU profile: ${profileFiles.cpu}`);
  if (profileFiles.heap) reporter.note(`Heap profile: ${profileFiles.heap}`);
  return null;
}

/**
 * Write the secrets report, when one was requested.
 *
 * With `-` the report is the requested payload and belongs on stdout; to a file
 * it is a side effect and only the path is worth mentioning.
 */
async function writeSecretsReport(result, request, reporter) {
  const target = request.security.secretsReport;
  if (!target || !result.stats?.secretsGuard?.report) return;

  if (target === '-') {
    // stdout carries one document. A second JSON blob appended to it is not a
    // report — it is a stream neither consumer can parse.
    if (describeDestination(deliveryKindFor(request.destination)).writesPayloadToStdout) {
      throw new ValidationError(
        'Cannot write the secrets report to stdout while the export is also going there',
        'secrets-report',
        '-',
        {
          code: ERROR_CODES.INVALID_OPTION,
          suggestion: 'Write the report to a file, or choose another destination',
        },
      );
    }
    process.stdout.write(`${JSON.stringify(result.stats.secretsGuard.report, null, 2)}\n`);
    return;
  }

  const reportPath = path.resolve(target);
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeJson(reportPath, result.stats.secretsGuard.report, { spaces: 2 });
  reporter.note(`Secrets report written to ${reportPath}`);
}

/**
 * Load the clipboard layer on first need.
 * @returns {Promise<Object>} The Clipboard module
 */
function clipboard() {
  return import('../utils/clipboard.js').then((module) => module.default);
}

/**
 * Put the output where it was asked to go.
 *
 * Delivery returns a description of what actually happened rather than printing
 * anything, so a fallback is one fact the reporter can fold into a single
 * headline instead of three lines that read as unrelated.
 *
 * @returns {Promise<Object>} Delivery result
 */
async function deliverOutput(result, request, root, reporter) {
  const destination = request.destination;
  const kind = deliveryKindFor(destination);
  reporter.phase(PHASES.DELIVER, { destination: kind });

  // `debug profile` measures the work, not the clipboard.
  if (destination.type === 'discard') {
    return { requested: 'discard', actual: 'discard', status: 'success', fallbackUsed: false };
  }

  if (result.streamed) {
    return {
      requested: 'stream',
      actual: 'stream',
      status: 'success',
      path: destination.path ? path.resolve(destination.path) : undefined,
      fallbackUsed: false,
    };
  }

  const output = result.output;
  if (!output) {
    throw new CommandError('No output generated', 'copy');
  }

  if (destination.type === 'reference') {
    const tempFile = await writeReferenceFile(output, root, request.content.format);
    try {
      await (await clipboard()).copyFileReference(tempFile);
      return {
        requested: 'reference',
        actual: 'reference',
        status: 'success',
        path: tempFile,
        fallbackUsed: false,
      };
    } catch (error) {
      // Clipboard failure is a degraded success, not data loss: the file is
      // still there and its path is still reported.
      return {
        requested: 'reference',
        actual: 'file',
        status: 'warning',
        path: tempFile,
        fallbackUsed: true,
        cause: error.message,
      };
    }
  }

  if (destination.type === 'file') {
    const outputPath = path.resolve(destination.path);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, 'utf8');
    await revealIfRequested(outputPath, destination);
    return {
      requested: 'file',
      actual: 'file',
      status: 'success',
      path: outputPath,
      fallbackUsed: false,
    };
  }

  if (destination.type === 'stdout') {
    // The document, and only the document, on stdout.
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    return { requested: kind, actual: kind, status: 'success', fallbackUsed: false };
  }

  try {
    await (await clipboard()).copyText(output);
    return { requested: 'clipboard', actual: 'clipboard', status: 'success', fallbackUsed: false };
  } catch (error) {
    const tempFile = await writeReferenceFile(output, root, request.content.format);
    return {
      requested: 'clipboard',
      actual: 'file',
      status: 'warning',
      path: tempFile,
      fallbackUsed: true,
      cause: error.message,
    };
  }
}

/**
 * Show the written file in the OS file manager, when asked to.
 * @param {string} filePath - File that was written
 * @param {Object} destination - Canonical destination request
 */
async function revealIfRequested(filePath, destination) {
  if (!destination?.reveal) return;
  await (await clipboard()).revealInFinder(filePath);
}

/**
 * Turn a finished run into one model and hand it to the reporter.
 * @returns {Object} The computed run statistics
 */
function reportRun({ reporter, result, request, delivery, warnings, notices = [], startTime }) {
  const included = (result.files || []).filter((file) => file !== null);
  const stats = {
    files: included.length,
    outputBytes:
      result.outputSize ??
      result.stats?.outputSize ??
      (result.output ? Buffer.byteLength(result.output, 'utf8') : undefined),
    estimatedTokens:
      result.stats?.estimatedTokens ??
      buildEstimates(included, {
        format: request.content.format,
        onlyTree: request.content.includeContent === false,
        addLineNumbers: request.content.lineNumbers,
        ...(result.output ? { actualChars: result.output.length } : {}),
      }).estimatedTokens,
    durationMs: Date.now() - startTime,
  };

  if (request.feedback.verbose) {
    emitVerboseSummary(reporter, result, stats);
  }

  // The whole point of `--explain` is the explanation, so it must not also
  // require `--verbose` to appear.
  if (request.explain) {
    emitExplainDetail(reporter, result);
  }

  if (included.length === 0) {
    reporter.complete(buildEmptyModel({ warnings }));
    return stats;
  }

  reporter.complete(
    buildCompletionModel({
      delivery,
      stats,
      warnings,
      notices,
      verbose: request.feedback.verbose,
    }),
  );
  return stats;
}

/**
 * Raise the policy failures the caller asked for.
 *
 * These are separate from operational errors: nothing went wrong with the
 * machine, and exit code 3 says so. Reporting happens first, so the user sees
 * the run they got before they see why it was rejected.
 *
 * @param {Object} params - Inputs
 */
function enforcePolicies({ request, result, delivery, fsErrors, stats }) {
  const security = request.security;

  if (security.failEmpty && stats.files === 0) {
    throw new PolicyError('No files were selected', '--fail-empty', {
      suggestion: 'Check --scope, --include and ignore rules, or drop --fail-empty',
    });
  }

  if (security.failOnTruncation && result.stats?.truncated) {
    throw new PolicyError(
      `${result.stats.truncatedCount ?? 0} files were dropped by the ${result.stats.truncatedBy} budget`,
      '--fail-on-truncation',
      { suggestion: 'Raise the budget, narrow the selection, or drop --fail-on-truncation' },
    );
  }

  if (security.failOnTruncation && result.stats?.truncatedFiles > 0) {
    throw new PolicyError(
      `${result.stats.truncatedFiles} files were truncated by the character budget`,
      '--fail-on-truncation',
      { suggestion: 'Raise --max-chars, or drop --fail-on-truncation' },
    );
  }

  if (security.failOnFsErrors && (fsErrors.failed > 0 || fsErrors.permanent > 0)) {
    throw new PolicyError('Filesystem operations failed after retries', '--fail-on-fs-errors', {
      suggestion: 'Check permissions on the reported paths, or drop --fail-on-fs-errors',
    });
  }

  // Under --strict a clipboard fallback stops being a degraded success. It is
  // an *operational* failure rather than a policy one: the machine could not do
  // what was asked, which is a different thing from a check the caller
  // requested coming back negative.
  if (security.strict && delivery?.fallbackUsed) {
    throw new CommandError(
      `Delivery fell back to ${delivery.actual}: ${delivery.cause ?? 'clipboard unavailable'}`,
      'copy',
      { suggestion: 'Use --output or --stdout in this environment, or drop --strict' },
    );
  }
}

/**
 * `--explain`: the individual rule that excluded each of the largest entries,
 * and the ignore file and line it came from.
 *
 * @param {Object} reporter - Run reporter
 * @param {Object} result - Pipeline result
 */
function emitExplainDetail(reporter, result) {
  const excluded = result.exclusionReport?.toJSON?.() ?? result.stats?.excluded;
  if (!excluded?.largest?.length) return;

  reporter.note('Largest exclusions:', { always: true });
  for (const entry of excluded.largest) {
    const source = entry.ruleSource ? ` (${entry.ruleSource})` : '';
    const rule = entry.rule ? ` [${entry.rule}]` : '';
    reporter.note(
      `  ${entry.path} — ${logger.formatBytes(entry.size)} — ${entry.reason}${rule}${source}`,
      { always: true },
    );
  }
}

/**
 * The verbose run detail: what was selected, what was not, and how long it took.
 */
function emitVerboseSummary(reporter, result, stats) {
  const rows = buildSelectionSummary(result);
  reporter.note(`Selected ${plural(stats.files, 'file')}`);
  for (const row of rows) {
    reporter.note(`${row.value} ${row.label}`);
  }

  const secrets = result.stats?.secretsGuard;
  if (secrets?.enabled && !secrets.planOnly) {
    reporter.note(`Checked ${plural(stats.files, 'file')} for secrets`);
  }

  // Per-stage timings name stage classes, which is engineering diagnostics
  // rather than run detail — `--verbose` is for the user, `--log-level debug`
  // is for us.
  const timings = result.pipelineStats?.perStageTimings || {};
  for (const [stage, ms] of Object.entries(timings)) {
    logger.debug(`${stage} took ${logger.formatDuration(ms)}`);
  }
}

export { buildPipelineStages, deliverOutput, reportRun };
