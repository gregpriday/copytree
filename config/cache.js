const { env } = require('../src/config/ConfigManager');

module.exports = {
  // Cache driver
  driver: env('CACHE_DRIVER', 'file'), // file, memory, redis
  
  // General cache settings
  enabled: env('CACHE_ENABLED', true),
  prefix: env('CACHE_PREFIX', 'copytree_'),
  defaultTtl: env('CACHE_DEFAULT_TTL', 3600), // 1 hour in seconds
  
  // File cache settings
  file: {
    path: env('CACHE_FILE_PATH', '.copytree-cache'),
    extension: env('CACHE_FILE_EXTENSION', '.cache'),
    umask: env('CACHE_FILE_UMASK', 0o644),
    gcProbability: env('CACHE_FILE_GC_PROBABILITY', 0.01), // 1% chance of GC on write
  },
  
  // Memory cache settings
  memory: {
    max: env('CACHE_MEMORY_MAX', 100), // Maximum number of items
    maxAge: env('CACHE_MEMORY_MAX_AGE', 3600000), // 1 hour in ms
    updateAgeOnGet: env('CACHE_MEMORY_UPDATE_AGE', false),
  },
  
  // Transformation cache
  transformations: {
    enabled: env('CACHE_TRANSFORMATIONS_ENABLED', true),
    ttl: env('CACHE_TRANSFORMATIONS_TTL', 86400), // 24 hours
    maxSize: env('CACHE_TRANSFORMATIONS_MAX_SIZE', 500 * 1024 * 1024), // 500MB
    
    // Specific transformer cache settings
    pdf: {
      enabled: env('CACHE_PDF_ENABLED', true),
      ttl: env('CACHE_PDF_TTL', 604800), // 7 days
    },
    image: {
      enabled: env('CACHE_IMAGE_ENABLED', true),
      ttl: env('CACHE_IMAGE_TTL', 604800), // 7 days
    },
    code: {
      enabled: env('CACHE_CODE_ENABLED', true),
      ttl: env('CACHE_CODE_TTL', 86400), // 1 day
    },
  },
  
  // AI response cache
  ai: {
    enabled: env('CACHE_AI_ENABLED', true),
    ttl: env('CACHE_AI_TTL', 86400), // 24 hours
    keyStrategy: env('CACHE_AI_KEY_STRATEGY', 'hash'), // hash, full
  },
  
  // Git cache
  git: {
    enabled: env('CACHE_GIT_ENABLED', true),
    ttl: env('CACHE_GIT_TTL', 300), // 5 minutes
    statusTtl: env('CACHE_GIT_STATUS_TTL', 60), // 1 minute
  },
  
  // Profile detection cache
  profiles: {
    enabled: env('CACHE_PROFILES_ENABLED', true),
    ttl: env('CACHE_PROFILES_TTL', 3600), // 1 hour
  },
  
  // Clear cache commands
  clearCommands: {
    all: 'clear:cache',
    transformations: 'clear:cache --transformations',
    ai: 'clear:cache --ai',
    git: 'clear:cache --git',
  },
};