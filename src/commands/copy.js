const Pipeline = require('../pipeline/Pipeline');
const ProfileLoader = require('../profiles/ProfileLoader');
const FileDiscovery = require('../utils/FileDiscovery');
const TransformerRegistry = require('../transforms/TransformerRegistry');
const { logger } = require('../utils/logger');
const { CommandError, handleError } = require('../utils/errors');
const { config } = require('../config/ConfigManager');
const Clipboard = require('../utils/clipboard');
const fs = require('fs-extra');
const path = require('path');

/**
 * Main copy command implementation
 * Copies directory structure and file contents to XML/JSON format
 */
async function copyCommand(targetPath = '.', options = {}) {
  const startTime = Date.now();
  
  try {
    // Initialize components
    logger.startSpinner('Initializing CopyTree...');
    
    // 1. Load profile
    const profileLoader = new ProfileLoader();
    const profileName = options.profile || 'default';
    const profile = await loadProfile(profileLoader, profileName, options);
    
    logger.updateSpinner(`Using profile: ${profile.name}`);
    
    // 2. Validate and resolve path
    const basePath = path.resolve(targetPath);
    if (!await fs.pathExists(basePath)) {
      throw new CommandError(`Path does not exist: ${basePath}`, 'copy');
    }
    
    // 3. Check for dry run
    if (options.dryRun) {
      logger.info('🔍 Dry run mode - no files will be processed');
    }
    
    // 4. Initialize pipeline with stages
    const pipeline = new Pipeline({
      continueOnError: true,
      emitProgress: true
    });
    
    // Setup pipeline stages
    const stages = await setupPipelineStages(basePath, profile, options);
    pipeline.through(stages);
    
    // 5. Setup progress tracking
    setupProgressTracking(pipeline);
    
    // 6. Execute pipeline
    logger.updateSpinner('Processing files...');
    const result = await pipeline.process({
      basePath,
      profile,
      options,
      startTime
    });
    
    logger.succeedSpinner(`Processed ${result.files.length} files`);
    
    // 7. Handle output (skip if dry-run)
    if (!options.dryRun) {
      await handleOutput(result, options);
    } else {
      // For dry-run, just show file count and size
      const fileCount = result.files.length;
      const totalSize = result.files.reduce((sum, file) => sum + (file.size || 0), 0);
      logger.info(`${fileCount} files [${logger.formatBytes(totalSize)}]`);
    }
    
    // 8. Show summary
    if (options.info) {
      showSummary(result, startTime);
    }
    
  } catch (error) {
    logger.stopSpinner();
    handleError(error, {
      exit: true,
      verbose: options.verbose || config().get('app.verboseErrors', false)
    });
  }
}

/**
 * Load and prepare profile
 */
async function loadProfile(profileLoader, profileName, options) {
  // Build overrides from command options
  const overrides = {};
  
  if (options.filter) {
    overrides.filter = Array.isArray(options.filter) ? options.filter : [options.filter];
  }
  
  if (options.includeHidden !== undefined) {
    overrides.options = overrides.options || {};
    overrides.options.includeHidden = options.includeHidden;
  }
  
  if (options.includeBinary !== undefined) {
    overrides.transformers = overrides.transformers || {};
    overrides.transformers.binary = {
      enabled: true,
      options: { action: 'include' }
    };
  }
  
  // Load profile with overrides
  let profile;
  try {
    profile = await profileLoader.load(profileName, overrides);
  } catch (error) {
    // Fallback to default profile
    logger.warn(`Failed to load profile '${profileName}', using default`);
    profile = ProfileLoader.createDefault();
  }
  
  return profile;
}

/**
 * Setup pipeline stages based on profile and options
 */
