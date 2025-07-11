# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Testing:**
- `./vendor/bin/phpunit` - Run all tests
- `./vendor/bin/phpunit --no-coverage` - Run tests without coverage (faster)
- `./vendor/bin/phpunit --coverage` - Run tests with coverage
- `./vendor/bin/phpunit tests/Unit/SpecificTest.php` - Run specific test file
- `composer test` - Run tests (shortcut)

**Code Quality:**
- `./vendor/bin/pint` - Format code using Laravel Pint
- `composer format` - Format code (shortcut)

**Development:**
- `php copytree` - Run the main CLI application
- `php copytree --help` - Show available commands
- `php copytree profile:create` - Interactive profile creation
- `php copytree ask "question" --state` - AI-powered Q&A with conversation state

## Architecture Overview

### Core Application Structure
This is a Laravel Zero CLI application for copying directory structures with advanced filtering and AI-powered features.

**Pipeline Architecture:**
The application uses a pipeline pattern (`app/Pipeline/`) for processing files through multiple stages:
1. `FileLoader` - Loads files from filesystem with gitignore filtering
2. Filter stages (`AIFilterStage`, `GitFilterStage`, `RulesetFilterStage`, etc.)
3. Processing stages (`DeduplicateFilesStage`, `SortFilesStage`)
4. External source integration (`ExternalSourceStage`)

**Key Services:**
- `Prism` - Unified AI interface for multiple providers (OpenAI, Fireworks, Anthropic, etc.)
- `ProfileLoader` - Loads and processes YAML profile configurations
- `GitHubUrlHandler` - Handles GitHub repository cloning and caching
- `ConversationStateService` - Manages chat history for the ask command

**File Transformation System:**
Transformers in `app/Transforms/Transformers/` convert various file types:
- Images → text descriptions (via AI)
- PDFs → text (via pdftotext/Pandoc)
- Documents → text (via Pandoc)
- Code → summaries (via AI)

### Profile System
Profiles are YAML files controlling file selection and processing:
- **Location:** `profiles/` directory or `.ctree/` in project root
- **Auto-detection:** `ProfileGuesser` detects Laravel, SvelteKit, etc.
- **Structure:** Include/exclude patterns, transforms, external sources
- **Profiles available:** `default.yaml`, `laravel.yaml`, `sveltekit.yaml`

### AI Integration
- **Providers:** OpenAI, Fireworks, with configuration in `config/ai.php`
- **Models:** Different models for different tasks (filtering, summarization, Q&A)
- **Features:** File filtering, content summarization, image description, filename generation

### External Sources
The application can merge files from external GitHub repositories into output, with caching in `~/.copytree/external-sources/`.

## Test Structure
- **Unit tests:** `tests/Unit/` - Individual component testing
- **Integration tests:** `tests/Integration/` - AI service integration tests  
- **Feature tests:** `tests/Feature/` - End-to-end command testing
- Test configuration uses in-memory cache and Fireworks AI models

## Configuration Files
- `config/copytree.php` - Global file/directory exclusions
- `config/ai.php` - AI provider and model configurations
- `~/.copytree/.env` - User environment variables (API keys)
- `phpunit.xml.dist` - Test environment settings

## Important Notes
- **macOS only:** Uses `pbcopy`, `osascript` for clipboard operations
- **Dependencies:** Requires Pandoc and Poppler for document conversion
- **Caching:** External sources and AI responses are cached
- **Database:** SQLite database for conversation history (auto-created)

## Commit Message Guidelines
- Do not mention Claude or Claude Code in commit messages
- Do not include "Generated with Claude Code" or similar attributions
- Do not add Claude as a co-author