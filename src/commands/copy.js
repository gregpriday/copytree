const Pipeline = require('../pipeline/Pipeline');
const ProfileLoader = require('../profiles/ProfileLoader');
const FileDiscovery = require('../utils/FileDiscovery');
const TransformerRegistry = require('../transforms/TransformerRegistry');
const { logger } = require('../utils/logger');
const { CommandError, handleError } = require('../utils/errors');
const { config } = require('../config/ConfigManager');
const clipboardy = require('clipboardy');
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
    
    // 7. Handle output
    await handleOutput(result, options);
    
    // 8. Show summary
    if (options.info || options.display) {
      showSummary(result, startTime);
    }
    
    logger.success('Copy completed successfully!');
    
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
  
  // 2. Profile Filter Stage (applies exclude patterns)
  const ProfileFilterStage = require('../pipeline/stages/ProfileFilterStage');
  stages.push(new ProfileFilterStage({
    exclude: profile.exclude || [],
    filter: profile.filter || []
  }));
  
  // 3. Limit Stage (if --head option is used)
  if (options.head) {
    const LimitStage = require('../pipeline/stages/LimitStage');
    stages.push(new LimitStage({
      limit: parseInt(options.head)
    }));
  }
  
  // 4. File Loading Stage
  const FileLoadingStage = require('../pipeline/stages/FileLoadingStage');
  stages.push(new FileLoadingStage({
    encoding: 'utf8'
  }));
  
  // 5. Transformer Stage
  const TransformStage = require('../pipeline/stages/TransformStage');
  const registry = TransformerRegistry.createDefault();
  stages.push(new TransformStage({
    registry,
    transformers: profile.transformers || {}
  }));
  
  // 6. Character Limit Stage (if --char-limit option is used)
  if (options.charLimit) {
    const CharLimitStage = require('../pipeline/stages/CharLimitStage');
    stages.push(new CharLimitStage({
      limit: parseInt(options.charLimit)
    }));
  }
  
  // 7. Output Formatting Stage
  const OutputFormattingStage = require('../pipeline/stages/OutputFormattingStage');
  stages.push(new OutputFormattingStage({
    format: profile.output?.format || 'xml',
    addLineNumbers: options.withLineNumbers || profile.output?.addLineNumbers,
    prettyPrint: profile.output?.prettyPrint ?? true,
    includeMetadata: profile.output?.includeMetadata ?? true,
    showSize: options.showSize
  }));
  
  return stages;
}

/**
 * Setup progress tracking for pipeline
 */
function setupProgressTracking(pipeline) {
  let stageIndex = 0;
  const stageNames = [
    'Discovering files',
    'Applying filters',
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
  const output = result.output;
  
  if (!output) {
    throw new CommandError('No output generated', 'copy');
  }
  
  // Determine output destination
  if (options.output) {
    // Write to file
    const outputPath = path.resolve(options.output);
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, output, 'utf8');
    logger.success(`Output written to: ${outputPath}`);
    
  } else if (options.display) {
    // Display to console
    console.log('\n' + output);
    
  } else if (options.stream) {
    // Stream to stdout
    process.stdout.write(output);
    
  } else {
    // Default: copy to clipboard
    try {
      await clipboardy.write(output);
      logger.success('Output copied to clipboard!');
    } catch (error) {
      logger.warn('Failed to copy to clipboard, displaying instead');
      console.log('\n' + output);
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