# CopyTree Test Suite

This directory contains comprehensive tests for CopyTree, organized by type:

## Test Structure

```
tests/
├── unit/                 # Unit tests for individual components
│   ├── commands/        # Test each command in isolation
│   ├── pipeline/        # Test pipeline stages
│   ├── transformers/    # Test each transformer
│   ├── services/        # Test services (AI, Cache, etc.)
│   └── utils/          # Test utility functions
├── integration/         # Integration tests
│   ├── pipeline/       # Full pipeline tests
│   ├── profiles/       # Profile loading and validation
│   └── external/       # External source integration
├── e2e/                # End-to-end command tests
│   └── copy.test.js
└── fixtures/           # Test data and mock projects
    ├── projects/       # Sample projects
    ├── files/         # Individual test files
    └── profiles/      # Test profiles
```

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:coverage

```

## Test Coverage Goals

- **Overall**: 80%+ coverage
- **Critical paths**: 95%+ coverage
- **Commands**: 100% coverage
- **Error handling**: 100% coverage

## Writing Tests

### Unit Test Example

```javascript
// tests/unit/transformers/ImageDescriptionTransformer.test.js
describe('ImageDescriptionTransformer', () => {
  it('should generate description for valid image', async () => {
    // Test implementation
  });
  
  it('should handle API errors gracefully', async () => {
    // Test error handling
  });
});
```

### Integration Test Example

```javascript
// tests/integration/pipeline/external-sources.test.js
describe('External Sources Pipeline', () => {
  it('should clone and process GitHub repository', async () => {
    // Test GitHub integration
  });
});
```

### E2E Test Example

```javascript
// tests/e2e/copy.test.js
describe('Copy Command E2E', () => {
  it('should copy project with AI filter', async () => {
    // Test full command execution
  });
});
```

## Mocking

- **AI Service**: Mock Gemini API responses
- **File System**: Use mock-fs for file operations
- **Git**: Mock simple-git operations
- **External APIs**: Use nock for HTTP mocking

## Performance Tests

Located in `tests/performance/`:
- Large file handling
- Memory usage monitoring
- Streaming performance
- Cache effectiveness