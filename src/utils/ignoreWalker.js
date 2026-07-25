/**
 * Git-style ignore file traversal utility
 *
 * Implements layered ignore evaluation with full gitignore semantics:
 * - Multiple ignore file names per directory, layered in declaration order
 *   (`.gitignore` then `.copytreeignore`, so CopyTree rules win ties)
 * - Nested ignore files at every depth, not just the root
 * - Anchored patterns (leading /) are relative to the containing directory
 * - Negations (!) can re-include previously excluded paths
 * - Last match wins across nested ignore files
 * - Directory pruning (don't descend into excluded directories)
 * - Scoped traversal: start at a subtree but resolve rules from the root
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import { withFsRetry } from './retryableFs.js';
import { isRetryableFsError, createAbortError } from './errors.js';
import {
  recordRetry,
  recordGiveUp,
  recordPermanent,
  recordSuccessAfterRetry,
} from './fsErrorReport.js';
import { toPosix } from './pathUtils.js';
import { reasonForLayerKind, EXCLUSION_REASONS } from './exclusionReport.js';

// Opt-in cache for parsed ignore rules per file path.
// Disabled by default to prevent stale rules in long-running processes.
// Callers who enable caching must call clearRuleCache() between operations.
const ruleCache = new Map();

/**
 * Collator for directory entry ordering.
 *
 * `readdir` order is not stable across platforms, so entries are sorted to make
 * output deterministic. `a.name.localeCompare(b.name)` constructs a collator on
 * every comparison, which on a directory of 10,000 entries is 10,000-odd
 * collator constructions for one sort. One shared instance produces exactly the
 * same ordering.
 */
const ENTRY_COLLATOR = new Intl.Collator();

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
 * Whether a relative path escapes its base.
 *
 * Segment-aware on purpose: `'..'` and `'../x'` escape, but a directory
 * legitimately named `..draft` does not.
 *
 * @param {string} rel - Relative path, POSIX or native separators
 * @returns {boolean} True when the path points outside its base
 */
function isOutside(rel) {
  return rel === '..' || rel.startsWith('../') || rel.startsWith(`..${path.sep}`);
}

/**
 * Derive an ignore layer's kind from the ignore file it was read from.
 * @param {string} fileName - Ignore file base name
 * @returns {string} Layer kind
 */
function kindForIgnoreFile(fileName) {
  return fileName === '.gitignore' ? 'gitignore' : 'copytreeignore';
}

/**
 * Find which individual rule in a layer produced the final verdict.
 *
 * Only called under `explain: true`, and only for paths that were actually
 * excluded, so the per-rule compilation cost is bounded to the exclusions the
 * caller asked to have explained.
 *
 * @param {Object} layer - Ignore layer with a `rules` array
 * @param {string} testPath - Path relative to the layer base
 * @returns {{rule: string, line: number}|null} The last matching rule
 */
function findMatchingRule(layer, testPath) {
  if (!Array.isArray(layer.rules) || layer.rules.length === 0) return null;

  if (!layer._compiled) {
    layer._compiled = [];
    layer.rules.forEach((raw, index) => {
      // Only blanks and comments are skipped. The rule itself is compiled from
      // the raw line: trailing spaces are significant in gitignore syntax
      // unless escaped, and trimming here would make the explanation disagree
      // with the verdict it is explaining.
      if (!raw.trim() || raw.trimStart().startsWith('#')) return;
      layer._compiled.push({
        rule: raw.trim(),
        line: index + 1,
        ig: ignore().add(raw),
      });
    });
  }

  let match = null;
  for (const entry of layer._compiled) {
    if (entry.ig.ignores(testPath)) {
      match = { rule: entry.rule, line: entry.line };
    }
  }
  return match;
}

