# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CopyTree is a sophisticated CLI tool for intelligently copying and transforming project structures for AI consumption. It features:

- **Intelligent file selection** using YAML-based profiles with inheritance support
- **17 specialized transformers** for PDFs, images, code, documents, and AI-powered analysis
- **Deep Git integration** for tracking changes and modifications
- **React/Ink-based terminal UI** with real-time progress and interactive components
- **External sources** support (GitHub repositories with automatic caching and updates)
- **Multi-provider AI integration** with automatic fallback and retry logic

## Architecture

### Module System
**IMPORTANT**: This project uses **ES Modules (ESM)**, not CommonJS:
- Use `import`/`export` syntax (NOT `require()`/`module.exports`)
- Entry point: `bin/copytree.js` with dynamic imports
- `package.json` has `"type": "module"`
- Use `import.meta.url` for path resolution
- Babel transpilation for Jest tests

### Core Components

**Entry Point** (`bin/copytree.js` - 256 lines)
- CLI argument parsing with Commander.js
- Dynamic Ink imports for React-based UI
- 12 commands: copy, profile:list, profile:validate, copy:docs, config:validate, config:inspect, cache:clear, install:copytree

**Pipeline System** (`src/pipeline/Pipeline.js` - 435 lines)
- **Event-driven architecture** using Node.js EventEmitter
- **16 specialized stages** executed sequentially with parallel processing support
- **Memory-efficient streaming** for files > 10MB
- **Error recovery** with `handleError()` lifecycle hooks
- **Automatic metrics collection**: timing, memory usage, input/output sizes
- **Comprehensive events**: `pipeline:start`, `pipeline:complete`, `stage:start`, `stage:complete`, `file:batch`
- See [Architecture Guide](./docs/technical/architecture.md) for detailed contracts

**Pipeline Stages** (16 total, all in `src/pipeline/stages/`):
1. `FileDiscoveryStage.js` - Discovers files using fast-glob
2. `GitFilterStage.js` - Filters by git status (modified, changed)
3. `ProfileFilterStage.js` - Applies exclude/filter patterns from profiles
4. `AlwaysIncludeStage.js` - Force-includes specific patterns
5. `ExternalSourceStage.js` - Includes files from GitHub/external sources
6. `LimitStage.js` - Limits to first N files
7. `FileLoadingStage.js` - Loads file contents into memory
8. `TransformStage.js` - Applies transformers based on file type
9. `CharLimitStage.js` - Enforces character limits
10. `InstructionsStage.js` - Adds custom instructions to output
11. `NPMStage.js` - Handles npm package.json analysis
12. `ComposerStage.js` - Handles PHP composer.json analysis
13. `DeduplicateFilesStage.js` - Removes duplicate files
14. `SortFilesStage.js` - Sorts files by path, size, or modification time
15. `OutputFormattingStage.js` - Formats to XML/JSON/Markdown/Tree
16. `StreamingOutputStage.js` - Streams large outputs to file/stdout

**Stage Base Class** (`src/pipeline/Stage.js` - 227 lines)
Each stage inherits from `Stage` with these lifecycle hooks:
- `onInit(context)` - One-time initialization
- `beforeRun(input)` - Pre-processing hook
- `process(input)` - Required implementation (main logic)
- `afterRun(output)` - Post-processing hook
- `handleError(error, input)` - Error recovery with fallback
- `validate(input)` - Optional input validation
- Helper methods: `log()`, `emitProgress()`, `emitFileEvent()`

**Commands** (`src/commands/`)
- `copy.js` - Main copy command with extensive options
- `profileList.js`, `profileValidate.js` - Profile management
- `configValidate.js`, `configInspect.js` - Configuration utilities
- `cacheClear.js` - Cache management
- `copyDocs.js` - Documentation copying
- `installCopytree.js` - Installation helpers

