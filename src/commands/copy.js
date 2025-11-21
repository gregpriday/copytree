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

// Lazy initialization for Jest compatibility
let __filename, __dirname, pkg;
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
  pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
} catch (error) {
  // In test environment, these may not be available
  __filename = '';
  __dirname = '';
  pkg = { version: '0.0.0-test' };
}

/**
 * Main copy command implementation
 * Copies directory structure and file contents to XML/JSON format
 */
async function copyCommand(targetPath = '.', options = {}) {
  const startTime = Date.now();

  try {
    // Reset filesystem error tracking at start
    resetFsErrors();

    // When streaming, silence the logger to avoid polluting stdout
    if (options.stream) {
      logger.options.silent = true;
    }

    // Start with initializing message
    logger.startSpinner('Initializing');

    // 1. Build configuration from CLI options and defaults
    const profileConfig = buildProfileFromCliOptions(options);

    // 2. Validate and resolve path
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
      await displayOutput(outputResult, options);
    } else if (options.dryRun) {
      logger.info('🔍 Dry run mode - no files were processed.');
      const fileCount = result.files.filter((f) => f !== null).length;
      const totalSize = result.files
        .filter((f) => f !== null)
        .reduce((sum, file) => sum + (file.size || 0), 0);
      logger.info(`${fileCount} files [${logger.formatBytes(totalSize)}] would be processed`);
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
    logger.stopSpinner();
    handleError(error, {
      exit: true,
      verbose: options.verbose || config().get('app.verboseErrors', false),
    });
  }
}

/**
 * Load and prepare profile
 */
/**
 * Build profile configuration from CLI options and config defaults
 * Replaces the old ProfileLoader system
 */
function buildProfileFromCliOptions(options) {
  const copytreeConfig = config().get('copytree', {});

  // Build profile-like configuration object from CLI options and defaults
  const profileConfig = {
    // Include patterns (default to all files)
    include: options.filter
      ? Array.isArray(options.filter)
        ? options.filter
        : [options.filter]
      : ['**/*'],

    // Exclude patterns (from CLI or config defaults)
    exclude: options.exclude
      ? Array.isArray(options.exclude)
        ? options.exclude
        : [options.exclude]
      : copytreeConfig.globalExcludedDirectories || [],

    // Filter patterns (same as include for compatibility)
    filter: options.filter
      ? Array.isArray(options.filter)
        ? options.filter
        : [options.filter]
      : [],

    // Force-include patterns (always option)
    always: options.always
      ? Array.isArray(options.always)
        ? options.always
        : [options.always]
      : [],

    // External sources
    external: options.external
      ? Array.isArray(options.external)
        ? options.external
        : [options.external]
      : [],

    // Options for file discovery and processing (honor CLI flags)
    options: {
      respectGitignore: options.respectGitignore ?? copytreeConfig.respectGitignore ?? true,
      includeHidden: options.includeHidden ?? copytreeConfig.includeHidden ?? false,
      followSymlinks: options.followSymlinks ?? copytreeConfig.followSymlinks ?? false,
      maxFileSize: options.maxFileSize ?? copytreeConfig.maxFileSize,
      maxTotalSize: options.maxTotalSize ?? copytreeConfig.maxTotalSize,
      maxFileCount: options.maxFileCount ?? copytreeConfig.maxFileCount,
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
      respectGitignore: profile.options?.respectGitignore ?? true,
      includeHidden: profile.options?.includeHidden ?? false,
      followSymlinks: profile.options?.followSymlinks ?? false,
      maxFileSize: profile.options?.maxFileSize,
      maxTotalSize: profile.options?.maxTotalSize,
      maxFileCount: profile.options?.maxFileCount,
      forceInclude: mergedAlways,
    }),
  );

  // 2. Always Include Stage (mark files before any filtering)
  if (mergedAlways.length > 0) {
    const { default: AlwaysIncludeStage } = await import(
      '../pipeline/stages/AlwaysIncludeStage.js'
    );
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

  // 5. External Source Stage (if external sources are configured)
  if (profile.external && profile.external.length > 0) {
    const { default: ExternalSourceStage } = await import(
      '../pipeline/stages/ExternalSourceStage.js'
    );
    stages.push(new ExternalSourceStage(profile.external));
  }

  // 6. Limit Stage (if --head option is used)
  if (options.head) {
    const { default: LimitStage } = await import('../pipeline/stages/LimitStage.js');
    stages.push(
      new LimitStage({
        limit: parseInt(options.head),
      }),
    );
  }

  // 7. File Loading Stage (skip if --only-tree)
  if (!options.onlyTree) {
    const { default: FileLoadingStage } = await import('../pipeline/stages/FileLoadingStage.js');
    stages.push(
      new FileLoadingStage({
        encoding: 'utf8',
      }),
    );

    // 8. Secrets Guard Stage (automatic secret detection and redaction)
    // Only add if explicitly enabled or not explicitly disabled
    const secretsGuardEnabled =
      options.secretsGuard !== false &&
      (options.secretsGuard === true || config().get('secretsGuard.enabled', true));

    if (secretsGuardEnabled) {
      const { default: SecretsGuardStage } = await import(
        '../pipeline/stages/SecretsGuardStage.js'
      );
      stages.push(
        new SecretsGuardStage({
          enabled: true,
          redactionMode:
            options.secretsRedactMode || config().get('secretsGuard.redactionMode', 'typed'),
          failOnSecrets: options.failOnSecrets || config().get('secretsGuard.failOnSecrets', false),
        }),
      );
    }

    // 9. Transformer Stage
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

  // 10. Character Limit Stage (if --char-limit option is used)
  if (options.charLimit) {
    const { default: CharLimitStage } = await import('../pipeline/stages/CharLimitStage.js');
    stages.push(
      new CharLimitStage({
        limit: parseInt(options.charLimit),
      }),
    );
  }

  // 11. Instructions Stage (load instructions unless disabled)
  const { default: InstructionsStage } = await import('../pipeline/stages/InstructionsStage.js');
  stages.push(new InstructionsStage());

  // 12. Output Formatting Stage
  // Determine output format (default to tree if --only-tree is used)
  const rawFormat = options.format || (options.onlyTree ? 'tree' : profile.output?.format || 'xml');
  const outputFormat =
    (rawFormat || 'xml').toString().toLowerCase() === 'md'
      ? 'markdown'
      : (rawFormat || 'xml').toString().toLowerCase();

  // Use streaming stage for stream option or large outputs
  if (options.stream || (profile.options?.streaming ?? false)) {
    const { default: StreamingOutputStage } = await import(
      '../pipeline/stages/StreamingOutputStage.js'
    );
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
    const { default: OutputFormattingStage } = await import(
      '../pipeline/stages/OutputFormattingStage.js'
    );
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
async function displayOutput(outputResult, options) {
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
    const tempFile = path.join(os.tmpdir(), `copytree-${Date.now()}.${extension}`);
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

export default copyCommand;
