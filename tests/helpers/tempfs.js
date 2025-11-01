/**
 * Temporary filesystem management for tests
 *
 * Provides deterministic, race-free temporary directory management
 * with robust cleanup that handles macOS/APFS peculiarities.
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

/**
 * Sanitize a label for use in filesystem paths
 */
function sanitize(name = '') {
  return String(name)
    .replace(/[^a-z0-9._-]+/gi, '-')
    .slice(0, 80);
}

/**
 * Write .metadata_never_index to disable Spotlight indexing (macOS)
 */
async function ensureNoIndex(dir) {
  try {
    await fsp.writeFile(path.join(dir, '.metadata_never_index'), '');
  } catch {
    // Ignore errors - this is best-effort optimization for macOS
  }
}

/**
 * Settle filesystem operations
 *
 * Yields to allow:
 * - Pending microtasks to complete
 * - File handles to close
 * - OS filesystem cache to flush
 * - APFS/Spotlight to finish background operations
 *
 * @param {number} ms - Milliseconds to wait (default: 50)
 */
export async function settleFs(ms = 50) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.resolve(); // Drain microtasks
}

/**
 * Safely remove a directory with retries and backoff
 *
 * Handles APFS transient states and Spotlight indexing races
 * with exponential backoff on ENOTEMPTY/EBUSY errors.
 *
 * @param {string} target - Directory to remove
 * @param {object} options - Removal options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 5)
 * @param {number} options.retryDelay - Initial retry delay in ms (default: 100)
 */
export async function safeRemove(target, { maxRetries = 5, retryDelay = 100 } = {}) {
  const opts = { recursive: true, force: true, maxRetries, retryDelay };

  try {
    await fsp.rm(target, opts);
    return;
  } catch (e) {
    // If not ENOTEMPTY/EBUSY or doesn't exist, rethrow
    if (e?.code === 'ENOENT') return; // Already removed
    if (e?.code !== 'ENOTEMPTY' && e?.code !== 'EBUSY') throw e;
  }

  // Extra bounded backoff for APFS/Spotlight transient states
  let delay = retryDelay;
  for (let i = 0; i < maxRetries; i++) {
    await settleFs(delay);
    try {
      await fsp.rm(target, opts);
      return;
    } catch (e) {
      if (e?.code === 'ENOENT') return; // Removed by another process
      if (e?.code !== 'ENOTEMPTY' && e?.code !== 'EBUSY') throw e;
      delay = Math.min(delay * 2, 500); // Exponential backoff, capped at 500ms
    }
  }

  // Final attempt - let error surface to fail test meaningfully
  await fsp.rm(target, opts);
}

/**
 * Create a test-scoped temporary directory
 *
 * Returns an object with:
 * - path: Absolute path to the temp directory
 * - cleanup: Async function to remove the directory
 *
 * Directory structure:
 * <os.tmpdir()>/copytree-tests/<PID>-<WORKER_ID>-<timestamp>-<uuid>/<label>/
 *
 * @param {string} label - Optional label for the directory
 * @returns {Promise<{path: string, cleanup: () => Promise<void>}>}
 */
export async function createTestTempDir(label = '') {
  const base = path.join(os.tmpdir(), 'copytree-tests');
  const unique = `${process.pid}-${process.env.JEST_WORKER_ID || '0'}-${Date.now()}-${randomUUID()}`;
  const dir = path.join(base, unique, sanitize(label));

  await fsp.mkdir(dir, { recursive: true });
  await ensureNoIndex(path.join(base, unique));

  return {
    path: dir,
    cleanup: async () => {
      await settleFs(50);
      await safeRemove(path.join(base, unique));
    },
  };
}

/**
 * Execute a function with a temporary directory
 *
 * Creates a temp directory, executes the function, and always
 * cleans up afterwards (even if the function throws).
 *
 * @param {string} label - Label for the temp directory
 * @param {(dir: string) => Promise<T>} fn - Async function to execute
 * @returns {Promise<T>} Result of the function
 */
export async function withTempDir(label, fn) {
  const { path: dir, cleanup } = await createTestTempDir(label);
  try {
    return await fn(dir);
  } finally {
    await cleanup();
  }
}
