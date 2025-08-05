import crypto from 'crypto';
import { config } from '../config/ConfigManager.js';
import { logger } from '../utils/logger.js';
import { ProviderError } from '../utils/errors.js';

/**
 * @typedef {Object} TokenUsage
 * @property {number} prompt - Tokens used in prompt
 * @property {number} completion - Tokens used in completion
 * @property {number} total - Total tokens used
 */

/**
 * @typedef {Object} RateLimit
 * @property {Object} requests - Request rate limit info
 * @property {number|null} requests.limit - Request limit per period
 * @property {number|null} requests.remaining - Remaining requests
 * @property {Object} tokens - Token rate limit info
 * @property {number|null} tokens.limit - Token limit per period
 * @property {number|null} tokens.remaining - Remaining tokens
 * @property {Date|null} resetTime - When limits reset
 */

/**
 * @typedef {Object} AIResponseEnvelope
 * @property {string} content - Main response content
 * @property {string} model - Model used for response
 * @property {string} finishReason - Completion reason
 * @property {TokenUsage} tokensUsed - Token usage information
 * @property {number} latencyMs - Response latency in milliseconds
 * @property {string} requestId - Unique request identifier
 * @property {RateLimit} rateLimit - Rate limiting information
 * @property {Object} meta - Provider-specific metadata
 */

/**
 * Base class for AI provider (Gemini only)
 */
class BaseProvider {
  constructor(options = {}) {
    this.name = 'gemini';
    this.config = config();
    this.logger = logger.child(this.constructor.name);
    
    // Provider configuration
    this.apiKey = options.apiKey || this.getApiKey();
    this.model = options.model || this.getDefaultModel();
    this.maxTokens = options.maxTokens || this.config.get('ai.defaults.maxTokens', 2048);
    this.temperature = options.temperature ?? this.config.get('ai.defaults.temperature', 0.7);
    
    // Response caching
    this.cacheEnabled = options.cache ?? this.config.get('cache.ai.enabled', true);
    
    // Validate configuration
    this.validateConfig();
  }

  /**
   * Get API key from config or environment
   * @returns {string} API key
   */
  getApiKey() {
    return process.env.GEMINI_API_KEY || this.config.get('ai.gemini.apiKey');
  }

  /**
   * Get default model for provider
   * @returns {string} Default model name
   */
  getDefaultModel() {
    return this.config.get('ai.gemini.defaultModel');
  }

  /**
   * Validate provider configuration
   * @throws {ProviderError} If configuration is invalid
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new ProviderError(
        'API key not found for Gemini. Set GEMINI_API_KEY environment variable.',
        this.name,
      );
    }
    
    if (!this.model) {
      throw new ProviderError(
        'Default model not configured for Gemini',
        this.name,
      );
    }
  }

  /**
   * Send a completion request
   * @param {Object} options - Request options
   * @param {string} options.prompt - The prompt to send
   * @param {string} options.systemPrompt - System prompt (if supported)
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.temperature - Temperature for generation
   * @param {boolean} options.stream - Whether to stream the response
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   * @abstract
   */
  async complete(_options) {
    throw new Error('complete() must be implemented by subclass');
  }

  /**
   * Send a chat completion request
   * @param {Object} options - Request options
   * @param {Array} options.messages - Array of message objects
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.temperature - Temperature for generation
   * @param {boolean} options.stream - Whether to stream the response
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   * @abstract
   */
  async chat(_options) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Create a standardized AI response envelope
   * @param {Object} options - Envelope options
   * @param {string} options.content - Main response content
   * @param {string} options.model - Model used for response
   * @param {string} options.finishReason - Completion reason
   * @param {Object} options.tokensUsed - Token usage information
   * @param {number} options.latencyMs - Response latency in milliseconds
   * @param {string} options.requestId - Unique request identifier
   * @param {Object} options.rateLimit - Rate limiting information
   * @param {Object} options.meta - Provider-specific metadata
   * @returns {AIResponseEnvelope} Standardized response envelope
   */
  createEnvelope(options) {
    return {
      content: options.content || '',
      model: options.model || this.model,
      finishReason: options.finishReason || 'stop',
      tokensUsed: {
        prompt: options.tokensUsed?.prompt || 0,
        completion: options.tokensUsed?.completion || 0,
        total: options.tokensUsed?.total || 0,
      },
      latencyMs: options.latencyMs || 0,
      requestId: options.requestId || crypto.randomUUID(),
      rateLimit: {
        requests: { 
          limit: options.rateLimit?.requests?.limit || null, 
          remaining: options.rateLimit?.requests?.remaining || null 
        },
        tokens: { 
          limit: options.rateLimit?.tokens?.limit || null, 
          remaining: options.rateLimit?.tokens?.remaining || null 
        },
        resetTime: options.rateLimit?.resetTime || null,
      },
      meta: {
        provider: this.name,
        ...options.meta,
      },
    };
  }

