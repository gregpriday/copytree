const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Watch command - Watch directory for changes and regenerate output
 */
async function watchCommand(path, options) {
  logger.error('Watch command not yet implemented');
  throw new CommandError('Watch command is not yet implemented', 'watch');
}

module.exports = watchCommand;