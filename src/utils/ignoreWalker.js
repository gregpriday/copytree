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

/**
 * Normalize path to POSIX style (forward slashes)
 * @param {string} p - Path to normalize
 * @returns {string} POSIX-normalized path
 */
function toPosix(p) {
  return p.split(path.sep).join('/');
}

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

  async function* walk(dir, layers) {
    stats.directoriesScanned++;

    // Load ignore rules at this level
    const ignoreFilePath = path.join(dir, ignoreFileName);
    const localRules = await readRules(ignoreFilePath);
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

        // Recurse into subdirectory
        yield* walk(absPath, nextLayers);
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
 * @returns {Promise<{ignored: boolean, rule: string, layer: string}>} Decision with explanation
 */
export async function testPath(testPath, root, options = {}) {
  const { ignoreFileName = '.copytreeignore', config = {} } = options;

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
    const rules = await readRules(ignoreFilePath);
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
