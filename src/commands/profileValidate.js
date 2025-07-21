const chalk = require('chalk');
const { logger } = require('../utils/logger');
const { CommandError, ProfileError } = require('../utils/errors');
const ProfileLoader = require('../profiles/ProfileLoader');

/**
 * Profile validate command - Validate profile syntax and structure
 */
async function profileValidateCommand(profile, options) {
  if (!profile) {
    throw new CommandError(
      'Profile name or path is required',
      'profile:validate'
    );
  }

  try {
    const profileLoader = new ProfileLoader();
    let loadedProfile;
    let validationPassed = true;
    
    console.log(chalk.bold(`\nValidating profile: ${profile}\n`));
    
    // Step 1: Try to load the profile
    try {
      loadedProfile = await profileLoader.load(profile, {});
      console.log(chalk.green('✓') + ' Profile loaded successfully');
    } catch (error) {
      console.log(chalk.red('✗') + ' Failed to load profile');
      console.log(chalk.red(`  ${error.message}`));
      validationPassed = false;
      
      if (error instanceof ProfileError && error.details) {
        if (error.details.searchPaths) {
          console.log(chalk.gray('\n  Searched in:'));
          error.details.searchPaths.forEach(path => {
            console.log(chalk.gray(`    - ${path}`));
          });
        }
        if (error.details.validationError) {
          console.log(chalk.red('\n  Validation errors:'));
          error.details.validationError.forEach(detail => {
            console.log(chalk.red(`    - ${detail.message}`));
          });
        }
      }
      
      // Can't continue if profile won't load
      if (!options.force) {
        return;
      }
    }
    
    if (loadedProfile) {
      // Step 2: Check profile structure
      console.log(chalk.green('✓') + ' Profile structure is valid');
      
      // Step 3: Check for warnings
      const warnings = [];
      
      // Check for common issues
      if (!loadedProfile.description) {
        warnings.push('No description provided');
      }
      
      if (!loadedProfile.version) {
        warnings.push('No version specified');
      }
      
      if (loadedProfile.include && loadedProfile.include.length === 0) {
        warnings.push('Include patterns list is empty');
      }
      
      if (loadedProfile.options?.maxFileSize && loadedProfile.options.maxFileSize < 1024) {
        warnings.push('maxFileSize is very small (< 1KB)');
      }
      
      if (loadedProfile.options?.maxFileCount && loadedProfile.options.maxFileCount < 10) {
        warnings.push('maxFileCount is very low (< 10)');
      }
      
      // Display warnings
      if (warnings.length > 0) {
        console.log(chalk.yellow('\n⚠ Warnings:'));
        warnings.forEach(warning => {
          console.log(chalk.yellow(`  - ${warning}`));
        });
      }
      
      // Step 4: Show profile details
      if (options.verbose || options.show) {
        console.log(chalk.bold('\nProfile Details:'));
        console.log(`  Name: ${loadedProfile.name}`);
        console.log(`  Description: ${loadedProfile.description || 'N/A'}`);
        console.log(`  Version: ${loadedProfile.version || 'N/A'}`);
        
        if (loadedProfile.extends) {
          console.log(`  Extends: ${loadedProfile.extends}`);
        }
        
        if (loadedProfile._source) {
          console.log(`  Source: ${loadedProfile._source}`);
        }
        
        console.log(chalk.bold('\nFile Selection:'));
        if (loadedProfile.include && loadedProfile.include.length > 0) {
          console.log(`  Include patterns: ${loadedProfile.include.join(', ')}`);
        }
        if (loadedProfile.exclude && loadedProfile.exclude.length > 0) {
          console.log(`  Exclude patterns: ${loadedProfile.exclude.join(', ')}`);
        }
        if (loadedProfile.filter && loadedProfile.filter.length > 0) {
          console.log(`  Filter patterns: ${loadedProfile.filter.join(', ')}`);
        }
        
        if (loadedProfile.options) {
          console.log(chalk.bold('\nOptions:'));
          Object.entries(loadedProfile.options).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }
        
        if (loadedProfile.transformers) {
          console.log(chalk.bold('\nTransformers:'));
          Object.entries(loadedProfile.transformers).forEach(([name, config]) => {
            const status = config.enabled ? chalk.green('enabled') : chalk.red('disabled');
            console.log(`  ${name}: ${status}`);
            if (config.options && Object.keys(config.options).length > 0) {
              console.log(`    Options: ${JSON.stringify(config.options)}`);
            }
          });
        }
        
        if (loadedProfile.output) {
          console.log(chalk.bold('\nOutput Settings:'));
          Object.entries(loadedProfile.output).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }
      }
      
      // Final summary
      console.log();
      if (validationPassed && warnings.length === 0) {
        console.log(chalk.green.bold('✓ Profile is valid with no issues'));
      } else if (validationPassed && warnings.length > 0) {
        console.log(chalk.yellow.bold(`✓ Profile is valid with ${warnings.length} warning(s)`));
      } else {
        console.log(chalk.red.bold('✗ Profile validation failed'));
      }
    }
    
  } catch (error) {
    logger.error('Failed to validate profile', { 
      profile, 
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `Failed to validate profile: ${error.message}`,
      'profile:validate'
    );
  }
}

module.exports = profileValidateCommand;