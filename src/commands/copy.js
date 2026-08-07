import Pipeline from '../pipeline/Pipeline.js';
import TransformerRegistry from '../transforms/TransformerRegistry.js';
import { logger } from '../utils/logger.js';
import {
  CommandError,
  CopyTreeError,
  ERROR_CODES,
  ValidationError,
  describeError,
  isAbortError,
} from '../utils/errors.js';
import { config } from '../config/ConfigManager.js';
import Clipboard from '../utils/clipboard.js';
import {
  describeDestination,
  normalizeFormat,
  resolveDestination,
  validateDestinationOptions,
  writeReferenceFile,
} from '../utils/outputDestination.js';
import { createReporter } from '../ui/feedback/Reporter.js';
import { PHASES, plural } from '../ui/feedback/messages.js';
import {
  buildCancelledModel,
  buildCompletionModel,
  buildDryRunModel,
  buildEmptyModel,
  buildFailureModel,
  buildNotices,
  buildSelectionSummary,
  classifyWarnings,
} from '../ui/feedback/model.js';
import ProgressTracker from '../utils/ProgressTracker.js';
import fs from 'fs-extra';
import path from 'path';
import GitHubUrlHandler from '../services/GitHubUrlHandler.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { summarize as getFsErrorSummary, reset as resetFsErrors } from '../utils/fsErrorReport.js';
import FolderProfileLoader from '../config/FolderProfileLoader.js';
import { Profiler, writeProfilingReport } from '../utils/profiler.js';
import { parseSize } from '../utils/helpers.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { buildEstimates } from '../utils/estimate.js';

// Lazy initialization for Jest compatibility
let pkg;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
} catch (error) {
  // In test environment, these may not be available
  pkg = { version: '0.0.0-test' };
}

/**
 * Run a copy, then say what happened.
 *
 * This is the only implementation of "copy this directory". It used to be one
 * of two: the CLI rendered an Ink component that ran its own pipeline, resolved
 * its own destination, computed its own metrics and wrote its own completion
 * text, while `--stream` and `--profile` came through here. The two drifted in
 * every way two implementations of the same thing can — different wording,
 * different icons, different byte counts, and a clipboard path that could
 * finish without printing anything at all.
 *
 * The shape is now: run the pipeline, deliver the output, build one structured
 * model of what happened, hand it to one reporter. The reporter decides how a
 * terminal, a log file or a JSON consumer should see it.
 *
 * @param {string} [targetPath='.'] - Directory, or GitHub URL, to copy
 * @param {Object} [options={}] - Parsed CLI options
 * @returns {Promise<Object|undefined>} The pipeline result, when one was produced
 */