  /**
   * Create an error envelope for failed requests
   * @param {Error} error - The error that occurred
   * @param {string} requestId - Request identifier
   * @param {number} latencyMs - Time spent before error
   * @param {Object} meta - Additional metadata
   * @returns {Object} Error envelope
   */
  createErrorEnvelope(error, requestId, latencyMs, meta = {}) {
    return {
      error: error.message,
      requestId,
      latencyMs,
      model: this.model,
      meta: {
        provider: this.name,
        errorType: error.constructor.name,
        ...meta,
      },
    };
  }

  /**
   * Stream a response
   * @param {AsyncGenerator} stream - The stream to process
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<string>} Complete response
   */
  async processStream(stream, onChunk) {
    let fullResponse = '';
    
    try {
      for await (const chunk of stream) {
        const content = this.extractContentFromChunk(chunk);
        if (content) {
          fullResponse += content;
          if (onChunk) {
            onChunk(content);
          }
        }
      }
    } catch (error) {
      throw new ProviderError(
        `Stream processing failed: ${error.message}`,
        this.name,
        { originalError: error },
      );
    }
    
    return fullResponse;
  }

  /**
   * Extract content from streaming chunk
   * @param {Object} chunk - Streaming chunk
   * @returns {string} Extracted content
   * @abstract
   */
  extractContentFromChunk(_chunk) {
    throw new Error('extractContentFromChunk() must be implemented by subclass');
  }

  /**
   * Get provider information
   * @returns {Object} Provider info
   */
  getInfo() {
    return {
      name: this.name,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    };
  }

  /**
   * Create a cache key for a request
   * @param {Object} options - Request options
   * @returns {string} Cache key
   */
  getCacheKey(options) {
    const data = {
      provider: this.name,
      model: this.model,
      prompt: options.prompt || '',
      messages: options.messages || [],
      temperature: options.temperature || this.temperature,
      maxTokens: options.maxTokens || this.maxTokens,
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Handle API errors
   * @param {Error} error - Original error
   * @param {string} operation - Operation that failed
   * @param {Object} envelope - Error envelope metadata
   * @throws {ProviderError} Wrapped error
   */
  handleError(error, operation, envelope = {}) {
    let message = `${this.name} ${operation} failed: ${error.message}`;
    let code = 'PROVIDER_ERROR';
    
    // Handle common API errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401 || status === 403) {
        message = `Invalid ${this.name} API key`;
        code = 'INVALID_API_KEY';
      } else if (status === 429) {
        message = `${this.name} rate limit exceeded`;
        code = 'RATE_LIMIT';
      } else if (status === 503) {
        message = `${this.name} service unavailable`;
        code = 'SERVICE_UNAVAILABLE';
      }
    }
    
    throw new ProviderError(message, this.name, {
      code,
      originalError: error,
      operation,
      envelope,
    });
  }

  /**
   * Check if provider supports a feature
   * @param {string} feature - Feature name
   * @returns {boolean}
   */
  supports(feature) {
    const features = this.getSupportedFeatures();
    return features.includes(feature);
  }

  /**
   * Get list of supported features
   * @returns {Array<string>} Supported features
   */
  getSupportedFeatures() {
    return ['complete', 'chat', 'streaming'];
  }
}

export default BaseProvider;