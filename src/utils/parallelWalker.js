/**
 * Parallel directory traversal with bounded concurrency
 *
 * Implements efficient parallel file discovery using:
 * - Breadth-first search (BFS) queue for fair scheduling
 * - Bounded concurrency via p-limit to prevent resource exhaustion
 * - Backpressure handling to avoid unbounded buffering
 * - Full gitignore semantics with layered ignore evaluation
 * - Cycle detection for symlinks
 * - Deterministic ordering within each directory level
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import { withFsRetry } from './retryableFs.js';
import { isRetryableFsError } from './errors.js';
import {
  recordRetry,
  recordGiveUp,
  recordPermanent,
  recordSuccessAfterRetry,
} from './fsErrorReport.js';
import { toPosix } from './pathUtils.js';

/**
 * Read ignore rules from a file
 * @param {string} filePath - Absolute path to ignore file
 * @returns {Promise<string[]>} Array of rule lines (or empty if file doesn't exist)
 */
async function readRules(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    // Strip UTF-8 BOM if present
    const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    return cleaned.split('\n');
  } catch {
    // File doesn't exist or can't be read - treat as no rules
    return [];
  }
}

/**
 * Determine if a path should be ignored based on layered ignore rules
 * @param {string} absPath - Absolute path to test
 * @param {string} root - Root directory path
 * @param {Array<{base: string, ig: any}>} layers - Stack of ignore layers
 * @param {boolean} [isDirectory=false] - Whether the path is a directory
 * @returns {{ignored: boolean, rule?: string, layer?: string}} Ignore decision and explanation
 */
function isIgnored(absPath, root, layers, isDirectory = false) {
  const relToRoot = toPosix(path.relative(root, absPath));
  let ignored = false;
  let matchedRule = null;
  let matchedLayer = null;

  for (const { base, ig } of layers) {
    const relToLayer = toPosix(path.relative(base, absPath));

    // Skip if path isn't under this layer's base
    if (relToLayer.startsWith('..')) continue;

    // Test with directory trailing slash if it's a directory
    const testPath = isDirectory && !relToLayer.endsWith('/') ? relToLayer + '/' : relToLayer;

    // Use .test() if available (returns {ignored, unignored}), otherwise fallback to .ignores()
    const result = ig.test?.(testPath) ?? {
      ignored: ig.ignores(testPath),
      unignored: false,
    };

    if (result.ignored !== undefined) {
      if (result.ignored) {
        ignored = true;
        matchedRule = 'exclude';
        matchedLayer = base;
      }
      if (result.unignored) {
        ignored = false;
        matchedRule = 'include (negation)';
        matchedLayer = base;
      }
    }
  }

  return {
    ignored,
    rule: matchedRule,
    layer: matchedLayer,
  };
}

/**
 * Parallel directory walker with bounded concurrency
 *
 * @async
 * @generator
 * @param {string} root - Root directory to walk
 * @param {Object} options - Walk options
 * @param {string} [options.ignoreFileName='.copytreeignore'] - Name of ignore files to process
 * @param {boolean} [options.includeDirectories=false] - Whether to yield directories
 * @param {boolean} [options.followSymlinks=false] - Whether to follow symbolic links
 * @param {boolean} [options.explain=false] - Include explanation for each decision
 * @param {Array} [options.initialLayers=[]] - Pre-existing ignore layers (e.g., from .gitignore)
 * @param {Object} [options.config] - Configuration object for retry settings
 * @param {number} [options.concurrency=5] - Maximum concurrent directory operations
 * @param {number} [options.highWaterMark] - Backpressure threshold (default: 2x concurrency)
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @yields {{path: string, stats: fs.Stats, explanation?: Object}} File information
 */
