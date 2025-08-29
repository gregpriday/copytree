// Mock logger for tests
const createMockLogger = () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    success: jest.fn(),
    startSpinner: jest.fn(),
    updateSpinner: jest.fn(),
    succeedSpinner: jest.fn(),
    failSpinner: jest.fn(),
    stopSpinner: jest.fn(),
    table: jest.fn(),
    line: jest.fn(),
    styled: jest.fn(),
    tree: jest.fn(),
    formatBytes: jest.fn((bytes) => `${bytes} B`),
    formatDuration: jest.fn((ms) => `${ms}ms`),
    progress: jest.fn(),
    setInkEventsMode: jest.fn(),
    isInkEventsMode: jest.fn().mockReturnValue(false),
    createProgressBar: jest.fn(),
    child: jest.fn(() => createMockLogger()),
  };
  return mockLogger;
};

// Create the main logger instance
const logger = createMockLogger();

// Export both the class and a default instance (matching the original export)
const MockLogger = jest.fn(() => createMockLogger());

export { MockLogger as Logger, logger };

// Export convenience method exports (matching the original)
export const info = logger.info;
export const success = logger.success;
export const warn = logger.warn;
export const error = logger.error;
export const debug = logger.debug;
