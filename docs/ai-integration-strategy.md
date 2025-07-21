# AI Integration Migration Strategy

## Overview

The PHP CopyTree uses Prism library for unified AI provider access, supporting OpenAI, Google Gemini, and Fireworks. This document outlines the strategy for implementing equivalent functionality in Node.js with a focus on maintainability, performance, and cost management.

## Current PHP Architecture

### Prism Integration
```php
// Unified interface via Prism
$client = new PrismClient();
$provider = $client->resolve($providerName);
$response = $provider->completions()->create([
    'model' => $model,
    'messages' => $messages,
    'stream' => true
]);
```

### Supported Providers
1. OpenAI (GPT-4, GPT-3.5)
2. Google Gemini (Pro, Flash)
3. Fireworks (Various open models)
4. Anthropic Claude (mentioned but not fully integrated)

## Node.js Architecture Design

### Provider Interface

```javascript
// src/ai/providers/AIProvider.js
class AIProvider {
    constructor(config) {
        this.config = config;
        this.name = this.constructor.name;
    }
    
    // Core methods that all providers must implement
    async generateCompletion(messages, options = {}) {
        throw new Error('generateCompletion must be implemented');
    }
    
    async generateStream(messages, options = {}) {
        throw new Error('generateStream must be implemented');
    }
    
    async countTokens(text) {
        throw new Error('countTokens must be implemented');
    }
    
    // Optional methods with default implementations
    async embedText(text) {
        throw new Error(`${this.name} does not support embeddings`);
    }
    
    formatMessages(messages) {
        // Default message formatting
        return messages;
    }
    
    validateModel(model) {
        const supportedModels = this.getSupportedModels();
        if (!supportedModels.includes(model)) {
            throw new Error(`Model ${model} not supported by ${this.name}`);
        }
    }
    
    getSupportedModels() {
        return [];
    }
    
    getDefaultModel() {
        return this.getSupportedModels()[0];
    }
}
```

### Provider Factory

```javascript
// src/ai/AIProviderFactory.js
class AIProviderFactory {
    static providers = new Map();
    
    static register(name, ProviderClass) {
        this.providers.set(name.toLowerCase(), ProviderClass);
    }
    
    static create(providerName, model = null) {
        const Provider = this.providers.get(providerName.toLowerCase());
        
        if (!Provider) {
            throw new Error(`Unknown AI provider: ${providerName}`);
        }
        
        const config = {
            apiKey: process.env[`${providerName.toUpperCase()}_API_KEY`],
            model: model || process.env[`${providerName.toUpperCase()}_MODEL`],
            ...this.getProviderConfig(providerName)
        };
        
        return new Provider(config);
    }
    
    static getProviderConfig(providerName) {
        const config = require('../config');
        return config.get(`ai.providers.${providerName}`) || {};
    }
    
    static listProviders() {
        return Array.from(this.providers.keys());
    }
}

// Register providers
AIProviderFactory.register('openai', require('./providers/OpenAIProvider'));
AIProviderFactory.register('gemini', require('./providers/GeminiProvider'));
AIProviderFactory.register('anthropic', require('./providers/AnthropicProvider'));
AIProviderFactory.register('fireworks', require('./providers/FireworksProvider'));
```

## Provider Implementations

### 1. OpenAI Provider