**Transformers** (`src/transforms/transformers/` - 17 total)
- **Text**: FileLoader, FirstLines, Markdown, HTMLStripper, MarkdownLinkStripper
- **Documents**: PDF (pdf-parse), DocumentToText (pandoc), CSV
- **Images**: Image (Tesseract OCR), ImageDescription (AI), SvgDescription
- **AI-powered**: AISummary, BatchAISummary, FileSummary, UnitTestSummary
- **Utilities**: Binary, StreamingFileLoader
- **Traits system**: Each transformer declares inputTypes, outputTypes, heavy, idempotent, dependencies
- **Registry** (`TransformerRegistry.js` - 740 lines): Manages priority, conflicts, optimization

**Services** (`src/services/`)
- `AIService.js` (378 lines) - Multi-provider AI integration with retry logic
- `CacheService.js` (375 lines) - Dual-layer (memory + file) caching
- `GitHubUrlHandler.js` (295 lines) - GitHub repository cloning and caching
- `InstructionsLoader.js` - Loads custom instructions from files
- `ProfileGuesser.js` - Auto-detect project types

**UI System** (`src/ui/` - React/Ink-based)
- 12 components: CopyProgress, FileBrowser, ProfileSelector, ConfigInspector, etc.
- Hooks for state management
- Contexts for shared state
- Real-time progress updates

### Configuration System

**ConfigManager** (`src/config/ConfigManager.js` - 527 lines)

**Hierarchical Loading** (in priority order):
1. **Default configs** in `config/` directory (always loaded first)
2. **User overrides** in `~/.copytree/` and `.copytree/` (deep merged)
3. **Environment variables** (highest priority, e.g., `GEMINI_API_KEY`)
4. **Runtime options** (command-line flags override all)

**Configuration Files** (`config/` directory):
- `ai.js` - AI provider configuration (Gemini API key, model, temperature)
- `app.js` - Application settings
- `cache.js` - Cache TTL, max size, directories
- `copytree.js` - File exclusions, size limits, binary handling
- `schema.json` (20,013 bytes) - JSON Schema validation with AJV
- `state.js` - State management config

**Features**:
- **Schema validation** using AJV with JSON Schema
- **Provenance tracking** - tracks which config source set each value
- **Laravel-style `env()` function** - e.g., `env('GEMINI_API_KEY', 'default')`
- **Dot notation access** - e.g., `config.get('ai.gemini.model', 'gemini-2.5-flash')`
- **Deep merging** of user configs with defaults

**User Configuration Locations**:
- Global: `~/.copytree/config.js` or `~/.copytree/config.json`
- Project: `.copytree/config.js` or `.copytree/config.json`
- Supports both `.js` (CommonJS exports) and `.json` files

**Environment Variable Mapping**:
```bash
GEMINI_API_KEY        → ai.gemini.apiKey
GEMINI_MODEL          → ai.gemini.model
COPYTREE_MAX_FILE_SIZE → copytree.maxFileSize
AI_CACHE_ENABLED      → ai.cache.enabled
```

### Profile System

**ProfileLoader** (`src/profiles/ProfileLoader.js` - 412 lines)

**Profile Search Paths** (in priority order):
1. **Project directory**: `.copytree/profilename.yml`
2. **User directory**: `~/.copytree/profiles/profilename.yml`
3. **Built-in profiles**: `profiles/profilename.yml`

**Profile Structure** (YAML format):
```yaml
name: string                 # Profile name
description: string          # Human-readable description
version: string              # Semantic version
extends: string              # Profile inheritance (e.g., "default")

include: string[]            # Glob patterns to include
exclude: string[]            # Glob patterns to exclude
filter: string[]             # Additional filtering patterns
always: string[]             # Always include these patterns

external:                    # External sources
  - source: string           # GitHub URL or local path
    destination: string      # Where to place in output
    rules: { include, exclude }
    optional: boolean        # Fail gracefully if unavailable

options:
  includeHidden: boolean
  followSymlinks: boolean
  respectGitignore: boolean
  maxFileSize: number
  maxTotalSize: number
  maxFileCount: number

transformers:                # Transformer configuration
  file-loader: true
  markdown: { enabled: true, options: { removeLinks: false } }
  pdf: false
  image-description: { enabled: true, options: { detail: "high" } }

output:
  format: string             # "markdown" | "xml" | "json" | "tree"
  includeMetadata: boolean
  addLineNumbers: boolean
  prettyPrint: boolean

pipeline:
  stages: string[]           # Custom stage order
  parallel: boolean
  stopOnError: boolean
```

