# CopyTree Test Suite

Welcome to the CopyTree test suite! This directory contains comprehensive tests covering unit, integration, e2e, and performance scenarios.

## Quick Start

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Generate coverage report
npm run test:coverage

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npm test -- tests/unit/config/config.hierarchy.test.js

# Update golden files (use sparingly!)
UPDATE_GOLDEN=true npm test
```

## Directory Structure

```
tests/
├── unit/                  # Fast, isolated unit tests
│   ├── commands/          # CLI command tests
│   ├── config/            # Configuration system tests
│   │   └── config.hierarchy.test.js  ✅ Config precedence & env mapping
│   ├── pipeline/          # Pipeline and stage tests
│   │   ├── events.contract.test.js  ✅ Event emission validation
│   │   └── ...
│   ├── services/          # Service layer tests
│   ├── transformers/      # Individual transformer tests
│   ├── transforms/        # Transform system tests
│   │   └── traits.enforcement.test.js  ✅ Trait-based scheduling
│   ├── ui/                # UI component tests
│   └── utils/             # Utility function tests
├── integration/           # Multi-module integration tests
├── e2e/                   # End-to-end CLI tests
├── performance/           # Performance benchmarks
├── helpers/               # 🆕 Test utilities (NEW!)
│   ├── determinism.js     # Normalization for stable outputs
│   ├── fixtures.js        # Fixture management & golden files
│   └── pipeline.js        # Pipeline testing utilities
├── fixtures/              # Test data
│   ├── goldens/           # 🆕 Expected outputs for regression tests
│   └── simple-project/    # Small test project
└── mocks/                 # Mock implementations
```

## Test Categories

### Unit Tests (`tests/unit/`)

**Purpose:** Test individual modules in isolation.

**Characteristics:**
- Fast (< 10ms per test)
- No external dependencies
- Deterministic
- High coverage (80%+ target)

**Example:**
```javascript
import { isRetryableError } from '../../../src/utils/errors.js';

it('identifies RATE_LIMIT as retryable', () => {
  const error = new Error('Rate limit exceeded');
  expect(isRetryableError(error)).toBe(true);
});
```

### Integration Tests (`tests/integration/`)

**Purpose:** Test interaction between modules.

**Characteristics:**
- Medium speed (< 100ms per test)
- Local resources only (no network)
- Test data flows
- Validate subsystem contracts

**Example:**
```javascript
import { createLocalGitRepo } from '../helpers/fixtures.js';

it('clones and caches local repo', async () => {
  const repo = createLocalGitRepo('test', files);
  const first = await copy({ source: repo.path });
  const second = await copy({ source: repo.path });

  expect(second.stats.fromCache).toBe(true);
});
```

### E2E Tests (`tests/e2e/`)

**Purpose:** Test complete CLI workflows.

**Characteristics:**
- Slower (< 1s per test)
- Full CLI invocation
- Golden file comparisons
- Cover user scenarios

**Example:**
```javascript
import { normalizeForGolden } from '../helpers/determinism.js';

it.each(['xml', 'json', 'markdown'])('produces stable %s output', async (format) => {
  const output = await runCLI(['--format', format, 'simple-project']);
  const normalized = normalizeForGolden(output);
  expect(normalized).toMatchGolden(`simple.${format}`);
});
```

### Performance Tests (`tests/performance/`)

**Purpose:** Ensure performance within budgets.

**Characteristics:**
- Run on schedule (nightly/weekly)
- Track trends over time
- Fail on regressions > 10%
- Generate reports

## New Test Helpers 🆕

### `tests/helpers/determinism.js`

Utilities for normalizing nondeterministic data:

```javascript
import {
  normalizeForGolden,    // Normalize everything
  normalizePaths,        // Paths (absolute → relative)
  normalizeTimestamps,   // Timestamps (ISO, Unix)
  normalizeIds,          // UUIDs, request IDs
  normalizeMetrics       // Durations, memory, sizes
} from './helpers/determinism.js';

// Comprehensive normalization for golden files
const normalized = normalizeForGolden(output, { basePath: projectRoot });

// Selective normalization
const pathsOnly = normalizePaths(content, { placeholder: '<ROOT>' });
```

**Key Features:**
- OS-agnostic path normalization
- Timestamp → `<TIMESTAMP>` placeholder
- UUIDs → `<UUID>` placeholder
- Performance metrics → `<DURATION>`, `<MEMORY>`
- Line ending normalization

### `tests/helpers/fixtures.js`

Fixture management and golden file utilities:

```javascript
import {
  createSimpleProject,    // Create test project
  createLargeProject,     // Create perf test project
  createLocalGitRepo,     // Create local git repo
  createRobustnessFixtures, // Edge case fixtures
  fixturePath,            // Get fixture path
  goldenPath,             // Get golden file path
  tmpPath,                // Get temp path
  cleanTmpDir,            // Clean temp directory
  toMatchGolden           // Jest matcher
} from './helpers/fixtures.js';