```javascript
// src/ai/providers/OpenAIProvider.js
const { OpenAI } = require('openai');
const { encoding_for_model } = require('tiktoken');

class OpenAIProvider extends AIProvider {
    constructor(config) {
        super(config);
        this.client = new OpenAI({
            apiKey: config.apiKey
        });
        this.encoding = null;
    }
    
    getSupportedModels() {
        return [
            'gpt-4-turbo-preview',
            'gpt-4',
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-16k'
        ];
    }
    
    async generateCompletion(messages, options = {}) {
        const completion = await this.client.chat.completions.create({
            model: options.model || this.config.model || 'gpt-3.5-turbo',
            messages: this.formatMessages(messages),
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens,
            ...options
        });
        
        return {
            text: completion.choices[0].message.content,
            usage: {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens
            },
            model: completion.model,
            finishReason: completion.choices[0].finish_reason
        };
    }
    
    async generateStream(messages, options = {}) {
        const stream = await this.client.chat.completions.create({
            model: options.model || this.config.model || 'gpt-3.5-turbo',
            messages: this.formatMessages(messages),
            stream: true,
            ...options
        });
        
        // Convert to async iterator
        return (async function* () {
            for await (const chunk of stream) {
                const delta = chunk.choices[0].delta;
                if (delta.content) {
                    yield {
                        text: delta.content,
                        finishReason: chunk.choices[0].finish_reason
                    };
                }
            }
        })();
    }
    
    async countTokens(text) {
        if (!this.encoding) {
            this.encoding = encoding_for_model(
                this.config.model || 'gpt-3.5-turbo'
            );
        }
        
        return this.encoding.encode(text).length;
    }
}
```

### 2. Google Gemini Provider

```javascript
// src/ai/providers/GeminiProvider.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiProvider extends AIProvider {
    constructor(config) {
        super(config);
        this.genAI = new GoogleGenerativeAI(config.apiKey);
    }
    
    getSupportedModels() {
        return [
            'gemini-1.5-pro',
            'gemini-1.5-flash',
            'gemini-1.0-pro'
        ];
    }
    
    async generateCompletion(messages, options = {}) {
        const model = this.genAI.getGenerativeModel({
            model: options.model || this.config.model || 'gemini-1.5-flash'
        });
        
        // Convert messages to Gemini format
        const chat = model.startChat({
            history: this.convertToGeminiHistory(messages.slice(0, -1)),
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens,
                topP: options.topP || 0.9,
                topK: options.topK || 1
            }
        });
        
        const result = await chat.sendMessage(
            messages[messages.length - 1].content
        );
        
        const response = await result.response;
        const text = response.text();
        
        return {
            text,
            usage: {
                promptTokens: response.usageMetadata?.promptTokenCount || 0,
                completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0,
                cachedTokens: response.usageMetadata?.cachedContentTokenCount || 0
            },
            model: model.model,
            finishReason: response.candidates[0].finishReason
        };
    }
    
    async generateStream(messages, options = {}) {
        const model = this.genAI.getGenerativeModel({
            model: options.model || this.config.model || 'gemini-1.5-flash'
        });
        
        const chat = model.startChat({
            history: this.convertToGeminiHistory(messages.slice(0, -1))
        });
        
        const result = await chat.sendMessageStream(
            messages[messages.length - 1].content
        );
        
        // Convert to async iterator
        return (async function* () {
            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    yield { text };
                }
            }
        })();
    }
    
    convertToGeminiHistory(messages) {
        return messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
    }
    
    async countTokens(text) {
        const model = this.genAI.getGenerativeModel({
            model: this.config.model || 'gemini-1.5-flash'
        });
        
        const { totalTokens } = await model.countTokens(text);
        return totalTokens;
    }
}
```

### 3. Anthropic Provider

```javascript
// src/ai/providers/AnthropicProvider.js
const Anthropic = require('@anthropic-ai/sdk');

class AnthropicProvider extends AIProvider {
    constructor(config) {
        super(config);
        this.client = new Anthropic({
            apiKey: config.apiKey
        });
    }
    
    getSupportedModels() {
        return [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
            'claude-2.1',
            'claude-instant-1.2'
        ];
    }
    
    async generateCompletion(messages, options = {}) {
        const response = await this.client.messages.create({
            model: options.model || this.config.model || 'claude-3-haiku-20240307',
            messages: this.formatMessages(messages),
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.7,
            ...options
        });
        
        return {
            text: response.content[0].text,
            usage: {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens
            },
            model: response.model,
            finishReason: response.stop_reason
        };
    }
    
    async generateStream(messages, options = {}) {
        const stream = await this.client.messages.create({
            model: options.model || this.config.model || 'claude-3-haiku-20240307',
            messages: this.formatMessages(messages),
            max_tokens: options.maxTokens || 4096,
            stream: true,
            ...options
        });
        
        return (async function* () {
            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta') {
                    yield {
                        text: chunk.delta.text,
                        finishReason: null
                    };
                } else if (chunk.type === 'message_delta') {
                    yield {
                        text: '',
                        finishReason: chunk.delta.stop_reason
                    };
                }
            }
        })();
    }
    
    formatMessages(messages) {
        // Anthropic requires system message separately
        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');
        
        return {
            system: systemMessage?.content,
            messages: otherMessages
        };
    }
}
```