**Default Profile** (`profiles/default.yml`):
- **Includes**: All files (`**/*`)
- **Excludes**: node_modules, .git, build artifacts, lock files, IDE files, etc.
- **Transformers**: file-loader (enabled), binary (enabled), others disabled by default
- **Output**: Markdown format with metadata
- **Limits**: 10MB per file, 100MB total, 10,000 files max

**Profile Inheritance**:
- Use `extends: "profilename"` to inherit from another profile
- Child profile settings override parent settings
- Deep merging for transformers, options, and external sources

**Validation**:
- Uses Joi schema validation
- Detailed error messages with line numbers
- Validates glob patterns, external sources, transformer options

## Documentation

Comprehensive documentation available in `docs/`:

- **[docs/index.md](./docs/index.md)** - Getting started guide
- **[docs/cli/copytree-reference.md](./docs/cli/copytree-reference.md)** - Complete CLI reference
- **[docs/profiles/transformer-reference.md](./docs/profiles/transformer-reference.md)** - All transformers documented
- **[docs/technical/architecture.md](./docs/technical/architecture.md)** - Pipeline architecture and stage contracts
- **[docs/usage/troubleshooting.md](./docs/usage/troubleshooting.md)** - Common issues

## Quick Reference

```bash
# Basic usage
copytree                         # Copy current directory
copytree /path/to/project        # Copy specific directory
copytree https://github.com/...  # Copy GitHub repository

# Profiles & filtering
copytree --profile default       # Use default profile
copytree --profile customname    # Use custom profile
copytree --git-modified          # Only modified files
copytree --git-branch main       # Compare with branch

# Transformers
copytree --transform             # Enable all transformers
copytree --no-transform          # Disable transformers

# Output options
copytree --output output.xml     # Save to file
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

**CRITICAL**: Use **ES Modules (ESM)** syntax:
```javascript
// CORRECT - Use this
import { foo } from './module.js';
export const bar = 'baz';
export default class MyClass { }

// WRONG - Do NOT use this
const { foo } = require('./module.js');
module.exports = { bar: 'baz' };
```

**Other conventions**:
- **Async/await** - No callbacks, use promises everywhere
- **Error handling** - Use custom error classes from `src/utils/errors.js`
- **Logging** - Use the logger service consistently (supports child loggers)
- **Naming**:
  - Classes: PascalCase (`TransformStage`, `FileLoader`)
  - Files: camelCase.js or PascalCase.js
  - Events: `namespace:event` (`pipeline:start`, `stage:complete`)
  - Config keys: dot.notation.lowercase (`ai.gemini.model`)

**Architecture Patterns Used**:
- **Strategy pattern**: Transformers, Formatters
- **Pipeline pattern**: Stage-based processing
- **Observer pattern**: Event emission throughout
- **Singleton pattern**: Config, Logger instances
- **Factory pattern**: Registry creation
- **Dependency injection**: Via constructors

### Testing

**Jest Configuration** (`jest.config.js`):
- **Environment**: Node.js
- **Transform**: Babel for ESM→CommonJS (Jest requirement)
- **Coverage thresholds**: 80% global (branches, functions, lines, statements)
- **Specific thresholds**: GitUtils 90%, UnitTestSummaryTransformer 70%
- **Module mocking**: ConfigManager, logger, Ink components, ProfileLoader
- **Timeout**: 10 seconds per test

**Commands**:
```bash
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:coverage     # Coverage report with thresholds
```

**Test Structure**:
- `tests/unit/` - Unit tests (~30 test files)
  - `commands/`, `config/`, `pipeline/stages/`, `services/`
  - `transformers/`, `transforms/`, `ui/`, `utils/`
- `tests/integration/` - End-to-end integration tests
- `tests/performance/` - Performance benchmarks
- `tests/fixtures/` - Test data (simple-project, images)
- `tests/mocks/` - Mock implementations

**Testing Patterns**:
- Mock external dependencies (APIs, file system where needed)
- Use fixtures for file-based tests
- Event-driven testing for pipeline stages
- Integration tests verify full pipeline execution

### Performance Targets

- Process 10,000 files in < 30 seconds
- Memory usage < 500MB for large projects
- Support projects up to 100MB total size
- Stream files > 10MB

### Error Handling

**Custom Error Classes** (`src/utils/errors.js` - 265 lines):

```javascript
// Import error classes (ESM syntax)
import {
  CopyTreeError,        // Base error class
  CommandError,         // Command execution errors
  FileSystemError,      // File operations
  ConfigurationError,   // Config loading/validation
  ValidationError,      // Input validation
  PipelineError,        // Pipeline stage errors
  AIProviderError,      // AI service errors
  TransformError,       // Transformer errors
  GitError,             // Git operations
  ProfileError,         // Profile loading/validation
  InstructionsError     // Instructions loading
} from './utils/errors.js';

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

