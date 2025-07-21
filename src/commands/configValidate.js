const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const joi = require('joi');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const { config, ConfigManager } = require('../config/ConfigManager');

/**
 * Config validate command - Validate application configuration
 */
async function configValidateCommand(options = {}) {
  try {
    console.log(chalk.bold('\nValidating CopyTree Configuration\n'));
    
    let hasErrors = false;
    const warnings = [];
    const configManager = config();
    
    // Step 1: Check config directories
    console.log(chalk.blue('Checking configuration directories...'));
    
    const defaultConfigPath = path.join(__dirname, '../../config');
    const userConfigPath = path.join(os.homedir(), '.copytree');
    
    // Check default config directory
    if (await fs.pathExists(defaultConfigPath)) {
      console.log(chalk.green('✓') + ` Default config directory exists: ${defaultConfigPath}`);
    } else {
      console.log(chalk.red('✗') + ` Default config directory missing: ${defaultConfigPath}`);
      hasErrors = true;
    }
    
    // Check user config directory
    if (await fs.pathExists(userConfigPath)) {
      console.log(chalk.green('✓') + ` User config directory exists: ${userConfigPath}`);
    } else {
      console.log(chalk.yellow('⚠') + ` User config directory not found: ${userConfigPath}`);
      warnings.push('User config directory does not exist (this is normal if no custom configs)');
    }
    
    // Step 2: Validate individual config modules
    console.log(chalk.blue('\nValidating configuration modules...'));
    
    const configModules = ['ai', 'app', 'cache', 'copytree', 'state'];
    
    for (const moduleName of configModules) {
      try {
        const moduleConfig = configManager.get(moduleName);
        
        if (!moduleConfig) {
          console.log(chalk.red('✗') + ` Config module '${moduleName}' not loaded`);
          hasErrors = true;
          continue;
        }
        
        console.log(chalk.green('✓') + ` Config module '${moduleName}' loaded successfully`);
        
        // Validate specific modules
        switch (moduleName) {
          case 'ai':
            validateAIConfig(moduleConfig, warnings);
            break;
          case 'copytree':
            validateCopytreeConfig(moduleConfig, warnings);
            break;
          case 'cache':
            validateCacheConfig(moduleConfig, warnings);
            break;
        }
        
      } catch (error) {
        console.log(chalk.red('✗') + ` Failed to validate '${moduleName}': ${error.message}`);
        hasErrors = true;
      }
    }
    
    // Step 3: Check environment variables
    console.log(chalk.blue('\nChecking environment variables...'));
    
    const envVars = {
      'GEMINI_API_KEY': { required: false, type: 'ai' },
      'COPYTREE_MAX_FILE_SIZE': { required: false, type: 'size' },
      'COPYTREE_MAX_TOTAL_SIZE': { required: false, type: 'size' },
      'COPYTREE_CACHE_TTL': { required: false, type: 'number' }
    };
    
    for (const [envVar, config] of Object.entries(envVars)) {
      const value = process.env[envVar];
      
      if (value) {
        console.log(chalk.green('✓') + ` ${envVar} is set`);
        
        // Validate type
        if (config.type === 'number' && isNaN(parseInt(value))) {
          warnings.push(`${envVar} should be a number, got: ${value}`);
        }
      } else if (config.required) {
        console.log(chalk.red('✗') + ` ${envVar} is required but not set`);
        hasErrors = true;
      } else {
        if (config.type === 'ai' && envVar.includes('API_KEY')) {
          warnings.push(`${envVar} not set - AI features will not work`);
        }
      }
    }
    
    // Step 4: Test configuration access
    console.log(chalk.blue('\nTesting configuration access...'));
    
    try {
      // Test getting nested config values
      const testPaths = [
        'copytree.defaultExclusions',
        'ai.provider',
        'cache.enabled',
        'app.name'
      ];
      
      for (const testPath of testPaths) {
        const value = configManager.get(testPath);
        if (value !== undefined && value !== null) {
          console.log(chalk.green('✓') + ` Can access config: ${testPath}`);
        } else {
          console.log(chalk.yellow('⚠') + ` Config path empty or undefined: ${testPath}`);
        }
      }
      
    } catch (error) {
      console.log(chalk.red('✗') + ` Failed to access configuration: ${error.message}`);
      hasErrors = true;
    }
    
    // Display warnings
    if (warnings.length > 0) {
      console.log(chalk.yellow('\n⚠ Warnings:'));
      warnings.forEach(warning => {
        console.log(chalk.yellow(`  - ${warning}`));
      });
    }
    
    // Show current configuration if verbose
    if (options.verbose || options.show) {
      console.log(chalk.bold('\nCurrent Configuration:'));
      const allConfig = configManager.all();
      
      for (const [module, config] of Object.entries(allConfig)) {
        console.log(chalk.bold(`\n${module}:`));
        displayConfigObject(config, '  ');
      }
    }
    
    // Final summary
    console.log();
    if (!hasErrors && warnings.length === 0) {
      console.log(chalk.green.bold('✓ Configuration is valid with no issues'));
    } else if (!hasErrors && warnings.length > 0) {
      console.log(chalk.yellow.bold(`✓ Configuration is valid with ${warnings.length} warning(s)`));
    } else {
      console.log(chalk.red.bold('✗ Configuration validation failed'));
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('Failed to validate configuration', { 
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Failed to validate configuration: ${error.message}`,
      'config:validate'
    );
  }
}

/**
 * Validate AI configuration
 */
function validateAIConfig(config, warnings) {
  if (!config.provider) {
    warnings.push('No AI provider configured');
  }
  
  if (config.provider === 'gemini' && !config.gemini?.apiKey) {
    warnings.push('Gemini provider selected but no API key configured');
  }
  
  if (!config.cacheEnabled) {
    warnings.push('AI caching is disabled - this may increase API costs');
  }
}

/**
 * Validate copytree configuration
 */
function validateCopytreeConfig(config, warnings) {
  if (config.maxFileSize && config.maxFileSize < 1024) {
    warnings.push('maxFileSize is very small (< 1KB)');
  }
  
  if (config.maxFileCount && config.maxFileCount < 10) {
    warnings.push('maxFileCount is very low (< 10)');
  }
  
  if (!config.defaultExclusions || config.defaultExclusions.length === 0) {
    warnings.push('No default exclusions configured');
  }
}

/**
 * Validate cache configuration
 */
function validateCacheConfig(config, warnings) {
  if (!config.enabled) {
    warnings.push('Caching is disabled - this may impact performance');
  }
  
  if (config.ttl && config.ttl < 60) {
    warnings.push('Cache TTL is very short (< 1 minute)');
  }
}

/**
 * Display configuration object recursively
 */
function displayConfigObject(obj, indent = '') {
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      console.log(`${indent}${key}:`);
      displayConfigObject(value, indent + '  ');
    } else if (Array.isArray(value)) {
      console.log(`${indent}${key}: [${value.length} items]`);
      if (value.length > 0 && value.length <= 5) {
        value.forEach(item => {
          console.log(`${indent}  - ${item}`);
        });
      }
    } else {
      // Mask sensitive values
      let displayValue = value;
      if (key.toLowerCase().includes('key') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password')) {
        displayValue = value ? '***' : '(not set)';
      }
      console.log(`${indent}${key}: ${displayValue}`);
    }
  }
}

module.exports = configValidateCommand;