/**
 * Determine if a path should be ignored based on layered ignore rules
 * @param {string} absPath - Absolute path to test
 * @param {string} root - Root directory path
 * @param {Array<{base: string, ig: any}>} layers - Stack of ignore layers
 * @param {boolean} [isDirectory=false] - Whether the path is a directory
 * @param {boolean} [explain=false] - Resolve the matching rule and its source
 * @returns {{ignored: boolean, rule?: string, layer?: string, reason?: string, ruleSource?: string}} Decision
 */
function isIgnored(
  absPath,
  root,
  layers,
  isDirectory = false,
  explain = false,
  dirPrefixes = null,
  entryName = null,
) {
  let ignored = false;
  let matchedRule = null;
  let matchedLayer = null;
  let matchedLayerRef = null;
  let matchedTestPath = null;

  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    const { base, ig } = layer;

    // Inside a walk, every layer base is an ancestor of the directory being
    // read, so the relative path is the directory's own prefix plus the entry
    // name. Recomputing `path.relative` per layer per entry is the same answer
    // reached the expensive way, and on a deep tree the layer stack is long.
    let relToLayer;
    if (dirPrefixes !== null) {
      const prefix = dirPrefixes[index];
      if (prefix === null) continue;
      relToLayer = prefix === '' ? entryName : `${prefix}/${entryName}`;
    } else {
      relToLayer = toPosix(path.relative(base, absPath));
    }

    // Skip if path isn't under this layer's base
    // `isOutside` compares segments: a directory named `..draft` is inside the
    // layer even though its relative path starts with two dots.
    if (relToLayer === '' || isOutside(relToLayer)) continue;

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
        matchedLayerRef = layer;
        matchedTestPath = testPath;
      }
      if (result.unignored) {
        ignored = false;
        matchedRule = 'include (negation)';
        matchedLayer = base;
        matchedLayerRef = layer;
        matchedTestPath = testPath;
      }
    }
  }

  const decision = {
    ignored,
    rule: matchedRule,
    layer: matchedLayer,
  };

  if (matchedLayerRef) {
    decision.reason = reasonForLayerKind(matchedLayerRef.kind);
    decision.kind = matchedLayerRef.kind;

    if (explain) {
      const found = findMatchingRule(matchedLayerRef, matchedTestPath);
      if (found) {
        decision.rule = found.rule;
        decision.ruleSource = matchedLayerRef.source
          ? `${matchedLayerRef.source}:${found.line}`
          : `${matchedLayerRef.kind || 'config'}:${found.line}`;
      } else if (matchedLayerRef.source) {
        decision.ruleSource = matchedLayerRef.source;
      }
    }
  }

  return decision;
}

/**
 * Relative path from each ignore layer's base down to a directory.
 *
 * Computed once per directory and then reused for every entry in it. `null`
 * marks a layer the directory sits outside of, which is a permanent property of
 * the pair and so is worth deciding once.
 *
 * @param {string} dir - Directory being read
 * @param {Array} layers - Active ignore layers
 * @returns {Array<string|null>} POSIX prefixes, parallel to `layers`
 */
function layerPrefixes(dir, layers) {
  const prefixes = new Array(layers.length);
  for (let i = 0; i < layers.length; i++) {
    const rel = toPosix(path.relative(layers[i].base, dir));
    prefixes[i] = isOutside(rel) ? null : rel;
  }
  return prefixes;
}

/**
 * Load the ignore layers contributed by a single directory.
 *
 * @param {string} dir - Directory to read ignore files from
 * @param {string[]} ignoreFileNames - Ordered ignore file names (later wins)
 * @param {boolean} useCache - Whether to use the rule cache
 * @param {Set<string>} [present] - Names known to exist in `dir`. When supplied
 *   (the walker already has the directory listing), absent names are skipped
 *   instead of being probed with a read that is going to fail.
 * @returns {Promise<Array>} Layers for this directory
 */
