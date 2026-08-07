# Changelog

## [0.17.0] - 2026-08-07

A performance and terminal-output release. Nothing in the selection logic or the
output formats changed: the same command over the same tree produces the same
bytes. What changed is how much a run costs before it does any work, and how much
it says about itself while doing it.

Every behaviour change here, including the ones too small to list, is recorded
with its rationale in
[docs/technical/behavior-ledger.md](docs/technical/behavior-ledger.md).

### Changed

- **A normal run now prints a progress line and a completion line, nothing
  else.** The per-stage log stream and the run summary box are behind
  `-v, --verbose`. Anything that scraped stderr for stage names or the summary
  table will find less there.
- **One reporter draws every copy run.** The Ink copy UI — which ran its own
  pipeline, resolved its own destination and wrote its own completion text — is
  gone; `src/ui/feedback` replaces it with a status vocabulary that has an ASCII
  fallback, a single message catalogue, structured completion/warning/failure
  models, and a renderer that honours `--no-color`, `--quiet` and NDJSON. Ink
  remains only for `config:validate` and `config:inspect`, which draw real
  tables.
- **stdout carries the requested document and nothing else**; everything said to
  a person goes to stderr. `--display --format json | jq` stays valid while a
  run reports progress. Pipeline stages no longer write to the terminal at all.
- **Progress names what a stage is doing, not its class** — `Discovering files`
  rather than `FileDiscoveryStage`. An unrecognised stage is de-PascalCased, so
  no class name reaches a user.
- **A successful redaction is a note naming the files, not a warning.** A warning
  is now reserved for a finding the guard could not redact, or a file it could
  not scan.
- **`-o/--output` no longer reveals the file in Finder/Explorer.** On macOS that
  launched `osascript`, woke Finder and stole focus, which makes `-o` unusable
  in a loop. Opt in with `--reveal`.
- **`--dry-run` writes nothing at all.** It previously still produced the output
  file in some paths.
- **Markdown `sha256` describes the emitted content, not the file on disk.** In
  streamed output this was a disclosure: by the time a file is streamed its
  content has been redacted, so hashing the path published the digest of the
  unredacted original next to the redacted document — enough to confirm a guess
  at the removed bytes. Buffered output was fixed alongside it. Digests for
  unredacted, untransformed files are unchanged.
- **Streamed output carries the format version** that buffered output has always
  carried. A streamed document was previously indistinguishable from an
  unversioned one.
- **File ordering is pinned rather than taken from the host's ICU.** Ordering
  decides which files survive a budget, so the same command could select
  differently across Node versions or on a small-ICU build. Printable-ASCII
  paths now compare against a frozen weight table derived from
  `Intl.Collator`, verified against it for every character pair and 500,000
  random strings; non-ASCII paths still defer to a real collator. No ordering
  changes on a full-ICU platform — it simply can no longer drift underneath a
  release.
- **`colorize: 'always'` into a pipe now actually colours.** Chalk's own
  detection ran before the logger's policy could ask, so an explicit request
  for colour into a pipe or a file produced none.
- **`stats.secretsGuard.scanner` reports `none` when nothing was scanned.** It
  reported `builtin` even for runs where no file ever reached a scanner, which
  named a scanner for protection applied to nothing.
- **Gitleaks stops after an operational failure.** A missing config or an
  incompatible binary fails identically for every file; CopyTree retried per
  file and logged a warning each time. It is now reported once and the run
  finishes on the built-in scanner. Findings are unchanged.
- **`stage:complete` carries `memoryUsage: null`** unless `--profile` asked for
  it.
- **Programmatic results are no longer re-sorted after `SortFilesStage`**, which
  had been quietly overriding the stage that owns the order.
- **`InstructionsStage.validate()` is a no-op**; a named instructions set that
  cannot be loaded now fails from `process()`. The user-visible result is
  unchanged — `--instructions nope` still fails — but `validate()` and
  `process()` used to disagree for this case and only `validate()`'s answer ever
  reached anyone.

### Fixed

- **Progress never reached the UI.** `usePipeline` registered its listeners in a
  `useEffect` that read `pipelineRef.current` on the render where it was still
  null, and setting a ref triggers no re-render, so nothing was ever attached.
