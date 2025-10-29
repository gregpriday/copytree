# Testing Module Rules

## Coverage Requirements

**Global thresholds** (enforced by Jest):
- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

**Run before commit:**
```bash
npm run test:coverage
```

## Test Structure

**Unit tests** (`tests/unit/`):
- Fast (<10ms per test)
- No external dependencies
- Deterministic
- Use mocks for: ConfigManager, logger, Ink components, ProfileLoader

**Integration tests** (`tests/integration/`):
- Medium speed (<100ms)
- Test component interactions
- Local resources only (no network)

**E2E tests** (`tests/e2e/`):
- Full CLI invocation
- Golden file comparisons
- Use test helpers from `@tests/helpers/`

## Test Helpers (NEW)

**Determinism** (`tests/helpers/determinism.js`):
- `normalizeForGolden(output)` - Normalize for stable comparisons
- `normalizePaths(content)` - OS-agnostic paths
- `normalizeTimestamps(content)` - Replace timestamps
- `normalizeIds(content)` - Replace UUIDs/request IDs

**Fixtures** (`tests/helpers/fixtures.js`):
- `createSimpleProject(name, options)` - Create test project
- `createLocalGitRepo(name, files)` - Create git repo for testing
- `toMatchGolden(goldenFileName)` - Jest matcher for golden files
- `UPDATE_GOLDEN=true npm test` - Update golden files

**Pipeline** (`tests/helpers/pipeline.js`):
- `createTestPipeline(stages)` - Create minimal pipeline
- `PipelineEventCollector(pipeline)` - Collect and validate events
- `MockStage` - Mock pipeline stage
- `assertStageContract(stage)` - Validate stage implements contract

## Testing Patterns

**Pipeline stages:**
```javascript
const stage = new MyStage();
const result = await stage.process(input);
expect(result.files).toBeDefined();
```

**Event-driven tests:**
```javascript
const collector = new PipelineEventCollector(pipeline);
await pipeline.run(input);
expect(collector.getEvents('stage:complete')).toHaveLength(2);
```

**Golden file tests:**
```javascript
const output = await generateOutput('simple-project', 'xml');
const normalized = normalizeForGolden(output);
expect(normalized).toMatchGolden('simple.xml');
```

## Test Writing Guidelines

1. Use AAA pattern (Arrange, Act, Assert)
2. Descriptive test names: `it('retries retryable errors up to max attempts')`
3. Isolate tests: clean up in `afterEach()`
4. Mock external dependencies: AI APIs, file system (when needed)
5. Use fixtures from `@tests/fixtures/`
