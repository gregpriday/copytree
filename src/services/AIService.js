import GeminiProvider from '../providers/GeminiProvider.js';
import { CacheService } from './CacheService.js';
import { config } from '../config/ConfigManager.js';
import { logger } from '../utils/logger.js';
import { retry } from '../utils/helpers.js';
import { isRetryableError } from '../utils/errors.js';

/**
 * AI Service - Handles all AI operations with multi-provider support
 */
class AIService {
  constructor(options = {}) {
    this.config = config();
    this.logger = logger.child('AIService');

    // Initialize providers (supports multi-provider fallback)
    this.providers = this._initializeProviders(options);
    this.currentProviderIndex = 0;

    // Primary provider (for backward compatibility)
    this.provider = this.providers[0];

    // Initialize cache if enabled
    if (this.config.get('ai.cache.enabled', true)) {
      this.cache = CacheService.create('ai', {
        defaultTtl: this.config.get('ai.cache.ttl', 86400),
      });
    }

    // Enhanced retry configuration with selective retrying
    this.retryOptions = {
      maxAttempts: this.config.get('ai.retry.maxAttempts', 3),
      initialDelay: this.config.get('ai.retry.initialDelay', 1000),
      maxDelay: this.config.get('ai.retry.maxDelay', 10000),
      backoffMultiplier: this.config.get('ai.retry.backoffMultiplier', 2),
      shouldRetry: (error) => isRetryableError(error),
    };
  }

  /**
   * Initialize providers from configuration
   * @param {Object} options - Constructor options
   * @returns {Array} Array of initialized providers
   */
  _initializeProviders(options = {}) {
    const providersConfig = this.config.get('ai.providers', []);
    const providers = [];

    // If no providers config, fall back to legacy single provider setup
    if (providersConfig.length === 0) {
      const modelName = this.config.get('ai.gemini.model');
      providers.push(
        new GeminiProvider({
          model: modelName,
          ...options,
        }),
      );
      return providers;
    }

    // Sort providers by priority (lower number = higher priority)
    const sortedProviders = [...providersConfig].sort(
      (a, b) => (a.priority || 1) - (b.priority || 1),
    );

    for (const providerConfig of sortedProviders) {
      try {
        if (providerConfig.name === 'gemini') {
          providers.push(
            new GeminiProvider({
              model: providerConfig.model,
              apiKey: providerConfig.apiKey,
              baseUrl: providerConfig.baseUrl,
              timeout: providerConfig.timeout,
              ...options,
            }),
          );
        }
        // Future providers can be added here
        // else if (providerConfig.name === 'openai') {
        //   providers.push(new OpenAIProvider({ ... }));
        // }
      } catch (error) {
        this.logger.warn(`Failed to initialize provider ${providerConfig.name}: ${error.message}`);
      }
    }

    if (providers.length === 0) {
      throw new Error('No AI providers could be initialized');
    }

    this.logger.debug(`Initialized ${providers.length} AI provider(s)`, {
      providers: providers.map((p) => ({ name: p.name, model: p.model })),
    });

    return providers;
  }

  /**
   * Send a completion request with retry and caching
   * @param {Object} options - Request options
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   */
  async complete(options) {
    // Check cache first (use primary provider for cache key)
    if (this.cache && !options.noCache) {
      const cacheKey = this.provider.getCacheKey(options);
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        this.logger.debug('AI response retrieved from cache', {
          requestId: cached.requestId,
          tokensUsed: cached.tokensUsed?.total || 0,
          model: cached.model,
        });
        return cached;
      }
    }

    // Make request with retry and provider fallback
    const response = await this._retryWithFallback(
      (provider) => provider.complete(options),
      options,
    );

    // Log response metrics
    this.logger.debug('AI completion response received', {
      requestId: response.requestId,
      latencyMs: response.latencyMs,
      tokensUsed: response.tokensUsed?.total || 0,
      model: response.model,
      finishReason: response.finishReason,
      provider: response.meta?.provider,
    });

