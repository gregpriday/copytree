module.exports = {
  testEnvironment: 'node',
  
  // Test file patterns - only integration tests
  testMatch: [
    '**/tests/integration/**/*.test.js',
    '**/tests/integration/**/*.spec.js'
  ],
  
  // NO module mapping for integration tests - we want real modules
  moduleNameMapper: {},
  
  // Module directories
  moduleDirectories: ['node_modules', 'src'],
  
  // NO setup files - don't load mocks for integration tests
  setupFiles: [],
  setupFilesAfterEnv: [],
  
  // Transform files
  transform: {
    '^.+\\.js$': 'babel-jest'
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
  
  // Longer timeout for integration tests
  testTimeout: 30000, // 30 seconds for integration tests
  
  // Verbose output
  verbose: true,
  
  // Don't clear/reset mocks since we're not using them
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false
};