async function copyCommand(targetPath = '.', options = {}) {
  const startTime = Date.now();
  const reporter = createReporter(reporterOptionsFor(options));

  let profiler = null;
  // Held outside the try so a scope error can be told which root it escaped.
  let basePath = null;
  try {
    resetFsErrors();
    applyLoggingOptions(options);
    // The effective level depends on config files and COPYTREE_LOG_LEVEL, not
    // only on the flags, so it can only be read after the options are applied.
    // `--quiet` still wins outright.
    if (!options.quiet) {
      reporter.setLevel(effectiveReporterLevel());
    }

    // Contradictory destinations are rejected before any work happens. Silent
    // precedence — quietly doing one of the two things asked for — is the wrong
    // answer to a contradiction the user is the only one who can resolve.
    validateDestinationOptions(options);

    reporter.start({
      target: targetPath,
      format: normalizeFormat(options.format),
      destination: resolveDestination(options),
      dryRun: Boolean(options.dryRun),
    });
    reporter.phase(PHASES.PREPARE);

    if (options.profile) {
      // Profiler.start() rolls back (disconnects) on partial failure, so a
      // throw during startup leaks nothing.
      profiler = new Profiler({
        type: options.profile,
        profileDir: options.profileDir || '.profiles',
      });
      await profiler.start();
    }

    await config().loadConfiguration();

    basePath = await resolveBasePath(targetPath, reporter);
    const profileConfig = await buildProfileFromCliOptions(options, basePath);

    const result = await runPipeline({ basePath, profileConfig, options, startTime, reporter });

    if (profiler) {
      profiler = await finishProfiling(profiler, {
        result,
        options,
        targetPath,
        startTime,
        reporter,
      });
    }

    await writeSecretsReport(result, options, reporter);

    const delivery = options.dryRun
      ? null
      : await deliverOutput(result, options, basePath, reporter);

    const fsErrors = getFsErrorSummary();
    const warnings = classifyWarnings(result, { delivery, fsErrors });
    const notices = buildNotices(result);
    reportRun({ reporter, result, options, delivery, warnings, notices, startTime });

    // `--fail-on-fs-errors` turns a degraded run into a failed one. It changes
    // the exit code, not the reporting: the warning is already on screen.
    if (options.failOnFsErrors && (fsErrors.failed > 0 || fsErrors.permanent > 0)) {
      process.exitCode = 1;
    }

    return result;
  } catch (error) {
    if (profiler) {
      try {
        await profiler.stop();
      } catch (_stopErr) {
        // A profiler that will not stop must not replace the real error.
      }
    }

    // A user pressing Ctrl+C is not a failure, and printing a red error with a
    // stack for it is a small lie about what happened.
    if (isAbortError(error)) {
      reporter.complete(buildCancelledModel());
      process.exitCode = 130;
      return undefined;
    }

    const description = describeError(error, { basePath: basePath || process.cwd() });
    reporter.fail(buildFailureModel(description));
    if (options.verbose || config().get('app.verboseErrors', false)) {
      logger.debug(
        JSON.stringify(
          error instanceof CopyTreeError
            ? error.toJSON()
            : { message: error.message, stack: error.stack },
        ),
      );
    }
    process.exitCode = 1;
    return undefined;
  } finally {
    reporter.close();
  }
}

/**
 * Translate CLI options into reporter configuration.
 *
 * @param {Object} options - Parsed CLI options
 * @returns {Object} Reporter options
 */
function reporterOptionsFor(options = {}) {
  return {
    // Feedback always goes to stderr, whatever the destination. That is what
    // keeps `copytree --display --format json | jq` valid while still showing
    // progress, and it removes the reason the old UI had to suppress itself
    // whenever the document shared stdout.
    stream: process.stderr,
    verbose: Boolean(options.verbose),
    quiet: Boolean(options.quiet),
    // `silent` is a severity, not a format: rendering failures as JSON when
    // nobody asked for JSON is as wrong as not rendering them at all.
    level: options.logFormat === 'silent' ? 'error' : 'info',
    format: options.logFormat === 'json' ? 'json' : 'text',
    color: options.color === false ? 'never' : 'auto',
    context: {
      format: normalizeFormat(options.format),
      destination: resolveDestination(options),
    },
  };
}

/**
 * The reporter's severity floor, taken from the logger's effective settings.
 *
 * Read from the logger rather than from the flags so that config files and
 * `COPYTREE_LOG_LEVEL` / `COPYTREE_LOG_FORMAT` reach the reporter too. They
 * previously did not, so `COPYTREE_LOG_FORMAT=silent` left the completion line
 * on screen while silencing everything around it.
 *
 * @returns {'info'|'warn'|'error'} Lowest severity worth reporting
 */
function effectiveReporterLevel() {
  if (logger.isLevelEnabled('info')) return 'info';
  if (logger.isLevelEnabled('warn')) return 'warn';
  return 'error';
}

/**
 * Apply CLI logging options to the shared logger.
 *
 * Logs are pinned to stderr for every destination, not only for `--stream`:
 * stdout belongs to the requested document and nothing else.
 *
 * @param {Object} options - Parsed CLI options
 */
function applyLoggingOptions(options) {
  const logOptions = { destination: 'stderr' };
  if (options.logLevel !== undefined) logOptions.level = options.logLevel;
  if (options.logFormat !== undefined) logOptions.format = options.logFormat;
  if (options.color === false) logOptions.colorize = 'never';
  logger.configure(logOptions);
}