async function layersForDirectory(dir, ignoreFileNames, useCache, present = null) {
  const layers = [];

  for (const fileName of ignoreFileNames) {
    if (present !== null && !present.has(fileName)) continue;
    const ignoreFilePath = path.join(dir, fileName);
    const rules = await readRules(ignoreFilePath, useCache);
    if (rules.length === 0) continue;
    layers.push({
      base: dir,
      ig: ignore().add(rules),
      kind: kindForIgnoreFile(fileName),
      source: ignoreFilePath,
      rules,
    });
  }

  return layers;
}

/**
 * List the directories from `root` down to the parent of `absPath`, inclusive.
 * @param {string} root - Root directory
 * @param {string} absPath - Absolute path below the root
 * @returns {string[]} Ordered directory chain
 */
function ancestorDirs(root, absPath) {
  const parentDir = path.dirname(absPath);
  const rel = path.relative(root, parentDir);
  const dirs = [root];

  if (rel === '' || isOutside(rel)) {
    return dirs;
  }

  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    dirs.push(current);
  }
  return dirs;
}

/**
 * Build the ignore layers that apply along the path from the root to a target.
 *
 * This is what makes scoped traversal root-anchored without walking the whole
 * tree: the intermediate rules come from reading a handful of ignore files, not
 * from enumerating directories.
 *
 * @param {string} root - Root directory (ignore anchor)
 * @param {string} absPath - Target path
 * @param {string[]} ignoreFileNames - Ordered ignore file names
 * @param {boolean} useCache - Whether to use the rule cache
 * @returns {Promise<Array>} Ordered layers, outermost first
 */
async function buildAncestorLayers(root, absPath, ignoreFileNames, useCache) {
  const { layers } = await buildScopeContext(root, absPath, ignoreFileNames, useCache, []);
  return layers;
}

/**
 * Rebuild a layer without the rules that exclude any path on a chain.
 *
 * Used by `scopeIgnoresIgnoreFiles`. Dropping a whole inherited layer would
 * throw away rules that have nothing to do with the selection — a root
 * `.gitignore` that excludes both `build/` and `*.secret` would stop excluding
 * secrets the moment someone scoped into `build/`. Only the rules that actually
 * stand between the caller and their selection are removed.
 *
 * Negations are never dropped: they do not exclude anything.
 *
 * @param {Object} layer - Ignore layer with a `rules` array
 * @param {string[]} chain - Absolute paths from the first directory below the
 *   root down to the scope entry itself
 * @returns {Object} A layer with the blocking rules removed
 */
function withoutRulesBlocking(layer, chain) {
  if (!Array.isArray(layer.rules) || layer.rules.length === 0) return layer;

  const targets = chain
    .map((absPath) => toPosix(path.relative(layer.base, absPath)))
    .filter((rel) => rel !== '' && !isOutside(rel))
    .map((rel) => (rel.endsWith('/') ? rel : `${rel}/`));

  if (targets.length === 0) return layer;

  const kept = layer.rules.filter((raw) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return true;
    const single = ignore().add(raw);
    return !targets.some((target) => single.ignores(target));
  });

  if (kept.length === layer.rules.length) return layer;

  return { ...layer, ig: ignore().add(kept), rules: kept, _compiled: undefined };
}

/**
 * Build the ignore context for a scope entry, simulating what a full walk does.
 *
 * A full walk loads a directory's ignore files and only then decides whether to
 * descend into each child. Reading every ignore file along the chain
 * unconditionally is not equivalent: it can surface rules a full walk would
 * never have read. With `/.gitignore` excluding `parent/` and
 * `/parent/.gitignore` containing `!*`, a full walk prunes `parent` and never
 * sees the negation, while a naive scoped run reads it and re-includes the
 * whole subtree. So each ancestor is evaluated before its rules are loaded, and
 * traversal stops at the first ancestor a full walk would have pruned.
 *
 * @param {string} root - Root directory (ignore anchor)
 * @param {string} absPath - Scope entry
 * @param {string[]} ignoreFileNames - Ordered ignore file names
 * @param {boolean} useCache - Whether to use the rule cache
 * @param {Array} initialLayers - Config and caller layers, always applied
 * @param {boolean} [bypass=false] - Neutralize the rules blocking this entry
 * @returns {Promise<{layers: Array, prunedAt: string|null}>} Layers, and the
 *   ancestor that a full walk would have pruned (null when reachable)
 */
