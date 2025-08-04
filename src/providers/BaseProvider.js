import crypto from 'crypto';
import { config } from '../config/ConfigManager.js';
import { logger } from '../utils/logger.js';
import { ProviderError } from '../utils/errors.js';

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
   * @returns {Promise<Object>} Response object
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
   * @returns {Promise<Object>} Response object
   * @abstract
   */
  async chat(_options) {
    throw new Error('chat() must be implemented by subclass');
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
   * @throws {ProviderError} Wrapped error
   */
  handleError(error, operation) {
    let message = `Gemini ${operation} failed: ${error.message}`;
    let code = 'PROVIDER_ERROR';
    
    // Handle common API errors
    if (error.response) {
      const status = error.response.status;
      
      if (status === 401 || status === 403) {
        message = 'Invalid Gemini API key';
        code = 'INVALID_API_KEY';
      } else if (status === 429) {
        message = 'Gemini rate limit exceeded';
        code = 'RATE_LIMIT';
      } else if (status === 503) {
        message = 'Gemini service unavailable';
        code = 'SERVICE_UNAVAILABLE';
      }
    }
    
    throw new ProviderError(message, this.name, {
      code,
      originalError: error,
      operation,
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