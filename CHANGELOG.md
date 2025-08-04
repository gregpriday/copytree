# Changelog

## [0.10.0] - 2025-08-04

### Major Changes
- **Complete ESM Migration** - Migrated entire codebase from CommonJS to ECMAScript Modules
- **Node.js 18+ Support** - Updated minimum requirement to Node.js >=18.0.0 with compatibility for versions 18-24
- **Enhanced Cross-Platform Support** - Improved Windows and Linux clipboard and file operations

### Breaking Changes
- Converted all modules from CommonJS `require/module.exports` to ESM `import/export` syntax
- Added `.js` extensions to all relative imports for ESM compliance
- Updated package.json to use `"type": "module"`

### Added
- Dynamic ESM import compatibility for UI components
- PowerShell integration for Windows file operations
- ESM-compatible test configurations

### Fixed
- **Critical**: Resolved copy command hanging issues on Node.js 18-22
- **Critical**: Fixed React/Ink component loading timing problems
- ESLint v9 compatibility with 2950+ auto-fixed formatting issues
- Clipboardy ESM compatibility with dynamic imports

### Removed
- Deprecated ESM loader that caused `globalPreload` warnings
- Legacy CommonJS compatibility shims

## [0.9.1] - 2025-08-01

### Added
- **Custom instructions system** for AI analysis with `--instructions` and `--no-instructions` CLI options
- **InstructionsStage** pipeline stage to load instructions from user or app directories
- **InstructionsLoader** service with caching and validation
- **@ prefix** for all file paths in XML output for improved clarity
- **ct:instructions** metadata in XML/JSON output with usage guidance
- Default instructions template with enhanced guidance for AI consumption

### Changed
- **Simplified profile system** - Removed framework-specific profile auto-detection
- **ProfileGuesser** now always returns default profile instead of detecting project types
- **Default profile only** - All projects now use the default profile unless explicitly specified
- Updated CLI help text to reflect default profile behavior
- Improved instructions template with directory pattern guidance

### Removed
- **Framework auto-detection** logic for Laravel, React, SvelteKit profiles
- **Laravel and SvelteKit profile YAML files** and related documentation
- **builtin-profiles.md** documentation for removed framework profiles

### Technical
- Restructured instructions template in `src/templates/` directory
- Enhanced integration tests for simplified profile system
- Updated documentation to reflect single default profile approach
- Added `jest.integration.config.js` for improved test configuration

## [0.9.0] - 2025-07-29

### Initial Release

CopyTree is a sophisticated CLI tool for intelligently copying and transforming project structures for AI consumption.

#### Features

- **Intelligent file selection** using profiles with auto-detection for 14+ project types
- **15+ file transformers** for PDFs, images, code, and documents
- **Deep Git integration** for tracking changes and modifications
- **External sources** support (GitHub repositories)
- **AI-powered transformations** with Google Gemini integration
- **Event-driven pipeline** with 16 specialized processing stages
- **Memory-efficient streaming** for large files
- **Comprehensive CLI** with intuitive commands and options
- **Multiple output formats** (XML, JSON, clipboard, file)
- **Default profile only** - Framework auto-detection removed, uses default profile for all projects
- **Caching system** for AI responses and transformations
- **Error recovery** and graceful degradation

#### Technical Highlights

- CommonJS modules with async/await patterns
- Comprehensive test suite with unit and integration tests
- Performance optimized for projects with 10,000+ files
- Memory usage under 500MB for large projects
- Support for projects up to 100MB total size