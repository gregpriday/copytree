/**
 * Git-style ignore file traversal utility
 *
 * Implements layered .copytreeignore evaluation with full gitignore semantics:
 * - Anchored patterns (leading /) are relative to the containing directory
 * - Negations (!) can re-include previously excluded paths
 * - Last match wins across nested ignore files
 * - Directory pruning (don't descend into excluded directories)
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

// Opt-in cache for parsed ignore rules per file path.
// Disabled by default to prevent stale rules in long-running processes.
// Callers who enable caching must call clearRuleCache() between operations.
const ruleCache = new Map();

/**
 * Clear all cached ignore rules.
 *
 * Only relevant when caching is enabled via `{ cache: true }`.
 * Call this between operations in long-running processes to ensure
 * ignore files are re-read from disk.
 */
export function clearRuleCache() {
  ruleCache.clear();
}

/**
 * Read ignore rules from a file
 * @param {string} filePath - Absolute path to ignore file
 * @param {boolean} [useCache=false] - Whether to use the in-memory rule cache
 * @returns {Promise<string[]>} Array of rule lines (or empty if file doesn't exist)
 */
async function readRules(filePath, useCache = false) {
  if (useCache) {
    const cached = ruleCache.get(filePath);
    if (cached) {
      return cached;
    }
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    // Strip UTF-8 BOM if present
    const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const rules = cleaned.split('\n');
    if (useCache) {
      ruleCache.set(filePath, rules);
    }
    return rules;
  } catch (error) {
    // Only cache "file not found" — transient errors (EMFILE, EACCES) should not
    // be cached because they may resolve on the next call.
    if (useCache && error.code === 'ENOENT') {
      ruleCache.set(filePath, []);
    }
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
 * Walk directory tree with layered ignore file support
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
 * @param {boolean} [options.cache=false] - Enable in-memory caching of parsed ignore rules.
 *   When true, ignore files are read once and cached for the lifetime of the process.
 *   Callers must call clearRuleCache() between operations to avoid stale rules.
 * @yields {{path: string, stats: fs.Stats, explanation?: Object}} File information
 */
export async function* walkWithIgnore(root, options = {}) {
  const {
    ignoreFileName = '.copytreeignore',
    includeDirectories = false,
    followSymlinks = false,
    explain = false,
    initialLayers = [],
    config = {},
    cache = false,
    maxDepth = undefined,
  } = options;

  // Extract retry configuration with defaults
  const retryConfig = {
    maxAttempts: config?.copytree?.fs?.retryAttempts ?? 3,
    initialDelay: config?.copytree?.fs?.retryDelay ?? 100,
    maxDelay: config?.copytree?.fs?.maxDelay ?? 2000,
  };

  const stats = {};
  stats.filesScanned = 0;
  stats.directoriesScanned = 0;
  stats.directoriesPruned = 0;
  stats.filesExcluded = 0;

  async function* walk(dir, layers, depth = 0) {
    stats.directoriesScanned++;

    // Load ignore rules at this level
    const ignoreFilePath = path.join(dir, ignoreFileName);
    const localRules = await readRules(ignoreFilePath, cache);
    const localIg = ignore().add(localRules);
    const nextLayers = [...layers, { base: dir, ig: localIg }];

    let entries;
    try {
      entries = await withFsRetry(() => fs.readdir(dir, { withFileTypes: true }), {
        ...retryConfig,
        onRetry: ({ code }) => recordRetry(dir, code),
      });
      // Record success if there were retries
      recordSuccessAfterRetry(dir);
    } catch (error) {
      // Record failure type based on error category
      if (isRetryableFsError(error)) {
        recordGiveUp(dir, error.code);
      } else {
        recordPermanent(dir, error.code);
      }
      // Can't read directory - skip it
      return;
    }

    // Filter out ignore files themselves to prevent them from appearing in output
    entries = entries.filter(
      (entry) => entry.name !== ignoreFileName && entry.name !== '.gitignore',
    );

    // Sort entries for deterministic order across platforms
    // fs.readdir order is not guaranteed and differs between Windows/Unix
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);

      // Handle symlinks
      let isDir = entry.isDirectory();
      let stat = null;

      if (entry.isSymbolicLink()) {
        if (!followSymlinks) {
          continue; // Skip symlinks by default
        }
        try {
          stat = await withFsRetry(() => fs.stat(absPath), {
            ...retryConfig,
            onRetry: ({ code }) => recordRetry(absPath, code),
          });
          recordSuccessAfterRetry(absPath);
          isDir = stat.isDirectory();
        } catch (error) {
          // Record failure and skip broken symlink
          if (isRetryableFsError(error)) {
            recordGiveUp(absPath, error.code);
          } else {
            recordPermanent(absPath, error.code);
          }
          continue;
        }
      }

      // Check if this path should be ignored
      const decision = isIgnored(absPath, root, nextLayers, isDir);

      if (isDir) {
        if (decision.ignored) {
          stats.directoriesPruned++;
          continue; // Don't descend into ignored directories
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
              continue; // Skip directory if we can't stat it
            }
          }
          const result = { path: absPath, stats: stat };
          if (explain) {
            result.explanation = decision;
          }
          yield result;
        }

        // Recurse into subdirectory (respect maxDepth if set)
        if (maxDepth === undefined || depth < maxDepth) {
          yield* walk(absPath, nextLayers, depth + 1);
        }
      } else {
        stats.filesScanned++;

        if (decision.ignored) {
          stats.filesExcluded++;
          continue;
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
            continue; // Skip file if we can't stat it
          }
        }
        const result = { path: absPath, stats: stat };
        if (explain) {
          result.explanation = decision;
        }
        yield result;
      }
    }
  }

  yield* walk(root, initialLayers);
}

