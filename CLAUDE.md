# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL: Migration in Progress

**This is an active migration project from PHP to Node.js. The codebase is currently being built from scratch.**

### Current Status
- **Phase**: Foundation & Implementation
- **Progress**: Basic structure established, core commands need implementation
- **Timeline**: 6-8 weeks total migration effort
- **Complexity**: High - 12 commands, 13 transformers, complex pipeline architecture

### Essential Migration Documentation

Before working on this project, **you MUST review these documents** in order:

1. **[docs/migration-roadmap.md](./docs/migration-roadmap.md)** - Master plan with phases and timeline
2. **[docs/php-migration.md](./docs/php-migration.md)** - Comprehensive migration strategy (160-320 hours)
3. **[docs/architecture-comparison.md](./docs/architecture-comparison.md)** - PHP vs Node.js architecture mapping
4. **[docs/command-migration-guide.md](./docs/command-migration-guide.md)** - Detailed implementation for each command

### Key Technical Documents

- **[docs/file-transformation-pipeline.md](./docs/file-transformation-pipeline.md)** - 13 transformer implementations
- **[docs/ai-integration-strategy.md](./docs/ai-integration-strategy.md)** - Multi-provider AI architecture
- **[docs/configuration-migration-guide.md](./docs/configuration-migration-guide.md)** - Configuration system design
- **[docs/dependency-mapping-guide.md](./docs/dependency-mapping-guide.md)** - PHP to Node.js package mappings

## Project Overview

CopyTree is a sophisticated CLI tool that:
- Copies directory structures and file contents into structured XML format
- Features AI-powered file filtering using natural language queries
- Integrates deeply with Git for modified/changed file filtering
- Includes 13 file transformers (PDFs, images with OCR, AI summaries)
- Provides conversational AI interface for codebase Q&A
- Supports profile-based file selection with auto-detection

**Original PHP Implementation**: `/Users/gpriday/Dropbox/PHP/copytree` - Use `Task` tool to analyze when needed.

## Current Implementation Status

### ✅ Completed
- Basic project structure
- Commander.js CLI setup
- Some utility modules (fileFilter, patternExpander)
- Initial command files (structure only)

### 🚧 In Progress
- **Pipeline Architecture** - Core processing engine
- **Configuration System** - Laravel-like config management
- **Main Copy Command** - Primary functionality

### ❌ Not Started
- File transformation pipeline (13 transformers)
- AI provider implementations (OpenAI, Gemini, Anthropic)
- Git integration features
- Profile system with auto-detection
- Watch mode
- MCP protocol support
- Comprehensive test suite

## Development Priority

Follow the phased approach in [migration-roadmap.md](./docs/migration-roadmap.md):

1. **Current Focus**: Pipeline architecture and configuration system
2. **Next**: Basic copy command with file discovery
3. **Then**: Transformers and Git integration
4. **Finally**: AI features and additional commands

## Architecture Guidelines

### Pipeline Implementation
The pipeline is the heart of CopyTree. Reference the PHP implementation:
```php
// PHP Pipeline stages
app(Pipeline::class)
    ->send($files)
    ->through([stages...])
    ->thenReturn();
```

Must support:
- Sequential stage processing
- Event emission for progress
- Error handling with recovery
- Memory-efficient streaming

### Command Structure
Each command in `src/commands/` should:
- Export an async function
- Handle all options from PHP version
- Include proper error handling
- Support dry-run where applicable

### Configuration System
Implement hierarchical configuration like Laravel:
- Default configs in `config/`
- User overrides in `~/.copytree/`
- Environment variable overrides
- Runtime modifications

## Critical Implementation Notes

### Async/Await Patterns
```javascript
// Always use async/await, never callbacks
const files = await discoverFiles(path);
const transformed = await Promise.all(
    files.map(file => transformer.transform(file))
);
```

### Memory Management
For large projects, use streams:
```javascript
const stream = fs.createReadStream(filePath);
// Process in chunks, don't load entire file
```

### Error Handling
```javascript
class CommandError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
```

## Testing Requirements

- Minimum 80% code coverage
- Unit tests for all utilities
- Integration tests for commands
- E2E tests with real projects
- Performance benchmarks

## Dependencies to Install

As you implement features, install these packages:

```bash
# Core (Phase 1)
npm install dotenv fs-extra glob fast-glob ignore

# Transformers (Phase 2)
npm install pdf-parse tesseract.js marked sharp

# AI Providers (Phase 4)
npm install openai @anthropic-ai/sdk tiktoken

# Additional
npm install ora chalk inquirer js-yaml
```

## Key Differences from PHP Version

1. **No AI Profile Creation** - Explicitly excluded from Node.js version
2. **Direct API Clients** - No Prism equivalent, use provider SDKs directly
3. **Manual DI** - No Laravel service container
4. **CommonJS** - Using require/module.exports, not ES modules

## Performance Targets

- Process 10,000 files in under 30 seconds
- Stay under 500MB memory for large projects
- Support projects up to 100MB total size
- Stream files larger than 10MB

## When Working on This Project

1. **Always consult the PHP version** for feature parity
2. **Follow the migration phases** - don't skip ahead
3. **Write tests as you go** - don't defer testing
4. **Document complex logic** - this is a complex system
5. **Ask for clarification** when PHP behavior is unclear

## Resources

- PHP Source: `/Users/gpriday/Dropbox/PHP/copytree`
- All Docs: `./docs/`
- Original README: Review for feature list
- Test Projects: Create in `tests/fixtures/projects/`

Remember: This is a sophisticated application with complex requirements. Take time to understand the architecture before implementing features.