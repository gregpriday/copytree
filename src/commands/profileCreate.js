const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Profile create command - Create new profile by scanning project
 */
async function profileCreateCommand(path, options) {
  logger.error('Profile create command not yet implemented');
  throw new CommandError('Profile create command is not yet implemented', 'profile:create');
}

module.exports = profileCreateCommand;