const chalk = require('chalk');
const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const ProfileLoader = require('../profiles/ProfileLoader');

/**
 * Profile list command - List all available profiles
 */
async function profileListCommand(options) {
  try {
    const profileLoader = new ProfileLoader();
    
    // Get all available profiles
    const profiles = await profileLoader.listAvailable();
    
    if (profiles.length === 0) {
      console.log(chalk.yellow('\nNo profiles found.'));
      console.log('\nProfile search locations:');
      console.log(`  - Project: .copytree/`);
      console.log(`  - User: ~/.copytree/profiles/`);
      console.log(`  - Built-in: (included with copytree)`);
      return;
    }
    
    // Group profiles by source
    const grouped = {
      'built-in': [],
      'user': [],
      'project': []
    };
    
    profiles.forEach(profile => {
      grouped[profile.source].push(profile);
    });
    
    // Display profiles
    console.log(chalk.bold('\nAvailable Profiles:\n'));
    
    // Built-in profiles
    if (grouped['built-in'].length > 0) {
      console.log(chalk.blue('Built-in Profiles:'));
      grouped['built-in'].forEach(profile => {
        console.log(`  ${chalk.bold(profile.name.padEnd(20))} ${chalk.gray(profile.description)}`);
      });
      console.log();
    }
    
    // User profiles
    if (grouped['user'].length > 0) {
      console.log(chalk.green('User Profiles:'));
      grouped['user'].forEach(profile => {
        console.log(`  ${chalk.bold(profile.name.padEnd(20))} ${chalk.gray(profile.description)}`);
      });
      console.log();
    }
    
    // Project profiles
    if (grouped['project'].length > 0) {
      console.log(chalk.magenta('Project Profiles:'));
      grouped['project'].forEach(profile => {
        console.log(`  ${chalk.bold(profile.name.padEnd(20))} ${chalk.gray(profile.description)}`);
      });
      console.log();
    }
    
    // Show usage hint
    console.log(chalk.gray('To use a profile: copytree --profile <name>\n'));
    
    // If verbose, show more details
    if (options.verbose) {
      console.log(chalk.bold('Profile Details:\n'));
      profiles.forEach(profile => {
        console.log(chalk.bold(`${profile.name}:`));
        console.log(`  Description: ${profile.description}`);
        console.log(`  Source: ${profile.source}`);
        console.log(`  Path: ${profile.path}`);
        if (profile.version) {
          console.log(`  Version: ${profile.version}`);
        }
        console.log();
      });
    }
    
  } catch (error) {
    logger.error('Failed to list profiles', { error: error.message });
    throw new CommandError(
      `Failed to list profiles: ${error.message}`,
      'profile:list'
    );
  }
}

module.exports = profileListCommand;