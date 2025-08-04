const { CacheService } = require('../services/CacheService');
const { logger } = require('../utils/logger');
const { config } = require('../config/ConfigManager');
const { CommandError } = require('../utils/errors');

/**
 * Clear cache command
 * (Now handled by ValidationView component)
 */
async function clearCommand(_options = {}) {
  // All cache clearing is now handled by the ValidationView component
  // This function is kept for backward compatibility
  return {
    success: true,
    message: 'Cache clearing handled by UI component',
  };
}

/**
 * Show cache status and statistics
 * (Function kept for backwards compatibility but no longer used for console output)
 */
async function showCacheStatus() {
  try {
    const cache = new CacheService();
    const fs = require('fs-extra');
    const path = require('path');
    
    const status = {
      enabled: config().get('cache.enabled', true),
      driver: config().get('cache.driver', 'file'),
      path: cache.cachePath,
      entries: 0,
      totalSize: 0,
      byType: {
        transform: 0,
        ai: 0,
        git: 0,
        profile: 0,
        other: 0,
      },
    };
    
    if (config().get('cache.driver') === 'file' && await fs.pathExists(cache.cachePath)) {
      const files = await fs.readdir(cache.cachePath);
      const cacheFiles = files.filter((f) => f.endsWith(cache.extension));
      
      status.entries = cacheFiles.length;
      
      for (const file of cacheFiles) {
        const stats = await fs.stat(path.join(cache.cachePath, file));
        status.totalSize += stats.size;
        
        if (file.includes('_transform_')) status.byType.transform++;
        else if (file.includes('_ai_')) status.byType.ai++;
        else if (file.includes('_git_')) status.byType.git++;
        else if (file.includes('_profile_')) status.byType.profile++;
        else status.byType.other++;
      }
    }
    
    return status;
    
  } catch (error) {
    logger.error('Failed to get cache status:', error.message);
    return null;
  }
}

module.exports = clearCommand;