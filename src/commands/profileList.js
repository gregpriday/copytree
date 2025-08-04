const { logger } = require('../utils/logger');
const { CommandError } = require('../utils/errors');
// const ProfileLoader = require('../profiles/ProfileLoader'); // Currently unused

/**
 * Profile list command - List all available profiles
 * (Now handled by ProfileListView component)
 */
async function profileListCommand(_options) {
  // All profile listing is now handled by the ProfileListView component
  // This function is kept for backward compatibility
  return {
    success: true,
    message: 'Profile listing handled by UI component',
  };
}

module.exports = profileListCommand;