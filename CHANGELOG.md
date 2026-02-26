# Changelog

## [0.15.0] - 2026-02-26

### Fixed
- Expose `formatBytes` utility to all format helpers (XML, JSON, Markdown, tree) so formatters can render human-readable file sizes

### Infrastructure
- Add release command and update CLAUDE.md release docs

## [0.14.0] - 2026-02-26

### Major Changes
- **Programmatic Node.js API** - New `copy()` and `scan()` functions for library usage, with `onProgress` callbacks and `manifest` field on results
- **Streaming Copy API** - `copyStream()` for memory-efficient processing of large outputs
- **Electron Integration** - CopyTree now works in Electron ≥28 main processes for desktop apps
- **Folder-Level Profiles** - New `.copytree.yml`/`.copytree.json` profile configuration system replacing legacy profiles
- **NDJSON & SARIF Output Formats** - Two new output formats for CI integration and static analysis tooling
- **Built-in Secret Detection** - Multi-engine secret detection and redaction with comprehensive pattern coverage
- **Structured Logging** - Configurable log levels and formats for better debugging and observability
- **Convenience Filter Flags** - New `--ext`, `--max-depth`, `--min-size`, `--max-size` CLI flags for quick filtering

### Added
- **Parallel File Discovery** - Bounded concurrency for faster file discovery on large codebases
- **Resilient Filesystem I/O** - Automatic retry logic for transient filesystem errors
- **CPU/Heap Profiling Harness** - Built-in `--profile` flag for performance diagnostics
- **Performance Budget Enforcement** - Nightly CI benchmarks with regression detection
- **Layered `.copytreeignore`** - Gitignore-semantics ignore files with directory-level scoping
- **Token Optimization** - Config lazy-loading and reduced overhead for faster startup
- **Improved Temp File Naming** - Project directory context in temporary file names for easier debugging

### Breaking Changes
- **Removed environment variable support** - `.env` files and `COPYTREE_*` env vars are no longer read for configuration
- **Removed legacy profile system** - Framework-specific profiles and auto-detection removed; use folder-level `.copytree.yml` instead
- **Removed singleton ConfigManager** - ConfigManager is now instantiated per-operation for safe concurrent usage
- **Removed `install:copytree` command** - Deprecated command has been removed
- **Removed remaining AI feature remnants** - All AI provider infrastructure fully purged from codebase

### Fixed
- **Security: ReDoS vulnerability** - Updated minimatch to 10.2.4 to resolve Regular Expression Denial of Service
- **Security: Shell injection** - Fixed clipboard operations on macOS/Linux that were vulnerable to shell injection
- **Windows Compatibility** - Case-insensitive glob matching, CRLF normalization, proper `SIGKILL` handling, JSON streaming path escaping
- **POSIX Path Normalization** - All `file.path` values now consistently use forward slashes across the entire pipeline
- **Stale Ignore Rule Cache** - Fixed default rule cache that caused stale rules in long-running processes
- **XML Control Characters** - Sanitize invalid control characters in XML output
- **Clipboard Windows Escaping** - Fixed clipboard copy failures on Windows due to improper escaping

### Infrastructure
- **OIDC Trusted Publishing** - NPM publishing now uses OIDC tokens via `publish.yml` workflow (no secrets)
- **Comprehensive E2E Golden File Tests** - 21 test cases covering all output formats, flags, streaming, and error handling
- **Major Dependency Upgrades** - React 19, Ink 6, Chalk 5, Ora 9, Inquirer 13, actions/checkout v6

### Technical Improvements
- **1105 passing tests** across 74 test suites with cross-platform determinism
- **Documentation overhaul** - Comprehensive docs rewrite for accuracy and consistency
- **Memory optimization** - Reduced memory usage in formatters and utilities
- **Simplified codebase** - Removed advanced/unused features for maintainability

## [0.13.1] - 2025-10-29

### Fixed
- **Critical**: Remove remaining AIProviderError import in TransformStage.js that caused runtime error
- Remove AIProviderError from recoverable error types list

## [0.13.0] - 2025-10-29

### Major Changes
- **Removed AI Provider Integration** - Simplified codebase by removing AI provider infrastructure and dependencies
- **Enhanced Binary File Handling** - Implemented magic number detection for accurate binary file identification
- **Comprehensive Force-Include System** - Added `.copytreeinclude` file support for forcing inclusion of specific files
- **Improved Testing Infrastructure** - Established comprehensive test suites with helpers and utilities

### Added
- **Structured Documentation System** - New task-based documentation with groups and sections for better organization
- **Binary File Detection** - Magic number-based detection for accurate binary file identification
- **Force-Include Mechanism** - `.copytreeinclude` file support with highest precedence in file selection
- **Testing Infrastructure** - Comprehensive test helpers including determinism utilities, fixtures management, and pipeline testing utilities
- **Golden File Testing** - Regression testing infrastructure with normalized output comparison