async function buildScopeContext(
  root,
  absPath,
  ignoreFileNames,
  useCache,
  initialLayers = [],
  bypass = false,
) {
  const dirs = ancestorDirs(root, absPath);
  // Everything between the root and the selection, inclusive: these are the
  // paths whose exclusion the caller is explicitly overriding.
  const chain = bypass ? [...dirs.slice(1), absPath] : [];

  const layers = [...initialLayers];
  let prunedAt = null;

  for (let i = 0; i < dirs.length; i++) {
    // The root is the anchor and is always entered. Every directory below it
    // has to survive the rules accumulated above it, exactly as in a full walk.
    if (i > 0 && isIgnored(dirs[i], root, layers, true).ignored) {
      prunedAt = dirs[i];
      break;
    }

    const dirLayers = await layersForDirectory(dirs[i], ignoreFileNames, useCache);
    layers.push(
      ...(bypass ? dirLayers.map((layer) => withoutRulesBlocking(layer, chain)) : dirLayers),
    );
  }

  return { layers, prunedAt };
}

/**
 * Walk directory tree with layered ignore file support
 *
 * @async
 * @generator
 * @param {string} root - Root directory to walk (also the ignore anchor)
 * @param {Object} options - Walk options
 * @param {string} [options.ignoreFileName='.copytreeignore'] - Legacy single ignore file name
 * @param {string[]} [options.ignoreFileNames] - Ordered ignore file names; later layers win
 * @param {boolean} [options.includeDirectories=false] - Whether to yield directories
 * @param {boolean} [options.followSymlinks=false] - Whether to follow symbolic links
 * @param {boolean} [options.explain=false] - Include explanation for each decision
 * @param {Array} [options.initialLayers=[]] - Pre-existing ignore layers (e.g., config excludes)
 * @param {Object} [options.config] - Configuration object for retry settings
 * @param {boolean} [options.cache=false] - Enable in-memory caching of parsed ignore rules.
 *   When true, ignore files are read once and cached for the lifetime of the process.
 *   Callers must call clearRuleCache() between operations to avoid stale rules.
 * @param {number} [options.maxDepth] - Maximum traversal depth
 * @param {string[]} [options.scope] - Absolute paths (files or directories) to traverse instead
 *   of the whole root. Ignore rules still resolve from `root`.
 * @param {boolean} [options.scopeIgnoresIgnoreFiles=false] - Let scope entries override the
 *   ignore rules that would otherwise exclude them
 * @param {Function} [options.onExclude] - Called with `{path, size, reason, rule, ruleSource, isDirectory}`
 *   for every excluded entry
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @yields {{path: string, stats: fs.Stats, explanation?: Object}} File information
 */
