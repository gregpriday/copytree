/**
 * Filesystem error reporting and aggregation
 * Tracks retries, successes, and failures across filesystem operations
 */

const stats = {
  totalRetries: 0,
  succeededAfterRetry: 0,
  failed: 0,
  permanent: 0,
  byPath: new Map(), // path -> { retries, lastCode, status }
};

/**
 * Record a retry attempt for a filesystem operation
 * @param {string} path - File or directory path
 * @param {string} code - Error code that triggered the retry
 */
export function recordRetry(path, code) {
  stats.totalRetries++;
  const entry = stats.byPath.get(path) ?? { retries: 0, lastCode: null, status: 'pending' };
  entry.retries++;
  entry.lastCode = code;
  stats.byPath.set(path, entry);
}

/**
 * Record a filesystem operation that failed after all retries
 * @param {string} path - File or directory path
 * @param {string} code - Final error code
 */
export function recordGiveUp(path, code) {
  stats.failed++;
  const entry = stats.byPath.get(path) ?? { retries: 0, lastCode: null, status: 'pending' };
  entry.lastCode = code;
  entry.status = 'failed';
  stats.byPath.set(path, entry);
}

/**
 * Record a non-retryable (permanent) filesystem error
 * @param {string} path - File or directory path
 * @param {string} code - Error code
 */
export function recordPermanent(path, code) {
  stats.permanent++;
  const entry = stats.byPath.get(path) ?? { retries: 0, lastCode: null, status: 'pending' };
  entry.lastCode = code;
  entry.status = 'permanent';
  stats.byPath.set(path, entry);
}

/**
 * Record a successful operation after retries
 * @param {string} path - File or directory path
 */
export function recordSuccessAfterRetry(path) {
  const entry = stats.byPath.get(path);
  if (entry && entry.retries > 0 && entry.status === 'pending') {
    stats.succeededAfterRetry++;
    entry.status = 'ok';
    stats.byPath.set(path, entry);
  }
}

/**
 * Get summary of filesystem errors
 * @returns {Object} Summary with counts and details
 */
export function summarize() {
  return {
    totalRetries: stats.totalRetries,
    succeededAfterRetry: stats.succeededAfterRetry,
    failed: stats.failed,
    permanent: stats.permanent,
  };
}

/**
 * Get detailed error information by path
 * @returns {Map} Map of path to error details
 */
export function getDetailsByPath() {
  return new Map(stats.byPath);
}

/**
 * Get failed paths (after all retries)
 * @returns {Array<{path: string, code: string, retries: number}>}
 */
export function getFailedPaths() {
  const failed = [];
  for (const [path, entry] of stats.byPath.entries()) {
    if (entry.status === 'failed') {
      failed.push({ path, code: entry.lastCode, retries: entry.retries });
    }
  }
  return failed;
}

/**
 * Get permanent error paths (non-retryable)
 * @returns {Array<{path: string, code: string}>}
 */
export function getPermanentErrorPaths() {
  const permanent = [];
  for (const [path, entry] of stats.byPath.entries()) {
    if (entry.status === 'permanent') {
      permanent.push({ path, code: entry.lastCode });
    }
  }
  return permanent;
}

/**
 * Reset all statistics (useful for testing)
 */
export function reset() {
  stats.totalRetries = 0;
  stats.succeededAfterRetry = 0;
  stats.failed = 0;
  stats.permanent = 0;
  stats.byPath.clear();
}
