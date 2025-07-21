const chokidar = require('chokidar');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const copyCommand = require('./copy');
const GitHubUrlHandler = require('../services/GitHubUrlHandler');
const ProfileLoader = require('../profiles/ProfileLoader');
const { execSync } = require('child_process');
const { AIService } = require('../services/AIService');
const Clipboard = require('../utils/clipboard');

/**
 * Watch command - Watch directory for changes and regenerate output
 */
async function watchCommand(watchPath, options = {}) {
  const startTime = Date.now();
  let basePath = watchPath || process.cwd();
  let isGitHubUrl = false;
  let githubHandler = null;
  
  try {
    // Handle GitHub URLs
    if (GitHubUrlHandler.isGitHubUrl(basePath)) {
      isGitHubUrl = true;
      githubHandler = new GitHubUrlHandler(basePath);
      basePath = await githubHandler.getFiles();
      console.log(chalk.blue(`Watching GitHub repository: ${watchPath}`));
      console.log(chalk.gray(`Local cache: ${basePath}\n`));
    }
    
    // Validate target directory
    if (!await fs.pathExists(basePath)) {
      throw new CommandError(
        `Watch target does not exist: ${basePath}`,
        'watch'
      );
    }
    
    console.log(chalk.blue.bold('CopyTree Watch Mode\n'));
    console.log(chalk.gray(`Watching: ${basePath}`));
    console.log(chalk.gray(`Started: ${new Date().toLocaleTimeString()}\n`));
    
    // Determine output file
    let outputPath = options.output;
    if (!outputPath) {
      outputPath = await generateOutputPath(basePath, options);
      console.log(chalk.gray(`Output file: ${outputPath}\n`));
    }
    
    // Initialize state
    let isProcessing = false;
    let pendingChanges = new Set();
    let changeTimer = null;
    let runCount = 0;
    const fileState = new Map(); // Track file modification times
    
    // Set up graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow('\n\nShutting down watch mode...'));
      if (watcher) {
        watcher.close();
      }
      if (changeTimer) {
        clearTimeout(changeTimer);
      }
      console.log(chalk.green('Watch mode stopped'));
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Run initial copy
    if (!options.skipInitial) {
      console.log(chalk.blue('Running initial copy...\n'));
      await runCopy(basePath, { ...options, output: outputPath }, ++runCount);
      console.log();
      
      // Initialize file state
      await updateFileState(basePath, fileState, options);
    }
    
    // Configure watch options
    const watchOptions = {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: options.followSymlinks || false,
      depth: options.depth,
      interval: options.pollInterval || 1000,
      binaryInterval: options.binaryInterval || 3000,
      ignored: await getIgnorePatterns(basePath, options),
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    };
    
    // Create watcher
    const watcher = chokidar.watch(basePath, watchOptions);
    
    // Handle file change events
    const handleChange = (eventType, filePath) => {
      if (isProcessing) {
        pendingChanges.add(filePath);
        return;
      }
      
      const relativePath = path.relative(basePath, filePath);
      const timestamp = new Date().toLocaleTimeString();
      
      // Log the change
      const eventColor = getEventColor(eventType);
      console.log(`${chalk.gray(timestamp)} ${eventColor(eventType.padEnd(7))} ${chalk.cyan(relativePath)}`);
      
      pendingChanges.add(filePath);
      
      // Debounce changes
      if (changeTimer) {
        clearTimeout(changeTimer);
      }
      
      changeTimer = setTimeout(async () => {
        if (pendingChanges.size === 0) return;
        
        const changedFiles = Array.from(pendingChanges);
        pendingChanges.clear();
        
        console.log(chalk.yellow(`\nDetected ${changedFiles.length} change(s), regenerating...\n`));
        
        try {
          isProcessing = true;
          await runCopy(basePath, { ...options, output: outputPath }, ++runCount);
          console.log(chalk.green('✓ Copy completed\n'));
          
          // Update file state after successful copy
          await updateFileState(basePath, fileState, options);
          
          // Reveal in Finder on macOS
          if (options.reveal !== false) {
            await Clipboard.revealInFinder(outputPath);
          }
        } catch (error) {
          console.log(chalk.red(`✗ Copy failed: ${error.message}\n`));
          logger.error('Watch copy failed', { error: error.message });
        } finally {
          isProcessing = false;
          
          // Process any pending changes that accumulated during processing
          if (pendingChanges.size > 0) {
            handleChange('pending', Array.from(pendingChanges)[0]);
          }
        }
      }, options.debounce || 500);
    };
    
    // Set up event listeners
    watcher
      .on('add', (filePath) => handleChange('added', filePath))
      .on('change', (filePath) => handleChange('changed', filePath))
      .on('unlink', (filePath) => handleChange('removed', filePath))
      .on('addDir', (dirPath) => {
        if (options.verbose) {
          handleChange('add dir', dirPath);
        }
      })
      .on('unlinkDir', (dirPath) => {
        if (options.verbose) {
          handleChange('rm dir', dirPath);
        }
      })
      .on('error', (error) => {
        console.log(chalk.red(`Watch error: ${error.message}`));
        logger.error('Watch error', { error: error.message });
      })
      .on('ready', () => {
        console.log(chalk.green('👀 Watching for changes... (Press Ctrl+C to stop)\n'));
        
        if (options.verbose) {
          console.log(chalk.gray('Watch configuration:'));
          console.log(chalk.gray(`  Debounce: ${options.debounce || 500}ms`));
          console.log(chalk.gray(`  Poll interval: ${watchOptions.interval}ms`));
          console.log(chalk.gray(`  Follow symlinks: ${watchOptions.followSymlinks}`));
          if (watchOptions.depth) {
            console.log(chalk.gray(`  Max depth: ${watchOptions.depth}`));
          }
          console.log();
        }
      });
    
    // Keep the process alive
    return new Promise(() => {
      // This promise never resolves, keeping the watch running
      // until the process is terminated
    });
    
  } catch (error) {
    logger.error('Watch command failed', { 
      path: basePath,
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Watch command failed: ${error.message}`,
      'watch'
    );
  }
}

/**
 * Run the copy command with current options
 */
async function runCopy(basePath, options, runCount) {
  const startTime = Date.now();
  
  try {
    // Prepare copy options
    const copyOptions = {
      ...options,
      // Remove watch-specific options
      skipInitial: undefined,
      debounce: undefined,
      pollInterval: undefined,
      binaryInterval: undefined,
      depth: undefined
    };
    
    // Run copy command
    await copyCommand(basePath, copyOptions);
    
    const duration = Date.now() - startTime;
    console.log(chalk.green(`Run #${runCount} completed in ${duration}ms`));
    
  } catch (error) {
    throw new CommandError(
      `Copy operation failed: ${error.message}`,
      'watch-copy'
    );
  }
}

/**
 * Get ignore patterns for file watching based on profile and gitignore
 */
async function getIgnorePatterns(basePath, options) {
  const patterns = [
    // Common directories to ignore
    '**/node_modules/**',
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.cache/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.copytree/**',
    
    // Common files to ignore
    '**/*.log',
    '**/*.tmp',
    '**/*.temp',
    '**/.DS_Store',
    '**/Thumbs.db',
    
    // IDE files
    '**/.idea/**',
    '**/.vscode/**',
    '**/*.swp',
    '**/*.swo',
    '**/*~'
  ];
  
  // Add profile-based excludes
  if (options.profile) {
    try {
      const profileLoader = new ProfileLoader();
      const profile = await profileLoader.load(options.profile);
      
      if (profile.exclude) {
        patterns.push(...profile.exclude);
      }
    } catch (error) {
      logger.warn('Failed to load profile for watch patterns', { error: error.message });
    }
  }
  
  // Add gitignore patterns if enabled
  if (options.respectGitignore !== false) {
    const gitignorePath = path.join(basePath, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      const gitignorePatterns = gitignoreContent
        .split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(pattern => pattern.trim());
      patterns.push(...gitignorePatterns);
    }
  }
  
  // Add custom ignore patterns
  if (options.ignore) {
    if (Array.isArray(options.ignore)) {
      patterns.push(...options.ignore);
    } else {
      patterns.push(options.ignore);
    }
  }
  
  return patterns;
}

/**
 * Get color for different event types
 */
function getEventColor(eventType) {
  switch (eventType) {
    case 'added':
      return chalk.green;
    case 'changed':
      return chalk.yellow;
    case 'removed':
      return chalk.red;
    case 'add dir':
      return chalk.blue;
    case 'rm dir':
      return chalk.magenta;
    default:
      return chalk.gray;
  }
}

/**
 * Generate output path using AI if not provided
 */
async function generateOutputPath(basePath, options) {
  try {
    const projectName = path.basename(basePath);
    const timestamp = new Date().toISOString().slice(0, 10);
    
    // Use AI to generate descriptive filename if API key is available
    if (process.env.GEMINI_API_KEY && options.aiFilename !== false) {
      try {
        const aiService = new AIService();
        const prompt = `Generate a short, descriptive filename for a copytree output of the "${projectName}" project. Return only the filename without extension, using kebab-case. Maximum 30 characters.`;
        
        const suggestion = await aiService.generate(prompt, { maxTokens: 50 });
        const cleanName = suggestion.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
        
        if (cleanName && cleanName.length > 0) {
          return path.join(process.cwd(), `${cleanName}-${timestamp}.xml`);
        }
      } catch (error) {
        logger.warn('Failed to generate AI filename', { error: error.message });
      }
    }
    
    // Fallback to standard naming
    return path.join(process.cwd(), `copytree-${projectName}-${timestamp}.xml`);
  } catch (error) {
    // Ultimate fallback
    return path.join(process.cwd(), `copytree-output.xml`);
  }
}

/**
 * Update file state tracking
 */
async function updateFileState(basePath, fileState, options) {
  fileState.clear();
  
  try {
    const { globby } = await import('globby');
    
    // Get patterns from profile if specified
    let includePatterns = ['**/*'];
    let excludePatterns = await getIgnorePatterns(basePath, options);
    
    if (options.profile) {
      try {
        const profileLoader = new ProfileLoader();
        const profile = await profileLoader.load(options.profile);
        
        if (profile.include) {
          includePatterns = profile.include;
        }
      } catch (error) {
        logger.warn('Failed to load profile for file state', { error: error.message });
      }
    }
    
    // Get all tracked files
    const files = await globby(includePatterns, {
      cwd: basePath,
      ignore: excludePatterns,
      dot: options.includeHidden || false,
      followSymbolicLinks: options.followSymlinks || false
    });
    
    // Store modification times
    for (const file of files) {
      const filePath = path.join(basePath, file);
      try {
        const stats = await fs.stat(filePath);
        fileState.set(file, stats.mtime.getTime());
      } catch (error) {
        // Ignore stat errors
      }
    }
    
    logger.info('File state initialized', { 
      trackedFiles: fileState.size,
      basePath 
    });
  } catch (error) {
    logger.error('Failed to update file state', { error: error.message });
  }
}

/**
 * Get directory state for comparison
 */
function getDirectoryState(fileState) {
  const state = {};
  for (const [file, mtime] of fileState) {
    state[file] = mtime;
  }
  return state;
}

module.exports = watchCommand;