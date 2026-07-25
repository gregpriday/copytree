/**
 * Scope resolution.
 *
 * `scope` takes literal paths, not globs. A directory named `src/[draft]` is
 * just a path; there is nothing for the caller to escape, and nothing that can
 * silently match something else. This is the whole point: escaping glob
 * metacharacters at every call site, forever, is a bug factory.
 *
 * Entries may be files or directories, which is exactly what a multi-select
 * picker produces. They are deduplicated, and a parent subsumes its children.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ScopeError, ERROR_CODES } from './errors.js';
import { toPosix } from './pathUtils.js';

/**
 * @typedef {Object} ScopeEntry
 * @property {string} absolutePath - Platform-native absolute path
 * @property {string} relativePath - POSIX path relative to the base path
 * @property {boolean} isDirectory - Whether the entry is a directory
 */

/**
 * Resolve, validate, and normalize a scope selection.
 *
 * @param {string} basePath - Absolute base path; the ignore anchor and path root
 * @param {string[]|string} scope - Literal paths, absolute or relative to basePath
 * @param {Object} [options={}] - Resolution options
 * @param {boolean} [options.followSymlinks=false] - Allow a scope entry to be a symbolic link.
 *   Even then the link's real target must stay inside the base path.
 * @returns {Promise<ScopeEntry[]>} Deduplicated entries, sorted by path
 * @throws {ScopeError} `ERR_SCOPE_OUTSIDE_ROOT` when an entry escapes the base path, including
 *   via a symbolic link, or when it is a link and `followSymlinks` is off
 * @throws {ScopeError} `ERR_PATH_NOT_FOUND` when an entry does not exist
 */
export async function resolveScope(basePath, scope, options = {}) {
  const entries = Array.isArray(scope) ? scope : scope ? [scope] : [];
  if (entries.length === 0) return [];

  const followSymlinks = options.followSymlinks === true;
  const root = path.resolve(basePath);
  // Containment is checked against the real base too: comparing a resolved
  // symlink target to a symlinked base would report a false escape.
  const realRoot = await realPathOrSelf(root);
  const resolved = [];

  for (const raw of entries) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new ScopeError(
        'scope entries must be non-empty strings',
        ERROR_CODES.INVALID_OPTION,
        raw,
      );
    }

    const absolutePath = path.resolve(root, raw);
    const relative = path.relative(root, absolutePath);

    // An entry outside the root is a caller mistake. These paths come from user
    // clicks; an explicit error beats an empty context that looks like success.
    // Compare path segments, not the raw string: a directory legitimately named
    // `..draft` starts with `..` without escaping anything.
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new ScopeError(
        `scope entry resolves outside the base path: ${raw}`,
        ERROR_CODES.SCOPE_OUTSIDE_ROOT,
        raw,
        { basePath: root, resolved: absolutePath },
      );
    }

    let stat;
    try {
      // lstat, not stat: a symlink must be recognised as a symlink before it is
      // followed, so `followSymlinks: false` is honoured for scope entries too.
      stat = await fs.lstat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ScopeError(
          `scope entry does not exist: ${raw}`,
          ERROR_CODES.PATH_NOT_FOUND,
          raw,
          { basePath: root, resolved: absolutePath },
        );
      }
      throw new ScopeError(
        `scope entry could not be read: ${raw} (${error.code})`,
        ERROR_CODES.PATH_NOT_FOUND,
        raw,
        { basePath: root, resolved: absolutePath, cause: error.code },
      );
    }

    if (stat.isSymbolicLink()) {
      if (!followSymlinks) {
        throw new ScopeError(
          `scope entry is a symbolic link and followSymlinks is disabled: ${raw}`,
          ERROR_CODES.SCOPE_OUTSIDE_ROOT,
          raw,
          { basePath: root, resolved: absolutePath },
        );
      }

      // A lexical containment check is not enough once links are in play:
      // `repo/link -> /etc` resolves inside the root on paper and outside it in
      // fact. Compare where the link actually lands.
      const realEntry = await realPathOrSelf(absolutePath);
      const realRelative = path.relative(realRoot, realEntry);
      if (
        realRelative === '..' ||
        realRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(realRelative)
      ) {
        throw new ScopeError(
          `scope entry resolves outside the base path via a symbolic link: ${raw}`,
          ERROR_CODES.SCOPE_OUTSIDE_ROOT,
          raw,
          { basePath: root, resolved: realEntry },
        );
      }

      stat = await fs.stat(absolutePath);
    }

    resolved.push({
      absolutePath,
      relativePath: relative === '' ? '' : toPosix(relative),
      isDirectory: stat.isDirectory(),
    });
  }

  return subsume(resolved);
}

/**
 * Resolve a path's real location, falling back to the input when that fails.
 * @param {string} target - Path to resolve
 * @returns {Promise<string>} Real path, or the input unchanged
 */
async function realPathOrSelf(target) {
  try {
    return await fs.realpath(target);
  } catch {
    return target;
  }
}

/**
 * Deduplicate entries, dropping any entry already covered by an ancestor.
 *
 * Selecting `src` and `src/panels` in a picker is normal; walking `src/panels`
 * twice is not.
 *
 * @param {ScopeEntry[]} entries - Resolved entries
 * @returns {ScopeEntry[]} Minimal covering set, sorted by path
 */
function subsume(entries) {
  const byPath = new Map();
  for (const entry of entries) {
    byPath.set(entry.relativePath, entry);
  }

  const unique = [...byPath.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // The empty relative path means "the base path itself", which covers everything.
  const wholeTree = unique.find((entry) => entry.relativePath === '');
  if (wholeTree) return [wholeTree];

  const kept = [];
  for (const entry of unique) {
    const covered = kept.some(
      (parent) => parent.isDirectory && entry.relativePath.startsWith(`${parent.relativePath}/`),
    );
    if (!covered) kept.push(entry);
  }

  return kept;
}

export default resolveScope;
