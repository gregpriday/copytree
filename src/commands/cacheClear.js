const { CacheService } = require('../services/CacheService');
const { logger } = require('../utils/logger');
const { config } = require('../config/ConfigManager');
const { CommandError, handleError } = require('../utils/errors');

/**
 * Clear cache command
 * Clears various caches used by CopyTree
 */
async function clearCommand(options = {}) {
  try {
    logger.startSpinner('Clearing cache...');
    
    let totalCleared = 0;
    const cache = new CacheService();
    
    // Determine what to clear
    const clearAll = !options.transformations && !options.ai && !options.git && !options.profiles;
    
    if (clearAll || options.transformations) {
      logger.updateSpinner('Clearing transformation cache...');
      const cleared = await cache.clear('copytree_transform_');
      totalCleared += cleared;
      logger.info(`✓ Cleared ${cleared} transformation cache entries`);
    }
    
    if (clearAll || options.ai) {
      logger.updateSpinner('Clearing AI response cache...');
      const cleared = await cache.clear('copytree_ai_');
      totalCleared += cleared;
      logger.info(`✓ Cleared ${cleared} AI cache entries`);
    }
    
    if (clearAll || options.git) {
      logger.updateSpinner('Clearing git cache...');
      const cleared = await cache.clear('copytree_git_');
      totalCleared += cleared;
      logger.info(`✓ Cleared ${cleared} git cache entries`);
    }
    
    if (clearAll || options.profiles) {
      logger.updateSpinner('Clearing profile detection cache...');
      const cleared = await cache.clear('copytree_profile_');
      totalCleared += cleared;
      logger.info(`✓ Cleared ${cleared} profile cache entries`);
    }
    
    // Run garbage collection if requested
    if (options.gc) {
      logger.updateSpinner('Running garbage collection...');
      const removed = await cache.runGarbageCollection();
      logger.info(`✓ Removed ${removed} expired cache entries`);
    }
    
    logger.succeedSpinner(`Cache cleared! Total entries removed: ${totalCleared}`);
    
    // Show cache status if requested
    if (options.status) {
      await showCacheStatus();
    }
    
  } catch (error) {
    logger.stopSpinner();
    handleError(error, {
      exit: true,
      verbose: options.verbose || config().get('app.verboseErrors', false)
    });
  }
}

/**
 * Show cache status and statistics
 */
async function showCacheStatus() {
  try {
    const cache = new CacheService();
    const fs = require('fs-extra');
    const path = require('path');
    
    console.log('\n📊 Cache Status:');
    console.log(`  Cache enabled: ${config().get('cache.enabled', true) ? 'Yes' : 'No'}`);
    console.log(`  Cache driver: ${config().get('cache.driver', 'file')}`);
    console.log(`  Cache path: ${cache.cachePath}`);
    
    if (config().get('cache.driver') === 'file' && await fs.pathExists(cache.cachePath)) {
      const files = await fs.readdir(cache.cachePath);
      const cacheFiles = files.filter(f => f.endsWith(cache.extension));
      
      let totalSize = 0;
      let byType = {
        transform: 0,
        ai: 0,
        git: 0,
        profile: 0,
        other: 0
      };
      
      for (const file of cacheFiles) {
        const stats = await fs.stat(path.join(cache.cachePath, file));
        totalSize += stats.size;
        
        if (file.includes('_transform_')) byType.transform++;
        else if (file.includes('_ai_')) byType.ai++;
        else if (file.includes('_git_')) byType.git++;
        else if (file.includes('_profile_')) byType.profile++;
        else byType.other++;
      }
      
      console.log(`  Total entries: ${cacheFiles.length}`);
      console.log(`  Total size: ${logger.formatBytes(totalSize)}`);
      console.log('\n  Entries by type:');
      console.log(`    Transformations: ${byType.transform}`);
      console.log(`    AI responses: ${byType.ai}`);
      console.log(`    Git data: ${byType.git}`);
      console.log(`    Profiles: ${byType.profile}`);
      if (byType.other > 0) {
        console.log(`    Other: ${byType.other}`);
      }
    }
    
  } catch (error) {
    logger.error('Failed to get cache status:', error.message);
  }
}

module.exports = clearCommand;