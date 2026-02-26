import path from 'path';

/**
 * Convert a path produced by Node's `path` module to POSIX format
 * (forward slashes only).
 *
 * On Windows, `path.relative()`, `path.join()`, and `path.normalize()`
 * return backslash-separated paths. Glob libraries (micromatch, minimatch,
 * fast-glob) treat backslashes as escape characters per the POSIX glob spec,
 * so pattern matching silently fails unless paths use forward slashes.
 *
 * This utility replaces the current platform's path separator (`path.sep`)
 * with `/`. On POSIX systems it is a no-op (path.sep is already `/`).
 * It does NOT strip leading `./`, resolve `..`, or deduplicate slashes —
 * paths entering the pipeline from `path.relative()` or `fast-glob` are
 * already in canonical form.
 *
 * @param {string} p - Platform-native path string
 * @returns {string} The path with forward slashes
 */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}