    // Cache successful responses (cache the full envelope)
    if (this.cache && !options.noCache && response.content) {
      const cacheKey = this.provider.getCacheKey(options);
      await this.cache.set(cacheKey, response);
    }

    return response;
  }

  /**
   * Send a chat request with retry and caching
   * @param {Object} options - Request options
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   */
  async chat(options) {
    // Check cache first (use primary provider for cache key)
    if (this.cache && !options.noCache) {
      const cacheKey = this.provider.getCacheKey(options);
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        this.logger.debug('AI chat response retrieved from cache', {
          requestId: cached.requestId,
          tokensUsed: cached.tokensUsed?.total || 0,
          model: cached.model,
        });
        return cached;
      }
    }

    // Make request with retry and provider fallback
    const response = await this._retryWithFallback((provider) => provider.chat(options), options);

    // Log response metrics
    this.logger.debug('AI chat response received', {
      requestId: response.requestId,
      latencyMs: response.latencyMs,
      tokensUsed: response.tokensUsed?.total || 0,
      model: response.model,
      finishReason: response.finishReason,
      messageCount: response.meta?.messageCount,
      provider: response.meta?.provider,
    });

    // Cache successful responses (cache the full envelope)
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

    // Prepare options with task-specific configuration
    const requestOptions = {
      ...options,
      temperature: options.temperature ?? taskConfig.temperature,
      maxTokens: options.maxTokens ?? taskConfig.maxTokens,
      stream: options.stream ?? taskConfig.stream,
    };

    // Use the appropriate method with multi-provider support
    if (options.messages) {
      return this.chat(requestOptions);
    } else {
      return this.complete(requestOptions);
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
      ...options,
    });

    return response.content;
  }

  /**
   * Retry operation with multi-provider fallback
   * @param {Function} operation - Operation to retry (receives provider as argument)
   * @param {Object} options - Request options (for logging)
   * @returns {Promise} Operation result
   */
  async _retryWithFallback(operation, options) {
    let lastError;
    let currentProviderIndex = 0;

    // Try each provider with retries for retryable errors only
    while (currentProviderIndex < this.providers.length) {
      const provider = this.providers[currentProviderIndex];

      try {
        return await this._retryOperation(() => operation(provider), provider);
      } catch (error) {
        lastError = error;

        this.logger.debug(`Provider ${provider.name} failed`, {
          providerIndex: currentProviderIndex,
          error: error.message,
          errorCode: error.details?.code || error.code,
          retryable: isRetryableError(error),
        });

        // If error is not retryable, try next provider immediately
        if (!isRetryableError(error)) {
          this.logger.warn(
            `Non-retryable error with ${provider.name}, trying next provider: ${error.message}`,
          );
          currentProviderIndex++;
          continue;
        }

        // If retryable error exhausted retries, try next provider
        this.logger.warn(
          `Retryable error exhausted retries with ${provider.name}, trying next provider: ${error.message}`,
        );
        currentProviderIndex++;
      }
    }

    // All providers failed
    this.logger.error('All AI providers failed', {
      providersAttempted: this.providers.length,
      lastError: lastError.message,
    });

    throw lastError;
  }

  /**
   * Retry operation for a specific provider
   * @param {Function} operation - Operation to retry
   * @param {Object} provider - Provider context for logging
   * @returns {Promise} Operation result
   */
  async _retryOperation(operation, provider) {
    this.logger.debug(`Attempting operation with ${provider.name}`, {
      model: provider.model,
      maxRetries: this.retryOptions.maxAttempts,
    });

    return retry(operation, this.retryOptions);
  }

  /**
   * Get provider information
   * @returns {Object} Provider info
   */
  getProviderInfo() {
    return this.provider.getInfo();
  }

  /**
   * Get information about all available providers
   * @returns {Array} Array of provider info objects
   */
  getAllProviderInfo() {
    return this.providers.map((provider) => provider.getInfo());
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
      ...options,
    });
  }
}

// Export singleton instance and class
let defaultAI = null;

export { AIService };
export function getAI() {
  if (!defaultAI) {
    defaultAI = new AIService();
  }
  return defaultAI;
}
