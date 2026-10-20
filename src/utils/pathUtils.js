import path from 'path';
import picomatch from 'picomatch';

/**
 * Convert a path produced by Node's `path` module to POSIX format
 * (forward slashes only).
 *
 * On Windows, `path.relative()`, `path.join()`, and `path.normalize()`
 * return backslash-separated paths. Glob libraries (picomatch, minimatch,
 * tinyglobby) treat backslashes as escape characters per the POSIX glob spec,
 * so pattern matching silently fails unless paths use forward slashes.
 *
 * This utility replaces the current platform's path separator (`path.sep`)
 * with `/`. On POSIX systems it is a no-op (path.sep is already `/`).
 * It does NOT strip leading `./`, resolve `..`, or deduplicate slashes —
 * paths entering the pipeline from `path.relative()` or `tinyglobby` are
 * already in canonical form.
 *
 * @param {string} p - Platform-native path string
 * @returns {string} The path with forward slashes
 */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Compile include-style globs into one matcher for POSIX paths.
 *
 * picomatch only consults the platform when it is handed an options object:
 * `picomatch(globs)` is POSIX everywhere, while `picomatch(globs, { dot: true })`
 * reads a backslash in a pattern as a separator on Windows. Always passing one
 * keeps every caller on the same rule, and on the rule they had under
 * micromatch, which always consulted the platform.
 *
 * @param {string|string[]} patterns - Glob patterns; a path matching any one matches
 * @param {Object} [options] - picomatch options
 * @returns {(path: string) => boolean} The compiled matcher
 */
export function compileGlobs(patterns, options = {}) {
  return picomatch(patterns, options);
}
