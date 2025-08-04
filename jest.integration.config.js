import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  testMatch: ['**/tests/integration/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/unit/'],
  testTimeout: 30000
};