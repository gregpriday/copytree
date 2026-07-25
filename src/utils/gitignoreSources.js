/**
 * Git ignore sources beyond `.gitignore` files.
 *
 * Reads `.git/info/exclude` and the user's global gitignore
 * (`core.excludesFile`) using plain filesystem reads. CopyTree never shells out
 * to `git check-ignore` and never requires the target to be a git repository:
 * a missing `.git` directory simply means these layers contribute nothing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Read a file, returning null when it does not exist or cannot be read.
 * @param {string} filePath - Absolute path
 * @returns {Promise<string|null>} File contents with BOM stripped, or null
 */
async function readTextFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  } catch {
    return null;
  }
}

/**
 * Locate the `.git` directory for a path by walking up to the filesystem root.
 *
 * Handles both a real `.git` directory and the `gitdir: <path>` file that git
 * writes for worktrees and submodules.
 *
 * @param {string} startPath - Directory to start searching from
 * @returns {Promise<string|null>} Absolute path to the git directory, or null
 */
export async function findGitDir(startPath) {
  let current = path.resolve(startPath);

  for (;;) {
    const candidate = path.join(current, '.git');

    try {
      const stat = await fs.stat(candidate);

      if (stat.isDirectory()) {
        return candidate;
      }

      if (stat.isFile()) {
        // Worktree or submodule: `.git` is a file containing `gitdir: <path>`
        const content = await readTextFile(candidate);
        const match = content?.match(/^gitdir:\s*(.+)$/m);
        if (match) {
          const gitDir = match[1].trim();
          return path.isAbsolute(gitDir) ? gitDir : path.resolve(current, gitDir);
        }
      }
    } catch {
      // Not present at this level; keep walking up.
    }

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Extract `core.excludesFile` from git config INI text.
 *
 * Git config keys are case-insensitive, and the option has been spelled both
 * `excludesfile` and `excludesFile` across git versions.
 *
 * @param {string} text - Git config file contents
 * @returns {string|null} The configured path, or null
 */
export function parseExcludesFile(text) {
  if (!text) return null;

  let inCore = false;
  let result = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const section = line.match(/^\[([^\]"\s]+)/);
    if (section) {
      inCore = section[1].toLowerCase() === 'core';
      continue;
    }

    if (!inCore) continue;

    const kv = line.match(/^([A-Za-z0-9-]+)\s*=\s*(.*)$/);
    if (!kv) continue;
    if (kv[1].toLowerCase() !== 'excludesfile') continue;

    let value = kv[2].trim();
    // Strip a trailing inline comment on unquoted values
    if (!value.startsWith('"')) {
      value = value.replace(/\s+[#;].*$/, '').trim();
    } else {
      const closing = value.indexOf('"', 1);
      value = closing === -1 ? value.slice(1) : value.slice(1, closing);
    }

    if (value) result = value;
  }

  return result;
}

/**
 * Expand a leading `~` to the user's home directory.
 * @param {string} filePath - Possibly `~`-prefixed path
 * @returns {string} Absolute-ish path
 */
function expandHome(filePath) {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Resolve the user's global gitignore file.
 *
 * Checks `core.excludesFile` in the repository config, then the user's global
 * config (`~/.gitconfig` and the XDG location), then falls back to git's
 * built-in default of `$XDG_CONFIG_HOME/git/ignore`.
 *
 * @param {string|null} gitDir - Repository git directory, if any
 * @returns {Promise<string|null>} Absolute path to the global ignore file, or null
 */
export async function resolveGlobalExcludesFile(gitDir) {
  const xdgHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

  const configPaths = [
    gitDir ? path.join(gitDir, 'config') : null,
    path.join(os.homedir(), '.gitconfig'),
    path.join(xdgHome, 'git', 'config'),
  ].filter(Boolean);

  for (const configPath of configPaths) {
    const text = await readTextFile(configPath);
    const configured = parseExcludesFile(text);
    if (configured) {
      const resolved = path.resolve(expandHome(configured));
      if ((await readTextFile(resolved)) !== null) {
        return resolved;
      }
      // Configured but unreadable: treat as absent rather than falling through
      // to the default, which would silently apply rules the user replaced.
      return null;
    }
  }

  // Git's documented default when core.excludesFile is unset
  const fallback = path.join(xdgHome, 'git', 'ignore');
  return (await readTextFile(fallback)) !== null ? fallback : null;
}

/**
 * Resolve the common git directory for a git directory.
 *
 * A linked worktree's git directory is `<main>/.git/worktrees/<name>`, and it
 * holds only worktree-local state. `info/exclude` and the repository config
 * live in the common directory, named by the `commondir` file. Without this, a
 * scan inside a worktree silently loses the repository's own exclude rules.
 *
 * @param {string|null} gitDir - Git directory, possibly a linked worktree's
 * @returns {Promise<string|null>} Common git directory, or the input unchanged
 */
export async function resolveCommonGitDir(gitDir) {
  if (!gitDir) return null;

  const commondir = await readTextFile(path.join(gitDir, 'commondir'));
  if (!commondir) return gitDir;

  const target = commondir.trim();
  if (!target) return gitDir;

  return path.isAbsolute(target) ? target : path.resolve(gitDir, target);
}

/**
 * @typedef {Object} GitIgnoreSource
 * @property {string} path - Absolute path of the ignore file the rules came from
 * @property {string[]} rules - Raw rule lines
 * @property {'global-gitignore'|'git-info-exclude'} kind - Stable source identifier
 */

/**
 * Collect non-`.gitignore` ignore sources for a base path.
 *
 * Returned in precedence order (lowest first): global gitignore, then
 * `.git/info/exclude`. Both are applied as root-level layers.
 *
 * @param {string} basePath - Directory being scanned
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.infoExclude=true] - Read `.git/info/exclude`
 * @param {boolean} [options.globalExcludesFile=true] - Read the global gitignore
 * @returns {Promise<GitIgnoreSource[]>} Ordered ignore sources
 */
export async function collectGitIgnoreSources(basePath, options = {}) {
  const { infoExclude = true, globalExcludesFile = true } = options;
  const sources = [];

  if (!infoExclude && !globalExcludesFile) {
    return sources;
  }

  const gitDir = await findGitDir(basePath);
  // In a linked worktree, config and info/exclude live in the common directory.
  const commonGitDir = await resolveCommonGitDir(gitDir);

  if (globalExcludesFile) {
    const globalPath = await resolveGlobalExcludesFile(commonGitDir);
    if (globalPath) {
      const text = await readTextFile(globalPath);
      if (text) {
        sources.push({ path: globalPath, rules: text.split('\n'), kind: 'global-gitignore' });
      }
    }
  }

  if (infoExclude && commonGitDir) {
    const excludePath = path.join(commonGitDir, 'info', 'exclude');
    const text = await readTextFile(excludePath);
    if (text) {
      sources.push({ path: excludePath, rules: text.split('\n'), kind: 'git-info-exclude' });
    }
  }

  return sources;
}
