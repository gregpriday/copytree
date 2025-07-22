const { env } = require('../src/config/ConfigManager');

module.exports = {
  // Gemini is the only supported provider
  provider: 'gemini',
  
  // Gemini configuration
  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    baseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1'),
    timeout: env('GEMINI_TIMEOUT', 60000),
    model: env('GEMINI_MODEL', 'gemini-2.5-flash'), // Single model for all operations
  },
  
  // Default parameters
  defaults: {
    temperature: env('AI_DEFAULT_TEMPERATURE', 0.7),
    maxTokens: env('AI_DEFAULT_MAX_TOKENS', 2048),
    topP: env('AI_DEFAULT_TOP_P', 0.95),
    topK: env('AI_DEFAULT_TOP_K', 40),
    stream: env('AI_DEFAULT_STREAM', false),
  },
  
  // Task-specific parameters (using the same model for all tasks)
  tasks: {
    summarization: {
      temperature: env('AI_SUMMARIZATION_TEMPERATURE', 0.3),
      maxTokens: env('AI_SUMMARIZATION_MAX_TOKENS', 1024),
    },
    
    classification: {
      temperature: env('AI_CLASSIFICATION_TEMPERATURE', 0.1),
      maxTokens: env('AI_CLASSIFICATION_MAX_TOKENS', 256),
    },
    
    filenameGeneration: {
      temperature: env('AI_FILENAME_TEMPERATURE', 0.5),
      maxTokens: env('AI_FILENAME_MAX_TOKENS', 64),
    },
    
    codeDescription: {
      temperature: env('AI_CODE_DESCRIPTION_TEMPERATURE', 0.3),
      maxTokens: env('AI_CODE_DESCRIPTION_MAX_TOKENS', 2048),
    },
    
    imageDescription: {
      temperature: env('AI_IMAGE_DESCRIPTION_TEMPERATURE', 0.5),
      maxTokens: env('AI_IMAGE_DESCRIPTION_MAX_TOKENS', 512),
    },
    
    ask: {
      temperature: env('AI_ASK_TEMPERATURE', 0.7),
      maxTokens: env('AI_ASK_MAX_TOKENS', 4096),
      stream: env('AI_ASK_STREAM', true),
    },
    
    profileCreation: {
      temperature: env('AI_PROFILE_TEMPERATURE', 0.5),
      maxTokens: env('AI_PROFILE_MAX_TOKENS', 4096),
    },
  },
  
  // Caching
  cache: {
    enabled: env('AI_CACHE_ENABLED', true),
    ttl: env('AI_CACHE_TTL', 86400), // 24 hours in seconds
  },
  
  // Retry configuration
  retry: {
    maxAttempts: env('AI_RETRY_MAX_ATTEMPTS', 3),
    initialDelay: env('AI_RETRY_INITIAL_DELAY', 1000),
    maxDelay: env('AI_RETRY_MAX_DELAY', 10000),
    backoffMultiplier: env('AI_RETRY_BACKOFF', 2),
  },
  
  // Prompt templates path
  promptsPath: env('AI_PROMPTS_PATH', 'prompts'),
};