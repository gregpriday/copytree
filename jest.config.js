export default {
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/tests/**/*.test.jsx',
    '**/tests/**/*.spec.jsx'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Set to true when running coverage
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.jsx',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/**/*.test.jsx',
    '!src/**/*.spec.jsx',
    '!src/index.js' // CLI entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Module paths - keep mocks for ESM
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1.js',
    '^.*/config/ConfigManager\\.js$': '<rootDir>/tests/mocks/ConfigManager.js',
    '^.*/utils/logger\\.js$': '<rootDir>/tests/mocks/logger.js',
    '^.*/config\\.js$': '<rootDir>/tests/mocks/config.js',
    '^.*/services/InstructionsLoader\\.js$': '<rootDir>/tests/mocks/InstructionsLoader.js',
    '^.*/profiles/ProfileLoader\\.js$': '<rootDir>/tests/mocks/ProfileLoader.js',
    '^ink-testing-library$': '<rootDir>/tests/mocks/ink-testing-library.js',
    '^ink$': '<rootDir>/tests/mocks/ink.js'
  },
  
  // Module directories
  moduleDirectories: ['node_modules', 'src'],
  
  // Setup files
  setupFiles: ['<rootDir>/tests/setup-mocks.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Transform files for ESM
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  
  // Transform ignore patterns to handle ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(globby|slash|fast-glob|@fastify|p-limit|p-timeout|p-queue|eventemitter3|clipboardy)/)'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  
  // Timeouts
  testTimeout: 10000, // 10 seconds for async operations
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};