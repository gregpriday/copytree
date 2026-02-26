/**
 * Jest configuration with multiple projects
 * - "mocked" project: Uses global mocks for most tests (default behavior)
 * - "real" project: Tests real implementations without mocks for integration-level tests
 */

// Base configuration shared by both projects
const baseConfig = {
  testEnvironment: 'node',

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.jsx',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/**/*.test.jsx',
    '!src/**/*.spec.jsx',
    '!src/index.js', // CLI entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Module directories
  moduleDirectories: ['node_modules', 'src'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js', '<rootDir>/tests/jest.setup.js'],

  // Transform files for ESM
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  // Transform all node_modules ESM packages for Jest compatibility
  transformIgnorePatterns: [],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],

  // Timeouts
  testTimeout: 10000, // 10 seconds for async operations

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

// Mocked project - uses global mocks (default for most tests)
const mockedProject = {
  ...baseConfig,
  displayName: 'mocked',
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/unit/**/*.spec.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/integration/**/*.spec.js',
    '**/tests/e2e/**/*.test.js',
    '**/tests/e2e/**/*.spec.js',
    '**/tests/performance/**/*.test.js',
    '!**/tests/real/**/*.test.js', // Exclude real tests
    '!**/tests/integration/fileDiscoveryStage.parallel.test.js', // Requires real fs-extra and ConfigManager
    '!**/tests/integration/concurrent-operations.test.js', // Requires real ConfigManager
    '!**/tests/integration/folderProfile.test.js', // Requires real fs-extra for streamed output files
    '!**/tests/unit/utils/parallelWalker.test.js', // Requires real fs-extra
    '!**/tests/unit/config/config.isolation.test.js', // Requires real ConfigManager
    '!**/tests/unit/utils/logger.test.js', // Tests the real Logger class, uses loggerUnit project
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1.js',
    '^chalk$': '<rootDir>/tests/mocks/chalk.js',
    '^ora$': '<rootDir>/tests/mocks/ora.js',
    '^.*/config/ConfigManager\\.js$': '<rootDir>/tests/mocks/ConfigManager.js',
    '^.*/utils/logger\\.js$': '<rootDir>/tests/mocks/logger.js',
    '^.*/config\\.js$': '<rootDir>/tests/mocks/config.js',
    '^.*/services/InstructionsLoader\\.js$': '<rootDir>/tests/mocks/InstructionsLoader.js',
    '^ink-testing-library$': '<rootDir>/tests/mocks/ink-testing-library.js',
    '^ink$': '<rootDir>/tests/mocks/ink.js',
  },
  setupFiles: ['<rootDir>/tests/setup-env.js', '<rootDir>/tests/setup-global-mocks.js'],
};

// Real project - tests real implementations without global mocks
const realProject = {
  ...baseConfig,
  displayName: 'real',
  testMatch: [
    '**/tests/real/**/*.test.js',
    '**/tests/real/**/*.spec.js',
    '**/tests/integration/fileDiscoveryStage.parallel.test.js', // Requires real fs-extra and ConfigManager
    '**/tests/integration/concurrent-operations.test.js', // Requires real ConfigManager
    '**/tests/integration/folderProfile.test.js', // Requires real fs-extra for streamed output files
    '**/tests/unit/utils/parallelWalker.test.js', // Requires real fs-extra
    '**/tests/unit/config/config.isolation.test.js', // Requires real ConfigManager
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1.js',
    // Keep non-intrusive mocks (UI libraries, etc.)
    '^chalk$': '<rootDir>/tests/mocks/chalk.js',
    '^ora$': '<rootDir>/tests/mocks/ora.js',
    '^.*/utils/logger\\.js$': '<rootDir>/tests/mocks/logger.js',
    '^.*/config\\.js$': '<rootDir>/tests/mocks/config.js',
    '^ink-testing-library$': '<rootDir>/tests/mocks/ink-testing-library.js',
    '^ink$': '<rootDir>/tests/mocks/ink.js',
    // Note: ConfigManager and InstructionsLoader are NOT mocked here
  },
  setupFiles: ['<rootDir>/tests/setup-env.js'], // Only environment setup, no global mocks
};

// Logger unit project — tests the real Logger class without mocking logger.js.
// ConfigManager is still mocked to avoid disk I/O, but logger.js is real.
const loggerUnitProject = {
  ...baseConfig,
  displayName: 'logger',
  testMatch: ['**/tests/unit/utils/logger.test.js'],
  // Do NOT reset mocks between tests: the chalk mock uses jest.fn() and
  // resetMocks would clear the implementations, making chalk.red() return
  // undefined instead of the input string.
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1.js',
    '^chalk$': '<rootDir>/tests/mocks/chalk.js',
    '^ora$': '<rootDir>/tests/mocks/ora.js',
    // logger.js is intentionally NOT mocked here
    '^.*/config/ConfigManager\\.js$': '<rootDir>/tests/mocks/ConfigManager.js',
    '^.*/config\\.js$': '<rootDir>/tests/mocks/config.js',
    '^ink-testing-library$': '<rootDir>/tests/mocks/ink-testing-library.js',
    '^ink$': '<rootDir>/tests/mocks/ink.js',
  },
  setupFiles: ['<rootDir>/tests/setup-env.js'],
};

export default {
  // Global-only Jest options (not valid inside per-project config in Jest 30)
  collectCoverage: false,
  verbose: true,
  projects: [mockedProject, realProject, loggerUnitProject],
};
