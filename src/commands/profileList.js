const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
const ProfileLoader = require('../profiles/ProfileLoader');

/**
 * Profile list command - List all available profiles
 * (Now handled by ProfileListView component)
 */
async function profileListCommand(options) {
  try {
    // All profile listing is now handled by the ProfileListView component
    // This function is kept for backward compatibility
    return {
      success: true,
      message: 'Profile listing handled by UI component'
    };
    
  } catch (error) {
    logger.error('Failed to list profiles', { error: error.message });
    throw new CommandError(
      `Failed to list profiles: ${error.message}`,
      'profile:list'
    );
  }
}

module.exports = profileListCommand;