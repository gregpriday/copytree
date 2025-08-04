import { logger } from '../utils/logger.js';
import { CommandError } from '../utils/errors.js';
// import ProfileLoader from '../profiles/ProfileLoader.js'; // Currently unused

/**
 * Profile validate command - Validate profile syntax and structure
 * (Now handled by ValidationView component)
 */
async function profileValidateCommand(profile, _options) {
  try {
    // All validation is now handled by the ValidationView component
    // This function is kept for backward compatibility
    return {
      success: true,
      message: 'Validation handled by UI component',
      profile: profile || 'default',
    };
    
  } catch (error) {
    logger.error('Failed to validate profile', { 
      profile, 
      error: error.message,
      stack: error.stack, 
    });
    throw new CommandError(
      `Failed to validate profile: ${error.message}`,
      'profile:validate',
    );
  }
}

export default profileValidateCommand;