## Cost Management

### Token Usage Tracking

```javascript
// src/ai/TokenUsageTracker.js
class TokenUsageTracker {
    constructor() {
        this.usage = new Map();
        this.costs = {
            'gpt-4': { prompt: 0.03, completion: 0.06 },
            'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
            'claude-3-opus': { prompt: 0.015, completion: 0.075 },
            'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
            'gemini-1.5-pro': { prompt: 0.00125, completion: 0.005 },
            'gemini-1.5-flash': { prompt: 0.000075, completion: 0.0003 }
        };
    }
    
    track(provider, model, usage) {
        const key = `${provider}:${model}`;
        const existing = this.usage.get(key) || {
            promptTokens: 0,
            completionTokens: 0,
            cachedTokens: 0,
            requests: 0
        };
        
        this.usage.set(key, {
            promptTokens: existing.promptTokens + (usage.promptTokens || 0),
            completionTokens: existing.completionTokens + (usage.completionTokens || 0),
            cachedTokens: existing.cachedTokens + (usage.cachedTokens || 0),
            requests: existing.requests + 1
        });
    }
    
    calculateCost(model, usage) {
        const rates = this.costs[model];
        if (!rates) return null;
        
        const promptCost = (usage.promptTokens / 1000) * rates.prompt;
        const completionCost = (usage.completionTokens / 1000) * rates.completion;
        
        return {
            promptCost,
            completionCost,
            totalCost: promptCost + completionCost
        };
    }
    
    getReport() {
        const report = [];
        
        for (const [key, usage] of this.usage) {
            const [provider, model] = key.split(':');
            const cost = this.calculateCost(model, usage);
            
            report.push({
                provider,
                model,
                ...usage,
                cost
            });
        }
        
        return report;
    }
}

// Global instance
const tokenTracker = new TokenUsageTracker();
```

## AI Service Layer

### Project Question Service

```javascript
// src/services/ProjectQuestionService.js
class ProjectQuestionService {
    constructor(provider) {
        this.provider = provider;
    }
    
    async askQuestion(projectXml, question, history = [], options = {}) {
        const messages = this.buildMessages(projectXml, question, history);
        const response = await this.provider.generateCompletion(messages, options);
        
        // Track usage
        tokenTracker.track(
            this.provider.name,
            options.model || this.provider.getDefaultModel(),
            response.usage
        );
        
        return response;
    }
    
    async askQuestionStream(projectXml, question, history = [], options = {}) {
        const messages = this.buildMessages(projectXml, question, history);
        const stream = await this.provider.generateStream(messages, options);
        
        // Wrap stream to track usage
        const provider = this.provider;
        const model = options.model || provider.getDefaultModel();
        
        return (async function* () {
            let totalText = '';
            
            for await (const chunk of stream) {
                totalText += chunk.text;
                yield chunk;
            }
            
            // Estimate token usage for streaming
            const tokens = await provider.countTokens(totalText);
            tokenTracker.track(provider.name, model, {
                completionTokens: tokens
            });
        })();
    }
    
    buildMessages(projectXml, question, history) {
        const systemPrompt = `You are a helpful assistant analyzing a codebase. 
The user will ask questions about the following project structure and code:

${projectXml}

Please provide accurate, helpful answers based on the code provided.`;
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: question }
        ];
        
        return messages;
    }
}
```

### AI File Filter Service

```javascript
// src/services/AIFilterService.js
class AIFilterService {
    constructor(provider) {
        this.provider = provider;
    }
    
    async filterFiles(files, query, options = {}) {
        const fileList = files.map(f => f.path).join('\n');
        
        const prompt = `Given the following list of files, select only those that are relevant to: "${query}"

