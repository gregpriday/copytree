import { env } from '../src/config/ConfigManager.js';

export default {
  // State directory
  path: env('STATE_PATH', '.copytree-state'),
  
  // Conversation management
  maxMessages: env('STATE_MAX_MESSAGES', 50),
  ttl: env('STATE_TTL', 86400), // 24 hours in seconds
  
  // Conversation state management
  conversation: {
    // History settings
    historyLimit: env('STATE_HISTORY_LIMIT', 10), // Number of exchanges to keep
    summaryLength: env('STATE_SUMMARY_LENGTH', 500), // Characters for summary
    
    // Storage
    storageDriver: env('STATE_STORAGE_DRIVER', 'file'), // file, memory
    storagePath: env('STATE_STORAGE_PATH', '.copytree-state'),
    
    // Garbage collection
    gcEnabled: env('STATE_GC_ENABLED', true),
    gcInterval: env('STATE_GC_INTERVAL', 86400), // 24 hours
    gcMaxAge: env('STATE_GC_MAX_AGE', 604800), // 7 days
    
    // Session management
    sessionTimeout: env('STATE_SESSION_TIMEOUT', 3600), // 1 hour
    sessionExtendOnActivity: env('STATE_SESSION_EXTEND', true),
  },
  
  // Pipeline state
  pipeline: {
    trackProgress: env('STATE_PIPELINE_TRACK', true),
    emitEvents: env('STATE_PIPELINE_EVENTS', true),
    saveCheckpoints: env('STATE_PIPELINE_CHECKPOINTS', false),
  },
  
  // File processing state
  fileProcessing: {
    trackProcessed: env('STATE_FILE_TRACK', true),
    saveErrors: env('STATE_FILE_ERRORS', true),
    resumable: env('STATE_FILE_RESUMABLE', false),
  },
  
  // State serialization
  serialization: {
    format: env('STATE_FORMAT', 'json'), // json, yaml
    pretty: env('STATE_PRETTY', true),
    compress: env('STATE_COMPRESS', false),
  },
};