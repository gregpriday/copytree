const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const { McpServer } = require('../mcp/McpServer');

/**
 * MCP command - Start CopyTree MCP server
 */
async function mcpCommand(directory, options) {
  const workingDirectory = directory || process.cwd();
  
  try {
    logger.info('Starting CopyTree MCP server', {
      directory: workingDirectory,
      port: options.port || 'stdio'
    });
    
    // Create and start MCP server
    const server = new McpServer({
      workingDirectory,
      port: options.port,
      debug: options.debug || false
    });
    
    await server.start();
    
    // Keep the process running
    process.stdin.resume();
    
    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down MCP server...');
      await server.stop();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    logger.error('MCP server failed', { 
      error: error.message,
      stack: error.stack 
    });
    throw new CommandError(
      `MCP server failed: ${error.message}`,
      'mcp'
    );
  }
}

module.exports = mcpCommand;