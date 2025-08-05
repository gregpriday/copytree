import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import BaseProvider from './BaseProvider.js';
import { ProviderError } from '../utils/errors.js';

/**
 * Google Gemini provider implementation
 */
class GeminiProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    
    // Set up Gemini client
    this.baseUrl = options.baseUrl || this.config.get('ai.gemini.baseUrl');
    this.timeout = options.timeout || this.config.get('ai.gemini.timeout', 60000);
    
    // Initialize Google AI SDK
    this.client = new GoogleGenerativeAI(this.apiKey);
    
    // Get the model
    this.modelInstance = this.client.getGenerativeModel({ model: this.model });
  }

  /**
   * Send a completion request
   * @param {Object} options - Request options
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   */
  async complete(options) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      const prompt = options.systemPrompt 
        ? `${options.systemPrompt}\n\n${options.prompt}`
        : options.prompt;

      const generationConfig = {
        temperature: options.temperature ?? this.temperature,
        maxOutputTokens: options.maxTokens || this.maxTokens,
        topP: options.topP ?? this.config.get('ai.defaults.topP', 0.95),
        topK: options.topK ?? this.config.get('ai.defaults.topK', 40),
      };

      this.logger.debug(`Sending completion request to Gemini: ${this.model}`, { requestId });

      if (options.stream) {
        const result = await this.modelInstance.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        });
        
        // For streaming, return a different envelope structure
        return { 
          stream: result.stream, 
          model: this.model, 
          requestId,
          meta: { provider: 'gemini' }
        };
      }

      const result = await this.modelInstance.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();
      const latencyMs = Date.now() - startTime;

      // Create standardized envelope
      return this.createEnvelope({
        content: text,
        model: this.model,
        finishReason: response.candidates?.[0]?.finishReason || 'stop',
        tokensUsed: {
          prompt: response.usageMetadata?.promptTokenCount || 0,
          completion: response.usageMetadata?.candidatesTokenCount || 0,
          total: response.usageMetadata?.totalTokenCount || 0,
        },
        latencyMs,
        requestId,
        rateLimit: this._parseRateLimit(response),
        meta: {
          safetyRatings: response.candidates?.[0]?.safetyRatings,
          citationMetadata: response.candidates?.[0]?.citationMetadata,
          blockReason: response.candidates?.[0]?.blockReason,
          usageMetadata: response.usageMetadata,
        },
      });
    } catch (error) {
      const errorEnvelope = this.createErrorEnvelope(
        error,
        requestId,
        Date.now() - startTime,
        { operation: 'completion' }
      );
      
      this.handleError(error, 'completion', errorEnvelope);
    }
  }

  /**
   * Send a chat completion request
   * @param {Object} options - Request options
   * @returns {Promise<AIResponseEnvelope>} Standardized response envelope
   */
  async chat(options) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Convert messages to Gemini format
      const contents = this.convertMessagesToGeminiFormat(options.messages);
      
      const generationConfig = {
        temperature: options.temperature ?? this.temperature,
        maxOutputTokens: options.maxTokens || this.maxTokens,
        topP: options.topP ?? this.config.get('ai.defaults.topP', 0.95),
        topK: options.topK ?? this.config.get('ai.defaults.topK', 40),
      };

      this.logger.debug(`Sending chat request to Gemini: ${this.model}`, { requestId });

      if (options.stream) {
        const chat = this.modelInstance.startChat({
          history: contents.slice(0, -1),
          generationConfig,
        });
        
        const result = await chat.sendMessageStream(contents[contents.length - 1].parts[0].text);
        
        // For streaming, return a different envelope structure
        return { 
          stream: result.stream, 
          model: this.model, 
          requestId,
          meta: { provider: 'gemini' }
        };
      }

      const chat = this.modelInstance.startChat({
        history: contents.slice(0, -1),
        generationConfig,
      });

      const result = await chat.sendMessage(contents[contents.length - 1].parts[0].text);
      const response = await result.response;
      const text = response.text();
      const latencyMs = Date.now() - startTime;

      // Create standardized envelope
      return this.createEnvelope({
        content: text,
        model: this.model,
        finishReason: response.candidates?.[0]?.finishReason || 'stop',
        tokensUsed: {
          prompt: response.usageMetadata?.promptTokenCount || 0,
          completion: response.usageMetadata?.candidatesTokenCount || 0,
          total: response.usageMetadata?.totalTokenCount || 0,
        },
        latencyMs,
        requestId,
        rateLimit: this._parseRateLimit(response),
        meta: {
          safetyRatings: response.candidates?.[0]?.safetyRatings,
          citationMetadata: response.candidates?.[0]?.citationMetadata,
          blockReason: response.candidates?.[0]?.blockReason,
          usageMetadata: response.usageMetadata,
          messageCount: contents.length,
        },
      });
    } catch (error) {
      const errorEnvelope = this.createErrorEnvelope(
        error,
        requestId,
        Date.now() - startTime,
        { operation: 'chat', messageCount: contents?.length || 0 }
      );
      
      this.handleError(error, 'chat', errorEnvelope);
    }
  }

  /**
   * Convert messages to Gemini format
   * @param {Array} messages - OpenAI-style messages
   * @returns {Array} Gemini-formatted contents
   */
  convertMessagesToGeminiFormat(messages) {
    const contents = [];
    let systemPrompt = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        systemPrompt = message.content;
      } else {
        const role = message.role === 'assistant' ? 'model' : 'user';
        let text = message.content;
        
        // Prepend system prompt to first user message
        if (systemPrompt && message.role === 'user' && contents.length === 0) {
          text = `${systemPrompt}\n\n${text}`;
          systemPrompt = '';
        }
        
        contents.push({
          role,
          parts: [{ text }],
        });
      }
    }
    
    return contents;
  }

  /**
   * Extract content from streaming chunk
   * @param {Object} chunk - Streaming chunk
   * @returns {string} Extracted content
   */
  extractContentFromChunk(chunk) {
    if (chunk.text) {
      return chunk.text();
    }
    return '';
  }

  /**
   * Get list of supported features
   * @returns {Array<string>} Supported features
   */
  getSupportedFeatures() {
    return [
      'complete',
      'chat',
      'streaming',
      'systemPrompt',
      'multiModal',
    ];
  }

  /**
   * Parse rate limit information from response
   * @param {Object} response - Gemini API response
   * @returns {Object} Rate limit information
   */
  _parseRateLimit(response) {
    // Gemini doesn't currently expose rate limit headers in the response
    // This method is prepared for future API updates
    return {
      requests: { limit: null, remaining: null },
      tokens: { limit: null, remaining: null },
      resetTime: null,
    };
  }

  /**
   * Handle Gemini-specific errors
   * @param {Error} error - Original error
   * @param {string} operation - Operation that failed
   * @param {Object} envelope - Error envelope metadata
   */
  handleError(error, operation, envelope = {}) {
    if (error.status === 403 || error.message?.includes('API key not valid')) {
      throw new ProviderError(
        'Invalid Gemini API key',
        this.name,
        { code: 'INVALID_API_KEY', operation, envelope },
      );
    } else if (error.status === 429 || error.message?.includes('quota')) {
      throw new ProviderError(
        'Gemini rate limit or quota exceeded',
        this.name,
        { code: 'RATE_LIMIT', operation, envelope },
      );
    } else if (error.status === 503) {
      throw new ProviderError(
        'Gemini service unavailable',
        this.name,
        { code: 'SERVICE_UNAVAILABLE', operation, envelope },
      );
    } else if (error.message?.includes('safety')) {
      throw new ProviderError(
        'Content blocked by Gemini safety filters',
        this.name,
        { code: 'SAFETY_FILTER', operation, envelope },
      );
    }
    
    // Default error handling
    super.handleError(error, operation, envelope);
  }
}

export default GeminiProvider;