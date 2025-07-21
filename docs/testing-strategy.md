# CopyTree Testing Strategy

## Overview
This document outlines the comprehensive testing strategy for CopyTree, ensuring reliability, performance, and maintainability across all components.

## Testing Principles
1. **Test Pyramid**: Focus on unit tests (70%), integration tests (20%), and E2E tests (10%)
2. **Test Coverage**: Minimum 80% overall, 95% for critical paths
3. **Test Independence**: Each test should be isolated and not depend on others
4. **Fast Feedback**: Tests should run quickly to encourage frequent execution
5. **Meaningful Tests**: Focus on behavior, not implementation details

## Test Categories

### 1. Unit Tests (70% of tests)
Test individual components in isolation with mocked dependencies.

#### Pipeline Components
- **Stages** (`src/pipeline/stages/`)
  - [x] DeduplicateFilesStage
  - [x] ExternalSourceStage
  - [ ] AlwaysIncludeStage
  - [ ] ComposerStage
  - [ ] NPMStage
  - [ ] SortFilesStage
  - [ ] FileDiscoveryStage
  - [ ] GitFilterStage
  - [ ] AIFilterStage
  - [ ] ProfileFilterStage
  - [ ] FileLoadingStage
  - [ ] TransformStage
  - [ ] OutputFormattingStage
  - [ ] StreamingOutputStage

- **Core Pipeline** (`src/pipeline/`)
  - [x] Pipeline.js
  - [ ] Stage.js (base class)
  - [ ] StageResult.js

#### Transformers (`src/transforms/transformers/`)
- [x] ImageDescriptionTransformer
- [x] FileSummaryTransformer
- [ ] PDFTransformer
- [ ] CSVTransformer
- [ ] BinaryTransformer
- [ ] DocumentToTextTransformer
- [ ] FirstLinesTransformer
- [ ] HTMLStripperTransformer
- [ ] ImageTransformer
- [ ] MarkdownLinkStripperTransformer
- [ ] MarkdownTransformer
- [ ] SvgDescriptionTransformer
- [ ] UnitTestSummaryTransformer
- [ ] FileLoader (default)

#### Services (`src/services/`)
- [x] GitHubUrlHandler
- [x] AIService
- [ ] CacheService
- [ ] ConversationStateManager
- [ ] FileLoader
- [ ] MCPService
- [ ] RulesetFilter

#### Commands (`src/commands/`)
- [x] copy.js (partial)
- [ ] ask.js
- [ ] watch.js
- [ ] mcp.js
- [ ] profileCreate.js
- [ ] profileList.js
- [ ] profileValidate.js
- [ ] copyDocs.js
- [ ] configValidate.js
- [ ] cacheClear.js
- [ ] installCopytree.js
- [ ] installClaude.js

#### Profiles (`src/profiles/`)
- [ ] ProfileLoader
- [ ] ProfileGuesser
- [ ] ProfileValidator

#### Utils (`src/utils/`)
- [ ] errors.js
- [ ] fileFilter.js
- [ ] formatters.js
- [ ] gitHelper.js
- [ ] logger.js (mock only)
- [ ] patternExpander.js
- [ ] xmlBuilder.js

#### Config (`src/config/`)
- [x] ConfigManager (partial)
- [ ] Configuration files

### 2. Integration Tests (20% of tests)
Test multiple components working together with minimal mocking.

- [x] Pipeline Integration - Full pipeline execution
- [ ] Profile Loading - Profile discovery and validation
- [ ] Git Integration - Git operations with simple-git
- [ ] AI Integration - AI service with transformers
- [ ] Cache Integration - Caching across components
- [ ] MCP Integration - MCP server functionality

### 3. E2E Tests (10% of tests)
Test complete user workflows through the CLI.

- [ ] Copy Command E2E - Various scenarios
- [ ] Watch Mode E2E - File monitoring
- [ ] Ask Command E2E - Conversational interface
- [ ] Profile Management E2E - Create, list, validate
- [ ] Installation E2E - Setup workflows

## Testing Patterns

