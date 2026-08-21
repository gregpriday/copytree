/**
 * The clone cache, as something `copytree cache` can see.
 *
 * Copying a GitHub URL clones the repository under `~/.copytree/repos` and
 * keeps it, which is the right thing to do — a second copy of the same
 * repository should not re-download it. What was wrong is that nothing could
 * find it again: `cache status` reported the transformation cache and the
 * temporary reference files, and said nothing about the one cache that holds
 * whole checkouts and grows without bound. Someone wondering where their disk
 * had gone had no way to ask, and `cache clear` left it untouched.
 *
 * Every cache the product creates should be inspectable, bounded and removable
 * through the same workflow. This is the missing third.
 */

import path from 'path';
import fs from '../utils/fsx.js';
import GitHubUrlHandler from './GitHubUrlHandler.js';

/** How long an untouched clone is kept before `cache gc` reclaims it. */
export const DEFAULT_REPOSITORY_RETENTION_DAYS = 30;

/** Depth ceiling for the size walk, as a backstop against a pathological tree. */
const MAX_WALK_DEPTH = 64;

/**
 * What a cached clone's directory is named: `GitHubUrlHandler`'s cache key, an
 * md5 digest.
 *
 * Positive identification, and the single most important line in this file.
 * Enumerating "every directory under the root" and deleting it means the
 * blast radius of a mis-pointed cache root is *everything in it* — and
 * `COPYTREE_REPO_CACHE_PATH=.` makes that root the project someone is copying.
 * It also swept up the handler's own `worktrees` directory and its `<key>.lock`
 * directories, so clearing the cache could delete a checkout that a run was
 * using at the time.
 *
 * Matching the shape instead means this can only ever remove something CopyTree
 * named, whatever the root turns out to be.
 */
const CACHE_KEY = /^[0-9a-f]{32}$/;

/** Where per-commit worktrees live, as a sibling of the clones. */
const WORKTREES = 'worktrees';

/**
 * The cached clones, one entry per repository.
 *
 * Each is a directory named by the cache key, so the accounting is per
 * repository rather than per file: "seven repositories, 2.1 GB" is the sentence
 * someone needs, and "eighty-four thousand files" is not.
 *
 * @returns {Promise<Array<{path: string, size: number, mtimeMs: number}>>} Cached clones
 */
async function listRepositories() {
  const root = GitHubUrlHandler.cacheRoot();
  if (!(await fs.pathExists(root))) return [];

  const clones = [];

  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    // `isDirectory()` is false for a symlink to a directory, so a link planted
    // in the cache root is skipped rather than followed and removed.
    if (!entry.isDirectory() || !CACHE_KEY.test(entry.name)) continue;

    const full = path.join(root, entry.name);
    try {
      const stats = await fs.stat(full);
      const { size, newestMs } = await measure(full);

      clones.push({
        path: full,
        key: entry.name,
        size,
        // The newest mtime anywhere inside, not the directory's own. A
        // directory's mtime changes when its immediate children change, and a
        // `git fetch` rewrites files several levels down inside `.git` — so a
        // clone that had been re-fetched every day could still present a
        // year-old timestamp and be reclaimed as unused. The walk that measures
        // the size already visits every file, so this costs nothing.
        mtimeMs: Math.max(stats.mtimeMs, newestMs),
      });
    } catch {
      // Raced with a cleanup; nothing to report.
    }
  }

  return clones;
}

/**
 * Total bytes under a directory, and the newest modification time in it.
 *
 * Walked rather than `du`-ed: a shelled-out size is a subprocess per repository
 * and a different answer on every platform.
 *
 * Symlinks are counted, never followed. `Dirent.isDirectory()` is false for a
 * link to a directory, so the walk does not leave the cache, and `lstat` sizes
 * the link rather than its target — which matters because a repository can
 * contain a link to anywhere, and following one would both misreport the size
 * and, in a cache whose whole purpose is to be deletable, invite a walk that
 * wanders outside the directory being measured.
 *
 * @param {string} dir - Directory to measure
 * @returns {Promise<{size: number, newestMs: number}>} Bytes, and newest mtime
 */
async function measure(dir) {
  let size = 0;
  let newestMs = 0;

  const walk = async (current, depth) => {
    // A git checkout is not deeply nested; a symlink loop is. The walk cannot
    // follow a link, so this is a backstop rather than the primary defence.
    if (depth > MAX_WALK_DEPTH) return;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }

      try {
        const stats = await fs.lstat(full);
        if (stats.isFile() || stats.isSymbolicLink()) size += stats.size;
        if (stats.mtimeMs > newestMs) newestMs = stats.mtimeMs;
      } catch {
        // Vanished mid-walk.
      }
    }
  };

  await walk(dir, 0);
  return { size, newestMs };
}

/**
 * Describe the cached clones.
 *
 * @returns {Promise<{path: string, entries: number, bytes: number, oldest: string|null,
 *   newest: string|null}>} Status, in the shape the other cache categories use
 */
export async function repositoryStatus() {
  const clones = await listRepositories();
  const times = clones.map((clone) => clone.mtimeMs);

  return {
    path: GitHubUrlHandler.cacheRoot(),
    entries: clones.length,
    bytes: clones.reduce((total, clone) => total + clone.size, 0),
    oldest: times.length > 0 ? new Date(Math.min(...times)).toISOString() : null,
    newest: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
  };
}

/**
 * Remove cached clones older than the retention window.
 *
 * The default window is longer than the one for reference files: a clone is
 * expensive to rebuild and cheap to keep, where a reference file is the
 * opposite.
 *
 * @param {Object} [options={}] - Options
 * @param {number} [options.retentionDays=30] - Age above which a clone is stale
 * @param {boolean} [options.all=false] - Remove every cached clone
 * @returns {Promise<{removed: number, bytes: number}>} What was reclaimed
 */
export async function collectRepositories(options = {}) {
  const retentionDays = options.retentionDays ?? DEFAULT_REPOSITORY_RETENTION_DAYS;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const clones = await listRepositories();

  let removed = 0;
  let bytes = 0;

  for (const clone of clones) {
    if (!options.all && clone.mtimeMs >= cutoff) continue;

    try {
      // The worktrees first. They live outside the clone, in a sibling
      // directory, and hold a `.git` file pointing back into it — so removing
      // the clone alone leaves a checkout that looks like a repository and is
      // not one.
      bytes += await removeWorktreesFor(clone.key);

      await fs.remove(clone.path);
      removed += 1;
      bytes += clone.size;
    } catch {
      // A clone we cannot remove stays; reporting a smaller number is honest.
    }
  }

  return { removed, bytes };
}

/**
 * Remove the per-commit worktrees belonging to one clone.
 *
 * Named `<cacheKey>-<commit>`, so they can be identified without reading the
 * clone that is about to be deleted.
 *
 * @param {string} key - The clone's cache key
 * @returns {Promise<number>} Bytes reclaimed
 */
async function removeWorktreesFor(key) {
  const root = path.join(GitHubUrlHandler.cacheRoot(), WORKTREES);
  if (!(await fs.pathExists(root))) return 0;

  let bytes = 0;

  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${key}-`)) continue;

    const full = path.join(root, entry.name);
    try {
      const { size } = await measure(full);
      await fs.remove(full);
      bytes += size;
    } catch {
      // Leaving one behind is untidy, not unsafe.
    }
  }

  return bytes;
}

export default {
  DEFAULT_REPOSITORY_RETENTION_DAYS,
  repositoryStatus,
  collectRepositories,
};
