# Prism Package Internal Documentation

Prism is a Laravel package that simplifies integrating Large Language Models (LLMs) into applications, providing a unified interface for multiple AI providers. This document summarizes its core functionality, configuration, and advanced features for internal reference.

## Overview
- **Purpose**: Enables seamless integration of LLMs for text generation, embeddings, structured output, and multimodal interactions (text, images, documents).
- **Key Features**:
  - Unified provider interface for switching between AI providers (e.g., OpenAI, Anthropic, Gemini).
  - Fluent API for text generation, embeddings, and structured output.
  - Support for custom tools, streaming, and multimodal inputs.
  - Robust error handling and provider-specific configurations.
- **Laravel Integration**: Built for Laravel 11+ with PHP 8.2+, using Laravel's HTTP client and configuration system.

## Installation
- **Requirements**: PHP 8.2+, Laravel 11+.
- **Composer**: `composer require prism-php/prism`.
- **Configuration**: Publish config with `php artisan vendor:publish --tag=prism-config`, creating `config/prism.php`.

## Configuration
- **File**: `config/prism.php` defines provider settings and Prism Server options.
- **Providers**: Configure API keys and URLs via environment variables (e.g., `OPENAI_API_KEY`, `ANTHROPIC_URL`).
- **Example**:
  ```php
  'providers' => [
      'openai' => ['api_key' => env('OPENAI_API_KEY'), 'url' => env('OPENAI_URL')],
      'anthropic' => ['api_key' => env('ANTHROPIC_API_KEY')],
      'deepseek' => ['api_key' => env('DEEPSEEK_API_KEY')],
      'gemini' => ['api_key' => env('GEMINI_API_KEY')],
      'groq' => ['api_key' => env('GROQ_API_KEY')],
      'xai' => ['api_key' => env('XAI_API_KEY')],
  ],
  'prism_server' => ['enabled' => env('PRISM_SERVER_ENABLED', true)],
  ```
- **Overrides**: Use `using()` or `usingProviderConfig()` to dynamically override provider settings.

## Latest Model Recommendations (May 2025)

### Production-Ready Models by Use Case

**Best Overall Quality**:
- Anthropic: `claude-4-opus-20250514` ($15/$75 per M tokens)
- OpenAI: `gpt-4.1` ($2/$8 per M tokens)
- Google: `gemini-2.5-pro` ($1.25-2.50/$10-15 per M tokens)

**Cost-Effective**:
- DeepSeek: `deepseek-chat` ($0.27/$1.10 per M tokens)
- OpenAI: `gpt-4.1-nano` ($0.10/$0.40 per M tokens)
- Anthropic: `claude-3-5-haiku-20241022` ($1/$5 per M tokens)

**Fast Inference**:
- Groq: `llama-3.3-70b-versatile` (LPU optimized)
- Mistral: `mistral-small-latest` ($0.10/$0.30 per M tokens)

**Reasoning Tasks**:
- OpenAI: `o3` or `o4-mini-2025-04-16` ($1.10/$4.40 per M tokens)
- DeepSeek: `deepseek-reasoner` ($0.55/$2.19 per M tokens)

**Local Deployment**:
- Ollama: `llama3.1:70b-instruct-q4_K_M` (recommended quantization)

**Embeddings**:
- VoyageAI: `voyage-3.5` ($0.12 per M tokens)
- OpenAI: `text-embedding-3-large`

## Core Features

### Text Generation
- **Usage**: Generate text with a fluent API.
- **Example**:
  ```php
  use Prism\Prism\Prism;
  use Prism\Prism\Enums\Provider;
  
  // Latest Claude 4
  $response = Prism::text()
      ->using(Provider::Anthropic, 'claude-4-sonnet-20250514')
      ->withPrompt('Explain quantum computing.')
      ->asText();
  
  // GPT-4.1 for general use
  $response = Prism::text()
      ->using(Provider::OpenAI, 'gpt-4.1')
      ->withPrompt('Generate a business plan outline.')
      ->asText();
  
  // Cost-effective option
  $response = Prism::text()
      ->using(Provider::DeepSeek, 'deepseek-chat')
      ->withPrompt('Summarize this article.')
      ->asText();
  ```
- **Options**: `withSystemPrompt`, `withMessages`, `withMaxTokens`, `usingTemperature`, `usingTopP`, `withClientOptions`.

