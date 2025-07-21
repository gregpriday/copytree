// Mock logger for tests
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn(),
  child: jest.fn(function() { return this; })
});

const logger = createMockLogger();

module.exports = { logger };