- **UI chrome interleaved with the document under `--display`** once those
  listeners worked. The display destination now renders only the trailing
  completion line.
- **A streamed `--output` to a bad path** produced an uncaught error, or a file
  truncated during stage assembly. The file is opened in the stage that writes
  it, after the format is validated and with its error listener attached.
- **`--changed <bad-ref>` returned the whole repository unfiltered and exited
  0.** A stage that failed and carried on is now reported.
- **A denied clipboard permission reported a copy that never happened.**
  `osascript`'s exit status is checked, and a failure falls back to text.
- **Branch names containing slashes broke GitHub URLs** — `feature/x/y` was cut
  to `feature`. URL parsing moved to the `URL` class, the branch/subpath split
  is resolved against real refs by longest match, and `.git` suffixes, trailing
  slashes, query strings and percent-encoded paths are handled. Git invocations
  use `execFileSync` with argv arrays so nothing from a URL reaches a shell,
  paths are checked for traversal and symlinked-root escape before any disk
  access, tag refs work, `/blob/` URLs are rejected with an actionable message,
  and the cache updates via fetch+reset so a force-pushed remote cannot leave a
  stale "up to date" cache.
- **The GitHub cache-key separator was a literal NUL byte in the source**, which
  made git treat the file as binary and cost diffs, blame and merges. Written as
  `'\0'` the hash input is byte-identical, so cache keys are unchanged.
- Resolved the `brace-expansion` (GHSA-rgw5-rvv9-x895), `fast-uri`
  (GHSA-7p8r-x3mc-p8w7) and `js-yaml` (GHSA-5p4m-2wfm-xmqj) advisories.

### Performance

Interactive runs are 18–22% faster end to end — `--version` 51→33 ms, 100 files
119→93 ms, this repository 143→118 ms — with 1,000 files 12% faster and 10,000
files 4%. Output was compared byte-for-byte against the previous release across
36 format and flag combinations, all six sort keys, six selection modes, and
1,000- and 10,000-file projects.

- **Four dependencies left the invocation path.** lodash (6.8 ms), fs-extra
  (6.3 ms) and chalk (4.7 ms) are replaced by `config/objectUtils.js`,
  `src/utils/fsx.js` and `src/utils/ansi.js`, each covering only what CopyTree
  uses and each pinned to the original by an equivalence test suite. `fsx`
  promisifies the callback `fs` API rather than using `node:fs/promises`, which
  is roughly twice as slow on `stat`.
- **ICU stays off the startup path** via `src/utils/collation.js`, which also
  produces the ordering guarantee described above.
- **Feature-only modules load only when a run needs them**: js-yaml, the GitHub
  handler, the clipboard, the profiler, the parallel walker, and the three
  unselected formatters. `--version` is answered before Commander is built.
- **The pipeline stopped rebuilding what it was handed.** It was constructing a
  second `ConfigManager` and repeating the whole load — schema compile, default
  module imports, deep clones, merge, validate — on every run.
- **The transformer registry is built only when the selection needs it**, so an
  ordinary source copy never imports the transformation subsystem or hashes a
  cache key per file for a no-op transformer.
- **Schema validation is skipped entirely when no user config file or env
  override contributed**; ajv and ajv-formats load lazily.
- **Repeated probing is gone**: one `readdir` for folder profiles instead of
  twelve `pathExists` calls, one instructions load instead of four probes, three
  integers passed to the walker instead of a deep clone of all configuration,
  Gitleaks arguments resolved once per adapter instead of once per file, one
  `package.json` read, and discovery's include matchers compiled once instead of
  reparsed per file.

### Removed

- `xmlbuilder2` and `ink-spinner` are no longer dependencies; nothing imported
  either. A production install goes from 135 packages to 128.
- Dead modules `src/utils/performance.js` and `src/ui/hooks/useInk.js`, both
  published in the tarball and reached by nothing.
- The unreachable `profile:validate` path in `ValidationView`, which
  dynamically imported a module that does not exist.

### Infrastructure

- `npm run knip` reports anything the module graph never arrives at, so an
  unused dependency is a failed check rather than something noticed later.
