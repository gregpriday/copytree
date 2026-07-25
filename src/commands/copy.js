import Pipeline from '../pipeline/Pipeline.js';
import TransformerRegistry from '../transforms/TransformerRegistry.js';
import { logger } from '../utils/logger.js';
import { CommandError, handleError } from '../utils/errors.js';
import { config } from '../config/ConfigManager.js';
import Clipboard from '../utils/clipboard.js';
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
 * Main copy command implementation
 * Copies directory structure and file contents to XML/JSON format
 */
async function copyCommand(targetPath = '.', options = {}) {
  const startTime = Date.now();

  // Start performance profiler if --profile flag is set.
  // Profiler.start() rolls back (disconnects) on partial failure, so no resource
  // leak if startup throws — the error propagates to bin/copytree.js for exit(1).
  let profiler = null;
  if (options.profile) {
    profiler = new Profiler({
      type: options.profile,
      profileDir: options.profileDir || '.profiles',
    });
    await profiler.start();
  }

  try {
    // Reset filesystem error tracking at start
    resetFsErrors();

    // Apply logging configuration from CLI options (level, format, color).
    // This must run before any logger calls so the options take effect.
    // In stream or profiling mode we force logs to stderr (standard Unix practice)
    // so stdout is never polluted by log lines regardless of config.
    {
      const logOptions = {};
      if (options.logLevel !== undefined) logOptions.level = options.logLevel;
      if (options.logFormat !== undefined) logOptions.format = options.logFormat;
      if (options.color === false) logOptions.colorize = 'never';
      if (options.stream || options.profile) logOptions.destination = 'stderr';
      if (Object.keys(logOptions).length > 0) {
        logger.configure(logOptions);
      }
    }

    // Start with initializing message
    logger.startSpinner('Initializing');

    // Ensure configuration is loaded before proceeding
    await config().loadConfiguration();

    // 1. Validate and resolve path
    let basePath;
    if (GitHubUrlHandler.isGitHubUrl(targetPath)) {
      // For GitHub URLs, clone/update the repository and get the local path
      logger.updateSpinner('Cloning GitHub repository');
      const githubHandler = new GitHubUrlHandler(targetPath);
      basePath = await githubHandler.getFiles();
      logger.info(`Using GitHub repository: ${targetPath}`);
    } else {
      basePath = path.resolve(targetPath);
      if (!(await fs.pathExists(basePath))) {
        throw new CommandError(`Path does not exist: ${basePath}`, 'copy');
      }
    }

    // 2. Build configuration from CLI options and defaults, anchored at the target
    const profileConfig = await buildProfileFromCliOptions(options, basePath);

    // 3. Update to processing
    logger.updateSpinner('Processing files');

    // 4. Initialize pipeline with stages
    const pipeline = new Pipeline({
      continueOnError: true,
      emitProgress: true,
    });

    // Setup pipeline stages
    const stages = await setupPipelineStages(basePath, profileConfig, options);
    pipeline.through(stages);

    // 5. Execute pipeline
    const result = await pipeline.process({
      basePath,
      profileConfig,
      options,
      startTime,
      version: pkg.version,
    });

    // 6a. Stop profiler and write report
    if (profiler) {
      const duration = Date.now() - startTime;
      const savedTimestamp = profiler.timestamp; // capture before stop (avoids brittle filename parsing)
      let profileFiles = {};
      try {
        profileFiles = await profiler.stop();
      } catch (_err) {
        // Profiler stop failure is non-fatal
      } finally {
        profiler = null; // prevent double-stop if subsequent code throws
      }

      const pipelineStats = pipeline.getStats();
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

      logger.options.silent = false;
      logger.success(`Profile report saved: ${reportPath}`);
      if (profileFiles.cpu) logger.info(`CPU profile: ${profileFiles.cpu}`);
      if (profileFiles.heap) logger.info(`Heap profile: ${profileFiles.heap}`);
    }

    // 6. Write secrets report if requested
    if (options.secretsReport && result.stats?.secretsGuard?.report) {
      const reportPath = options.secretsReport === '-' ? null : path.resolve(options.secretsReport);

      if (reportPath) {
        await fs.ensureDir(path.dirname(reportPath));
        await fs.writeJson(reportPath, result.stats.secretsGuard.report, { spaces: 2 });
        logger.info(`Secrets report written to ${reportPath}`);
      } else {
        // Write to stdout
        console.log(JSON.stringify(result.stats.secretsGuard.report, null, 2));
      }
    }

    // 7. Prepare output
    let outputResult;
    if (!options.dryRun) {
      outputResult = await prepareOutput(result, options);
    }

    // 8. Stop spinner before showing final result
    logger.stopSpinner();

    // 9. Display final output
    if (!options.dryRun && outputResult) {
      await displayOutput(outputResult, options, basePath);
    } else if (options.dryRun) {
      logger.info('🔍 Dry run mode - no files were processed.');
      const included = result.files.filter((f) => f !== null);
      const totalSize = included.reduce((sum, file) => sum + (file.size || 0), 0);
      const { estimatedTokens } = buildEstimates(included, {
        format: options.format,
        onlyTree: options.onlyTree,
        addLineNumbers: options.withLineNumbers,
      });

      logger.info(
        `${included.length} files [${logger.formatBytes(totalSize)}, ~${formatCount(estimatedTokens)} tokens] would be processed`,
      );

      reportExclusions(result, options);
    }

    // 10. Show summary if requested
    if (options.info) {
      showSummary(result, startTime);
    }

    // 11. Show filesystem error summary
    const fsSummary = getFsErrorSummary();
    if (
      fsSummary.totalRetries > 0 ||
      fsSummary.succeededAfterRetry > 0 ||
      fsSummary.failed > 0 ||
      fsSummary.permanent > 0
    ) {
      logger.info('\nFilesystem Operations Summary:');
      if (fsSummary.totalRetries > 0) {
        logger.info(`  Total retries: ${fsSummary.totalRetries}`);
      }
      if (fsSummary.succeededAfterRetry > 0) {
        logger.success(`  Succeeded after retry: ${fsSummary.succeededAfterRetry}`);
      }
      if (fsSummary.failed > 0) {
        logger.warn(`  Failed after retries: ${fsSummary.failed}`);
      }
      if (fsSummary.permanent > 0) {
        logger.error(`  Permanent errors: ${fsSummary.permanent}`);
      }
    }

    // 12. Exit with error if --fail-on-fs-errors and there are failures
    if (options.failOnFsErrors && (fsSummary.failed > 0 || fsSummary.permanent > 0)) {
      logger.error(
        `\nExiting with error due to filesystem failures (use --fail-on-fs-errors to control this behavior)`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    // Ensure profiler is stopped and disconnected on error
    if (profiler) {
      try {
        await profiler.stop();
      } catch (_stopErr) {
        // Ignore stop errors during error handling
      }
    }
    logger.stopSpinner();
    handleError(error, {
      exit: true,
      verbose: options.verbose || config().get('app.verboseErrors', false),
    });
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
    throw new CommandError(
      `Invalid --ext value '${extStr}'. Provide at least one extension, e.g., .js,.ts`,
    );
  }
  return exts;
}

/**
 * Parse a human-readable size string to bytes, throwing a CommandError on invalid input.
 *
 * @param {string} sizeStr - Size string (e.g., '1KB', '10MB')
 * @param {string} flagName - Flag name for error messages
 * @returns {number} Size in bytes
 */
function parseSizeOption(sizeStr, flagName) {
  try {
    return parseSize(sizeStr);
  } catch {
    throw new CommandError(
      `Invalid --${flagName} value '${sizeStr}'. Use a format like 1KB, 500B, 10MB, 1GB.`,
    );
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

  // Try to load folder profile if requested or if -r/--as-reference is used
  // Note: options.folderProfile is the renamed --folder-profile/-p flag;
  //       options.profile is now reserved for performance profiling (cpu/heap/all).
  let folderProfile = null;
  if (options.folderProfile || options.asReference) {
    // Folder profiles belong to the project being copied, not to whatever
    // directory the process happens to be started from. An embedder's cwd is
    // its own app bundle; a shell user may well be a level above the target.
    const loader = new FolderProfileLoader({ cwd: basePath || process.cwd() });
    try {
      if (options.folderProfile) {
        // Load named profile: -p <name> / --folder-profile <name>
        folderProfile = await loader.loadNamed(options.folderProfile);
        logger.debug(`Loaded folder profile: ${options.folderProfile}`);
      } else {
        // Auto-discover profile for -r/--as-reference
        folderProfile = await loader.discover();
        if (folderProfile) {
          logger.debug(`Auto-discovered folder profile: ${folderProfile.name}`);
        }
      }
    } catch (error) {
      // If profile was explicitly requested but not found, throw error
      if (options.folderProfile) {
        throw error;
      }
      // For auto-discovery (-r), silently continue without profile
    }
  }

  // Build profile-like configuration object from CLI options, folder profile, and defaults
  // Precedence: CLI > folder profile > config defaults
  const profileConfig = {
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

  // 8. File Loading Stage (skip if --only-tree)
  if (!options.onlyTree) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(
      new FileLoadingStage({
        encoding: 'utf8',
      }),
    );

    // 7. Secrets Guard Stage (automatic secret detection and redaction)
    // Only add if explicitly enabled or not explicitly disabled
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
  }

  // 9. Deduplicate Stage (if --dedupe) — after loading, because duplicates are
  //    decided by content hash and there is no content before this point.
  if (options.dedupe && !options.onlyTree) {
    const { default: DeduplicateFilesStage } =
      await import('../pipeline/stages/DeduplicateFilesStage.js');
    stages.push(new DeduplicateFilesStage());
  }

  // 10. Character Limit Stage (if --char-limit option is used)
  if (options.charLimit) {
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
    const fsSync = await import('fs');

    let outputStream = process.stdout;
    if (options.output) {
      outputStream = fsSync.createWriteStream(path.resolve(options.output));
    }

    stages.push(
      new StreamingOutputStage({
        format: outputFormat,
        addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
        prettyPrint: profile.output?.prettyPrint ?? true,
        outputStream,
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

/**
 * Report what did not make it into the run, and why.
 *
 * "Why isn't my file here?" should be a glance, not a bisect of `.gitignore`.
 * Aggregate counts are always available; `--explain` adds the individual rule
 * and the ignore file and line it came from.
 *
 * @param {Object} result - Pipeline result
 * @param {Object} options - CLI options
 */
function reportExclusions(result, options) {
  // Read the live report, not `stats.excluded`. That field is serialized during
  // discovery, before the budget, dedupe and character-limit stages have had a
  // chance to drop anything, so it is a snapshot of an early moment rather than
  // the final accounting.
  const excluded = result.exclusionReport?.toJSON() ?? result.stats?.excluded;
  if (!excluded || excluded.total === 0) return;

  const counts = Object.entries(excluded.byReason)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');

  logger.info(`${excluded.total} excluded: ${counts}`);

  if (result.stats?.truncated) {
    logger.warn(
      `Truncated: ${result.stats.truncatedCount} file(s) dropped by ${result.stats.truncatedBy}`,
    );
  }

  if (!options.explain || !excluded.largest?.length) return;

  logger.info('\nLargest exclusions:');
  for (const entry of excluded.largest) {
    const source = entry.ruleSource ? ` (${entry.ruleSource})` : '';
    const rule = entry.rule ? ` [${entry.rule}]` : '';
    logger.info(
      `  ${entry.path} — ${logger.formatBytes(entry.size)} — ${entry.reason}${rule}${source}`,
    );
  }
}

/**
 * Format a count with thousands separators, abbreviating large values.
 * @param {number} value - Count to format
 * @returns {string} Human-readable count
 */
function formatCount(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

/**
 * Prepare output but don't display yet
 */
async function prepareOutput(result, options) {
  // If streaming was used, output has already been handled
  if (result.streamed) {
    const fileCount = result.files.filter((f) => f !== null).length;
    const totalSize = result.files
      .filter((f) => f !== null)
      .reduce((sum, file) => sum + (file.size || 0), 0);

    return {
      type: 'streamed',
      fileCount,
      totalSize,
      outputPath: options.output,
    };
  }

  const output = result.output;

  if (!output) {
    throw new CommandError('No output generated', 'copy');
  }

  // Calculate output size
  const outputSize = Buffer.byteLength(output, 'utf8');
  const fileCount = result.files.filter((f) => f !== null).length;

  return {
    type: 'normal',
    output,
    outputSize,
    fileCount,
  };
}

/**
 * Display the final output after Listr has cleared
 */
async function displayOutput(outputResult, options, basePath) {
  const { type, output, outputSize, fileCount, totalSize, outputPath } = outputResult;

  if (type === 'streamed') {
    if (outputPath) {
      logger.success(
        `Streamed ${fileCount} files [${logger.formatBytes(totalSize)}] to ${path.resolve(outputPath)}`,
      );
    } else {
      logger.success(`Streamed ${fileCount} files [${logger.formatBytes(totalSize)}]`);
    }
    return;
  }

  // Handle --as-reference option
  if (options.asReference) {
    const f = (options.format || 'xml').toString().toLowerCase();
    const format = f === 'md' ? 'markdown' : f;
    const extension =
      format === 'json'
        ? 'json'
        : format === 'markdown'
          ? 'md'
          : format === 'tree'
            ? 'txt'
            : format === 'ndjson'
              ? 'ndjson'
              : format === 'sarif'
                ? 'sarif'
                : 'xml';
    const os = await import('os');
    const dirName = basePath ? path.basename(basePath) : 'copytree';
    const safeName = dirName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const prefix = safeName || 'copytree';
    const tempFile = path.join(os.tmpdir(), `${prefix}-${Date.now()}.${extension}`);
    await fs.writeFile(tempFile, output, 'utf8');

    try {
      await Clipboard.copyFileReference(tempFile);
      logger.success(
        `Copied ${fileCount} files [${logger.formatBytes(outputSize)}] to ${path.basename(tempFile)}`,
      );
    } catch (_error) {
      logger.warn('Failed to copy reference to clipboard');
      logger.info(`Output saved to: ${tempFile}`);
      logger.info(`${fileCount} files [${logger.formatBytes(outputSize)}]`);
    }
    return;
  }

  // Determine output destination
  if (options.output) {
    // Write to file
    const outputPath = path.resolve(options.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, 'utf8');
    logger.success(
      `Copied ${fileCount} files [${logger.formatBytes(outputSize)}] to ${outputPath}`,
    );

    // Reveal in Finder on macOS
    await Clipboard.revealInFinder(outputPath);
  } else if (options.display) {
    // Display to console
    console.log(output);
    logger.success(`Displayed ${fileCount} files [${logger.formatBytes(outputSize)}]`);
  } else if (options.stream) {
    // Stream to stdout (shouldn't reach here if streaming was properly used)
    process.stdout.write(output);
  } else {
    // Default: copy to clipboard
    try {
      await Clipboard.copyText(output);
      logger.success(`Copied ${fileCount} files [${logger.formatBytes(outputSize)}] to clipboard`);
    } catch (_error) {
      // If clipboard fails, save to temporary file
      const f = (options.format || 'xml').toString().toLowerCase();
      const format = f === 'md' ? 'markdown' : f;
      const extension =
        format === 'json'
          ? 'json'
          : format === 'markdown'
            ? 'md'
            : format === 'tree'
              ? 'txt'
              : format === 'ndjson'
                ? 'ndjson'
                : format === 'sarif'
                  ? 'sarif'
                  : 'xml';
      const os = await import('os');
      const tempFile = path.join(os.tmpdir(), `copytree-${Date.now()}.${extension}`);
      await fs.writeFile(tempFile, output, 'utf8');
      logger.warn(`Failed to copy to clipboard. Output saved to: ${tempFile}`);
      logger.info(`${fileCount} files [${logger.formatBytes(outputSize)}]`);

      // Reveal in Finder on macOS
      await Clipboard.revealInFinder(tempFile);
    }
  }
}

/**
 * Show summary information
 */
function showSummary(result, startTime) {
  const duration = Date.now() - startTime;
  const stats = result.stats || {};

  console.log('\n📊 Summary:');
  console.log(`  Files processed: ${result.files.length}`);

  // Calculate total size from files
  const totalSize = result.files.reduce((sum, file) => sum + (file.size || 0), 0);
  console.log(`  Total size: ${logger.formatBytes(totalSize)}`);
  console.log(`  Output size: ${logger.formatBytes(result.outputSize || 0)}`);
  console.log(`  Duration: ${logger.formatDuration(duration)}`);

  if (stats.excludedFiles > 0) {
    console.log(`  Excluded files: ${stats.excludedFiles}`);
  }

  // Show secrets guard stats if present
  if (stats.secretsGuard) {
    const sg = stats.secretsGuard;
    console.log(
      `  🔒 Secrets Guard: ${sg.filesExcluded || 0} files excluded, ${sg.secretsRedacted || 0} redactions, ${sg.secretsFound || 0} findings`,
    );
  }

  if (result.errors && result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
  }
}

// Exported so the Ink UI shares this exact profile builder and stage list.
// Two implementations of "which files get selected" is the defect this whole
// module is meant to eliminate; the UI must not grow its own.
export { buildProfileFromCliOptions, setupPipelineStages };

export default copyCommand;
