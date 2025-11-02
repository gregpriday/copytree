/**
 * Environment variable cleanup utility
 *
 * Ensures proper isolation between tests that modify process.env
 * by correctly restoring the original environment state.
 */

let originalEnv;

/**
 * Setup environment isolation (call in beforeEach)
 */
export function setupEnvIsolation() {
  originalEnv = { ...process.env };
}

/**
 * Restore environment to original state (call in afterEach)
 */
export function restoreEnv() {
  if (!originalEnv) {
    console.warn('restoreEnv called without setupEnvIsolation - skipping');
    return;
  }

  // Remove keys that were added during test
  Object.keys(process.env).forEach((key) => {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  });

  // Restore original values for keys that were modified
  Object.keys(originalEnv).forEach((key) => {
    process.env[key] = originalEnv[key];
  });
}

/**
 * Get the original value of an environment variable
 */
export function getOriginalEnv(key) {
  return originalEnv ? originalEnv[key] : undefined;
}

/**
 * Set an environment variable for the current test only
 */
export function setTestEnv(key, value) {
  process.env[key] = value;
}

/**
 * Delete an environment variable for the current test only
 */
export function deleteTestEnv(key) {
  delete process.env[key];
}

/**
 * Jest global setup - can be used in setupFilesAfterEnv
 */
export function setupGlobalEnvIsolation() {
  beforeEach(() => {
    setupEnvIsolation();
  });

  afterEach(() => {
    restoreEnv();
  });
}