/**
 * Get all files matching ignore rules (non-streaming version)
 * @param {string} root - Root directory
 * @param {Object} options - Same as walkWithIgnore
 * @returns {Promise<Array<{path: string, stats: fs.Stats}>>} Array of file objects
 */
export async function getAllFiles(root, options = {}) {
  const files = [];
  for await (const file of walkWithIgnore(root, options)) {
    files.push(file);
  }
  return files;
}

/**
 * Test if a specific path would be ignored (for debugging)
 * @param {string} testPath - Path to test (relative to root)
 * @param {string} root - Root directory
 * @param {Object} options - Walk options
 * @param {string} [options.ignoreFileName='.copytreeignore'] - Name of ignore files to process
 * @param {Object} [options.config] - Configuration object for retry settings
 * @param {boolean} [options.cache=false] - Enable in-memory caching of parsed ignore rules
 * @returns {Promise<{ignored: boolean, rule: string|null, layer: string|null}>} Decision with explanation
 */
export async function testPath(testPath, root, options = {}) {
  const { ignoreFileName = '.copytreeignore', config = {}, cache = false } = options;

  // Build layers by walking up from root to the file's directory
  const absPath = path.resolve(root, testPath);
  const relPath = path.relative(root, absPath);
  const dirPath = path.dirname(absPath);

  const layers = [];
  let currentDir = root;

  // Walk down the directory tree, collecting ignore rules
  const parts = relPath.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    const ignoreFilePath = path.join(currentDir, ignoreFileName);
    const rules = await readRules(ignoreFilePath, cache);
    if (rules.length > 0) {
      const ig = ignore().add(rules);
      layers.push({ base: currentDir, ig });
    }

    if (i < parts.length - 1) {
      currentDir = path.join(currentDir, parts[i]);
    }
  }

  // Determine if it's a directory
  let isDirectory = false;
  try {
    // Use retry for stat in testPath with config
    const retryConfig = {
      maxAttempts: config?.copytree?.fs?.retryAttempts ?? 3,
      initialDelay: config?.copytree?.fs?.retryDelay ?? 100,
      maxDelay: config?.copytree?.fs?.maxDelay ?? 2000,
    };
    const stat = await withFsRetry(() => fs.stat(absPath), {
      ...retryConfig,
      onRetry: ({ code }) => recordRetry(absPath, code),
    });
    recordSuccessAfterRetry(absPath);
    isDirectory = stat.isDirectory();
  } catch (error) {
    // Record failure and assume file if stat fails
    if (isRetryableFsError(error)) {
      recordGiveUp(absPath, error.code);
    } else {
      recordPermanent(absPath, error.code);
    }
  }

  return isIgnored(absPath, root, layers, isDirectory);
}

export default walkWithIgnore;