- `npm run benchmark:latency` measures cold CLI latency — shell to prompt,
  including Node startup — across six scenarios against per-scenario budgets,
  reporting median and MAD and labelling deltas below the noise floor as such.
- `npm run benchmark:latency-ab` compares two checkouts in interleaved pairs, so
  load shared by both cancels out of the difference. The single-checkout harness
  cannot produce a trustworthy number on a busy machine.

## [0.16.0] - 2026-07-25

Skips 0.15.0, which was published to npm in error on 2026-02-26 and cannot be
reused. Nothing in this release relates to that version.

Breaking changes are listed first. Every behaviour change here, including the
ones too small to list, is recorded with its rationale in
[docs/technical/behavior-ledger.md](docs/technical/behavior-ledger.md).

### Breaking

- **Node.js 22.12 or newer is required** (`engines.node`). An install-time break
  for Node 20 hosts and for Electron builds on older runtimes.
- **The CLI writes a file reference by default.** `copytree` with no flags used
  to copy the whole formatted document to the clipboard; it now writes a temp
  file and copies that path. Use `-y` / `--clipboard` for the old behaviour.
  `-r` / `--as-reference` is accepted and now does nothing.
- **Secret scanning runs on the programmatic API.** `scan()`, `copy()` and
  `copyStream()` previously did no redaction at all. Callers that relied on raw
  file content will see redacted spans; opt out with `secretsGuard: false`.
- **Some pipeline stages are fatal.** Discovery, file loading, secret scanning
  and output formatting now propagate errors instead of being skipped, so a run
  that previously returned a successful-looking partial result now throws.
- **Output formatting no longer downgrades on failure.** A failed XML format
  used to return a JSON blob of raw files.
- **The programmatic API no longer writes to the terminal.** Stage messages are
  delivered as `stage:log` events via `onEvent`. Pass `quiet: false` to restore.
- **`stats.secretsGuard` changed shape** and is now actually populated. It was
  declared as `{ detected, redacted, report }` and never set.
- **Deduplication uses SHA-256** rather than MD5, and no longer treats binary
  placeholders as content, so `--dedupe` stops collapsing all binaries into one.
- **Sort order is a total order under a pinned locale**, which changes which
  files survive a budget for names differing only by case.

### Added

- **Scoped copy** - `--scope <path...>` / `scope` copies only the named paths,
  using literal paths rather than globs, with ignore rules still resolving from
  the repository root and output paths still root-relative. Traversal starts at
  the selection, so cost scales with what was asked for. `--scope-include-ignored`
  lifts the ignore rules blocking a selection.
- **Budgets that bind** - `--max-total-size`, `--max-files` and `--size-gate`,
  applied after sorting in a defined order, with truncation always reported
  (`stats.truncated`, `truncatedBy`, `truncatedCount`) rather than silent.
- **Exclusion accounting** - `stats.excluded` answers "what didn't make it, and
  why" by stable reason key. `--explain` adds the matched rule and the ignore
  file and line it came from.
- **Manifest** - `result.manifest` gives a lightweight per-file view carrying
  `path`, `size`, `modified` and an `outcome`, never content, so it is safe to
  retain in a long-lived process and to drive a preview from.
- **Output format versioning** - `result.outputFormatVersion`
  (e.g. `copytree-xml@1`), so a downstream prompt can detect a format change.
- **Token and size estimates** - `stats.estimatedTokens` and
  `estimatedOutputChars`, measured on a real run and estimated on a dry run.
- `--scope-include-config-excluded` / `scopeIgnoresConfigExcludes`, to let a
  `--scope` entry reach a config-excluded directory such as `node_modules`.
  `.git` is excluded by a layer no option lifts.
- `PROVIDER_TOKEN` detection for published credential prefixes (GitHub, Stripe,
  GitLab, Slack, Google, Anthropic, OpenAI, SendGrid, npm).
- `secretsGuard.oversizePolicy`, choosing between excluding, scanning, or
  failing on a file too large to scan.
- Exclusion accounting reasons `secretFile`, `secretUnscannable` and
  `symlinkEscape`.

### Changed

