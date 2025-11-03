# CopyTree Testing Strategy

**Version:** 1.0
**Last Updated:** 2025-01-15
**Status:** Active Development

## Overview

This document outlines the comprehensive testing strategy for CopyTree, including test types, coverage targets, infrastructure, and ongoing improvements. The strategy aligns with the project's event-driven pipeline architecture, transformer trait system, and graceful error recovery philosophy.

## Table of Contents

1. [Test Types & Organization](#test-types--organization)
2. [Test Infrastructure](#test-infrastructure)
3. [Coverage Targets](#coverage-targets)
4. [Implemented Test Suites](#implemented-test-suites)
5. [Pending Test Suites](#pending-test-suites)
6. [CI/CD Integration](#cicd-integration)
7. [Best Practices](#best-practices)
8. [Rollout Timeline](#rollout-timeline)

---

## Test Types & Organization

### Directory Structure

```
tests/
├── unit/                 # Unit tests for individual modules
│   ├── commands/         # CLI command tests
│   ├── config/           # Configuration system tests
│   ├── pipeline/         # Pipeline and stage tests
│   ├── services/         # Service layer tests
│   ├── transformers/     # Transformer tests
│   ├── transforms/       # Transform system tests
│   ├── ui/               # UI component tests
│   └── utils/            # Utility function tests
├── integration/          # Multi-module integration tests
├── e2e/                  # End-to-end CLI tests
├── performance/          # Performance benchmarks
├── helpers/              # Test helper utilities
│   ├── determinism.js    # Normalization utilities
│   ├── fixtures.js       # Fixture management
│   └── pipeline.js       # Pipeline test helpers
├── fixtures/             # Test data
│   ├── goldens/          # Golden file outputs
│   ├── simple-project/   # Small test project
│   ├── images/           # Image test files
│   └── pdfs/             # PDF test files
└── mocks/                # Mock implementations
```

### Test Categories

#### 1. **Unit Tests** (Fast, Isolated, Deterministic)

**Purpose:** Test individual functions, classes, and modules in isolation.

**Scope:**
- Pipeline stage contracts and lifecycle hooks
- Transformer trait enforcement
- Configuration hierarchy and precedence
- Service retry/fallback logic
- Error categorization
- Utility functions

**Characteristics:**
- Run in < 10ms per test
- No external dependencies (network, filesystem where possible)
- Use mocks for external services
- Deterministic outputs

#### 2. **Integration Tests** (Subsystem Realism)

**Purpose:** Test interaction between multiple modules without full system deployment.

**Scope:**
- Stage orchestration across multiple stages
- Event emission and propagation
- External source handling (with local git repos)
- Cache behavior (memory + file layers)
- Profile loading and inheritance

**Characteristics:**
- Run in < 100ms per test
- Use local resources (no network)
- Test real file I/O patterns
- Validate data flows between components

#### 3. **End-to-End Tests** (CLI & User Workflows)

**Purpose:** Validate complete user workflows from CLI invocation to output.

**Scope:**
- All output formats (XML, JSON, Markdown, Tree)
- Profile usage and filtering
- Git integration (modified, branch comparison)
- Transformer pipeline execution
- Error handling and recovery

**Characteristics:**
- Run in < 1s per test
- Use golden file comparisons
- Test actual CLI entry points
- Cover happy paths and common errors

#### 4. **Performance Tests** (Benchmarks & Budgets)

**Purpose:** Ensure performance remains within acceptable bounds.

**Scope:**
- Time budgets per project size (small/medium/large)
- Memory usage patterns
- Concurrency scaling
- Cache effectiveness
- Streaming behavior for large files

**Characteristics:**
- Run on schedule (nightly/weekly) in CI
- Track trends over time
- Fail on regressions > 10%
- Generate performance reports

#### 5. **Robustness Tests** (Edge Cases & Security)

**Purpose:** Test system behavior under unusual or adversarial conditions.

**Scope:**
- Path traversal attempts
- Symlink loops
- Malformed files (PDFs, CSVs, images)
- Non-UTF8 content
- Very large files (> 10MB)
- Case-insensitive path collisions

---

## Test Infrastructure

### Helper Modules

#### `tests/helpers/determinism.js`

Provides normalization utilities for stable test outputs:

```javascript
import { normalizeForGolden, normalizePaths, normalizeTimestamps } from './helpers/determinism.js';

// Normalize all nondeterministic data
const normalized = normalizeForGolden(output, { basePath: projectRoot });

// Selective normalization
const pathsNormalized = normalizePaths(content, { basePath: '/project' });
const idsNormalized = normalizeIds(content);
const metricsNormalized = normalizeMetrics(content);
```

**Features:**
- Path normalization (absolute → relative, OS-agnostic)
- Timestamp normalization (ISO 8601, Unix epochs)
- UUID and request ID normalization
- Performance metrics normalization (durations, memory, sizes)
- Token count normalization

#### `tests/helpers/fixtures.js`

Fixture management for test data:

```javascript
import { createSimpleProject, createLargeProject, createLocalGitRepo } from './helpers/fixtures.js';

// Create test projects programmatically
const projectPath = createSimpleProject('test', { withGit: true });

// Create performance test projects
const largeProject = createLargeProject('large', 500, { avgFileSize: 2048 });

// Create local git repos for external source testing
const repo = createLocalGitRepo('test-repo', {
  'README.md': '# Test',
  'src/index.js': 'console.log("hello");'
});
```

**Features:**
- Programmatic fixture creation
- Golden file management
- Local git repository creation
- Temporary directory management
- Cleanup utilities

#### `tests/helpers/pipeline.js`

Pipeline testing utilities:

```javascript
import { PipelineEventCollector, createTestPipeline, runPipelineWithEvents } from './helpers/pipeline.js';

// Collect and validate pipeline events
const collector = new PipelineEventCollector(pipeline);
await pipeline.run(input);

const validation = collector.validateContract();
expect(validation.valid).toBe(true);

// Create mock pipelines
const pipeline = createTestPipeline([stage1, stage2, stage3]);
```

**Features:**
- Event collection and validation
- Pipeline contract enforcement
- Mock stage creation
- Performance snapshot capture
- Stage input/output contract validation

### Golden File Testing

Golden files are stored in `tests/fixtures/goldens/` and represent expected outputs for regression testing.

**Usage:**
```javascript
import { readGolden, matchGolden } from './helpers/fixtures.js';

// Compare against golden file
const normalized = normalizeForGolden(output);
expect(normalized).toMatchGolden('simple.xml');

// Update mode (use sparingly)
// UPDATE_GOLDEN=true npm test
```

**Conventions:**
- One golden file per format per fixture
- Naming: `<fixture-name>.<format>` (e.g., `simple.xml`, `simple.json`)
- Always normalize before comparison
- Update only with explicit approval

---

## Coverage Targets

### Global Coverage

**Target:** 80% across all metrics (branches, functions, lines, statements)

**Current Status:** Enforced via `jest.config.js`

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

### Module-Specific Targets

#### Critical Paths (95% coverage)

- `src/pipeline/Pipeline.js`
- `src/pipeline/Stage.js`
- `src/config/ConfigManager.js`
- `src/transforms/TransformerRegistry.js`
- `src/utils/GitUtils.js`

#### High-Priority (90% coverage)

- All pipeline stages (`src/pipeline/stages/*.js`)
- Core transformers (FileLoader, PDF, Image, CSV, Markdown)
- Service layer (`src/services/*.js`)

#### Standard (80% coverage)

- UI components (`src/ui/*.js`)
- Utility functions (`src/utils/*.js`)
- Command implementations (`src/commands/*.js`)

### Commands (100% coverage)

All CLI commands should have comprehensive tests covering:
- Argument parsing
- Option validation
- Error handling
- Output formatting
- Exit codes

---

## Implemented Test Suites

### ✅ Pipeline Event Contract Tests

**Location:** `tests/unit/pipeline/events.contract.test.js`

**Coverage:**
- `pipeline:start`, `pipeline:complete`, `pipeline:error` events
- `stage:start`, `stage:complete`, `stage:error` events
- `file:batch` events with action types
- Event timing and ordering validation
- Performance metrics in events
- Error recovery event flow

**Test Count:** 20+ tests

**Key Validations:**
- All required event fields present
- Event ordering is correct
- Timing data is accurate
- Memory deltas are tracked
- Error events include stage context

### ✅ Transformer Trait Enforcement Tests

**Location:** `tests/unit/transforms/traits.enforcement.test.js`

**Coverage:**
- Heavy transformer identification and scheduling
- Idempotent trait behavior
- Input/output type matching and chaining
- Dependency resolution and circular detection
- Priority-based ordering
- Real-world transformer trait validation

**Test Count:** 20+ tests

**Key Validations:**
- Heavy transformers respect budget constraints
- Idempotent transformers can be reapplied safely
- Type incompatibilities prevent invalid chains
- Dependencies are resolved in correct order
- Priority determines execution sequence

### ✅ Configuration Hierarchy Tests

**Location:** `tests/unit/config/config.hierarchy.test.js`

**Coverage:**
- Precedence order: default < user < project < env < CLI
- Nested object deep merging
- Environment variable mapping (GEMINI_API_KEY, etc.)
- Provenance tracking for all values
- Dot notation access
- File loading from search paths

**Test Count:** 28 tests

**Key Validations:**
- Highest precedence source wins for each key
- Nested values merge correctly across levels
- Environment variables map to config keys
- Provenance tracks which source set each value
- Missing values fall through to defaults

---

## Pending Test Suites

### 🔲 CLI Golden Output Tests (E2E)

**Location:** `tests/e2e/cli.outputs.test.js` (planned)

**Scope:**
- All output formats (XML, JSON, Markdown, Tree)
- Profile application
- Include/exclude patterns
- Git filters (--modified, --changed <ref>)
- Transformer pipeline
- Streaming output
- Character limits
- Instructions injection

**Approach:**
```javascript
it.each(['xml', 'json', 'tree', 'markdown'])('produces stable %s output', async (format) => {
  const { stdout } = await runCLI(['--format', format, fixturePath('simple-project')]);
  const normalized = normalizeForGolden(stdout);
  expect(normalized).toMatchGolden(`simple.${format}`);
});
```

### 🔲 External Sources with Local Git Tests

**Location:** `tests/integration/external-sources.test.js` (planned)

**Scope:**
- Local git repository cloning
- Cache hit/miss behavior
- Branch detection
- Subpath support
- Rule application (include/exclude)
- Optional source handling
- Update detection

**Approach:**
```javascript
it('clones and caches local git repo', async () => {
  const repo = createLocalGitRepo('test-repo', files);
  const firstRun = await copy({ source: repo.path });
  const secondRun = await copy({ source: repo.path });

  expect(secondRun.stats.cloneFromCache).toBe(true);
  expect(secondRun.duration).toBeLessThan(firstRun.duration);
});
```

### 🔲 Robustness Tests

**Location:** `tests/integration/robustness.test.js` (planned)

**Scope:**
- Path traversal attempts (`../../../etc/passwd`)
- Symlink loops
- Malformed files (corrupt PDFs, invalid CSV, broken images)
- Non-UTF8 content
- Files > 10MB (streaming threshold)
- Zero-byte files
- Case-insensitive collisions
- Deep nesting (> 100 levels)

**Approach:**
```javascript
it('prevents path traversal', async () => {
  const { files } = await runPipeline({
    sourcePath: fixturesWith('../../../dangerous/path')
  });

  expect(files.every(f => isWithinSourcePath(f.path))).toBe(true);
});
```

### 🔲 Performance Benchmarks in CI

**Location:** `.github/workflows/performance.yml` (planned)

**Scope:**
- Scheduled runs (nightly/weekly)
- Small project (10 files): < 1s
- Medium project (100 files): < 5s
- Large project (500+ files): < 30s
- Memory ceiling: < 500MB
- Cache speedup: > 50% faster
- Concurrency scaling: linear up to 10 workers

**Approach:**
```yaml
- name: Run performance benchmarks
  run: npm run benchmark -- --json > perf-results.json

- name: Check performance budgets
  run: node scripts/check-perf-budgets.js perf-results.json

- name: Upload results
  uses: actions/upload-artifact@v3
  with:
    name: perf-results
    path: perf-results.json
```

---

## CI/CD Integration

### GitHub Actions Matrix

**Proposed Configuration:**

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node: [20, 22]  # Node.js 20+ required
        os: [ubuntu-latest, macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - run: npm run test:coverage

  performance:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run benchmark
      - run: node scripts/check-perf-budgets.js
```

### Required Checks

**Pull Request Gates:**
- ✅ Linting passes
- ✅ Unit tests pass (100%)
- ✅ Integration tests pass (100%)
- ✅ E2E tests pass (100%)
- ✅ Coverage thresholds met (80% global, 95% critical)

**Scheduled Checks (Nightly/Weekly):**
- Performance benchmarks within budgets
- No regressions > 10%
- Memory usage trends

---

## Best Practices

### Writing Tests

1. **Follow AAA Pattern:**
   ```javascript
   // Arrange
   const input = createTestInput();

   // Act
   const result = await process(input);

   // Assert
   expect(result).toMatchExpected();
   ```

2. **Use Descriptive Test Names:**
   ```javascript
   it('retries retryable errors up to max attempts', async () => { ... });
   // NOT: it('works', () => { ... });
   ```

3. **Isolate Tests:**
   - Clean up resources in `afterEach`
   - Don't rely on test execution order
   - Use separate fixtures per test when possible

4. **Mock External Dependencies:**
   - APIs (Gemini, GitHub)
   - File system (when appropriate)
   - Time (Date.now(), setTimeout)

5. **Use Helpers:**
   - Leverage `tests/helpers/` utilities
   - Create reusable fixtures
   - Extract common setup to functions

### Test Data

1. **Fixtures:**
   - Keep fixtures minimal and focused
   - One fixture per test scenario
   - Store in `tests/fixtures/`

2. **Golden Files:**
   - Normalize before comparison
   - Review diffs carefully before updating
   - Use `UPDATE_GOLDEN=true` only when necessary

3. **Generated Data:**
   - Seed random generators for determinism
   - Use factories for complex objects
   - Avoid hard-coded timestamps/IDs

### Performance

1. **Keep Unit Tests Fast (< 10ms):**
   - No network calls
   - Minimal file I/O
   - Mock heavy operations

2. **Limit Integration Test Scope:**
   - Test specific subsystems
   - Use local resources
   - Avoid full pipeline runs

3. **Parallelize Where Possible:**
   - Jest runs tests in parallel by default
   - Mark serial tests with `--runInBand` if needed

---

## Rollout Timeline

### Phase 1: Foundation (Weeks 1-2) ✅ **COMPLETED**

- ✅ Test infrastructure and helpers
- ✅ Pipeline event contract tests
- ✅ Transformer trait enforcement tests
- ✅ Config hierarchy tests

**Status:** All core test infrastructure is in place and validated.

### Phase 2: Integration & E2E (Weeks 3-4)

- 🔲 CLI golden output tests for all formats
- 🔲 External sources with local git tests
- 🔲 Robustness tests (path traversal, edge cases)
- 🔲 Complete pipeline integration tests

**Target:** 90% integration coverage

### Phase 3: Performance & CI (Weeks 5-6)

- 🔲 Performance benchmark CI integration
- 🔲 Regression detection and alerts
- 🔲 Memory profiling and optimization
- 🔲 Concurrency scaling tests

**Target:** Performance budgets enforced in CI

### Phase 4: Optimization & Polish (Ongoing)

- 🔲 Mutation testing (Stryker)
- 🔲 Property-based testing (fast-check)
- 🔲 Expand coverage to 95% for critical paths
- 🔲 Test documentation and examples

**Target:** Comprehensive test suite with automated quality gates

---

## Metrics & Monitoring

### Test Suite Metrics

**Current (Phase 1 Complete):**
- **Total Tests:** ~150+
- **Unit Tests:** ~120
- **Integration Tests:** ~20
- **E2E Tests:** ~10
- **Coverage:** 80% global (target met)

**Target (All Phases Complete):**
- **Total Tests:** 300+
- **Unit Tests:** 200+
- **Integration Tests:** 60+
- **E2E Tests:** 40+
- **Coverage:** 85% global, 95% critical paths

### Performance Benchmarks

**Targets:**
- Small project (10 files): < 1s
- Medium project (100 files): < 5s
- Large project (500+ files): < 30s
- Memory usage: < 500MB
- Cache speedup: > 50%

**Measured in CI:** Nightly performance runs with trend tracking

---

## Contributing

### Adding New Tests

1. **Choose the Right Category:**
   - Unit: Single module/function
   - Integration: Multiple modules
   - E2E: Full CLI workflow

2. **Use Existing Helpers:**
   - Check `tests/helpers/` for utilities
   - Reuse fixtures when possible

3. **Follow Naming Conventions:**
   - File: `<module>.test.js`
   - Suite: `describe('<ModuleName>', () => { ... })`
   - Test: `it('<expected behavior>', () => { ... })`

4. **Add to Coverage Targets:**
   - Update thresholds in `jest.config.js` if needed
   - Aim for critical paths: 95%
   - Standard paths: 80%

5. **Document Complex Tests:**
   - Add comments explaining non-obvious logic
   - Reference related issues/PRs
   - Explain why the test is necessary

### Running Tests Locally

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage

# Watch mode
npm test -- --watch

# Specific file
npm test -- tests/unit/config/config.hierarchy.test.js

# Update golden files (use with caution)
UPDATE_GOLDEN=true npm test
```

---

## Resources

- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **Testing Best Practices:** https://github.com/goldbergyoni/javascript-testing-best-practices
- **Project Architecture:** [docs/technical/architecture.md](./architecture.md)
- **CLI Reference:** [docs/cli/copytree-reference.md](../cli/copytree-reference.md)

---

## Conclusion

This testing strategy provides a solid foundation for ensuring CopyTree's reliability, performance, and maintainability. With the core infrastructure in place (Phase 1 complete), we're well-positioned to expand coverage and enforce quality gates throughout the development process.

**Key Principles:**
1. **Comprehensive:** Cover all layers (unit → integration → e2e → perf)
2. **Practical:** Focus on high-value tests aligned with architecture
3. **Automated:** Enforce quality gates in CI/CD
4. **Maintainable:** Use helpers, fixtures, and clear conventions
5. **Iterative:** Continuous improvement via phases and metrics

For questions or suggestions, please open an issue or discussion on GitHub.
