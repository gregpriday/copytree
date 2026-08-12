// Global test setup
// This file runs before all tests

import { toMatchGolden } from './helpers/fixtures.js';

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
  debug: jest.fn(),
};

// Re-arm the global filesystem mock before every test.
//
// `resetMocks: true` strips every mock implementation between tests, including
// the ones a `jest.mock` factory installed at module-registry time. The result
// was that `fs.readFile` resolved to `undefined` throughout the `mocked`
// project, so anything that actually read a file was operating on nothing —
// visible only as swallowed errors. Declared in `tests/setup-global-mocks.js`;
// applied here, where `beforeEach` exists.
beforeEach(() => {
  const registered = globalThis.__COPYTREE_FSX_MOCK__;
  if (!registered) return;

  const { mock, defaults } = registered;
  for (const [name, [kind, value]] of Object.entries(defaults)) {
    if (!jest.isMockFunction(mock[name])) continue;
    if (kind === 'resolve') mock[name].mockResolvedValue(value);
    else if (kind === 'return') mock[name].mockReturnValue(value);
    else mock[name].mockImplementation(value);
  }
});

// Add custom matchers if needed
expect.extend({
  toBeValidPath(received) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      pass,
      message: () => `expected ${received} to be a valid file path`,
    };
  },

  toContainFile(received, filepath) {
    const files = Array.isArray(received) ? received : [];
    const pass = files.some((f) => f.path === filepath);
    return {
      pass,
      message: () =>
        pass
          ? `expected files not to contain ${filepath}`
          : `expected files to contain ${filepath}`,
    };
  },

  // Register golden file matcher
  toMatchGolden,
});

// Global test utilities
global.testUtils = {
  createMockFile: (path, content = '', metadata = {}) => ({
    path,
    content,
    absolutePath: `/test/project/${path}`,
    size: content.length,
    mtime: new Date(),
    ...metadata,
  }),

  createMockProfile: (overrides = {}) => ({
    name: 'test-profile',
    patterns: ['**/*'],
    exclude: ['node_modules/**'],
    transformers: [],
    ...overrides,
  }),

  createMockContext: (overrides = {}) => ({
    basePath: '/test/project',
    options: {},
    profile: global.testUtils.createMockProfile(),
    emit: jest.fn(),
    ...overrides,
  }),
};

// Cleanup after tests
afterAll(() => {
  // Restore console
  global.console = console;
});
