const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');

/**
 * MCP command - Start CopyTree MCP server
 */
async function mcpCommand(options) {
  logger.error('MCP command not yet implemented');
  throw new CommandError('MCP command is not yet implemented', 'mcp');
}

module.exports = mcpCommand;