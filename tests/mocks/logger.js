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
    // Deliberately a plain function, not `jest.fn()`.
    //
    // The suite runs with `resetMocks: true`, which wipes every mock's
    // implementation before each test. A `jest.fn(() => createMockLogger())`
    // therefore starts returning `undefined` the moment a test begins, so any
    // module that takes a child logger in its constructor — most of them —
    // blows up on its first log call with "Cannot read properties of
    // undefined". Nothing asserts on `child` being called, so there is no
    // reason for it to be a spy.
    child: () => createMockLogger(),
  };
  return mockLogger;
};

// Create the main logger instance
const logger = createMockLogger();

// Mock Logger class (matching the original export)
const Logger = jest.fn(() => createMockLogger());

// Export both the class and a default instance (matching the original export)
export { Logger, logger };

// Export convenience method exports (matching the original)
export const info = logger.info;
export const success = logger.success;
export const warn = logger.warn;
export const error = logger.error;
export const debug = logger.debug;