async function setupPipelineStages(basePath, profile, options) {
  const stages = [];
  
  // 1. File Discovery Stage
  const FileDiscoveryStage = require('../pipeline/stages/FileDiscoveryStage');
  stages.push(new FileDiscoveryStage({
    basePath,
    patterns: profile.include || ['**/*'],
    respectGitignore: profile.options?.respectGitignore ?? true,
    includeHidden: profile.options?.includeHidden ?? false,
    followSymlinks: profile.options?.followSymlinks ?? false,
    maxFileSize: profile.options?.maxFileSize,
    maxTotalSize: profile.options?.maxTotalSize,
    maxFileCount: profile.options?.maxFileCount
  }));
  
  // 2. Git Filter Stage (if --modified or --changed is used)
  if (options.modified || options.changed) {
    const GitFilterStage = require('../pipeline/stages/GitFilterStage');
    stages.push(new GitFilterStage({
      basePath,
      modified: options.modified,
      changed: options.changed,
      withGitStatus: options.withGitStatus
    }));
  }
  
  // 3. AI Filter Stage (if --ai-filter is used)
  if (options.aiFilter) {
    const AIFilterStage = require('../pipeline/stages/AIFilterStage');
    stages.push(new AIFilterStage({
      query: options.aiFilter
    }));
  }
  
  // 4. Profile Filter Stage (applies exclude patterns)
  const ProfileFilterStage = require('../pipeline/stages/ProfileFilterStage');
  stages.push(new ProfileFilterStage({
    exclude: profile.exclude || [],
    filter: profile.filter || []
  }));
  
  // 5. External Source Stage (if external sources are configured)
  if (profile.external && profile.external.length > 0) {
    const ExternalSourceStage = require('../pipeline/stages/ExternalSourceStage');
    stages.push(new ExternalSourceStage(profile.external));
  }
  
  // 6. Limit Stage (if --head option is used)
  if (options.head) {
    const LimitStage = require('../pipeline/stages/LimitStage');
    stages.push(new LimitStage({
      limit: parseInt(options.head)
    }));
  }
  
  // 7. File Loading Stage (skip if --only-tree)
  if (!options.onlyTree) {
    const FileLoadingStage = require('../pipeline/stages/FileLoadingStage');
    stages.push(new FileLoadingStage({
      encoding: 'utf8'
    }));
    
    // 8. Transformer Stage
    const TransformStage = require('../pipeline/stages/TransformStage');
    const registry = TransformerRegistry.createDefault();
    stages.push(new TransformStage({
      registry,
      transformers: profile.transformers || {}
    }));
  }
  
  // 9. Character Limit Stage (if --char-limit option is used)
  if (options.charLimit) {
    const CharLimitStage = require('../pipeline/stages/CharLimitStage');
    stages.push(new CharLimitStage({
      limit: parseInt(options.charLimit)
    }));
  }
  
  // 10. Output Formatting Stage
  // Determine output format (default to tree if --only-tree is used)
  const outputFormat = options.format || (options.onlyTree ? 'tree' : (profile.output?.format || 'xml'));
  
  // Use streaming stage for stream option or large outputs
  if (options.stream || (profile.options?.streaming ?? false)) {
    const StreamingOutputStage = require('../pipeline/stages/StreamingOutputStage');
    const fs = require('fs');
    
    let outputStream = process.stdout;
    if (options.output) {
      outputStream = fs.createWriteStream(options.output);
    }
    
    stages.push(new StreamingOutputStage({
      format: outputFormat,
      addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
      prettyPrint: profile.output?.prettyPrint ?? true,
      outputStream
    }));
  } else {
    const OutputFormattingStage = require('../pipeline/stages/OutputFormattingStage');
    stages.push(new OutputFormattingStage({
      format: outputFormat,
      addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
      prettyPrint: profile.output?.prettyPrint ?? true,
      includeMetadata: profile.output?.includeMetadata ?? true,
      showSize: options.showSize,
      onlyTree: options.onlyTree
    }));
  }
  
  return stages;
}

/**
 * Setup progress tracking for pipeline
 */
function setupProgressTracking(pipeline) {
  let stageIndex = 0;
  const stageNames = [
    'Discovering files',
    'Applying git filters',
    'Applying profile filters',
    'Processing external sources',
    'Limiting files',
    'Loading content',
    'Transforming files',
    'Applying char limit',
    'Formatting output'
  ];
  
  pipeline.on('stage:start', ({ stage, index }) => {
    const stageName = stageNames[stageIndex++] || stage;
    logger.updateSpinner(stageName);
  });
  
  pipeline.on('stage:error', ({ stage, error }) => {
    logger.warn(`Stage ${stage} error: ${error.message}`);
  });
}

/**
 * Handle output based on options
 */
async function handleOutput(result, options) {
  // If streaming was used, output has already been handled
  if (result.streamed) {
    const fileCount = result.files.length;
    const totalSize = result.files.reduce((sum, file) => sum + (file.size || 0), 0);
    
    if (options.output) {
      logger.success(`Streamed ${fileCount} files [${logger.formatBytes(totalSize)}] to ${path.resolve(options.output)}`);
    } else {
      logger.success(`Streamed ${fileCount} files [${logger.formatBytes(totalSize)}]`);
    }
    return;
  }
  
  const output = result.output;
  
  if (!output) {
    throw new CommandError('No output generated', 'copy');
  }
  
  // Calculate output size
  const outputSize = Buffer.byteLength(output, 'utf8');
  const fileCount = result.files.length;
  
  // Handle --as-reference option
  if (options.asReference) {
    const format = options.format || 'xml';
    const extension = format === 'json' ? 'json' : 'xml';
    const tempFile = path.join(require('os').tmpdir(), `copytree-${Date.now()}.${extension}`);
    await fs.writeFile(tempFile, output, 'utf8');
    
    try {
      await Clipboard.copyFileReference(tempFile);
      logger.success(`Copied reference to temporary file: ${path.basename(tempFile)} [${logger.formatBytes(outputSize)}]`);
    } catch (error) {
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
    logger.success(`Copied ${fileCount} files [${logger.formatBytes(outputSize)}] to ${outputPath}`);
    
    // Reveal in Finder on macOS
    await Clipboard.revealInFinder(outputPath);
    
  } else if (options.display) {
    // Display to console
    console.log('\n' + output);
    logger.success(`Displayed ${fileCount} files [${logger.formatBytes(outputSize)}]`);
    
  } else if (options.stream) {
    // Stream to stdout (shouldn't reach here if streaming was properly used)
    process.stdout.write(output);
    
  } else {
    // Default: copy to clipboard
    try {
      await Clipboard.copyText(output);
      logger.success(`Copied ${fileCount} files [${logger.formatBytes(outputSize)}] to clipboard.`);
    } catch (error) {
      // If clipboard fails, save to temporary file
      const format = options.format || 'xml';
      const extension = format === 'json' ? 'json' : 'xml';
      const tempFile = path.join(require('os').tmpdir(), `copytree-${Date.now()}.${extension}`);
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
  
  if (result.errors && result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
  }
}

module.exports = copyCommand;