// Global test setup
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.COPYTREE_CACHE_ENABLED = 'false'; // Disable caching in tests

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Add custom matchers if needed
expect.extend({
  toBeValidPath(received) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      pass,
      message: () => `expected ${received} to be a valid file path`
    };
  },
  
  toContainFile(received, filepath) {
    const files = Array.isArray(received) ? received : [];
    const pass = files.some(f => f.path === filepath);
    return {
      pass,
      message: () => pass
        ? `expected files not to contain ${filepath}`
        : `expected files to contain ${filepath}`
    };
  }
});

// Global test utilities
global.testUtils = {
  createMockFile: (path, content = '', metadata = {}) => ({
    path,
    content,
    absolutePath: `/test/project/${path}`,
    size: content.length,
    mtime: new Date(),
    ...metadata
  }),
  
  createMockProfile: (overrides = {}) => ({
    name: 'test-profile',
    patterns: ['**/*'],
    exclude: ['node_modules/**'],
    transformers: [],
    ...overrides
  }),
  
  createMockContext: (overrides = {}) => ({
    basePath: '/test/project',
    options: {},
    profile: global.testUtils.createMockProfile(),
    emit: jest.fn(),
    ...overrides
  })
};

// Cleanup after tests
afterAll(() => {
  // Restore console
  global.console = console;
});