### Streaming Output
- **Purpose**: Streams text in real-time for responsive user experiences.
- **Example**:
  ```php
  $response = Prism::text()
      ->using(Provider::OpenAI, 'gpt-4.1')
      ->withPrompt('Write a story.')
      ->asStream();
  foreach ($response as $chunk) {
      echo $chunk->text;
      ob_flush();
      flush();
  }
  ```
- **Supports**: Tool interactions, Laravel event streams.

### Structured Output
- **Purpose**: Returns AI responses in a defined JSON schema.
- **Example**:
  ```php
  $schema = new ObjectSchema(name: 'review', properties: [
      new StringSchema('title', 'Movie title'),
      new StringSchema('rating', 'Rating'),
  ], requiredFields: ['title', 'rating']);
  
  $response = Prism::structured()
      ->using(Provider::OpenAI, 'gpt-4.1')
      ->withSchema($schema)
      ->withPrompt('Review Inception')
      ->asStructured();
  echo $response->structured['title'];
  ```
- **Modes**: Strict (schema-validated) or JSON (approximate).

### Embeddings
- **Purpose**: Converts text to vector representations for semantic search or recommendations.
- **Example**:
  ```php
  // Best quality embeddings
  $response = Prism::embeddings()
      ->using(Provider::VoyageAI, 'voyage-3.5')
      ->fromInput('Sample text')
      ->asEmbeddings();
  
  // OpenAI alternative
  $response = Prism::embeddings()
      ->using(Provider::OpenAI, 'text-embedding-3-large')
      ->fromInput('Sample text')
      ->asEmbeddings();
  
  $vector = $response->embeddings[0]->embedding;
  ```
- **Input Methods**: `fromInput`, `fromFile`, `fromArray`.

### Schemas
- **Purpose**: Defines data structures for structured output or tool parameters.
- **Types**: `StringSchema`, `NumberSchema`, `BooleanSchema`, `ArraySchema`, `EnumSchema`, `ObjectSchema`.
- **Example**:
  ```php
  $schema = new ObjectSchema(name: 'user', properties: [
      new StringSchema('name', 'User name'),
      new ArraySchema(name: 'hobbies', items: new StringSchema('hobby', 'Hobby')),
  ], requiredFields: ['name']);
  ```
- **Nullable Fields**: Set `nullable: true` for optional fields.

### Tools
- **Purpose**: Extends AI with custom functions.
- **Example**:
  ```php
  $tool = Tool::as('weather')
      ->for('Get weather')
      ->withStringParameter('city', 'City name')
      ->using(fn($city) => "Sunny in {$city}");
  
  $response = Prism::text()
      ->using(Provider::Anthropic, 'claude-3-5-sonnet-20241022')
      ->withMaxSteps(2)  // Required for tools
      ->withTools([$tool])
      ->withPrompt('Weather in Paris?')
      ->asText();
  ```

### Prism Server
- **Purpose**: Exposes Prism models via an OpenAI-compatible API.
- **Setup**: Register models in a service provider.
- **Example**:
  ```php
  PrismServer::register('custom-model', fn() => Prism::text()
      ->using(Provider::Anthropic, 'claude-4-sonnet-20250514'));
  ```
- **Endpoints**: `/prism/openai/v1/chat/completions`, `/prism/openai/v1/models`.

### Multimodal Inputs
- **Images**:
  ```php
  $message = new UserMessage('Analyze image', [Image::fromPath('image.jpg')]);
  Prism::text()
      ->using(Provider::Gemini, 'gemini-2.0-flash-001')
      ->withMessages([$message])
      ->generate();
  ```
- **Documents**: Supports PDF, text, markdown (provider-dependent).
  ```php
  $message = new UserMessage('Analyze PDF', [Document::fromPath('doc.pdf')]);
  ```

## Providers & Model Strings

### Supported Providers
- **Anthropic**: Claude 4 series, Claude 3.5/3.7 models
  - Latest: `claude-4-opus-20250514`, `claude-4-sonnet-20250514`
  - Production: `claude-3-5-sonnet-20241022`, `claude-3-7-sonnet-latest`
- **DeepSeek**: V3 and R1 reasoning models
  - `deepseek-chat`, `deepseek-reasoner`
- **Gemini**: 2.5 and 2.0 series with thinking capabilities
  - `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash-001`
- **Groq**: LPU-optimized inference
  - `llama-3.3-70b-versatile`, `mixtral-8x7b`, `gemma2-9b-it`
