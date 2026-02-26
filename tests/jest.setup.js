/**
 * Jest setup file for additional configuration
 *
 * This file is executed after the test framework is installed
 * but before each test file is executed.
 */

// Enable test retries in CI environment only
if (process.env.CI) {
  // Retry failed tests once in CI to handle transient issues
  // Log errors before retry for debugging
  jest.retryTimes(1, { logErrorsBeforeRetry: true });
}

// Always use real timers (not fake timers)
// This is important for tempfs.js settling logic
jest.useRealTimers();
