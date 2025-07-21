const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * Copy docs command - Copy profile documentation
 */
async function copyDocsCommand(options) {
  logger.error('Copy docs command not yet implemented');
  throw new CommandError('Copy docs command is not yet implemented', 'copy:docs');
}

module.exports = copyDocsCommand;