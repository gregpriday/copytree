/**
 * Exclusions that no option, rule, or negation can lift.
 *
 * Every other exclusion in CopyTree is a layer in a last-match-wins stack, so a
 * later negation can re-include what an earlier rule excluded. That is the right
 * model for ignore files and for config defaults, and the wrong model for git
 * metadata: packed objects and refs are not source, they are large and binary,
 * and no caller who asked for "the project" meant them.
 *
 * Putting `.git` in the ordinary config-exclude layer meant three separate ways
 * back in — a `!.git/` negation in a `.copytreeignore`, a `--scope .git` with
 * the config override, and an `--always '.git/**'` force-include, which bypasses
 * the layer stack entirely by design. This module is consulted outside the layer
 * stack so none of those apply.
 */

/** Directory names excluded at any depth, unconditionally. */
export const HARD_EXCLUDED_DIRECTORIES = Object.freeze(['.git']);

/**
 * Lowercased hard-excluded names, for the case-insensitive comparison used on
 * platforms whose filesystems are case-insensitive. `.GIT` reaches the same
 * directory as `.git` on macOS and Windows, so a case-sensitive test would be a
 * bypass there.
 */
const LOWERED = new Set(HARD_EXCLUDED_DIRECTORIES.map((name) => name.toLowerCase()));

/**
 * Whether a path lies inside a hard-excluded directory at any depth.
 *
 * Checked per segment rather than anchored at the root, because a submodule's
 * nested `.git` is git metadata too.
 *
 * @param {string} posixPath - Path relative to the repository root, POSIX-separated
 * @returns {boolean} True when the path is inside a hard-excluded directory
 */
export function isHardExcluded(posixPath) {
  if (!posixPath) return false;

  // `file.path` and every relative path inside the walkers are POSIX, so
  // splitting on '/' is correct here; `path.sep` would be wrong on Windows.
  for (const segment of posixPath.split('/')) {
    if (!segment) continue;
    if (LOWERED.has(segment.toLowerCase())) return true;
  }

  return false;
}

export default isHardExcluded;
