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
import { withFsRetry } from './retryableFs.js';
import { isRetryableFsError, createAbortError } from './errors.js';
import {
  recordRetry,
  recordGiveUp,
  recordPermanent,
  recordSuccessAfterRetry,
} from './fsErrorReport.js';
import { toPosix } from './pathUtils.js';
import {
  evaluateIgnore as isIgnored,
  layersForDirectory,
  buildScopeContext,
} from './ignoreWalker.js';
import { EXCLUSION_REASONS } from './exclusionReport.js';

/**
 * Parallel directory walker with bounded concurrency
 *
 * @async
 * @generator
 * @param {string} root - Root directory to walk
 * @param {Object} options - Walk options
 * @param {string} [options.ignoreFileName='.copytreeignore'] - Legacy single ignore file name
 * @param {string[]} [options.ignoreFileNames] - Ordered ignore file names; later layers win
 * @param {boolean} [options.includeDirectories=false] - Whether to yield directories
 * @param {boolean} [options.followSymlinks=false] - Whether to follow symbolic links
 * @param {boolean} [options.explain=false] - Include explanation for each decision
 * @param {Array} [options.initialLayers=[]] - Pre-existing ignore layers (e.g., config excludes)
 * @param {Object} [options.config] - Configuration object for retry settings
 * @param {number} [options.concurrency=5] - Maximum concurrent directory operations
 * @param {number} [options.highWaterMark] - Backpressure threshold (default: 2x concurrency)
 * @param {string[]} [options.scope] - Absolute paths to traverse instead of the whole root
 * @param {boolean} [options.scopeIgnoresIgnoreFiles=false] - Let scope entries override ignore rules
 * @param {boolean} [options.scopeIgnoresConfigExcludes=false] - Let scope entries override the
 *   config-level exclusions blocking them. `.git` is never overridable.
 * @param {Function} [options.onExclude] - Called for every excluded entry
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @yields {{path: string, stats: fs.Stats, explanation?: Object}} File information
 */