### Mocking Strategy
```javascript
// 1. Mock external dependencies
jest.mock('fs-extra');
jest.mock('child_process');
jest.mock('../../../src/config/ConfigManager', () => mockConfig);

// 2. Mock services with factories
const createMockAIService = (overrides = {}) => ({
  generate: jest.fn().mockResolvedValue('Generated text'),
  filterFilesByQuery: jest.fn().mockResolvedValue([]),
  ...overrides
});

// 3. Use test utilities for common patterns
const mockFile = testUtils.createMockFile('test.js', 'content');
const mockContext = testUtils.createMockContext();
```

### Test Structure
```javascript
describe('ComponentName', () => {
  let component;
  let mockDependencies;

  beforeEach(() => {
    // Setup
    jest.clearAllMocks();
    mockDependencies = createMocks();
    component = new Component(mockDependencies);
  });

  describe('methodName', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = await component.method(input);
      
      // Assert
      expect(result).toMatchExpectedOutput();
      expect(mockDependencies.service).toHaveBeenCalledWith(expectedArgs);
    });

    it('should handle edge cases', async () => {
      // Test empty input, null values, etc.
    });

    it('should handle errors gracefully', async () => {
      // Test error scenarios
    });
  });
});
```

### Common Test Scenarios

#### For Pipeline Stages
1. Normal processing with valid input
2. Empty input handling
3. Error handling and recovery
4. Context emission (events)
5. shouldApply conditions
6. Configuration respect

#### For Transformers
1. canTransform file matching
2. Successful transformation
3. Error handling (API failures, missing deps)
4. Caching behavior
5. Large file handling
6. Priority ordering

#### For Services
1. Initialization and configuration
2. Main functionality
3. Error scenarios
4. Retry logic
5. Caching behavior
6. Resource cleanup

#### For Commands
1. Option parsing
2. Success scenarios
3. Error handling
4. Output formatting
5. User feedback (spinners, messages)
6. File I/O operations

## Test Data Management

### Fixtures
- Location: `tests/fixtures/`
- Structure:
  ```
  fixtures/
  ├── projects/      # Sample project structures
  ├── files/         # Individual test files
  ├── profiles/      # Test profile YAMLs
  └── responses/     # Mock API responses
  ```

### Test Utilities
- `tests/setup.js` - Global test setup
- `tests/setup-mocks.js` - Global mocking
- `tests/utils/` - Shared test utilities

## Performance Testing

### Benchmarks
- File processing speed
- Memory usage under load
- Streaming performance
- Cache effectiveness

### Load Testing
- Large file counts (10k+ files)
- Large file sizes (100MB+ files)
- Deep directory structures
- Concurrent operations

## Coverage Goals

### Overall: 80%+
- Statements: 80%
- Branches: 80%
- Functions: 80%
- Lines: 80%

### Critical Paths: 95%+
- Pipeline core
- File discovery
- Command execution
- Error handling

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks
- Run unit tests for changed files
- Lint and format checks
- No broken tests allowed

## Testing Commands

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/services/AIService.test.js

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests with debugging
node --inspect-brk ./node_modules/.bin/jest --runInBand
```

## Test Maintenance

### Regular Tasks
1. Review and update mocks when implementations change
2. Add tests for bug fixes (regression tests)
3. Refactor tests to reduce duplication
4. Update fixtures and test data
5. Monitor and improve test performance

### Test Review Checklist
- [ ] Tests are readable and self-documenting
- [ ] Tests cover happy path and edge cases
- [ ] Tests include error scenarios
- [ ] Mocks are appropriate and not over-used
- [ ] Tests run quickly (< 100ms for unit tests)
- [ ] Tests are deterministic (no flaky tests)

## Implementation Priority

### Phase 1: Core Components (Week 1)
1. Pipeline stages (file discovery, loading, transform)
2. Core services (FileLoader, ProfileLoader)
3. Base transformers (FileLoader, Markdown, CSV)

### Phase 2: Commands (Week 2)
1. Main copy command
2. Watch command
3. Profile commands
4. Configuration commands

### Phase 3: Advanced Features (Week 3)
1. AI-powered transformers
2. Git integration
3. External sources
4. MCP server

### Phase 4: Polish (Week 4)
1. E2E tests
2. Performance tests
3. Cross-platform tests
4. Documentation