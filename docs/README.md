# CopyTree Node.js Migration Documentation

This directory contains comprehensive planning and implementation guides for migrating CopyTree from PHP/Laravel Zero to Node.js.

## 📋 Migration Planning Documents

### 1. [Migration Roadmap](./migration-roadmap.md)
The master plan with phased implementation timeline and quick reference to all other documents.

### 2. [Architecture Comparison](./architecture-comparison.md)
Side-by-side comparison of PHP/Laravel Zero and Node.js architectures, including:
- Project structure mapping
- Design pattern translations
- Key architectural differences

### 3. [Dependency Mapping Guide](./dependency-mapping-guide.md)
Comprehensive mapping of PHP packages to Node.js equivalents:
- Core framework dependencies
- File system operations
- AI/LLM integrations
- Testing frameworks

### 4. [Command Migration Guide](./command-migration-guide.md)
Detailed implementation instructions for each command:
- CopyTreeCommand (main functionality)
- AskCommand (AI Q&A)
- WatchCommand (file watching)
- All utility commands

### 5. [File Transformation Pipeline](./file-transformation-pipeline.md)
Complete transformer architecture documentation:
- Pipeline implementation
- Transformer registry
- All 13 transformer implementations
- Performance optimization strategies

### 6. [AI Integration Strategy](./ai-integration-strategy.md)
Multi-provider AI architecture design:
- Provider abstraction layer
- OpenAI, Gemini, Anthropic implementations
- Token tracking and cost management
- Service layer design

### 7. [Configuration Migration Guide](./configuration-migration-guide.md)
Configuration system architecture:
- Environment variable handling
- Hierarchical configuration
- User configuration support
- Dynamic configuration

### 8. [Testing Strategy](./testing-strategy.md)
Comprehensive testing approach:
- Unit, integration, and E2E tests
- Performance benchmarking
- CI/CD setup
- Testing best practices

## 🚀 Quick Start

1. Start with the [Migration Roadmap](./migration-roadmap.md) for an overview
2. Reference specific guides as you implement each component
3. Use the existing PHP migration guide at [php-migration.md](./php-migration.md) for context

## 📁 Other Documents

- [PHP Migration Overview](./php-migration.md) - Original migration plan
- [Clipboard Implementation Guide](./clipboard-implementation-guide.md) - macOS clipboard details
- [GitIgnore Migration Guide](./gitignore-migration-guide.md) - Git integration specifics

## 💡 Key Decisions

1. **No AI Profile Creation**: The Node.js version will not include AI-powered profile creation
2. **CommonJS Module System**: Using CommonJS instead of ES modules
3. **Direct API Clients**: Using direct AI provider clients instead of a unified library like Prism

## 📊 Implementation Timeline

- **Week 1**: Foundation & Configuration
- **Week 2**: File Processing & Basic Copy
- **Week 3**: Advanced Features & Git
- **Week 4**: AI Integration
- **Week 5**: Additional Commands
- **Week 6**: Testing & Polish

Total estimated effort: **6 weeks** for a developer familiar with both PHP and Node.js.