**Error Categorization**:
- **Retryable errors**: RATE_LIMIT, TIMEOUT, SERVICE_UNAVAILABLE, network errors
- **Non-retryable errors**: INVALID_API_KEY, SAFETY_FILTER, QUOTA_EXCEEDED, validation errors
- Use `isRetryableError(error)` function for automatic retry decisions

**AIService Error Handling**:
- **Max 3 retry attempts** with exponential backoff
- **Automatic provider fallback** on errors
- **Rate limit handling** with respect for retry-after headers

## Key Features

### AI Integration

**AIService** (`src/services/AIService.js` - 378 lines)

**Current Provider**: Google Gemini
- **Default model**: `gemini-2.5-flash` (configurable via `GEMINI_MODEL` env var)
- **Alternative models**: `gemini-1.5-pro`, `gemini-1.5-flash`
- **API key**: Set via `GEMINI_API_KEY` environment variable

**Multi-Provider Architecture**:
- **Extensible design** for OpenAI, Anthropic Claude, etc.
- **Automatic fallback** to backup providers on failure
- **Retry logic** with exponential backoff (max 3 attempts)
- **Standardized response envelope**:
  ```javascript
  {
    content: string,
    requestId: string,
    latencyMs: number,
    tokensUsed: { input, output, total },
    model: string,
    finishReason: string,
    meta: { provider, messageCount, ... }
  }
  ```

**AI Features**:
- **Code summaries** (AISummaryTransformer, BatchAISummaryTransformer)
- **Image descriptions** (ImageDescriptionTransformer)
- **File summaries** (FileSummaryTransformer)
- **Unit test summaries** (UnitTestSummaryTransformer)

**Caching**:
- **Dual-layer cache**: Memory + file-based
- **SHA-256 cache keys** based on file content and options
- **TTL support** (default 7 days)
- **Cache location**: `~/.copytree/cache/`
- **Automatic garbage collection** (1% probability per write)

### Git Integration

**GitUtils** (`src/utils/GitUtils.js`)

**Capabilities**:
- **Modified file detection**: `--git-modified` / `-m`
- **Branch comparison**: `--git-branch <branch>` / `-b <branch>`
- **Staged/unstaged filtering**: `--changed <ref>` / `-c <ref>`
- **Commit range filtering**: Files changed in commit range
- **Status enrichment**: Add git status metadata to files
- **Respects .gitignore**: Automatically excludes ignored files

**Commands**:
```bash
copytree --git-modified              # Only files with uncommitted changes
copytree --git-branch main           # Files changed from main branch
copytree --changed HEAD~3            # Files changed in last 3 commits
copytree --with-git-status           # Include git status in output
```

### External Sources

**ExternalSourceStage** (`src/pipeline/stages/ExternalSourceStage.js`)

