const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Cache clear command - Clear all caches
 */
async function cacheClearCommand(options) {
  logger.error('Cache clear command not yet implemented');
  throw new CommandError('Cache clear command is not yet implemented', 'cache:clear');
}

module.exports = cacheClearCommand;