- **Startup and hot-path performance** - `Intl.Collator` instances are hoisted
  rather than built per comparison, binaries are classified from a single read
  instead of a separate `stat` and `read`, file-loading concurrency is bounded,
  per-file config lookups are lifted out of formatter loops, `ConfigManager.get`
  has a fast path, and the CLI loads its Ink UI only when it renders.
- **Security: `simple-git` 3.31.1 to 3.36.0**, clearing a critical RCE advisory
  (GHSA-hffm-xvc3-vprc and two related). `npm audit --omit=dev` reports zero
  vulnerabilities; remaining findings are dev-only.

### Fixed

- **Secret redaction no longer destroys source code.** The generic rules matched
  from the keyword onward, so `const token = payload.token.trim();` became
  `const ***REDACTED***);`. Detection now reports the credential's own span, and
  a match has to look like a credential rather than sit next to the word
  "token".
- **A `.ts` file containing a literal NUL byte is no longer treated as binary.**
  `NEVER_BINARY` protected the extension lookup but not the content sniffer.
- **A dry run selects exactly what the real run selects.** The secrets guard was
  skipped without content, so its exclusions were missing from the preview.
- `copy()` no longer drops `stage` from progress callbacks, and no longer
  swallows a caller-supplied `onSummary`.
- `--secrets-report` writes a report. It read a field nothing ever set.
- `stage:log` events are emitted. The pipeline never set the back-reference
  `Stage.log()` guards on, so the event had never fired.
- Budget and character-limit detail reaches `CopyResult.stats`.
- Symlinks are contained within the real repository root when following is
  enabled, and directory cycles terminate.
- `ConfigManager.reload()` reloads instead of emptying the instance.
- XML attributes and text nodes are escaped, so a file named `a&b.js` no longer
  produces a document a strict parser rejects.
- `format()` honours the operation's own configuration rather than the
  process-wide singleton.
- The version reported by `--version` comes from CopyTree's own `package.json`
  rather than the current working directory's.
- `charLimit: 0` is honoured as a budget instead of being promoted to the 2M
  default.
- `npm run test:integration` runs integration tests rather than the whole suite.
- Caller `--exclude` patterns now win over gitignore negations, so an explicit
  exclusion cannot be re-included by a rule in the repository.
- `.git` is unreachable by any option, including a `!.git/` negation in an ignore
  file and an `--always '.git/**'` force-include.
- A private key's body is redacted, not just its `-----BEGIN-----` header.
- Secret-prone filenames (`id_rsa`, `*.pem`, `.env`) are excluded at any depth,
  not only at the repository root.
- Credentials named `db_password`, `stripe_api_key` and similar are detected;
  `_` is a word character, so the previous word-boundary anchoring missed them.
- JWTs are no longer discarded as reference paths, and Stripe publishable keys
  (`pk_live_*`) are no longer redacted.
- A short source file containing a NUL byte is not misclassified as binary.
- Non-text content is excluded rather than crashing the run with a `TypeError`.
- `--dedupe` no longer drops files that differ only in their redacted secrets.

### Infrastructure

- Migrate to ESLint 10 and TypeScript 7. ESLint 10's recommended set enabled
  `no-useless-assignment` and `preserve-caught-error`, which surfaced eight real
  findings; the dead `.eslintrc.json` is removed, and `tests/types/tsconfig.json`
  resolves its path mapping relative to itself now that `baseUrl` is gone.
- Rework the benchmark harness into a modular suite (`tests/performance/bench.js`
  plus `lib/` modules and declared scenarios), documented in
  `docs/technical/benchmarking.md`, with `benchmark:all`, `benchmark:fixtures`
  and `benchmark:compare` scripts.
- Upgrade dependencies, drop the unused `inquirer`, and bump GitHub Actions to
  current majors.
- Add real, unit and e2e coverage for the new stages and utilities; the suite is
  1554 tests across 98 suites with coverage thresholds enforced.
- Record every intentional behaviour change, with rationale, in
  `docs/technical/behavior-ledger.md`.

## [0.14.2] - 2026-02-27

### Infrastructure
- Add `ignore` package as explicit dependency
- Remove website webhook notification from publish workflow

## [0.14.1] - 2026-02-26

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