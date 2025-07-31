module.exports = {
  ...require('./jest.config'),
  testMatch: ['**/tests/integration/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/unit/'],
  testTimeout: 30000
};