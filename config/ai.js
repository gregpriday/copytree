const { env } = require('../src/config/ConfigManager');

module.exports = {
  // Default AI provider
  defaultProvider: env('AI_DEFAULT_PROVIDER', 'openai'),
  
  // Provider configurations
  providers: {
    openai: {
      apiKey: env('OPENAI_API_KEY', ''),
      baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
      timeout: env('OPENAI_TIMEOUT', 60000),
      models: {
        small: env('OPENAI_MODEL_SMALL', 'gpt-3.5-turbo'),
        medium: env('OPENAI_MODEL_MEDIUM', 'gpt-4'),
        large: env('OPENAI_MODEL_LARGE', 'gpt-4-turbo-preview'),
      },
      pricing: {
        'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
      },
    },
    
    anthropic: {
      apiKey: env('ANTHROPIC_API_KEY', ''),
      baseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1'),
      timeout: env('ANTHROPIC_TIMEOUT', 60000),
      models: {
        small: env('ANTHROPIC_MODEL_SMALL', 'claude-3-haiku-20240307'),
        medium: env('ANTHROPIC_MODEL_MEDIUM', 'claude-3-sonnet-20240229'),
        large: env('ANTHROPIC_MODEL_LARGE', 'claude-3-opus-20240229'),
      },
      pricing: {
        'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
        'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
        'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      },
    },
    
    gemini: {
      apiKey: env('GEMINI_API_KEY', ''),
      baseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1'),
      timeout: env('GEMINI_TIMEOUT', 60000),
      models: {
        small: env('GEMINI_MODEL_SMALL', 'gemini-1.5-flash'),
        medium: env('GEMINI_MODEL_MEDIUM', 'gemini-1.5-pro'),
        large: env('GEMINI_MODEL_LARGE', 'gemini-1.5-pro'),
      },
      pricing: {
        'gemini-1.5-flash': { input: 0.00025, output: 0.0005 },
        'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
      },
    },
    
    fireworks: {
      apiKey: env('FIREWORKS_API_KEY', ''),
      baseUrl: env('FIREWORKS_BASE_URL', 'https://api.fireworks.ai/inference/v1'),
      timeout: env('FIREWORKS_TIMEOUT', 60000),
      models: {
        small: env('FIREWORKS_MODEL_SMALL', 'accounts/fireworks/models/mixtral-8x7b-instruct'),
        medium: env('FIREWORKS_MODEL_MEDIUM', 'accounts/fireworks/models/mixtral-8x22b-instruct'),
        large: env('FIREWORKS_MODEL_LARGE', 'accounts/fireworks/models/yi-large'),
      },
      pricing: {
        'accounts/fireworks/models/mixtral-8x7b-instruct': { input: 0.0004, output: 0.0016 },
        'accounts/fireworks/models/mixtral-8x22b-instruct': { input: 0.0009, output: 0.0009 },
        'accounts/fireworks/models/yi-large': { input: 0.003, output: 0.003 },
      },
    },
  },
  
  // Default parameters
  defaults: {
    temperature: env('AI_DEFAULT_TEMPERATURE', 0.7),
    maxTokens: env('AI_DEFAULT_MAX_TOKENS', 2048),
    topP: env('AI_DEFAULT_TOP_P', 0.9),
    frequencyPenalty: env('AI_DEFAULT_FREQUENCY_PENALTY', 0),
    presencePenalty: env('AI_DEFAULT_PRESENCE_PENALTY', 0),
    stream: env('AI_DEFAULT_STREAM', false),
    model: env('AI_DEFAULT_MODEL', null), // null means use provider's default
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
    ttl: env('AI_CACHE_TTL', 1440), // 24 hours in minutes
    maxSize: env('AI_CACHE_MAX_SIZE', 100 * 1024 * 1024), // 100MB
    path: env('AI_CACHE_PATH', '.copytree-cache/ai'),
  },
  
  // Rate limiting
  rateLimit: {
    enabled: env('AI_RATE_LIMIT_ENABLED', true),
    maxRequests: env('AI_RATE_LIMIT_MAX_REQUESTS', 100),
    windowMs: env('AI_RATE_LIMIT_WINDOW', 60000), // 1 minute
  },
  
  // Retry configuration
  retry: {
    maxAttempts: env('AI_RETRY_MAX_ATTEMPTS', 3),
    initialDelay: env('AI_RETRY_INITIAL_DELAY', 1000),
    maxDelay: env('AI_RETRY_MAX_DELAY', 10000),
    backoffMultiplier: env('AI_RETRY_BACKOFF', 2),
  },
  
  // Token tracking
  tokenTracking: {
    enabled: env('AI_TOKEN_TRACKING_ENABLED', true),
    logUsage: env('AI_TOKEN_LOG_USAGE', true),
    warnThreshold: env('AI_TOKEN_WARN_THRESHOLD', 10000),
  },
  
  // Prompt templates path
  promptsPath: env('AI_PROMPTS_PATH', 'prompts'),
};