**Capabilities**:
- **GitHub repositories**: Clone and include files from GitHub
- **Local directories**: Include files from other local paths
- **Rule-based filtering**: Apply include/exclude patterns to external files
- **Optional sources**: Fail gracefully if source is unavailable
- **Destination mapping**: Control where external files appear in output

**GitHubUrlHandler** (`src/services/GitHubUrlHandler.js` - 295 lines):
- **Local caching**: Clones stored in `~/.copytree/repos/`
- **Auto-update**: Checks for updates and pulls if behind
- **Branch detection**: Automatically detects default branch (main/master)
- **Subpath support**: Can target specific directories in repo
- **URL format support**:
  ```
  https://github.com/user/repo
  https://github.com/user/repo/tree/branch
  https://github.com/user/repo/tree/branch/path/to/dir
  ```

**Profile Configuration**:
```yaml
external:
  - source: "https://github.com/user/repo/tree/main/src"
    destination: "vendor/package"
    rules:
      include: ["**/*.js"]
      exclude: ["**/*.test.js"]
    optional: true
```

### Transform Pipeline Flow

The 16-stage pipeline processes files in this order:
1. **FileDiscoveryStage** - Find files using glob patterns
2. **GitFilterStage** - Apply git-based filters (--git-modified, --git-branch)
3. **ProfileFilterStage** - Apply profile exclude/filter patterns
4. **AlwaysIncludeStage** - Force-include specific patterns
5. **ExternalSourceStage** - Include files from external sources
6. **LimitStage** - Limit to first N files
7. **FileLoadingStage** - Load file contents into memory
8. **TransformStage** - Apply transformers based on file type and config
9. **CharLimitStage** - Enforce character limits per file
10. **InstructionsStage** - Add custom instructions to output
11. **NPMStage** - Analyze npm package.json files
12. **ComposerStage** - Analyze PHP composer.json files
13. **DeduplicateFilesStage** - Remove duplicate files
14. **SortFilesStage** - Sort files by path/size/modification time
15. **OutputFormattingStage** - Format to XML/JSON/Markdown/Tree
16. **StreamingOutputStage** - Stream large outputs to file/stdout

## Current Status & Metrics

- ✅ **Feature complete** - All planned features implemented
- ✅ **17 transformers** - Comprehensive file processing (text, documents, images, AI-powered)
- ✅ **16-stage pipeline** - Event-driven processing with error recovery
- ✅ **AI integration** - Gemini provider (gemini-2.5-flash) with multi-provider support
- ✅ **Git integration** - Complete git functionality with branch comparison
- ✅ **React/Ink UI** - 12 interactive terminal components
- 📝 **Documentation** - Comprehensive user and developer docs

**Codebase Metrics** (as of last exploration):
- **84 JavaScript files** (~19,094 total lines)
- **~30 unit test files** with 80% coverage threshold
- **12 CLI commands** available
- **6 configuration files** with JSON Schema validation

## Dependencies

All dependencies are installed and managed via npm. Key dependencies:

### Core Runtime
- **CLI & UI**: commander@14.0.0, ink@4.0.0 (React for terminal), ora@5.4.1, inquirer@12.2.0, chalk@4.1.2
- **File System**: fs-extra@11.3.0, fast-glob@3.3.2, globby@14.1.0, minimatch@10.0.3
- **Configuration**: dotenv@17.2.0, js-yaml@4.1.0, joi@17.13.3, ajv@8.17.1
- **Git**: simple-git@3.28.0
- **Utilities**: lodash@4.17.21, p-limit@6.2.0 (concurrency), clipboardy@4.0.0, xmlbuilder2@3.1.1

### Transformers
- **PDF**: pdf-parse@1.1.1
- **Images**: tesseract.js@6.0.1 (OCR), sharp@0.34.3 (optional, dev only)
- **Markdown**: marked@16.1.1
- **CSV**: csv-parse (part of csv package)
- **Documents**: External tools (pandoc - must be installed separately)

### AI
- **Google AI**: @google/generative-ai@0.24.1

### Development
- **Testing**: jest@30.0.4, babel-jest@30.0.4 (ESM transformation)
- **Code Quality**: eslint@9.18.0, prettier@3.5.0
- **Build**: Babel for ESM→CommonJS transformation in tests

