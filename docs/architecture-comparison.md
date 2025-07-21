# CopyTree Architecture Comparison: PHP vs Node.js

## Overview

This document provides a detailed architectural comparison between the original PHP/Laravel Zero implementation and the Node.js port of CopyTree. It serves as a reference for understanding how Laravel patterns translate to Node.js equivalents.

## Project Structure Comparison

### PHP/Laravel Zero Structure
```
copytree-php/
├── app/
│   ├── Commands/           # Artisan commands
│   ├── Constants/          # Application constants
│   ├── Events/             # Event classes
│   ├── Exceptions/         # Custom exceptions
│   ├── Helpers/            # Helper classes
│   ├── Pipeline/           # Processing pipeline
│   ├── Profiles/           # Profile management
│   ├── Providers/          # Service providers
│   ├── Renderer/           # Output rendering
│   ├── Services/           # Business logic
│   ├── Transforms/         # File transformers
│   └── Utilities/          # Utility classes
├── bootstrap/              # Application bootstrapping
├── config/                 # Configuration files
├── database/               # Database migrations
├── profiles/               # Built-in profiles
├── prompts/                # AI prompt templates
├── resources/              # Resource files
├── storage/                # Storage directory
└── tests/                  # Test suite
```

### Node.js Structure
```
copytree-node/
├── bin/
│   └── copytree.js         # CLI entry point
├── src/
│   ├── commands/           # Command handlers
│   ├── config.js           # Central configuration
│   ├── transforms/         # File transformers
│   ├── utils/              # Utility functions
│   │   ├── fileFilter.js
│   │   ├── patternExpander.js
│   │   ├── gitUtils.js
│   │   ├── aiFilter.js
│   │   └── clipboard.js
│   ├── services/           # Business logic services
│   └── pipeline/           # Processing pipeline
├── profiles/               # Built-in profiles
├── prompts/                # AI prompt templates
└── tests/                  # Test suite
```

## Core Architecture Patterns

### Command Pattern

**PHP/Laravel Zero:**
```php
class CopyTreeCommand extends Command
{
    protected $signature = 'copy {path?} {--ai-filter=} {--modified}';
    
    public function handle(): int
    {
        // Command logic
    }
}
```

**Node.js/Commander:**
```javascript
program.command('copy [path]')
    .option('--ai-filter <query>', 'AI file filter')
    .option('--modified', 'Git modified files')
    .action(async (path, options) => {
        // Command logic
    });
```

### Service Container vs Manual Dependency Management

**PHP/Laravel Zero:**
- Uses Laravel's IoC container for dependency injection
- Services registered in providers
- Automatic resolution of dependencies

**Node.js:**
- Manual dependency instantiation
- Service modules export factories or singletons
- Consider using a DI library like `awilix` for complex cases

### Pipeline Pattern

**PHP/Laravel Zero:**
```php
app(Pipeline::class)
    ->send($files)
    ->through([
        FileLoader::class,
        RulesetFilter::class,
        AIFilterStage::class,
        GitFilterStage::class,
        DeduplicateFilesStage::class,
        SortFilesStage::class,
    ])
    ->thenReturn();
```

**Node.js Implementation:**
```javascript
class Pipeline {
    constructor() {
        this.stages = [];
    }
    
    through(stages) {
        this.stages = stages;
        return this;
    }
    
    async process(input) {
        return this.stages.reduce(async (acc, stage) => {
            const result = await acc;
            return stage.process(result);
        }, Promise.resolve(input));
    }
}
```

## Configuration Management

### PHP/Laravel Zero:
- Config files in `config/` directory
- Accessed via `config()` helper
- Environment variables via `.env`
- Hierarchical configuration merging

### Node.js:
- Central `config.js` module
- Environment variables via `dotenv`
- User config in `~/.copytree/config.json`
- Manual configuration merging

## File System Operations

### PHP:
- Symfony Finder for file discovery
- Laravel's File facade
- Native PHP file functions

### Node.js:
- `fs-extra` for enhanced file operations
- `glob` for pattern matching
- `fast-glob` for performance
- Native `fs` promises API

## Dependency Mapping

| PHP Package | Purpose | Node.js Equivalent |
|------------|---------|-------------------|
| laravel-zero/framework | CLI framework | commander |
| symfony/finder | File discovery | glob, fast-glob |
| czproject/git-php | Git integration | simple-git |
| openai-php/client | OpenAI API | openai |
| @google/generative-ai | Gemini API | @google/generative-ai |
| spatie/pdf-to-text | PDF extraction | pdf-parse |
| league/commonmark | Markdown parsing | marked |
| symfony/yaml | YAML parsing | js-yaml |
| symfony/process | Process execution | child_process |
| logiscape/mcp-sdk-php | MCP protocol | Custom implementation |

## AI Integration Architecture

### PHP:
- Prism library for unified AI access
- Multiple provider support (OpenAI, Gemini, Fireworks)
- Token counting via TikToken
- Streaming response handling

### Node.js:
- Direct API client usage
- Provider abstraction layer needed
- Token counting via js-tiktoken
- Stream handling with Node.js streams

## Testing Architecture

### PHP:
- PHPUnit for unit tests
- Pest PHP for feature tests
- Mockery for mocking

### Node.js:
- Jest for unit and integration tests
- Built-in Jest mocking
- Supertest for CLI testing

## Event System

### PHP:
- Laravel's event dispatcher
- Event classes in `app/Events/`
- Listeners registered in providers

### Node.js:
- Native EventEmitter
- Event-driven architecture
- Consider event-emitter3 for performance

## Error Handling

### PHP:
- Custom exception classes
- Laravel's exception handler
- Structured error reporting

### Node.js:
- Custom error classes extending Error
- Global error handlers
- Async error boundaries

## Performance Considerations

### PHP:
- Opcache for performance
- Lazy loading via service providers
- Memory management via GC

### Node.js:
- V8 optimization
- Stream processing for large files
- Worker threads for parallelization

## Key Migration Challenges

1. **Service Container**: Node.js lacks a built-in DI container
2. **Pipeline Pattern**: Requires custom implementation
3. **Configuration**: No standard config system like Laravel
4. **Testing**: Different assertion styles and mocking approaches
5. **Async Handling**: Everything is async in Node.js
6. **Memory Management**: Different GC behavior
7. **Process Management**: No Artisan, need custom CLI handling

## Recommendations

1. **Use TypeScript**: For better type safety and IDE support
2. **Implement Pipeline Early**: Core to the application flow
3. **Abstract Providers**: Create provider interfaces for AI services
4. **Use Streams**: For large file processing
5. **Implement Logging**: Use winston or pino
6. **Add Monitoring**: Performance metrics for optimization
7. **Consider Workers**: For parallel file processing

## Migration Priority

1. Core pipeline infrastructure
2. Basic copy command
3. File transformers
4. AI integration
5. Git integration
6. Profile system
7. Advanced commands
8. MCP support