- **Mistral**: Medium 3, Small 3.1, Devstral
  - `mistral-medium-latest`, `mistral-small-latest`, `devstral-small-latest`
- **Ollama**: Local models with quantization
  - `llama3.1:70b-instruct-q4_K_M`, `phi4:14b`, `deepseek-r1`
- **OpenAI**: GPT-4.1 series, o-series reasoning
  - `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o3`, `o4-mini-2025-04-16`
- **VoyageAI**: Embeddings only
  - `voyage-3.5`, `voyage-3.5-lite`, `voyage-multimodal-3`
- **xAI**: Grok models
  - `grok-2-1212`, `grok-2-vision-1212`, `grok-beta`

### Features by Provider
See `components/ProviderSupport.vue` for detailed feature matrix.

### Custom Providers
```php
$this->app['prism-manager']->extend('custom', fn($app, $config) => new CustomProvider($config['api_key']));
```

## Error Handling
- **Exceptions**:
  - `PrismException`: General errors.
  - `PrismServerException`: Server errors.
  - `PrismRateLimitedException`: Rate limit hits.
  - `PrismProviderOverloadedException`: Provider capacity issues.
  - `PrismRequestTooLargeException`: Oversized requests.
  - `PrismStructuredDecodingException`: Invalid JSON in structured responses.
- **Example**:
  ```php
  try {
      $response = Prism::text()->generate();
  } catch (PrismRateLimitedException $e) {
      foreach ($e->rateLimits as $limit) {
          // Handle rate limit
      }
  }
  ```

## Rate Limits
- **Handling**: Throws `PrismRateLimitedException` with `ProviderRateLimit` objects (`name`, `limit`, `remaining`, `resetsAt`).
- **Dynamic Limiting**: Rate limit info available in `response->meta->rateLimits`.
- **Example**:
  ```php
  try {
      $response = Prism::text()->generate();
  } catch (PrismRateLimitedException $e) {
      $limit = Arr::first($e->rateLimits, fn($rl) => $rl->remaining === 0);
  }
  ```

## Provider Interoperability
- **Method**: `whenProvider` customizes requests per provider.
- **Example**:
  ```php
  $response = Prism::text()
      ->using(Provider::OpenAI, 'gpt-4.1')
      ->withPrompt('Story about robots')
      ->whenProvider(Provider::Anthropic, fn($req) => $req->withMaxTokens(4000))
      ->whenProvider(Provider::Gemini, fn($req) => $req->withProviderOptions(['thinkingBudget' => 300]))
      ->asText();
  ```

## Best Practices
- **Model Selection**:
  - Use dated versions in production (avoid `-latest` aliases)
  - Match model to task: reasoning models for complex logic, fast models for simple tasks
  - Consider cost vs quality tradeoffs
- **System Prompts**: Use `withSystemPrompt` for provider compatibility.
- **Error Handling**: Catch specific exceptions for robust apps.
- **Schemas**: Define clear, required, and nullable fields.
- **Vector Storage**: Use vector databases (e.g., Milvus, Qdrant, pgvector) for embeddings.
- **Rate Limits**: Implement Laravel rate limiters for each provider limit.
- **Context Windows**: Check model limits (GPT-4.1: 1M, Claude: 200K, Gemini 2.5: 1M)

## Limitations
- **Provider-Specific**:
  - Anthropic: No native structured output; uses workaround.
  - DeepSeek: No embeddings, tool choice, or images.
  - Ollama: No image URLs, tool choice.
  - OpenAI: No `ToolChoice::Any`, caching issues with JSON mode.
  - Gemini: Single embedding at a time only.
- **General**: Schema validation planned for future release.

## Testing
- **Fakes**: Use `Prism::fake()` with `TextResponseFake` for unit tests.
- **Example**:
  ```php
  Prism::fake([
      TextResponseFake::make()
          ->withText('Fake response')
          ->withUsage(new Usage(10, 20))
  ]);
  ```

## Azure OpenAI & AWS Bedrock
- **Azure**: Uses deployment names instead of model strings
  - Deploy models like `gpt-4.1`, `o4-mini-2025-04-16` with custom names
- **AWS Bedrock**: Uses model IDs like `anthropic.claude-3-5-sonnet-20241022-v2:0`
  - Supports Titan embeddings: `amazon.titan-embed-text-v2:0`

This summary covers Prism's core mechanics and usage with the latest model recommendations as of May 2025. Refer to provider-specific files (e.g., `providers/openai.md`) for detailed configurations and limitations.