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
   * @returns {Promise<Object>} Response object
   */
  async complete(options) {
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

      this.logger.debug(`Sending completion request to Gemini: ${this.model}`);

      if (options.stream) {
        const result = await this.modelInstance.generateContentStream({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        });
        
        return { stream: result.stream, model: this.model };
      }

      const result = await this.modelInstance.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();

      return {
        content: text,
        model: this.model,
        finishReason: response.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      this.handleError(error, 'completion');
    }
  }

  /**
   * Send a chat completion request
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response object
   */
  async chat(options) {
    try {
      // Convert messages to Gemini format
      const contents = this.convertMessagesToGeminiFormat(options.messages);
      
      const generationConfig = {
        temperature: options.temperature ?? this.temperature,
        maxOutputTokens: options.maxTokens || this.maxTokens,
        topP: options.topP ?? this.config.get('ai.defaults.topP', 0.95),
        topK: options.topK ?? this.config.get('ai.defaults.topK', 40),
      };

      this.logger.debug(`Sending chat request to Gemini: ${this.model}`);

      if (options.stream) {
        const chat = this.modelInstance.startChat({
          history: contents.slice(0, -1),
          generationConfig,
        });
        
        const result = await chat.sendMessageStream(contents[contents.length - 1].parts[0].text);
        
        return { stream: result.stream, model: this.model };
      }

      const chat = this.modelInstance.startChat({
        history: contents.slice(0, -1),
        generationConfig,
      });

      const result = await chat.sendMessage(contents[contents.length - 1].parts[0].text);
      const response = await result.response;
      const text = response.text();

      return {
        content: text,
        model: this.model,
        finishReason: response.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      this.handleError(error, 'chat');
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
   * Handle Gemini-specific errors
   * @param {Error} error - Original error
   * @param {string} operation - Operation that failed
   */
  handleError(error, operation) {
    if (error.status === 403 || error.message?.includes('API key not valid')) {
      throw new ProviderError(
        'Invalid Gemini API key',
        this.name,
        { code: 'INVALID_API_KEY', operation },
      );
    } else if (error.status === 429 || error.message?.includes('quota')) {
      throw new ProviderError(
        'Gemini rate limit or quota exceeded',
        this.name,
        { code: 'RATE_LIMIT', operation },
      );
    } else if (error.status === 503) {
      throw new ProviderError(
        'Gemini service unavailable',
        this.name,
        { code: 'SERVICE_UNAVAILABLE', operation },
      );
    } else if (error.message?.includes('safety')) {
      throw new ProviderError(
        'Content blocked by Gemini safety filters',
        this.name,
        { code: 'SAFETY_FILTER', operation },
      );
    }
    
    // Default error handling
    super.handleError(error, operation);
  }
}

export default GeminiProvider;