export async function* walkWithIgnore(root, options = {}) {
  const {
    ignoreFileName = '.copytreeignore',
    ignoreFileNames,
    includeDirectories = false,
    followSymlinks = false,
    explain = false,
    initialLayers = [],
    config = {},
    cache = false,
    maxDepth = undefined,
    scope = null,
    scopeIgnoresIgnoreFiles = false,
    onExclude = null,
    signal = null,
  } = options;

  const ignoreNames =
    Array.isArray(ignoreFileNames) && ignoreFileNames.length > 0
      ? ignoreFileNames
      : [ignoreFileName];

  // Ignore files are metadata, not content: never emit them.
  const suppressedNames = new Set([...ignoreNames, '.gitignore', '.copytreeignore']);

  // Extract retry configuration with defaults
  const retryConfig = {
    maxAttempts: config?.copytree?.fs?.retryAttempts ?? 3,
    initialDelay: config?.copytree?.fs?.retryDelay ?? 100,
    maxDelay: config?.copytree?.fs?.maxDelay ?? 2000,
  };

  const stats = {
    filesScanned: 0,
    directoriesScanned: 0,
    directoriesPruned: 0,
    filesExcluded: 0,
  };

  function checkAborted() {
    if (signal?.aborted) {
      throw createAbortError('Traversal aborted');
    }
  }

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

  async function statWithRetry(absPath) {
    try {
      const stat = await withFsRetry(() => fs.stat(absPath), {
        ...retryConfig,
        onRetry: ({ code }) => recordRetry(absPath, code),
      });
      recordSuccessAfterRetry(absPath);
      return stat;
    } catch (error) {
      if (isRetryableFsError(error)) {
        recordGiveUp(absPath, error.code);
      } else {
        recordPermanent(absPath, error.code);
      }
      if (onExclude) {
        onExclude({
          path: toPosix(path.relative(root, absPath)),
          size: 0,
          reason: EXCLUSION_REASONS.UNREADABLE,
          rule: error.code,
          isDirectory: false,
        });
      }
      return null;
    }
  }

  async function* walk(dir, layers, depth = 0) {
    checkAborted();
    stats.directoriesScanned++;

    // Read the directory before loading its ignore files. The listing says which
    // ignore files actually exist, so absent ones are skipped rather than probed
    // with an open that is guaranteed to fail. Most directories in a repository
    // contain no ignore file at all, so this removes two failed syscalls per
    // directory from every walk.
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
      if (onExclude) {
        onExclude({
          path: toPosix(path.relative(root, dir)),
          size: 0,
          reason: EXCLUSION_REASONS.UNREADABLE,
          rule: error.code,
          isDirectory: true,
        });
      }
      // Can't read directory - skip it
      return;
    }

    // Which ignore files this directory actually contains, taken from the
    // listing we already have.
    //
    // Only consulted when the rule cache is off, which is the default. With the
    // cache on, a missing ignore file is deliberately remembered as "no rules"
    // until `clearRuleCache()` is called, and skipping the read here would
    // quietly change that documented staleness contract.
    const presentIgnoreFiles = cache ? null : new Set();
    if (presentIgnoreFiles !== null) {
      for (const entry of entries) {
        if (ignoreNames.includes(entry.name)) presentIgnoreFiles.add(entry.name);
      }
    }

    // Load ignore rules contributed by this directory
    const nextLayers =
      presentIgnoreFiles !== null && presentIgnoreFiles.size === 0
        ? layers
        : [...layers, ...(await layersForDirectory(dir, ignoreNames, cache, presentIgnoreFiles))];

    // Filter out ignore files themselves to prevent them from appearing in output
    entries = entries.filter((entry) => !suppressedNames.has(entry.name));

    // Sort entries for deterministic order across platforms
    // fs.readdir order is not guaranteed and differs between Windows/Unix
    entries.sort((a, b) => ENTRY_COLLATOR.compare(a.name, b.name));

    // One relative path per layer for this directory, reused by every entry in
    // it instead of being recomputed per entry per layer.
    const prefixes = layerPrefixes(dir, nextLayers);

    for (const entry of entries) {
      checkAborted();
      const absPath = path.join(dir, entry.name);

      // Handle symlinks
      let isDir = entry.isDirectory();
      let stat = null;

      if (entry.isSymbolicLink()) {
        if (!followSymlinks) {
          continue; // Skip symlinks by default
        }
        stat = await statWithRetry(absPath);
        if (!stat) continue;
        isDir = stat.isDirectory();
      }

      // Check if this path should be ignored
      const decision = isIgnored(absPath, root, nextLayers, isDir, explain, prefixes, entry.name);

      if (isDir) {
        if (decision.ignored) {
          stats.directoriesPruned++;
          reportExclusion(absPath, decision, 0, true);
          continue; // Don't descend into ignored directories
        }

        // Yield directory if requested
        if (includeDirectories) {
          if (!stat) {
            stat = await statWithRetry(absPath);
            if (!stat) continue;
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
          if (onExclude) {
            // Size is only needed for the exclusion report's "largest" list.
            const excludedStat = explain ? await statWithRetry(absPath) : null;
            reportExclusion(absPath, decision, excludedStat?.size ?? 0, false);
          }
          continue;
        }

        // Yield file
        if (!stat) {
          stat = await statWithRetry(absPath);
          if (!stat) continue;
        }
        const result = { path: absPath, stats: stat };
        if (explain) {
          result.explanation = decision;
        }
        yield result;
      }
    }
  }

  if (!scope || scope.length === 0) {
    yield* walk(root, initialLayers);
    return;
  }

  // Scoped traversal: rules resolve from `root`, traversal starts at the scope
  // entries. Cost scales with the selection, not with the repository.
  for (const entry of scope) {
    checkAborted();

    const absEntry = path.resolve(entry);

    // `scopeIgnoresIgnoreFiles` is the deliberate "I know it's gitignored, copy
    // it anyway" gesture. It neutralizes the specific rules standing between the
    // root and the selection, and nothing else: `initialLayers` (config
    // exclusions, caller excludes) still apply, unrelated inherited rules still
    // apply, and ignore files INSIDE the selection still apply because they
    // describe the subtree the caller asked for.
    const { layers, prunedAt } = await buildScopeContext(
      root,
      absEntry,
      ignoreNames,
      cache,
      initialLayers,
      scopeIgnoresIgnoreFiles,
    );

    const entryStat = await statWithRetry(absEntry);
    if (!entryStat) continue;

    const isDir = entryStat.isDirectory();

    // An ancestor a full walk would have pruned makes the whole selection
    // unreachable, whatever the selection's own rules say.
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
        yield { path: absEntry, stats: entryStat };
      }
      yield* walk(absEntry, layers, 0);
    } else {
      stats.filesScanned++;
      yield { path: absEntry, stats: entryStat };
    }
  }
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
 * @param {string} [options.ignoreFileName='.copytreeignore'] - Legacy single ignore file name
 * @param {string[]} [options.ignoreFileNames] - Ordered ignore file names
 * @param {Array} [options.initialLayers=[]] - Pre-existing ignore layers
 * @param {Object} [options.config] - Configuration object for retry settings
 * @param {boolean} [options.cache=false] - Enable in-memory caching of parsed ignore rules
 * @param {boolean} [options.explain=false] - Resolve the matching rule and its source
 * @returns {Promise<{ignored: boolean, rule: string|null, layer: string|null}>} Decision with explanation
 */
export async function testPath(testPath, root, options = {}) {
  const {
    ignoreFileName = '.copytreeignore',
    ignoreFileNames,
    config = {},
    cache = false,
    initialLayers = [],
    explain = false,
  } = options;

  const ignoreNames =
    Array.isArray(ignoreFileNames) && ignoreFileNames.length > 0
      ? ignoreFileNames
      : [ignoreFileName];

  const absPath = path.resolve(root, testPath);

  // Determine if it's a directory
  let isDirectory = false;
  try {
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

  // A directory's own ignore file cannot exclude the directory itself, so the
  // layer chain stops at its parent for files and at itself for directories.
  const layers = [
    ...initialLayers,
    ...(await buildAncestorLayers(root, absPath, ignoreNames, cache)),
  ];

  return isIgnored(absPath, root, layers, isDirectory, explain);
}

export {
  buildAncestorLayers,
  buildScopeContext,
  layersForDirectory,
  ancestorDirs,
  isIgnored as evaluateIgnore,
};
export default walkWithIgnore;