### Removed
- **AI Provider System** - Removed BaseProvider.js and all AI provider infrastructure
- **AI Configuration** - Removed AI-specific configuration sections and validation
- **AI Error Handling** - Removed AIProviderError and ProviderError classes from error system

### Enhanced
- **Documentation Structure** - Refactored documentation for improved clarity and accuracy across all guides
- **README Simplification** - Streamlined README by removing AI-specific sections and focusing on core features
- **Installation Guide** - Simplified setup process by removing AI provider configuration steps
- **Troubleshooting Guide** - Removed AI-related error sections and focused on core functionality issues
- **Pipeline Event Tests** - Improved pipeline event contract validation and testing infrastructure

### Fixed
- **File Count Accuracy** - Corrected file count calculation by excluding null placeholders
- **Code Quality Issues** - Resolved linting and formatting issues across the codebase
- **Pipeline Event Contracts** - Fixed event emission validation in pipeline tests
- **Binary File Exclusion** - Improved binary file detection and exclusion logic

### Technical Improvements
- **Dependency Updates** - Upgraded project dependencies to latest stable versions
- **Test Coverage** - Added comprehensive unit, integration, and e2e test suites
- **Documentation Organization** - Restructured documentation with better grouping and navigation
- **Code Consistency** - Applied consistent formatting and linting across entire codebase

## [0.12.0] - 2025-08-29

### Major Changes
- **Markdown Output Format** - Set markdown as the new default output format with comprehensive formatting support
- **Enhanced Output Formatting** - Improved markdown and XML output formatting with proper namespace and CDATA wrapping
- **Comprehensive Testing** - Added extensive unit tests for GitUtils and UnitTestSummaryTransformer

### Added
- **Markdown Formatter** - New MarkdownFormatter with comprehensive file structure and content formatting
- **Enhanced File Extension Handling** - Improved detection and handling of various file types in markdown output
- **GitUtils Unit Tests** - Complete test coverage for Git utility functions
- **UnitTestSummaryTransformer Tests** - Comprehensive testing for unit test summary generation
- **Claude Code Release Command** - Added automated release process command for GitFlow workflows

### Enhanced
- **XML Output Formatting** - Improved XML output with proper namespace declarations and CDATA section handling
- **Markdown Output Structure** - Better organization and readability of markdown formatted output
- **File Extension Detection** - More accurate file type identification for appropriate formatting
- **Release Process** - Streamlined GitFlow release workflow with automated version management

### Fixed
- **Path Validation** - Removed overly restrictive path validation that blocked directories with hyphens
- **XML Formatting Issues** - Resolved XML output formatting problems with proper escaping and structure
- **Code Formatting** - Applied consistent code formatting across the entire codebase

### Technical Improvements
- **Output Pipeline Refactoring** - Significant improvements to output formatting pipeline architecture
- **Formatter Abstraction** - Better separation of concerns between XML and Markdown formatters  
- **Test Coverage Expansion** - Increased test coverage for critical utility functions and transformers
- **GitFlow Integration** - Enhanced release management with proper GitFlow branching strategies

## [0.11.0] - 2025-08-05

### Major Changes
- **Comprehensive Architecture Improvements** - Enhanced pipeline system with improved validation and error handling
- **JSON Schema Validation System** - Added robust configuration validation with detailed error reporting
- **Performance Monitoring & Budgets** - Implemented performance tracking, budgets, and telemetry system
- **Enhanced Error Handling** - New custom error classes with detailed context and recovery mechanisms

### Added
- **JSON Schema Configuration** - Complete schema validation for all configuration options
- **Performance Budget System** - Automatic performance monitoring with grade calculations (A-F)
- **Performance Telemetry** - Session recording and insights for optimization recommendations
- **Enhanced Pipeline Architecture** - 16+ specialized processing stages with lifecycle hooks
- **Advanced Transformer Registry** - Trait-based system with conflict detection and optimization
- **Config Inspector UI** - New UI component for configuration debugging and validation
- **Memory Usage Monitoring** - Real-time memory tracking and optimization suggestions
- **Stage-Level Performance Tracking** - Detailed timing and resource usage per pipeline stage

### Enhanced
- **AIService Architecture** - Improved singleton pattern with better error handling and caching
- **Pipeline Stage System** - Enhanced event emission and error recovery capabilities
- **Configuration Management** - Hierarchical configuration with environment variable support
- **Test Suite Coverage** - Complete ES module conversion with 496+ passing tests
- **Documentation System** - New technical architecture documentation and transformer guides

### Fixed
- **Pipeline Error Recovery** - Improved graceful degradation and error boundary handling
- **Memory Leak Prevention** - Better resource cleanup and garbage collection
- **Configuration Validation** - Comprehensive validation with clear error messages
- **Transform Stage Optimization** - Enhanced file processing efficiency and memory usage

### Technical Improvements
- **Transformer Traits System** - Advanced transformer compatibility and ordering
- **Event-Driven Pipeline** - Enhanced event emission throughout processing lifecycle
- **Performance Optimization** - Throughput calculations and bottleneck identification
- **Error Context Enrichment** - Detailed error information with recovery suggestions

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