export async function* walkParallel(root, options = {}) {
  const {
    ignoreFileName = '.copytreeignore',
    includeDirectories = false,
    followSymlinks = false,
    explain = false,
    initialLayers = [],
    config = {},
    concurrency = 5,
    highWaterMark = concurrency * 2,
    signal,
  } = options;

  // Extract retry configuration with defaults
  const retryConfig = {
    maxAttempts: config?.copytree?.fs?.retryAttempts ?? 3,
    initialDelay: config?.copytree?.fs?.retryDelay ?? 100,
    maxDelay: config?.copytree?.fs?.maxDelay ?? 2000,
  };

  // Import p-limit dynamically (v7+ uses default export)
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);

  // Statistics tracking
  const stats = {
    filesScanned: 0,
    directoriesScanned: 0,
    directoriesPruned: 0,
    filesExcluded: 0,
    inflight: 0,
    maxInflight: 0,
  };

  // Symlink cycle detection: track visited (dev, ino) pairs
  const visited = new Set();

  // BFS queue for fair directory processing
  const queue = [];

  // Buffered results ready to yield
  const buffer = [];
  // Backpressure control
  const maxBuffer = Number.isFinite(highWaterMark) && highWaterMark > 0 ? highWaterMark : Infinity;
  const throttleEnabled = Number.isFinite(maxBuffer);

  let drainWaitPromise = null;
  let resolveDrainWait = null;

  async function enqueueResult(result) {
    if (!result) return;

    if (throttleEnabled) {
      while (buffer.length >= maxBuffer) {
        if (signal?.aborted) {
          throw new Error('Traversal aborted');
        }
        if (!drainWaitPromise) {
          drainWaitPromise = new Promise((resolve) => {
            resolveDrainWait = resolve;
          });
        }
        await drainWaitPromise;
      }
    }

    buffer.push(result);
  }

  function notifyDrain() {
    if (!throttleEnabled) return;
    if (buffer.length < maxBuffer && resolveDrainWait) {
      const resolve = resolveDrainWait;
      resolveDrainWait = null;
      drainWaitPromise = null;
      resolve();
    }
  }

  // Track if traversal is complete
  let done = false;

  /**
   * Check if we should follow a symlink (and detect cycles)
   * @param {fs.Stats} stat - File stats
   * @param {string} absPath - Absolute path
   * @returns {boolean} Whether to follow this symlink
   */
  function shouldFollowSymlink(stat, absPath) {
    if (!followSymlinks) return false;

    const key = `${stat.dev}:${stat.ino}`;
    if (visited.has(key)) {
      // Cycle detected - skip
      return false;
    }
    visited.add(key);
    return true;
  }

  /**
   * Process a single directory entry (file or directory)
   * @param {string} dir - Parent directory path
   * @param {fs.Dirent} entry - Directory entry
   * @param {Array} layers - Current ignore layers
   */
  async function processEntry(dir, entry, layers) {
    if (signal?.aborted) {
      throw new Error('Traversal aborted');
    }

    const absPath = path.join(dir, entry.name);

    // Handle symlinks
    let isDir = entry.isDirectory();
    let stat = null;

    if (entry.isSymbolicLink()) {
      if (!followSymlinks) {
        return; // Skip symlinks by default
      }
      try {
        stat = await withFsRetry(() => fs.stat(absPath), {
          ...retryConfig,
          onRetry: ({ code }) => recordRetry(absPath, code),
        });
        recordSuccessAfterRetry(absPath);

        // Check for cycles
        if (!shouldFollowSymlink(stat, absPath)) {
          return; // Cycle detected or already visited
        }

        isDir = stat.isDirectory();
      } catch (error) {
        // Record failure and skip broken symlink
        if (isRetryableFsError(error)) {
          recordGiveUp(absPath, error.code);
        } else {
          recordPermanent(absPath, error.code);
        }
        return;
      }
    }

    // Check if this path should be ignored
    const decision = isIgnored(absPath, root, layers, isDir);

    if (isDir) {
      let queuedResult = null;
      if (decision.ignored) {
        stats.directoriesPruned++;
        return; // Don't descend into ignored directories
      }

      // Yield directory if requested
      if (includeDirectories) {
        if (!stat) {
          try {
            stat = await withFsRetry(() => fs.stat(absPath), {
              ...retryConfig,
              onRetry: ({ code }) => recordRetry(absPath, code),
            });
            recordSuccessAfterRetry(absPath);
          } catch (error) {
            if (isRetryableFsError(error)) {
              recordGiveUp(absPath, error.code);
            } else {
              recordPermanent(absPath, error.code);
            }
            return; // Skip directory if we can't stat it
          }
        }
        const result = { path: absPath, stats: stat };
        if (explain) {
          result.explanation = decision;
        }
        queuedResult = result;
      }

      // Add subdirectory to queue for processing
      queue.push({ dir: absPath, layers });
      return queuedResult;
    } else {
      stats.filesScanned++;

      if (decision.ignored) {
        stats.filesExcluded++;
        return;
      }

      // Yield file
      if (!stat) {
        const statStart = Date.now();
        try {
          stat = await withFsRetry(() => fs.stat(absPath), {
            ...retryConfig,
            onRetry: ({ code }) => recordRetry(absPath, code),
          });
          recordSuccessAfterRetry(absPath);
        } catch (error) {
          if (isRetryableFsError(error)) {
            recordGiveUp(absPath, error.code);
          } else {
            recordPermanent(absPath, error.code);
          }
          return; // Skip file if we can't stat it
        }
      }
      const result = { path: absPath, stats: stat };
      if (explain) {
        result.explanation = decision;
      }
      return result;
    }
  }

  /**
   * Process a single directory: read entries and schedule them
   * @param {string} dir - Directory path
   * @param {Array} layers - Current ignore layers
   */
  async function processDirectory(dir, layers) {
    stats.directoriesScanned++;

    // Load ignore rules at this level
    const ignoreFilePath = path.join(dir, ignoreFileName);
    const localRules = await readRules(ignoreFilePath);
    const localIg = ignore().add(localRules);
    const nextLayers = [...layers, { base: dir, ig: localIg }];

    let entries;
    const readdirStart = Date.now();
    try {
      entries = await withFsRetry(() => fs.readdir(dir, { withFileTypes: true }), {
        ...retryConfig,
        onRetry: ({ code }) => recordRetry(dir, code),
      });
      recordSuccessAfterRetry(dir);
    } catch (error) {
      // Record failure type based on error category
      if (isRetryableFsError(error)) {
        recordGiveUp(dir, error.code);
      } else {
        recordPermanent(dir, error.code);
      }
      // Can't read directory - skip it (return empty array for proper handling)
      return [];
    }

    // Filter out ignore files themselves to prevent them from appearing in output
    entries = entries.filter(
      (entry) => entry.name !== ignoreFileName && entry.name !== '.gitignore',
    );

    // Sort entries for deterministic order across platforms
    entries.sort((a, b) => a.name.localeCompare(b.name));

    // Process all entries in this directory in parallel (bounded by limit)
    const entryResults = await Promise.all(
      entries.map((entry) => limit(() => processEntry(dir, entry, nextLayers))),
    );
    return entryResults.filter(Boolean);
  }

  // Initialize queue with root directory
  queue.push({ dir: root, layers: initialLayers });

  // Main traversal loop
  try {
    const running = new Set();

    while (queue.length > 0 || running.size > 0) {
      if (signal?.aborted) {
        throw new Error('Traversal aborted');
      }

      while (queue.length > 0 && running.size < concurrency) {
        const { dir, layers } = queue.shift();
        const task = processDirectory(dir, layers).then(async (results) => {
          // Guard against undefined results (when readdir fails)
          if (results) {
            for (const result of results) {
              await enqueueResult(result);
            }
          }
        });

        running.add(task);
        stats.inflight = running.size;
        stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);

        task
          .finally(() => {
            running.delete(task);
            stats.inflight = running.size;
          })
          .catch(() => {});
      }

      // Yield buffered results (apply backpressure)
      while (buffer.length > 0) {
        yield buffer.shift();
        notifyDrain();

        // Check backpressure threshold
        if (buffer.length >= maxBuffer) {
          // Continue draining
          continue;
        }

        // If buffer is manageable and we have more dirs to process, break to continue
        if (queue.length > 0 && buffer.length < maxBuffer / 2) {
          break;
        }
      }

      if (buffer.length === 0 && running.size > 0) {
        await Promise.race(running);
      }
    }

    // Drain any remaining buffered results
    while (buffer.length > 0) {
      yield buffer.shift();
      notifyDrain();
    }

    done = true;
  } finally {
    // Ensure we clear the limit to free resources
    if (limit.clearQueue) {
      limit.clearQueue();
    }
  }
}

/**
 * Get all files using parallel traversal (non-streaming version)
 * @param {string} root - Root directory
 * @param {Object} options - Same as walkParallel
 * @returns {Promise<Array<{path: string, stats: fs.Stats}>>} Array of file objects
 */
export async function getAllFilesParallel(root, options = {}) {
  const files = [];
  for await (const file of walkParallel(root, options)) {
    files.push(file);
  }
  return files;
}

export default walkParallel;