/**
 * Resolve the directory to copy, cloning first when given a GitHub URL.
 *
 * @param {string} targetPath - Path or GitHub URL
 * @param {import('../ui/feedback/Reporter.js').Reporter} reporter - Run reporter
 * @returns {Promise<string>} Absolute base path
 */
async function resolveBasePath(targetPath, reporter) {
  if (GitHubUrlHandler.isGitHubUrl(targetPath)) {
    reporter.note(`Cloning ${targetPath}`);
    const githubHandler = new GitHubUrlHandler(targetPath);
    return githubHandler.getFiles();
  }

  const basePath = path.resolve(targetPath);
  if (!(await fs.pathExists(basePath))) {
    throw new CopyTreeError(`Path does not exist: ${basePath}`, ERROR_CODES.PATH_NOT_FOUND, {
      path: targetPath,
    });
  }
  return basePath;
}

/**
 * Assemble and run the pipeline, forwarding progress to the reporter.
 *
 * `ProgressTracker` is the only normalization layer between pipeline events and
 * the screen. It already guarantees stable stage ids and monotonic progress;
 * the UI used to compute a second, different answer from the same events, and
 * the two disagreed often enough to show progress running backwards.
 *
 * @returns {Promise<Object>} Pipeline result
 */
async function runPipeline({ basePath, profileConfig, options, startTime, reporter }) {
  const pipeline = new Pipeline({
    continueOnError: true,
    emitProgress: true,
    // Stage logs go through the same silence the reporter observes. Without
    // this a `--quiet` run still leaked stage warnings, and on a TTY they were
    // written straight over the reporter's live line, since only the reporter
    // knows to erase it first.
    quiet: reporter.quiet,
  });
  const stages = await setupPipelineStages(basePath, profileConfig, options);
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
    basePath,
    // `profile` is the key the stages actually read — the formatter takes the
    // profile name for the document's metadata from it. This used to be passed
    // as `profileConfig` here and as `profile` from the UI, so `--stream` XML
    // silently omitted the `<ct:profile>` element that a non-streamed run
    // included. Nothing read `profileConfig` at all.
    profile: profileConfig,
    options,
    startTime,
    version: pkg.version,
  });

  result.pipelineStats = pipeline.getStats();
  return result;
}

/**
 * Stop the profiler and write its report.
 *
 * @returns {Promise<null>} Always null, so the caller cannot double-stop
 */