Return only the file paths that match, one per line, with no additional text or explanation.

Files:
${fileList}`;
        
        const response = await this.provider.generateCompletion([
            { role: 'user', content: prompt }
        ], {
            temperature: 0.3,
            maxTokens: 1000,
            ...options
        });
        
        // Parse response
        const selectedPaths = response.text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        // Filter files
        return files.filter(file => 
            selectedPaths.includes(file.path)
        );
    }
}
```

## Configuration

### Environment Variables
```bash
# .env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...
FIREWORKS_API_KEY=...

# Default models
OPENAI_MODEL=gpt-3.5-turbo
GEMINI_MODEL=gemini-1.5-flash
ANTHROPIC_MODEL=claude-3-haiku-20240307

# Default provider
AI_DEFAULT_PROVIDER=gemini
```

### Configuration File
```javascript
// config/ai.js
module.exports = {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
    
    providers: {
        openai: {
            baseURL: process.env.OPENAI_BASE_URL,
            timeout: 30000,
            maxRetries: 3
        },
        gemini: {
            timeout: 30000,
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_ONLY_HIGH'
                }
            ]
        },
        anthropic: {
            timeout: 30000,
            maxRetries: 3
        }
    },
    
    // Rate limiting
    rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 90000
    },
    
    // Caching
    cache: {
        enabled: true,
        ttl: 3600, // 1 hour
        maxSize: 100 // MB
    }
};
```

## Error Handling

```javascript
// src/ai/errors.js
class AIError extends Error {
    constructor(message, provider, details = {}) {
        super(message);
        this.name = 'AIError';
        this.provider = provider;
        this.details = details;
    }
}

class RateLimitError extends AIError {
    constructor(provider, retryAfter) {
        super(`Rate limit exceeded for ${provider}`, provider, { retryAfter });
        this.name = 'RateLimitError';
    }
}

class ModelNotFoundError extends AIError {
    constructor(provider, model) {
        super(`Model ${model} not found for ${provider}`, provider, { model });
        this.name = 'ModelNotFoundError';
    }
}

// Middleware for error handling
async function withAIErrorHandling(fn) {
    try {
        return await fn();
    } catch (error) {
        if (error.status === 429) {
            throw new RateLimitError(
                error.provider,
                error.headers?.['retry-after']
            );
        }
        
        if (error.code === 'model_not_found') {
            throw new ModelNotFoundError(error.provider, error.model);
        }
        
        throw new AIError(
            error.message,
            error.provider,
            { originalError: error }
        );
    }
}
```

## Testing Strategy

```javascript
// tests/ai/providers/OpenAIProvider.test.js
describe('OpenAIProvider', () => {
    let provider;
    
    beforeEach(() => {
        provider = new OpenAIProvider({
            apiKey: 'test-key'
        });
        
        // Mock the OpenAI client
        jest.spyOn(provider.client.chat.completions, 'create')
            .mockResolvedValue(mockCompletion);
    });
    
    it('should generate completion', async () => {
        const response = await provider.generateCompletion([
            { role: 'user', content: 'Hello' }
        ]);
        
        expect(response.text).toBe('Hello! How can I help you?');
        expect(response.usage).toBeDefined();
    });
    
    it('should handle streaming', async () => {
        const stream = await provider.generateStream([
            { role: 'user', content: 'Hello' }
        ]);
        
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk.text);
        }
        
        expect(chunks.join('')).toBe('Hello! How can I help you?');
    });
});
```

## Migration Checklist

- [ ] Implement base AIProvider class
- [ ] Create AIProviderFactory
- [ ] Implement OpenAI provider
- [ ] Implement Gemini provider
- [ ] Implement Anthropic provider
- [ ] Add Fireworks provider
- [ ] Create token usage tracking
- [ ] Implement cost calculation
- [ ] Add streaming support
- [ ] Create service layer (Question, Filter)
- [ ] Add error handling
- [ ] Implement caching
- [ ] Add rate limiting
- [ ] Create comprehensive tests
- [ ] Document provider APIs
- [ ] Add provider comparison guide