export async function* walkParallel(root, options = {}) {
  const {
    ignoreFileName = '.copytreeignore',
    ignoreFileNames,
    includeDirectories = false,
    followSymlinks = false,
    explain = false,
    initialLayers = [],
    config = {},
    concurrency = 5,
    highWaterMark = concurrency * 2,
    signal,
    maxDepth = undefined,
    scope = null,
    scopeIgnoresIgnoreFiles = false,
    scopeIgnoresConfigExcludes = false,
    onExclude = null,
  } = options;

  const ignoreNames =
    Array.isArray(ignoreFileNames) && ignoreFileNames.length > 0
      ? ignoreFileNames
      : [ignoreFileName];

  // Ignore files are metadata, not content: never emit them.
  const suppressedNames = new Set([...ignoreNames, '.gitignore', '.copytreeignore']);

  function reportExclusion(absPath, decision, size, isDirectory) {
    if (!onExclude) return;
    onExclude({
      path: toPosix(path.relative(root, absPath)),
      size: size || 0,
      reason: decision.reason || EXCLUSION_REASONS.CONFIG_EXCLUDE,
      rule: decision.rule,
      ruleSource: decision.ruleSource,
      isDirectory: Boolean(isDirectory),
    });
  }

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
          throw createAbortError('Traversal aborted');
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
    signalData();
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

  // Wake the consumer as soon as output exists.
  //
  // Without this the consumer only wakes when a worker task settles, while a
  // worker that filled the buffer is itself waiting for the consumer to drain
  // it — so a single directory yielding more than `highWaterMark` entries hangs
  // the traversal outright.
  let dataWaitPromise = null;
  let resolveDataWait = null;

  function signalData() {
    if (resolveDataWait) {
      const resolve = resolveDataWait;
      resolveDataWait = null;
      dataWaitPromise = null;
      resolve();
    }
  }

  function waitForData() {
    if (!dataWaitPromise) {
      dataWaitPromise = new Promise((resolve) => {
        resolveDataWait = resolve;
      });
    }
    return dataWaitPromise;
  }

  // Resolved once; every containment check needs it and it cannot change
  // mid-walk.
  let realRootPromise = null;
  function realRoot() {
    if (realRootPromise === null) {
      realRootPromise = fs.realpath(root).catch(() => null);
    }
    return realRootPromise;
  }

  /**
   * Whether a followed symlink target is still inside the repository.
   *
   * Compared against the *real* root so that a repository itself reached
   * through a symlink does not fail containment on every one of its own files.
   *
   * @param {string} absPath - Path the link points at
   * @returns {Promise<string|null>} The real path when contained, null otherwise
   */
  async function containedRealPath(absPath) {
    let real;
    try {
      real = await fs.realpath(absPath);
    } catch {
      return null;
    }

    const realRootValue = await realRoot();
    if (realRootValue === null) return null;
    if (real === realRootValue) return real;
    if (real.startsWith(realRootValue + path.sep)) return real;
    return null;
  }

  /**
   * Whether this directory has already been entered.
   *
   * Only directories are tracked. Tracking files here meant that two symlinks
   * to the same file silently dropped the second one, which is deduplication
   * wearing cycle detection's clothes.
   *
   * @param {fs.Stats} stat - Stats for the directory
   * @param {string} real - Canonical path
   * @returns {boolean} True when this directory is new
   */
  function claimDirectory(stat, real) {
    // Windows reports ino 0 on some filesystems, so fall back to the real path.
    const key = stat && stat.ino ? `${stat.dev}:${stat.ino}` : real;
    if (visited.has(key)) {
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
   * @param {number} depth - Current traversal depth (0 = root)
   */
  async function processEntry(dir, entry, layers, depth) {
    if (signal?.aborted) {
      throw createAbortError('Traversal aborted');
    }

    const absPath = path.join(dir, entry.name);

    // Handle symlinks
    let isDir = entry.isDirectory();
    let stat = null;

    if (entry.isSymbolicLink()) {
      if (!followSymlinks) {
        return; // Skip symlinks by default
      }

      // A link is only followed if it lands back inside the repository.
      // Otherwise a link committed to a repository could pull in any file the
      // running user can read.
      const realPath = await containedRealPath(absPath);
      if (realPath === null) {
        reportExclusion(
          absPath,
          { reason: EXCLUSION_REASONS.SYMLINK_ESCAPE, rule: 'followSymlinks' },
          0,
          false,
        );
        return;
      }

      try {
        stat = await withFsRetry(() => fs.stat(absPath), {
          ...retryConfig,
          onRetry: ({ code }) => recordRetry(absPath, code),
        });
        recordSuccessAfterRetry(absPath);

        isDir = stat.isDirectory();

        // Cycle detection applies to directories only: a link to an ancestor
        // or a two-directory loop would otherwise recurse forever.
        if (isDir && !claimDirectory(stat, realPath)) {
          stats.directoriesPruned++;
          return;
        }
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
    const decision = isIgnored(absPath, root, layers, isDir, explain);

    if (isDir) {
      let queuedResult = null;
      if (decision.ignored) {
        stats.directoriesPruned++;
        reportExclusion(absPath, decision, 0, true);
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

      // Add subdirectory to queue for processing (respect maxDepth)
      if (maxDepth === undefined || depth < maxDepth) {
        queue.push({ dir: absPath, layers, depth: depth + 1 });
      }
      return queuedResult;
    } else {
      stats.filesScanned++;

      if (decision.ignored) {
        stats.filesExcluded++;
        reportExclusion(absPath, decision, 0, false);
        return;
      }

      // Yield file
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
   * @param {number} depth - Current traversal depth (0 = root)
   */
  async function processDirectory(dir, layers, depth) {
    stats.directoriesScanned++;

    // Load ignore rules contributed by this directory (layered, later wins)
    const nextLayers = [...layers, ...(await layersForDirectory(dir, ignoreNames, false))];

    let entries;
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
    entries = entries.filter((entry) => !suppressedNames.has(entry.name));

    // Sort entries for deterministic order across platforms
    entries.sort((a, b) => a.name.localeCompare(b.name));

    // Process all entries in this directory in parallel (bounded by limit)
    const entryResults = await Promise.all(
      entries.map((entry) => limit(() => processEntry(dir, entry, nextLayers, depth))),
    );
    return entryResults.filter(Boolean);
  }

  // Seed the queue. Without a scope that is just the root; with a scope the
  // ignore layers along root -> entry are read up front so rules stay
  // root-anchored while traversal starts at the selection.
  if (!scope || scope.length === 0) {
    queue.push({ dir: root, layers: initialLayers, depth: 0 });
  } else {
    for (const entry of scope) {
      const absEntry = path.resolve(entry);

      // Identical semantics to walkWithIgnore: ancestors are evaluated before
      // their rules are loaded, so a scoped run cannot surface rules a full walk
      // would have pruned past.
      const { layers, prunedAt } = await buildScopeContext(
        root,
        absEntry,
        ignoreNames,
        false,
        initialLayers,
        scopeIgnoresIgnoreFiles,
        scopeIgnoresConfigExcludes,
      );

      let entryStat;
      try {
        entryStat = await withFsRetry(() => fs.stat(absEntry), retryConfig);
      } catch (error) {
        if (onExclude) {
          onExclude({
            path: toPosix(path.relative(root, absEntry)),
            size: 0,
            reason: EXCLUSION_REASONS.UNREADABLE,
            rule: error.code,
            isDirectory: false,
          });
        }
        continue;
      }

      const isDir = entryStat.isDirectory();

      const decision = prunedAt
        ? {
            ignored: true,
            reason: EXCLUSION_REASONS.GITIGNORE,
            rule: `ancestor excluded: ${toPosix(path.relative(root, prunedAt))}`,
          }
        : isIgnored(absEntry, root, layers, isDir, explain);

      if (decision.ignored) {
        if (isDir) stats.directoriesPruned++;
        else stats.filesExcluded++;
        reportExclusion(absEntry, decision, isDir ? 0 : entryStat.size, isDir);
        continue;
      }

      if (isDir) {
        if (includeDirectories) {
          buffer.push({ path: absEntry, stats: entryStat });
        }
        queue.push({ dir: absEntry, layers, depth: 0 });
      } else {
        stats.filesScanned++;
        buffer.push({ path: absEntry, stats: entryStat });
      }
    }
  }

  // Main traversal loop
  try {
    const running = new Set();

    while (queue.length > 0 || running.size > 0) {
      if (signal?.aborted) {
        throw createAbortError('Traversal aborted');
      }

      while (queue.length > 0 && running.size < concurrency) {
        const { dir, layers, depth } = queue.shift();
        const task = processDirectory(dir, layers, depth).then(async (results) => {
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
        // Wake on either a finished directory or the first buffered result.
        await Promise.race([...running, waitForData()]);
      }
    }

    // Drain any remaining buffered results
    while (buffer.length > 0) {
      yield buffer.shift();
      notifyDrain();
    }
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
