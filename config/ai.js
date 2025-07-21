const { env } = require('../src/config/ConfigManager');

module.exports = {
  // Gemini is the only supported provider
  provider: 'gemini',
  
  // Gemini configuration
  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    baseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1'),
    timeout: env('GEMINI_TIMEOUT', 60000),
    defaultModel: env('GEMINI_DEFAULT_MODEL', 'gemini-1.5-flash'),
    models: {
      small: env('GEMINI_MODEL_SMALL', 'gemini-1.5-flash'),
      medium: env('GEMINI_MODEL_MEDIUM', 'gemini-1.5-pro'),
      large: env('GEMINI_MODEL_LARGE', 'gemini-1.5-pro'),
    }
  },
  
  // Default parameters
  defaults: {
    temperature: env('AI_DEFAULT_TEMPERATURE', 0.7),
    maxTokens: env('AI_DEFAULT_MAX_TOKENS', 2048),
    topP: env('AI_DEFAULT_TOP_P', 0.95),
    topK: env('AI_DEFAULT_TOP_K', 40),
    stream: env('AI_DEFAULT_STREAM', false),
    model: env('AI_DEFAULT_MODEL', 'small'), // Uses gemini.models[model]
  },
  
  // Task-specific parameters
  tasks: {
    summarization: {
      model: env('AI_SUMMARIZATION_MODEL', 'small'),
      temperature: env('AI_SUMMARIZATION_TEMPERATURE', 0.3),
      maxTokens: env('AI_SUMMARIZATION_MAX_TOKENS', 1024),
    },
    
    classification: {
      model: env('AI_CLASSIFICATION_MODEL', 'small'),
      temperature: env('AI_CLASSIFICATION_TEMPERATURE', 0.1),
      maxTokens: env('AI_CLASSIFICATION_MAX_TOKENS', 256),
    },
    
    filenameGeneration: {
      model: env('AI_FILENAME_MODEL', 'small'),
      temperature: env('AI_FILENAME_TEMPERATURE', 0.5),
      maxTokens: env('AI_FILENAME_MAX_TOKENS', 64),
    },
    
    codeDescription: {
      model: env('AI_CODE_DESCRIPTION_MODEL', 'medium'),
      temperature: env('AI_CODE_DESCRIPTION_TEMPERATURE', 0.3),
      maxTokens: env('AI_CODE_DESCRIPTION_MAX_TOKENS', 2048),
    },
    
    imageDescription: {
      model: env('AI_IMAGE_DESCRIPTION_MODEL', 'medium'),
      temperature: env('AI_IMAGE_DESCRIPTION_TEMPERATURE', 0.5),
      maxTokens: env('AI_IMAGE_DESCRIPTION_MAX_TOKENS', 512),
    },
    
    ask: {
      model: env('AI_ASK_MODEL', 'large'),
      temperature: env('AI_ASK_TEMPERATURE', 0.7),
      maxTokens: env('AI_ASK_MAX_TOKENS', 4096),
      stream: env('AI_ASK_STREAM', true),
    },
    
    profileCreation: {
      model: env('AI_PROFILE_MODEL', 'large'),
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