**External Dependencies** (must be installed separately):
- **pandoc** - For DocumentToTextTransformer (optional)

## Resources

- **Documentation**: `./docs/` - User and developer guides
- **Test Fixtures**: `tests/fixtures/` - Sample projects
- **Example Profiles**: `profiles/` - Example custom profile templates
- **Configuration**: `config/` - Default settings

## Best Practices

1. **Use profiles** for consistent file selection
2. **Enable caching** for AI operations (`AI_CACHE_ENABLED=true`)
3. **Set file limits** to prevent memory issues (default: 10MB per file, 100MB total, 10,000 files)
4. **Use .copytreeignore** for project-specific exclusions
5. **Monitor memory** usage for large projects (target: < 500MB)
6. **Leverage streaming** for large files (automatically enabled for files > 10MB)
7. **Test transformers** individually before combining them
8. **Use git filters** to reduce file count when working on specific changes

## Performance Optimization

**Default Limits** (configurable via config or CLI):
- Max file size: 10MB (use streaming for larger files)
- Max total size: 100MB
- Max file count: 10,000
- Max output size: 50MB
- Max characters: 2,000,000

**Performance Tips**:
- Heavy transformers (PDF, Image, AI) are marked with `heavy: true` trait
- Use `--limit N` to process subset of files
- Profile filtering reduces files before loading
- Streaming reduces memory for large outputs
- Cache AI responses to avoid redundant API calls

**Performance Budgets** (`src/utils/performanceBudgets.js`):
- File count limits per operation
- Memory thresholds with warnings
- Time limits for stages

## Common Workflows

### Adding a New Transformer

1. Create transformer class in `src/transforms/transformers/`
2. Extend `BaseTransformer` from `src/transforms/BaseTransformer.js`
3. Define transformer traits (inputTypes, outputTypes, heavy, etc.)
4. Implement `transform(file)` method
5. Register in `TransformerRegistry.js`
6. Add configuration options to profile schema
7. Write unit tests in `tests/unit/transformers/`

Example:
```javascript
import BaseTransformer from '../BaseTransformer.js';

export default class MyTransformer extends BaseTransformer {
  constructor(options = {}) {
    super(options);
    this.name = 'my-transformer';
    this.traits = {
      inputTypes: ['text'],
      outputTypes: ['text'],
      idempotent: true,
      heavy: false
    };
  }

  async transform(file) {
    // Transformation logic
    return {
      ...file,
      content: transformedContent
    };
  }
}
```

### Adding a New Pipeline Stage

1. Create stage class in `src/pipeline/stages/`
2. Extend `Stage` from `src/pipeline/Stage.js`
3. Implement `process(input)` method
4. Add lifecycle hooks if needed (onInit, beforeRun, afterRun, handleError)
5. Add stage to pipeline in desired order
6. Write unit tests in `tests/unit/pipeline/stages/`

Example:
```javascript
import Stage from '../Stage.js';

export default class MyStage extends Stage {
  constructor() {
    super('my-stage', 'My Stage Description');
  }

  async process(input) {
    this.log('Processing files...');
    // Stage logic
    return { ...input, files: processedFiles };
  }

  async handleError(error, input) {
    // Error recovery logic
    this.log(`Error: ${error.message}`, 'error');
    return input; // Return original input as fallback
  }
}
```

### Adding Event Listeners

The pipeline emits comprehensive events for monitoring:

```javascript
pipeline.on('pipeline:start', ({ input, stages, options }) => {
  console.log(`Starting pipeline with ${stages.length} stages`);
});

pipeline.on('stage:complete', ({ stage, output, duration, memoryUsage }) => {
  console.log(`${stage.name} completed in ${duration}ms`);
});

pipeline.on('file:batch', ({ stage, count, lastFile, action }) => {
  console.log(`${stage}: ${action} ${count} files`);
});
```

## Troubleshooting