async function finishProfiling(profiler, { result, options, targetPath, startTime, reporter }) {
  const duration = Date.now() - startTime;
  const savedTimestamp = profiler.timestamp; // captured before stop, so no filename parsing
  let profileFiles = {};
  try {
    profileFiles = await profiler.stop();
  } catch (_err) {
    // A profiler that fails to stop must not fail the copy it was measuring.
  }

  const pipelineStats = result.pipelineStats || {};
  const reportPath = await writeProfilingReport({
    profileDir: options.profileDir || '.profiles',
    timestamp: savedTimestamp,
    duration,
    version: pkg.version,
    command: `copytree ${[targetPath, '--profile', options.profile].filter(Boolean).join(' ')}`,
    files: {
      total: result.files?.length ?? 0,
      processed: result.files?.filter((f) => f !== null).length ?? 0,
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
async function writeSecretsReport(result, options, reporter) {
  if (!options.secretsReport || !result.stats?.secretsGuard?.report) return;

  if (options.secretsReport === '-') {
    // stdout carries one document. If it is already carrying the requested
    // output, a second JSON blob appended to it is not a report — it is a
    // corrupt stream that neither consumer can parse.
    if (describeDestination(resolveDestination(options)).writesPayloadToStdout) {
      throw new ValidationError(
        'Cannot write the secrets report to stdout while the output is also going there',
        'secrets-report',
        '-',
        {
          code: ERROR_CODES.INVALID_OPTION,
          suggestion: 'Write the report to a file, or drop --display / --stream',
        },
      );
    }
    process.stdout.write(`${JSON.stringify(result.stats.secretsGuard.report, null, 2)}\n`);
    return;
  }

  const reportPath = path.resolve(options.secretsReport);
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeJson(reportPath, result.stats.secretsGuard.report, { spaces: 2 });
  reporter.note(`Secrets report written to ${reportPath}`);
}

/**
 * Put the output where it was asked to go.
 *
 * Delivery returns a description of what actually happened rather than printing
 * anything, so a fallback — the clipboard was unavailable, the output went to a
 * temp file — is one fact the reporter can fold into a single headline instead
 * of three lines that read as unrelated.
 *
 * @returns {Promise<{requested: string, actual: string, status: string, path?: string,
 *   fallbackUsed: boolean, cause?: string}>} Delivery result
 */
async function deliverOutput(result, options, basePath, reporter) {
  const requested = resolveDestination(options);
  reporter.phase(PHASES.DELIVER, { destination: requested });

  if (result.streamed) {
    return {
      requested: 'stream',
      actual: 'stream',
      status: 'success',
      path: options.output ? path.resolve(options.output) : undefined,
      fallbackUsed: false,
    };
  }

  const output = result.output;
  if (!output) {
    throw new CommandError('No output generated', 'copy');
  }

  if (requested === 'reference') {
    const tempFile = await writeReferenceFile(output, basePath, options.format);
    try {
      await Clipboard.copyFileReference(tempFile);
      return {
        requested,
        actual: 'reference',
        status: 'success',
        path: tempFile,
        fallbackUsed: false,
      };
    } catch (error) {
      return {
        requested,
        actual: 'file',
        status: 'warning',
        path: tempFile,
        fallbackUsed: true,
        cause: error.message,
      };
    }
  }

  if (requested === 'file') {
    const outputPath = path.resolve(options.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, 'utf8');
    await Clipboard.revealInFinder(outputPath);
    return { requested, actual: 'file', status: 'success', path: outputPath, fallbackUsed: false };
  }

  if (requested === 'display' || requested === 'stream') {
    // The document, and only the document, on stdout.
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    return { requested, actual: requested, status: 'success', fallbackUsed: false };
  }

  try {
    await Clipboard.copyText(output);
    return { requested, actual: 'clipboard', status: 'success', fallbackUsed: false };
  } catch (error) {
    const tempFile = await writeReferenceFile(output, basePath, options.format);
    await Clipboard.revealInFinder(tempFile);
    return {
      requested,
      actual: 'file',
      status: 'warning',
      path: tempFile,
      fallbackUsed: true,
      cause: error.message,
    };
  }
}

/**
 * Turn a finished run into one model and hand it to the reporter.
 */
function reportRun({ reporter, result, options, delivery, warnings, notices = [], startTime }) {
  const included = (result.files || []).filter((f) => f !== null);
  const stats = {
    files: included.length,
    outputBytes: result.output
      ? Buffer.byteLength(result.output, 'utf8')
      : result.stats?.outputSize,
    estimatedTokens:
      result.stats?.estimatedTokens ??
      buildEstimates(included, {
        format: options.format,
        onlyTree: options.onlyTree,
        addLineNumbers: options.withLineNumbers,
        ...(result.output ? { actualChars: result.output.length } : {}),
      }).estimatedTokens,
    durationMs: Date.now() - startTime,
  };

  if (options.verbose) {
    emitVerboseSummary(reporter, result, stats);
  }

  if (options.dryRun) {
    // Detail first, verdict last: the completion line is the summary of what
    // came before it, so printing it above the explanation reads backwards.
    if (options.explain) emitExplainDetail(reporter, result);
    reporter.complete(
      buildDryRunModel({ stats, warnings, explain: options.explain, verbose: options.verbose }),
    );
    return;
  }

  if (included.length === 0) {
    reporter.complete(buildEmptyModel({ warnings }));
    return;
  }

  reporter.complete(
    buildCompletionModel({ delivery, stats, warnings, notices, verbose: options.verbose }),
  );
}

/**
 * The verbose run detail: what was selected, what was not, and how long it took.
 *
 * This is where the non-material categories belong. Four thousand ignored
 * entries is reassuring once you asked to see it, and alarming if it appears
 * uninvited on every run.
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
  // is for us. The distinction is the whole reason both exist.
  const timings = result.pipelineStats?.perStageTimings || {};
  for (const [stage, ms] of Object.entries(timings)) {
    logger.debug(`${stage} took ${logger.formatDuration(ms)}`);
  }
}

/**
 * `--explain`: the individual rule that excluded each of the largest entries,
 * and the ignore file and line it came from.
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
 * Parse comma-separated file extensions into a normalized array.
 * Accepts formats like ".js,.ts" or "js,ts" (with or without leading dot).
 * Returns an array of lowercase extensions with leading dots, e.g., ['.js', '.ts'].
 *
 * @param {string} extStr - Comma-separated extension string from --ext flag
 * @returns {string[]} Normalized extensions array
 */
function parseExtensions(extStr) {
  const exts = extStr
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`));
  if (exts.length === 0) {
    throw new ValidationError(`Invalid --ext value '${extStr}'`, 'ext', extStr, {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Provide at least one extension, e.g. .js,.ts',
    });
  }
  return exts;
}

/**
 * Parse a human-readable size string to bytes.
 *
 * Raised as `INVALID_OPTION` rather than a generic command failure, so the
 * reporter can print the offending flag and a concrete example instead of
 * "CopyTree could not complete the operation".
 *
 * @param {string} sizeStr - Size string (e.g., '1KB', '10MB')
 * @param {string} flagName - Flag name for error messages
 * @returns {number} Size in bytes
 */
function parseSizeOption(sizeStr, flagName) {
  try {
    return parseSize(sizeStr);
  } catch {
    throw new ValidationError(`Invalid --${flagName} value '${sizeStr}'`, flagName, sizeStr, {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Use a value such as 256KB, 10MB or 1GB',
    });
  }
}

/**
 * Build profile configuration from CLI options, folder profiles, and config defaults
 * Integrates the new FolderProfileLoader system
 *
 * @param {Object} options - CLI options
 * @param {string} [basePath] - Resolved target directory; folder profiles are
 *   discovered relative to this, not to process.cwd()
 * @returns {Promise<Object>} Profile configuration
 */
async function buildProfileFromCliOptions(options, basePath) {
  const copytreeConfig = config().get('copytree', {});

  // Load a named folder profile, or auto-discover one from the project.
  //
  // Auto-discovery used to be tied to `-r`. Now that reference output is the
  // default, keeping that coupling would have made discovery unconditional as
  // a side effect of an unrelated change, so it is stated directly instead: a
  // `.copytree/` profile in the project applies unless a named one overrides it.
  //
  // Note: options.folderProfile is the renamed --folder-profile/-p flag;
  //       options.profile is now reserved for performance profiling (cpu/heap/all).
  // Commander maps `--no-folder-profile` onto the same key, as `false`. So this
  // one option carries three states: a string names a profile, `false` skips
  // discovery entirely, and undefined means "discover if there is one".
  const namedProfile = typeof options.folderProfile === 'string' ? options.folderProfile : null;
  const profileDisabled = options.folderProfile === false;

  let folderProfile = null;
  if (!profileDisabled) {
    // Folder profiles belong to the project being copied, not to whatever
    // directory the process happens to be started from. An embedder's cwd is
    // its own app bundle; a shell user may well be a level above the target.
    const loader = new FolderProfileLoader({ cwd: basePath || process.cwd() });
    try {
      if (namedProfile) {
        // Load named profile: -p <name> / --folder-profile <name>
        folderProfile = await loader.loadNamed(namedProfile);
        logger.debug(`Loaded folder profile: ${namedProfile}`);
      } else {
        folderProfile = await loader.discover();
        if (folderProfile) {
          logger.debug(`Auto-discovered folder profile: ${folderProfile.name}`);
        }
      }
    } catch (error) {
      // A profile the caller named by hand must exist; a discovered one is
      // optional by definition.
      if (namedProfile) {
        throw error;
      }
    }
  }

  // Build profile-like configuration object from CLI options, folder profile, and defaults
  // Precedence: CLI > folder profile > config defaults
  const profileConfig = {
    // The formatters read `profile.name` for the document's metadata. Only
    // `_folderProfile` carried it, so every run — named profile or not — was
    // serialized as `<ct:profile>default</ct:profile>`.
    name: folderProfile?.name || 'default',

    // Include patterns
    // CLI filter takes highest priority, then folder profile, then default to all files
    include: options.filter
      ? Array.isArray(options.filter)
        ? options.filter
        : [options.filter]
      : folderProfile?.include?.length > 0
        ? folderProfile.include
        : ['**/*'],

    // Exclude patterns.
    // Merge CLI excludes with folder profile excludes. Config-level exclusions
    // (globalExcludedDirectories / globalExcludedFiles) are NOT merged here:
    // FileDiscoveryStage applies them unconditionally so the CLI and the
    // programmatic API cannot drift apart on what gets excluded.
    exclude: [
      ...(options.exclude
        ? Array.isArray(options.exclude)
          ? options.exclude
          : [options.exclude]
        : []),
      ...(folderProfile?.exclude || []),
    ],

    // Filter patterns (same as include for compatibility)
    filter: options.filter
      ? Array.isArray(options.filter)
        ? options.filter
        : [options.filter]
      : folderProfile?.include || [],

    // Force-include patterns (always option)
    always: options.always
      ? Array.isArray(options.always)
        ? options.always
        : [options.always]
      : [],

    // Options for file discovery and processing (honor CLI flags)
    options: {
      respectGitignore: options.respectGitignore ?? copytreeConfig.respectGitignore ?? true,
      includeHidden: options.includeHidden ?? copytreeConfig.includeHidden ?? false,
      followSymlinks: options.followSymlinks ?? copytreeConfig.followSymlinks ?? false,
      maxFileSize: options.maxFileSize ?? copytreeConfig.maxFileSize,
      maxTotalSize: options.maxTotalSize
        ? parseSizeOption(options.maxTotalSize, 'max-total-size')
        : copytreeConfig.maxTotalSize,
      maxFileCount: options.maxFiles ?? options.maxFileCount ?? copytreeConfig.maxFileCount,
      // `--no-size-gate` sets options.sizeGate to false, which disables the gate.
      sizeGate:
        options.sizeGate === false
          ? false
          : options.sizeGate
            ? parseSizeOption(options.sizeGate, 'size-gate')
            : copytreeConfig.sizeGate,
      // Convenience filter flags
      extFilter: options.ext ? parseExtensions(options.ext) : null,
      maxDepth: options.maxDepth !== undefined ? options.maxDepth : null,
      minSizeBytes: options.minSize ? parseSizeOption(options.minSize, 'min-size') : null,
      maxSizeBytes: options.maxSize ? parseSizeOption(options.maxSize, 'max-size') : null,
      // Scoped copy (literal paths, root-anchored ignore semantics)
      scope: options.scope ? (Array.isArray(options.scope) ? options.scope : [options.scope]) : [],
      scopeIgnoresIgnoreFiles: options.scopeIncludeIgnored === true,
      scopeIgnoresConfigExcludes: options.scopeIncludeConfigExcluded === true,
      explain: options.explain === true,
    },

    // Transformer configuration
    transformers: {},

    // Output configuration
    output: {
      format: options.format || 'xml',
      addLineNumbers: options.withLineNumbers ?? false,
      prettyPrint: true,
      includeMetadata: options.info ?? false,
      showSize: options.showSize ?? false,
    },

    // Store folder profile metadata for debugging
    _folderProfile: folderProfile
      ? {
          name: folderProfile.name,
          source: 'folder',
        }
      : null,
  };

  // Handle binary file inclusion
  if (options.includeBinary !== undefined) {
    profileConfig.transformers.binary = {
      enabled: true,
      options: { action: 'include' },
    };
  }

  return profileConfig;
}

/**
 * Setup pipeline stages based on profile and options
 */
async function setupPipelineStages(basePath, profile, options) {
  const stages = [];

  // Resolve --scope before the pipeline runs. The pipeline continues on stage
  // errors by design, which would turn "that folder does not exist" into an
  // empty result indistinguishable from "everything there is gitignored".
  const scopeEntries =
    profile.options?.scope?.length > 0
      ? await resolveScope(basePath, profile.options.scope, {
          followSymlinks: profile.options?.followSymlinks,
        })
      : [];
  const scopePaths = scopeEntries.map((entry) => entry.absolutePath);

  // Merge force-include patterns from all sources (CLI, profile, .copytreeinclude)
  const mergedAlways = [
    ...(Array.isArray(options.always) ? options.always : options.always ? [options.always] : []),
    ...(Array.isArray(profile.always) ? profile.always : []),
    // .copytreeinclude is loaded by the stage itself
  ];

  // 1. File Discovery Stage
  const { default: FileDiscoveryStage } = await import('../pipeline/stages/FileDiscoveryStage.js');
  stages.push(
    new FileDiscoveryStage({
      basePath,
      patterns: profile.include || ['**/*'],
      excludes: profile.exclude || [],
      respectGitignore: profile.options?.respectGitignore ?? true,
      includeHidden: profile.options?.includeHidden ?? false,
      followSymlinks: profile.options?.followSymlinks ?? false,
      maxFileSize: profile.options?.maxFileSize,
      sizeGate: profile.options?.sizeGate,
      forceInclude: mergedAlways,
      // Convenience filter flags
      extFilter: profile.options?.extFilter ?? null,
      maxDepth: profile.options?.maxDepth ?? null,
      minSizeBytes: profile.options?.minSizeBytes ?? null,
      maxSizeBytes: profile.options?.maxSizeBytes ?? null,
      // Scoped copy
      scope: scopePaths,
      scopeIgnoresIgnoreFiles: profile.options?.scopeIgnoresIgnoreFiles === true,
      scopeIgnoresConfigExcludes: profile.options?.scopeIgnoresConfigExcludes === true,
      explain: profile.options?.explain === true,
    }),
  );

  // 2. Always Include Stage (mark files before any filtering)
  if (mergedAlways.length > 0) {
    const { default: AlwaysIncludeStage } =
      await import('../pipeline/stages/AlwaysIncludeStage.js');
    stages.push(new AlwaysIncludeStage(mergedAlways));
  }

  // 3. Git Filter Stage (if --modified or --changed is used)
  if (options.modified || options.changed) {
    const { default: GitFilterStage } = await import('../pipeline/stages/GitFilterStage.js');
    stages.push(
      new GitFilterStage({
        basePath,
        modified: options.modified,
        changed: options.changed,
        withGitStatus: options.withGitStatus,
      }),
    );
  }

  // 4. Profile Filter Stage (applies exclude patterns)
  const { default: ProfileFilterStage } = await import('../pipeline/stages/ProfileFilterStage.js');
  stages.push(
    new ProfileFilterStage({
      exclude: profile.exclude || [],
      filter: profile.filter || [],
    }),
  );

  // 5. Sort Stage — ALWAYS, not only when --sort is passed. Budgets truncate
  //    from the tail, so "which files survive" is only meaningful once the
  //    order is defined.
  const { default: SortFilesStage } = await import('../pipeline/stages/SortFilesStage.js');
  stages.push(
    new SortFilesStage({ sortBy: options.sort || 'path', order: options.sortOrder || 'asc' }),
  );

  // 6. Budget Stage — maxFileCount and maxTotalSize, applied to the sorted list
  const { default: BudgetStage } = await import('../pipeline/stages/BudgetStage.js');
  stages.push(
    new BudgetStage({
      maxFileCount: profile.options?.maxFileCount,
      maxTotalSize: profile.options?.maxTotalSize,
    }),
  );

  // 7. Limit Stage (if --head option is used)
  if (options.head) {
    const { default: LimitStage } = await import('../pipeline/stages/LimitStage.js');
    stages.push(
      new LimitStage({
        limit: parseInt(options.head),
      }),
    );
  }

  // A dry run stops here. Everything below either reads file contents or emits
  // a document, and a preview does neither.
  //
  // Skipping only the *delivery* was not enough, and the gap was not academic:
  // with `--stream` the output stage wrote the whole document to stdout, and
  // `--dry-run --stream -o existing.xml` truncated that file — while the run
  // reported "No content was read and no output was written". A preview that
  // overwrites a file is worse than no preview.
  if (options.dryRun) {
    return stages;
  }

  // 8. File Loading Stage (skip if --only-tree)
  if (!options.onlyTree) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(
      new FileLoadingStage({
        encoding: 'utf8',
      }),
    );

    // 8. Transformer Stage
    const { default: TransformStage } = await import('../pipeline/stages/TransformStage.js');
    const registry = await TransformerRegistry.createDefault();
    stages.push(
      new TransformStage({
        registry,
        transformers: profile.transformers || {},
        noCache: options.noCache,
      }),
    );

    // 9. Deduplicate Stage (if --dedupe) — after loading, because duplicates
    //    are decided by content hash and there is no content before this point.
    //
    //    Before the secrets guard, because redaction destroys the distinction it
    //    hashes on: two config files differing only in their credentials become
    //    byte-identical strings of the same marker, and one is then dropped as a
    //    duplicate of the other.
    if (options.dedupe) {
      const { default: DeduplicateFilesStage } =
        await import('../pipeline/stages/DeduplicateFilesStage.js');
      stages.push(new DeduplicateFilesStage());
    }

    // 10. Secrets Guard Stage — AFTER transformation, so what gets scanned is
    //     what gets emitted. Scanning first left a gap: a transformer that
    //     converts a document to text can surface a credential that was not
    //     present in the bytes the scanner saw.
    const secretsGuardEnabled =
      options.secretsGuard !== false &&
      (options.secretsGuard === true || config().get('secretsGuard.enabled', true));

    if (secretsGuardEnabled) {
      const { default: SecretsGuardStage } =
        await import('../pipeline/stages/SecretsGuardStage.js');
      stages.push(
        new SecretsGuardStage({
          enabled: true,
          redactionMode:
            options.secretsRedactMode || config().get('secretsGuard.redactionMode', 'typed'),
          failOnSecrets: options.failOnSecrets || config().get('secretsGuard.failOnSecrets', false),
        }),
      );
    }
  }

  // 10. Character Limit Stage (if --char-limit option is used).
  //     Nullish rather than truthy, so `--char-limit 0` is honoured as a budget.
  if (options.charLimit != null) {
    const { default: CharLimitStage } = await import('../pipeline/stages/CharLimitStage.js');
    stages.push(
      new CharLimitStage({
        limit: parseInt(options.charLimit, 10),
      }),
    );
  }

  // 11. Instructions Stage (load instructions unless disabled)
  const { default: InstructionsStage } = await import('../pipeline/stages/InstructionsStage.js');
  stages.push(new InstructionsStage());

  // 12. Output Formatting Stage
  //
  // `--only-tree` controls *content* (omit file bodies), not *format*. It used
  // to imply `--format tree` here but not on the UI path, so the same flags
  // produced different documents depending on whether you passed -S. Rendering
  // as a tree is what `--format tree` is for.
  const rawFormat = options.format || profile.output?.format || 'xml';
  const outputFormat =
    (rawFormat || 'xml').toString().toLowerCase() === 'md'
      ? 'markdown'
      : (rawFormat || 'xml').toString().toLowerCase();

  // Use streaming stage for stream option or large outputs
  if (options.stream || (profile.options?.streaming ?? false)) {
    const { default: StreamingOutputStage } =
      await import('../pipeline/stages/StreamingOutputStage.js');

    stages.push(
      new StreamingOutputStage({
        format: outputFormat,
        addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
        prettyPrint: profile.output?.prettyPrint ?? true,
        // The path, not an open stream: the stage opens it once it is about to
        // write, so assembling the pipeline never touches the filesystem.
        outputPath: options.output || null,
      }),
    );
  } else {
    const { default: OutputFormattingStage } =
      await import('../pipeline/stages/OutputFormattingStage.js');
    stages.push(
      new OutputFormattingStage({
        format: outputFormat,
        addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
        prettyPrint: profile.output?.prettyPrint ?? true,
        includeMetadata: profile.output?.includeMetadata ?? true,
        showSize: options.showSize,
        onlyTree: options.onlyTree,
      }),
    );
  }

  return stages;
}

// Exported so the programmatic API and the tests share this exact profile
// builder and stage list. Two implementations of "which files get selected" is
// the defect this module exists to prevent.
export { buildProfileFromCliOptions, setupPipelineStages, deliverOutput, reportRun };

export default copyCommand;
