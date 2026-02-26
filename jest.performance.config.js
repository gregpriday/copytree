/**
 * Jest configuration for performance budget tests.
 *
 * Intentionally does NOT use the global fs-extra mock or the mocked
 * ConfigManager — performance tests must exercise the real filesystem so that
 * timings are meaningful.
 *
 * Run with:
 *   npm run test:performance
 */

export default {
  testEnvironment: 'node',

  // Only match files inside tests/performance/
  testMatch: ['**/tests/performance/**/*.test.js'],

  // Transform ESM files with Babel (same as main config)
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  // Allow all node_modules to be transformed so ESM packages work
  transformIgnorePatterns: [],

  // Map @/ shorthand used in some src imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1.js',
    // Keep lightweight UI mocks — these are never used by performance tests
    // but prevent import errors if transitive deps pull them in.
    '^chalk$': '<rootDir>/tests/mocks/chalk.js',
    '^ora$': '<rootDir>/tests/mocks/ora.js',
    '^.*/utils/logger\\.js$': '<rootDir>/tests/mocks/logger.js',
    '^.*/config\\.js$': '<rootDir>/tests/mocks/config.js',
  },

  // Minimal setup — only env variables, no global mock overrides
  setupFiles: ['<rootDir>/tests/setup-env.js'],

  // Performance tests can take a long time (fixture generation + discovery)
  testTimeout: 120_000, // 2 minutes per test

  // Run tests sequentially so memory measurements are not skewed by concurrency
  maxWorkers: 1,

  // Clear mocks between tests (no-op here since we have no global mocks)
  clearMocks: true,

  verbose: true,
};