// Create a simple test project
const project = createSimpleProject('test', {
  withGit: true,
  files: {
    'README.md': '# Test',
    'src/index.js': 'console.log("hello");'
  }
});

// Create local git repo for testing external sources
const repo = createLocalGitRepo('repo', {
  'file.js': 'content'
});
repo.addFiles({ 'file2.js': 'more content' });
repo.createBranch('feature');

// Compare against golden file
expect(normalizedOutput).toMatchGolden('expected.xml');
```

### `tests/helpers/pipeline.js`

Pipeline testing utilities:

```javascript
import {
  createTestPipeline,       // Create minimal pipeline
  createFullPipeline,       // Create full 16-stage pipeline
  PipelineEventCollector,   // Collect & validate events
  MockStage,                // Mock pipeline stage
  createMockFiles,          // Create mock file objects
  runPipelineWithEvents,    // Run pipeline with event capture
  assertStageContract       // Validate stage contracts
} from './helpers/pipeline.js';

// Collect and validate pipeline events
const pipeline = createTestPipeline([stage1, stage2]);
const collector = new PipelineEventCollector(pipeline);

await pipeline.run(input);

const validation = collector.validateContract();
expect(validation.valid).toBe(true);

// Check specific events
const stageCompletes = collector.getEvents('stage:complete');
expect(stageCompletes.length).toBe(2);
```

## Golden File Testing

Golden files in `tests/fixtures/goldens/` represent expected outputs for regression testing.

**Workflow:**

1. **Create Test:**
   ```javascript
   it('produces stable XML output', async () => {
     const output = await generateOutput('simple-project', 'xml');
     const normalized = normalizeForGolden(output);
     expect(normalized).toMatchGolden('simple.xml');
   });
   ```

2. **First Run (Creates Golden):**
   ```bash
   UPDATE_GOLDEN=true npm test -- tests/e2e/outputs.test.js
   ```

3. **Subsequent Runs (Compares):**
   ```bash
   npm test -- tests/e2e/outputs.test.js
   ```

4. **Review Changes:**
   ```bash
   git diff tests/fixtures/goldens/
   ```

**Best Practices:**
- ✅ Always normalize before comparison
- ✅ Review diffs carefully before committing
- ✅ Use meaningful golden file names
- ❌ Don't update goldens without understanding why they changed
- ❌ Don't commit machine-specific or nondeterministic data

## Coverage Targets

### Global: 80%

All metrics (branches, functions, lines, statements) must meet 80% coverage.

### Critical Paths: 95%

- `src/pipeline/Pipeline.js`
- `src/pipeline/Stage.js`
- `src/config/ConfigManager.js`
- `src/transforms/TransformerRegistry.js`
- `src/utils/GitUtils.js`

### Commands: 100%

All CLI commands should have comprehensive test coverage.

## Recently Added Tests ✅

### E2E Golden File Tests (NEW!)

**Files:** `tests/e2e/*.test.js` (4 test files, 21 test cases)

**Purpose:** Comprehensive regression testing for all CLI output formats using golden files.

**Test Coverage:**
- ✅ **Output Formats** (`output-formats.test.js`) - 4 tests
  - XML (default), JSON, Markdown, Tree formats
- ✅ **CLI Flags** (`flags-and-combos.test.js`) - 8 tests
  - `--with-line-numbers`, `--only-tree`, `--info`, `--show-size`
  - `--with-git-status` with actual Git repo
  - Flag combinations (json + line numbers, markdown + info, etc.)
- ✅ **Stream Mode** (`stream-mode.test.js`) - 4 tests
  - Streaming output for all formats
- ✅ **Error Handling** (`negative-cases.test.js`) - 5 tests
  - Unknown formats, invalid paths, invalid profiles
  - Conflicting flags, invalid filter patterns

**Example Test:**
```javascript
import { runCli, normalize } from './_utils.js';

test('XML (default format)', async () => {
  const { code, stdout, stderr } = await runCli([PROJECT, '--display']);

  expect(code).toBe(0);
  expect(stderr).toBe('');

  const normalized = normalize(stdout, { projectRoot: PROJECT });
  expect(normalized).toMatchGolden('default/simple.xml.golden');
});
```

**Running E2E Tests:**
```bash
# Run all E2E tests
npm run test:e2e

# Run specific E2E test file
npm run test:e2e -- output-formats

# Update golden files after intentional changes
UPDATE_GOLDEN=true npm run test:e2e

# Check which golden files changed
git diff tests/fixtures/goldens/
```

**Golden Files Created:** 19 files in `tests/fixtures/goldens/`
- `default/` - Base output formats (XML, JSON, Markdown, tree)
- `flags/` - Various flag combinations
- `stream/` - Streaming mode outputs
- `negative/` - Error messages and edge cases

**Normalization Applied:**
- ANSI escape codes removed
- Paths normalized (OS-agnostic)
- Timestamps → `<TIMESTAMP>`
- UUIDs → `<UUID>`
- Git SHAs → `<SHA>`
- Memory/duration metrics → `<MEMORY>`, `<DURATION>`
- Tree output sorted for determinism

**Key Features:**
- Fully deterministic across platforms (Linux, macOS, Windows)
- Detects unintended CLI output changes
- Uses real file I/O (bypasses Jest mocks with `jest.requireActual`)
- Comprehensive normalization via `tests/helpers/determinism.js`

### Pipeline Event Contract Tests

**File:** `tests/unit/pipeline/events.contract.test.js`

**Coverage:**
- ✅ Pipeline lifecycle events (`pipeline:start`, `pipeline:complete`)
- ✅ Stage events (`stage:start`, `stage:complete`)
- ✅ File batch events
- ✅ Event timing and ordering
- ✅ Error recovery flow

**Key Validations:**
- All required event fields present
- Events emitted in correct order
- Timing/memory data accurate
- Error events include context

### Transformer Trait Enforcement Tests

**File:** `tests/unit/transforms/traits.enforcement.test.js`

**Coverage:**
- ✅ Heavy transformer scheduling
- ✅ Idempotent trait behavior
- ✅ Input/output type matching
- ✅ Dependency resolution
- ✅ Priority-based ordering

**Key Validations:**
- Heavy transformers respect budgets
- Idempotent transformers safe to reapply
- Type chains validated
- Dependencies resolved correctly

### Configuration Hierarchy Tests

**File:** `tests/unit/config/config.hierarchy.test.js`

**Coverage:**
- ✅ Precedence: default < user < project < env < CLI
- ✅ Nested object merging
- ✅ Environment variable mapping
- ✅ Provenance tracking
- ✅ Dot notation access

**Key Validations:**
- Correct precedence order enforced
- Deep merging works correctly
- Env vars map to config keys
- Provenance tracks sources

## Test Writing Guidelines

### 1. Use AAA Pattern

```javascript
it('description', () => {
  // Arrange
  const input = setup();

  // Act
  const result = process(input);

  // Assert
  expect(result).toEqual(expected);
});
```

### 2. Descriptive Names

```javascript
✅ it('retries retryable errors up to max attempts', () => { ... });
❌ it('works', () => { ... });
```

### 3. Isolate Tests

```javascript
afterEach(() => {
  cleanTmpDir();
  resetMocks();
});
```

### 4. Mock External Dependencies

```javascript
jest.mock('../../../src/services/CacheService.js');
```

### 5. Use Helpers

```javascript
import { createTestPipeline, normalizeForGolden } from '../helpers';
```

## Common Commands

```bash
# Run tests matching pattern
npm test -- --testNamePattern="retry"

# Run tests in specific file
npm test -- tests/unit/config/config.hierarchy.test.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode (useful during development)
npm test -- --watch

# Run only failed tests from last run
npm test -- --onlyFailures

# Run tests in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Update snapshots (use carefully!)
npm test -- --updateSnapshot

# Update golden files (use carefully!)
UPDATE_GOLDEN=true npm test
```

## Debugging Tests

### VS Code Configuration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["${fileBasename}", "--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Chrome DevTools

```bash
node --inspect-brk node_modules/.bin/jest --runInBand tests/unit/config/config.hierarchy.test.js
```

Then open `chrome://inspect` in Chrome.

## CI/CD

Tests run automatically on:
- **Every push** to any branch
- **Every pull request** creation/update
- **Nightly** (performance benchmarks)

**Required for PR merge:**
- ✅ All tests pass
- ✅ Coverage thresholds met
- ✅ No linting errors

## Contributing

When adding new features:

1. **Write tests first** (TDD encouraged)
2. **Choose appropriate test type** (unit/integration/e2e)
3. **Use existing helpers** for common patterns
4. **Maintain coverage targets** (80% global, 95% critical)
5. **Add golden files** for CLI output changes
6. **Update this README** if adding new test categories

## Resources

- **Full Testing Strategy:** [docs/technical/testing-strategy.md](../docs/technical/testing-strategy.md)
- **Project Architecture:** [docs/technical/architecture.md](../docs/technical/architecture.md)
- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **Testing Best Practices:** https://github.com/goldbergyoni/javascript-testing-best-practices

## Questions?

Open an issue or discussion on GitHub if you need help with testing!
