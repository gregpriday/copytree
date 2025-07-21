const chokidar = require('chokidar');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const copyCommand = require('./copy');

/**
 * Watch command - Watch directory for changes and regenerate output
 */
async function watchCommand(watchPath, options = {}) {
  const startTime = Date.now();
  const basePath = watchPath || process.cwd();
  
  try {
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
    
    // Initialize state
    let isProcessing = false;
    let pendingChanges = new Set();
    let changeTimer = null;
    let runCount = 0;
    
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
      await runCopy(basePath, options, ++runCount);
      console.log();
    }
    
    // Configure watch options
    const watchOptions = {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: options.followSymlinks || false,
      depth: options.depth,
      interval: options.pollInterval || 1000,
      binaryInterval: options.binaryInterval || 3000,
      ignored: getIgnorePatterns(options),
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
          await runCopy(basePath, options, ++runCount);
          console.log(chalk.green('✓ Copy completed\n'));
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
 * Get ignore patterns for file watching
 */
function getIgnorePatterns(options) {
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

module.exports = watchCommand;