See [docs/usage/troubleshooting.md](./docs/usage/troubleshooting.md) for:
- Common errors and solutions
- Performance optimization tips
- Configuration debugging
- AI provider issues
- Memory management

### Quick Debug Tips

**Enable verbose logging**:
```bash
DEBUG=copytree:* copytree
```

**Validate configuration**:
```bash
copytree config:validate
copytree config:inspect
```

**Validate profile**:
```bash
copytree profile:validate profilename
```

**Clear cache**:
```bash
copytree cache:clear
```

**Common Issues**:
- **Out of memory**: Reduce file limits, enable streaming, use filters
- **Slow performance**: Enable caching, use lighter transformers, reduce file count
- **AI errors**: Check API key, verify model availability, check rate limits
- **Git errors**: Ensure directory is a git repository, check git status
- **Profile not found**: Check search paths (project → user → built-in)

## Important File Paths Reference

When working on specific features, refer to these key files:

### Pipeline & Architecture
- `src/pipeline/Pipeline.js` (435 lines) - Main pipeline orchestration
- `src/pipeline/Stage.js` (227 lines) - Base class for all stages
- `src/pipeline/stages/` - All 16 pipeline stage implementations
- `docs/technical/architecture.md` - Detailed architecture documentation

### Transformers
- `src/transforms/BaseTransformer.js` (285 lines) - Base transformer class
- `src/transforms/TransformerRegistry.js` (740 lines) - Registry and conflict resolution
- `src/transforms/transformers/` - All 17 transformer implementations

### Configuration & Profiles
- `src/config/ConfigManager.js` (527 lines) - Configuration loading and merging
- `config/schema.json` (20,013 bytes) - JSON Schema validation
- `src/profiles/ProfileLoader.js` (412 lines) - Profile loading with inheritance
- `profiles/default.yml` - Default profile configuration

### Services
- `src/services/AIService.js` (378 lines) - AI provider integration
- `src/services/CacheService.js` (375 lines) - Caching layer
- `src/services/GitHubUrlHandler.js` (295 lines) - GitHub repository handling
- `src/providers/GeminiProvider.js` - Gemini AI implementation

### Utilities
- `src/utils/errors.js` (265 lines) - Custom error classes
- `src/utils/logger.js` - Logging service
- `src/utils/GitUtils.js` - Git integration utilities
- `src/utils/performanceBudgets.js` - Performance limits

### Entry Points & Commands
- `bin/copytree.js` (256 lines) - Main CLI entry point
- `src/commands/copy.js` - Main copy command
- `src/commands/` - All command implementations

### Testing
- `jest.config.js` - Jest configuration
- `tests/unit/` - Unit tests (~30 files)
- `tests/fixtures/` - Test data
- `tests/mocks/` - Mock implementations

## Key Concepts for AI Agents

### Event-Driven Architecture
The entire pipeline is event-driven. When implementing new features:
- Emit events at appropriate times (`pipeline:*`, `stage:*`, `file:*`)
- Listen to existing events for integration points
- Use the EventEmitter pattern consistently

### Error Recovery Philosophy
CopyTree prioritizes graceful degradation:
- Stages implement `handleError()` for recovery
- Non-critical errors should log and continue
- Critical errors should fail fast with clear messages
- Use custom error classes for categorization

### Memory Management
Always consider memory impact:
- Files > 10MB trigger streaming automatically
- Heavy transformers (PDF, Image, AI) use more memory
- Cache results to avoid reprocessing
- Monitor memory deltas in pipeline stages

### Extensibility Points
The system is designed for extension at:
- **Transformers**: Add new file processing capabilities
- **Pipeline Stages**: Add new processing steps
- **AI Providers**: Add support for OpenAI, Claude, etc.
- **Formatters**: Add new output formats
- **Profiles**: Create custom file selection strategies

### Configuration Hierarchy
Remember the priority order:
1. Runtime CLI options (highest)
2. Environment variables
3. Project config (`.copytree/`)
4. User config (`~/.copytree/`)
5. Default config (`config/`) (lowest)

This allows users to override at any level while maintaining sane defaults.