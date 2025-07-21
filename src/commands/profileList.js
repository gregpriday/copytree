const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Profile list command - List all available profiles
 */
async function profileListCommand(options) {
  logger.error('Profile list command not yet implemented');
  throw new CommandError('Profile list command is not yet implemented', 'profile:list');
}

module.exports = profileListCommand;