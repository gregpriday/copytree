# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CopyTree is a sophisticated CLI tool for intelligently copying and transforming project structures for AI consumption. It features:

- **Intelligent file selection** using profiles
- **15+ file transformers** for PDFs, images, code, and documents
- **Deep Git integration** for tracking changes and modifications

- **External sources** support (GitHub repositories)

## Architecture

### Core Components

**Pipeline System** (`src/pipeline/`)
- Event-driven processing pipeline with 16 specialized stages
- Memory-efficient streaming for large files
- Error recovery and graceful degradation

**Commands** (`src/commands/`)
- `copy.js` - Main copy command with extensive options
- Profile commands: `profileList.js`, `profileValidate.js`
- Utility commands: `configValidate.js`, `cacheClear.js`, `copyDocs.js`
- Installation helpers: `installCopytree.js`

**Transformers** (`src/transforms/transformers/`)
- Text: FirstLines, Markdown, HTMLStripper, MarkdownLinkStripper
- Documents: PDF, DocumentToText, CSV
- Images: Image (OCR), ImageDescription (AI), SVGDescription
- AI-powered: AISummary, FileSummary, UnitTestSummary
- Utilities: FileLoader, Binary

**Services** (`src/services/`)
- `AIService.js` - Gemini AI integration
- `CacheService.js` - Response caching
- `GitHubUrlHandler.js` - GitHub repository handling
- `ProfileGuesser.js` - Auto-detect project types

### Configuration System

Hierarchical configuration with multiple sources:
1. Default configs in `config/`
2. User overrides in `~/.copytree/`
3. Environment variables
4. Runtime options

### Profile System

- **Built-in profiles**: Default only
- **No auto-detection** - Always uses default profile
- **YAML-based** configuration for custom profiles
- **Inheritance** support for profile composition

## Documentation

Comprehensive documentation available in `docs/`:

- **[docs/index.md](./docs/index.md)** - Getting started guide
- **[docs/cli/copytree-reference.md](./docs/cli/copytree-reference.md)** - Complete CLI reference
- **[docs/profiles/transformer-reference.md](./docs/profiles/transformer-reference.md)** - All transformers documented
- **[docs/usage/troubleshooting.md](./docs/usage/troubleshooting.md)** - Common issues

## Quick Reference

```bash
# Basic usage
copytree                         # Copy current directory
copytree /path/to/project        # Copy specific directory
copytree https://github.com/...  # Copy GitHub repository

# Profiles & filtering
copytree --profile default       # Use default profile
copytree --git-modified          # Only modified files
copytree --git-branch main       # Compare with branch

# Transformers
copytree --transform             # Enable all transformers
copytree --no-transform          # Disable transformers

# Output options
copytree --save output.xml       # Save to file
copytree --display               # Show in terminal
copytree --clipboard             # Copy to clipboard

# Profile management
copytree profile:list            # List profiles
copytree profile:validate        # Validate profile
```

## Development Guidelines

### Git Workflow

- **Git Flow** - This project follows Git Flow branching model
- **No automatic commits** - NEVER make commits unless explicitly asked by the user
- **No automatic changelog** - NEVER create or update CHANGELOG entries unless:
  - Explicitly asked by the user AND
  - Currently on a release branch (e.g., `release/x.y.z`)
- **Branch naming**:
  - Feature branches: `feature/description`
  - Release branches: `release/x.y.z`
  - Hotfix branches: `hotfix/description`
  - Development branch: `develop`
  - Production branch: `main` or `master`

### Code Style

- **CommonJS modules** - Use `require()` and `module.exports`
- **Async/await** - No callbacks, use promises
- **Error handling** - Use custom error classes
- **Logging** - Use the logger service consistently

### Testing

```bash
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:coverage     # Coverage report
```

Test structure:
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Performance benchmarks: `tests/performance/`
- Test fixtures: `tests/fixtures/`

### Performance Targets

- Process 10,000 files in < 30 seconds
- Memory usage < 500MB for large projects
- Support projects up to 100MB total size
- Stream files > 10MB

### Error Handling

```javascript
const { CommandError, ValidationError } = require('./utils/errors');

// Throw specific errors
throw new CommandError('Message', 'ERROR_CODE', { details });

// Handle in commands
try {
  await operation();
} catch (error) {
  if (error instanceof ValidationError) {
    logger.error('Validation failed:', error.message);
  }
  throw error;
}
```

## Key Features

### AI Integration
- **Provider**: Google Gemini (gemini-1.5-flash/pro)
- **Features**: Summaries, image descriptions
- **Caching**: Responses cached for performance

### Git Integration
- Track modified files (`--git-modified`)
- Compare branches (`--git-branch`)
- Filter by commit range
- Respect `.gitignore` patterns

### External Sources
- Include files from GitHub repositories
- Support for specific branches/tags
- Local directory inclusion
- Rule-based filtering for external files

### Transform Pipeline
1. **File Discovery** - Find files based on patterns
2. **Profile Filtering** - Apply profile rules
3. **Git Filtering** - Apply git-based filters
4. **Transformation** - Apply file transformers
5. **Output Formatting** - XML/JSON output

## Current Status

- ✅ **Feature complete** - All planned features implemented
- ✅ **15+ transformers** - Comprehensive file processing
- ✅ **Full pipeline** - 16 processing stages
- ✅ **AI integration** - Gemini provider with caching
- ✅ **Git integration** - Complete git functionality
- 📝 **Documentation** - Comprehensive user docs

## Dependencies

All dependencies are installed and managed via npm:

### Core
- CLI: commander, chalk, ora, inquirer
- File System: fs-extra, glob, fast-glob
- Config: dotenv, js-yaml
- Git: simple-git
- Utilities: lodash, rimraf, adm-zip

### Transformers
- PDF: pdf-parse
- Images: sharp, tesseract.js, canvas
- Markdown: marked
- CSV: csv-parse
- Documents: External tools (pandoc)

### AI
- Google Generative AI SDK

## Resources

- **Documentation**: `./docs/` - User and developer guides
- **Test Fixtures**: `tests/fixtures/` - Sample projects
- **Built-in Profiles**: `profiles/` - YAML profile definitions
- **Configuration**: `config/` - Default settings

## Best Practices

1. **Use profiles** for consistent file selection
2. **Enable caching** for AI operations
3. **Set file limits** to prevent memory issues
4. **Test with dry-run** before large operations
5. **Use .copytreeignore** for exclusions
6. **Monitor memory** usage for large projects

## Troubleshooting

See [docs/usage/troubleshooting.md](./docs/usage/troubleshooting.md) for:
- Common errors and solutions
- Performance optimization tips
- Configuration debugging
- AI provider issues
- Memory management