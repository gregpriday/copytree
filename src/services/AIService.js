const GeminiProvider = require('../providers/GeminiProvider');
const { CacheService } = require('./CacheService');
const { config } = require('../config/ConfigManager');
const { logger } = require('../utils/logger');
const { retry } = require('../utils/helpers');

/**
 * AI Service - Handles all AI operations using Gemini
 */
class AIService {
  constructor(options = {}) {
    this.config = config();
    this.logger = logger.child('AIService');
    
    // Initialize Gemini provider with single model
    const modelName = this.config.get('ai.gemini.model');
    
    this.provider = new GeminiProvider({
      model: modelName,
      ...options
    });
    
    // Initialize cache if enabled
    if (this.config.get('ai.cache.enabled', true)) {
      this.cache = CacheService.create('ai', {
        defaultTtl: this.config.get('ai.cache.ttl', 86400)
      });
    }
    
    // Retry configuration
    this.retryOptions = {
      maxAttempts: this.config.get('ai.retry.maxAttempts', 3),
      initialDelay: this.config.get('ai.retry.initialDelay', 1000),
      maxDelay: this.config.get('ai.retry.maxDelay', 10000),
      backoffMultiplier: this.config.get('ai.retry.backoffMultiplier', 2)
    };
  }

  /**
   * Send a completion request with retry and caching
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async complete(options) {
    // Check cache first
    if (this.cache && !options.noCache) {
      const cacheKey = this.provider.getCacheKey(options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.logger.debug('AI response retrieved from cache');
        return cached;
      }
    }
    
    // Make request with retry
    const response = await retry(
      () => this.provider.complete(options),
      this.retryOptions
    );
    
    // Cache successful responses
    if (this.cache && !options.noCache && response.content) {
      const cacheKey = this.provider.getCacheKey(options);
      await this.cache.set(cacheKey, response);
    }
    
    return response;
  }

  /**
   * Send a chat request with retry and caching
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async chat(options) {
    // Check cache first
    if (this.cache && !options.noCache) {
      const cacheKey = this.provider.getCacheKey(options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.logger.debug('AI chat response retrieved from cache');
        return cached;
      }
    }
    
    // Make request with retry
    const response = await retry(
      () => this.provider.chat(options),
      this.retryOptions
    );
    
    // Cache successful responses
    if (this.cache && !options.noCache && response.content) {
      const cacheKey = this.provider.getCacheKey(options);
      await this.cache.set(cacheKey, response);
    }
    
    return response;
  }

  /**
   * Stream a completion response
   * @param {Object} options - Request options
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<string>} Complete response
   */
  async streamComplete(options, onChunk) {
    const result = await this.provider.complete({ ...options, stream: true });
    return this.provider.processStream(result.stream, onChunk);
  }

  /**
   * Stream a chat response
   * @param {Object} options - Request options
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<string>} Complete response
   */
  async streamChat(options, onChunk) {
    const result = await this.provider.chat({ ...options, stream: true });
    return this.provider.processStream(result.stream, onChunk);
  }

  /**
   * Perform a specific AI task
   * @param {string} task - Task name
   * @param {Object} options - Task options
   * @returns {Promise<Object>} Task result
   */
  async performTask(task, options) {
    const taskConfig = this.config.get(`ai.tasks.${task}`);
    
    if (!taskConfig) {
      throw new Error(`Unknown AI task: ${task}`);
    }
    
    // Use the same provider for all tasks (single model)
    const provider = this.provider;
    
    // Prepare options
    const requestOptions = {
      ...options,
      temperature: options.temperature ?? taskConfig.temperature,
      maxTokens: options.maxTokens ?? taskConfig.maxTokens,
      stream: options.stream ?? taskConfig.stream
    };
    
    // Use the appropriate method
    if (options.messages) {
      return provider.chat(requestOptions);
    } else {
      return provider.complete(requestOptions);
    }
  }

  /**
   * Summarize code
   * @param {string} code - Code to summarize
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Summary
   */
  async summarizeCode(code, options = {}) {
    const prompt = `Please provide a clear and concise summary of the following code. Focus on what it does, its main components, and any important patterns or techniques used.

Code:
\`\`\`
${code}
\`\`\`

Summary:`;

    const response = await this.performTask('codeDescription', {
      prompt,
      ...options
    });
    
    return response.content;
  }



  /**
   * Get provider information
   * @returns {Object} Provider info
   */
  getProviderInfo() {
    return this.provider.getInfo();
  }

  /**
   * Create an AI service instance for a specific task
   * @param {string} task - Task name
   * @param {Object} options - Additional options
   * @returns {AIService} New AI service instance
   */
  static forTask(task, options = {}) {
    const taskConfig = config().get(`ai.tasks.${task}`);
    
    if (!taskConfig) {
      throw new Error(`Unknown AI task: ${task}`);
    }
    
    return new AIService({
      temperature: taskConfig.temperature,
      maxTokens: taskConfig.maxTokens,
      ...options
    });
  }
}

// Export singleton instance and class
const defaultAI = new AIService();

module.exports = {
  AIService,
  ai: defaultAI
};