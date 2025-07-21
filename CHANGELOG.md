# Changelog

All notable changes to CopyTree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive test suite with 80%+ coverage target
- Performance benchmarking tool and monitoring utilities
- Enhanced README with detailed usage examples and troubleshooting
- Integration tests for CLI commands
- Performance optimization utilities

### Changed
- Improved error handling and validation across all modules

### Fixed
- Fixed pattern matching edge cases in TransformerRegistry
- Improved configuration loading reliability

## [1.0.0] - 2025-07-21

### Added
- **Phase 1: Foundation**
  - Complete Node.js project structure with pipeline architecture
  - ConfigManager for hierarchical configuration (global, user, project)
  - Commander.js CLI with comprehensive command routing
  - Pipeline system with stage-based processing
  - Error handling with custom error classes
  - Logging system with configurable levels

- **Phase 2: File Processing** 
  - File discovery with glob patterns and gitignore support
  - TransformerRegistry with 7 built-in transformers:
    - FileLoader, Markdown, CSV, PDF, Image (OCR), Binary, AI Summary
  - Profile system with built-in profiles (default, Laravel, SvelteKit)
  - XML output generation with structured format
  - Clipboard integration for seamless workflow

- **Phase 3: Advanced Features**
  - Git integration with simple-git for modified/changed file filtering
  - Advanced transformers with caching support
  - Multiple output formats (XML, JSON, tree view)
  - File/directory streaming and size limits
  - External source support (GitHub URLs, directory merging)

- **Phase 4: AI Integration**
  - Google Gemini AI provider (simplified from multi-provider approach)
  - AI-powered file filtering using natural language queries
  - Code summarization transformer for large files
  - Conversational ask command with state management
  - Streaming responses and caching for AI operations
  - AIService with retry logic and rate limiting

- **Phase 5: Additional Commands**
  - `profile:list` - List all available profiles with detailed info
  - `profile:validate` - Validate profile syntax and structure
  - `config:validate` - Comprehensive configuration validation
  - `install:claude` - Claude Code MCP integration setup
  - `watch` - File monitoring with chokidar and auto-regeneration
  - `cache:clear` - Clear AI and transformation caches

- **Phase 6: Testing & Polish**
  - Unit tests for core utilities and services
  - Integration tests for CLI commands
  - Performance benchmarking suite
  - Comprehensive documentation and examples
  - README with troubleshooting and migration guide

### Technical Features
- **Pipeline Architecture**: 8-stage processing pipeline for maximum flexibility
- **Memory Efficient**: Streaming processing for large codebases
- **Performance Monitoring**: Built-in performance tracking and optimization
- **Caching System**: Multi-layer caching for AI operations and file transforms
- **Error Recovery**: Robust error handling with detailed diagnostics
- **Configuration Management**: Laravel-style hierarchical configuration
- **Pattern Matching**: Consolidated to minimatch for consistency

### Dependencies
- Core: commander, dotenv, fs-extra, glob, minimatch, chalk, ora
- AI: @google/generative-ai for Gemini integration
- File Processing: pdf-parse, tesseract.js, marked, sharp
- Git: simple-git for repository operations
- Development: jest, eslint, prettier for code quality

### Breaking Changes from PHP Version
- **AI Providers**: Now uses Google Gemini exclusively (removed OpenAI, Anthropic)
- **Token Tracking**: Simplified - no token usage tracking
- **Profile Creation**: Removed AI profile creation feature
- **Configuration**: JavaScript-based instead of PHP arrays
- **Dependencies**: Direct API clients instead of Prism abstraction

### Migration Notes
- Environment variables use `GEMINI_API_KEY` instead of multiple provider keys
- Configuration files are JavaScript modules instead of PHP arrays
- Profile YAML files remain compatible
- Command syntax mostly preserved for familiar experience

## [0.1.0] - Initial Development

### Added
- Project initialization and basic structure setup
- Migration planning and architecture documentation
- PHP to Node.js mapping and dependency analysis

---

## Version Numbering

- **Major version** (1.x.x): Breaking changes or major new features
- **Minor version** (x.1.x): New features that are backwards compatible  
- **Patch version** (x.x.1): Bug fixes and small improvements

## Support

For questions, issues, or feature requests:
- GitHub Issues: [Repository Issues](https://github.com/username/copytree/issues)
- Documentation: See README.md for comprehensive usage guide
- Migration Help: See docs/migration-guide.md for PHP version migration