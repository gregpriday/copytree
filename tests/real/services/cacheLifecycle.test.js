/**
 * Every cache the product creates can be inspected, bounded and removed.
 *
 * Two gaps, both of which let a cache exist that nothing could manage:
 *
 * 1. `cache.driver: none` disabled only the *file* half. Every method guarded
 *    on `enabled` and then consulted an in-process `Map` regardless of driver,
 *    so a caller who set it to get a cold, reproducible run still got a warm
 *    one.
 *
 * 2. Copying a GitHub URL clones the repository under `~/.copytree/repos` and
 *    keeps it. `cache status` reported the transformation cache and the
 *    temporary reference files and said nothing about the one cache that holds
 *    whole checkouts — on this machine, a gigabyte of them — and `cache clear`
 *    left it untouched.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { CacheService } from '../../../src/services/CacheService.js';

jest.unmock('../../../src/utils/fsx.js');

describe('cache.driver: none', () => {
  /**
   * Build a cache under a throwaway directory.
   * @param {string} driver - Cache driver
   * @returns {CacheService} The cache
   */
  const build = (driver) =>
    new CacheService({
      driver,
      enabled: true,
      cachePath: mkdtempSync(path.join(os.tmpdir(), 'copytree-cache-')),
    });

  it('misses everything it was told to store', async () => {
    const cache = build('none');

    await cache.set('key', 'value');

    expect(await cache.get('key')).toBeNull();
    expect(await cache.has('key')).toBe(false);
  });

  it('reports itself as disabled rather than empty', async () => {
    // "Empty" invites someone to wonder why nothing is being cached. "Disabled"
    // answers it.
    expect((await build('none').status()).enabled).toBe(false);
  });

  it('reclaims nothing, and says so', async () => {
    const cache = build('none');
    await cache.set('key', 'value');

    expect(await cache.clear()).toBe(0);
  });

  it.each(['file', 'memory'])('still caches under the %s driver', async (driver) => {
    const cache = build(driver);

    await cache.set('key', 'value');

    expect(await cache.get('key')).toBe('value');
    expect(await cache.has('key')).toBe(true);
  });
});

describe('the repository clone cache', () => {
  let root;
  let previous;

  beforeEach(() => {
    // `COPYTREE_REPO_CACHE_PATH`, not `HOME`. `os.homedir()` reads the password
    // database and ignores `HOME` on macOS, so a test that believed it had
    // redirected the home directory ran `collectRepositories({ all: true })`
    // against the developer's own cache and deleted every clone in it. That is
    // the reason the override exists.
    root = mkdtempSync(path.join(os.tmpdir(), 'copytree-repos-'));
    previous = process.env.COPYTREE_REPO_CACHE_PATH;
    process.env.COPYTREE_REPO_CACHE_PATH = root;
    jest.resetModules();
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.COPYTREE_REPO_CACHE_PATH;
    else process.env.COPYTREE_REPO_CACHE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Create a fake cached clone.
   * @param {string} name - Cache key directory name
   * @param {number} bytes - Size of the file to write into it
   * @returns {string} The clone directory
   */
  function seedClone(name, bytes) {
    const dir = path.join(root, name);
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'file.js'), 'x'.repeat(bytes));
    return dir;
  }

  it('points at the override, not the real cache', async () => {
    // The guard that makes every destructive test below safe to run.
    const { default: GitHubUrlHandler } = await import('../../../src/services/GitHubUrlHandler.js');

    expect(GitHubUrlHandler.cacheRoot()).toBe(root);
    expect(GitHubUrlHandler.cacheRoot()).not.toContain(os.homedir());
  });

  it.each([
    ['an empty value', ''],
    ['whitespace', '   '],
    ['the current directory', '.'],
    ['a relative path', 'some/dir'],
    ['a filesystem root', path.parse(process.cwd()).root],
    ['the home directory', os.homedir()],
  ])('refuses %s as a cache root', async (_label, value) => {
    // `cache clear --repositories` removes entries under this root, so `.` would
    // aim it at the project being copied. Refused rather than quietly falling
    // back to the real cache: someone who set this to protect their own clones
    // — the entire reason it exists — must not be silently redirected at them.
    process.env.COPYTREE_REPO_CACHE_PATH = value;
    jest.resetModules();

    const { default: GitHubUrlHandler } = await import('../../../src/services/GitHubUrlHandler.js');

    expect(() => GitHubUrlHandler.cacheRoot()).toThrow(/COPYTREE_REPO_CACHE_PATH/);
  });

  it('removes only what it named, even pointed at a project directory', async () => {
    // Defence in depth behind the validation above. A clone directory is a
    // 32-character md5 cache key, so nothing else can be mistaken for one.
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    mkdirSync(path.join(root, 'abc123.lock'), { recursive: true });
    mkdirSync(path.join(root, 'worktrees'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'index.js'), 'export default 1;');
    seedClone('0123456789abcdef0123456789abcdef', 50);

    const { collectRepositories } = await import('../../../src/services/repositoryStore.js');

    expect((await collectRepositories({ all: true })).removed).toBe(1);
    expect(existsSync(path.join(root, 'src', 'index.js'))).toBe(true);
    expect(existsSync(path.join(root, 'node_modules'))).toBe(true);
    // The handler's own lock and worktree directories are not repositories.
    expect(existsSync(path.join(root, 'abc123.lock'))).toBe(true);
    expect(existsSync(path.join(root, 'worktrees'))).toBe(true);
  });

  it('removes the worktrees belonging to a collected clone', async () => {
    // They live outside the clone and hold a `.git` file pointing back into it,
    // so removing the clone alone leaves a checkout that looks like a
    // repository and is not one.
    const key = 'fedcba9876543210fedcba9876543210';
    seedClone(key, 50);
    mkdirSync(path.join(root, 'worktrees', `${key}-abc123def456`), { recursive: true });
    mkdirSync(path.join(root, 'worktrees', 'otherkey-999999999999'), { recursive: true });

    const { collectRepositories } = await import('../../../src/services/repositoryStore.js');
    await collectRepositories({ all: true });

    expect(existsSync(path.join(root, 'worktrees', `${key}-abc123def456`))).toBe(false);
    // Another clone's worktree is untouched.
    expect(existsSync(path.join(root, 'worktrees', 'otherkey-999999999999'))).toBe(true);
  });

  it('counts a symlink without following it out of the cache', async () => {
    const { symlinkSync } = await import('fs');
    const clone = seedClone('1'.repeat(32), 100);
    // A repository can contain a link to anywhere. Following one would both
    // misreport the size and walk outside the directory being measured.
    symlinkSync(os.homedir(), path.join(clone, 'escape'));

    const { repositoryStatus } = await import('../../../src/services/repositoryStore.js');
    const status = await repositoryStatus();

    expect(status.entries).toBe(1);
    // The 100-byte file plus the link entry itself, nowhere near a home directory.
    expect(status.bytes).toBeLessThan(10_000);
  });

  it('reads recency from the newest file inside, not the directory itself', async () => {
    const { utimesSync } = await import('fs');
    const clone = seedClone('2'.repeat(32), 100);

    // A directory's mtime changes when its immediate children change; a `git
    // fetch` rewrites files several levels down. Backdating the directory while
    // its contents are fresh is exactly that shape.
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    utimesSync(clone, longAgo, longAgo);

    const { collectRepositories } = await import('../../../src/services/repositoryStore.js');

    expect(await collectRepositories({ retentionDays: 30 })).toEqual({ removed: 0, bytes: 0 });
  });

  it('reports what it holds, per repository', async () => {
    // Per repository, not per file: "seven repositories, 2.1 GB" is the
    // sentence someone chasing disk usage needs.
    seedClone('a'.repeat(32), 500);
    seedClone('b'.repeat(32), 1500);

    const { repositoryStatus } = await import('../../../src/services/repositoryStore.js');
    const status = await repositoryStatus();

    expect(status.entries).toBe(2);
    expect(status.bytes).toBe(2000);
    expect(status.path).toBe(root);
  });

  it('reports an empty cache without failing', async () => {
    const { repositoryStatus } = await import('../../../src/services/repositoryStore.js');
    const status = await repositoryStatus();

    expect(status).toMatchObject({ entries: 0, bytes: 0, oldest: null, newest: null });
  });

  it('removes every clone when asked for all of them', async () => {
    seedClone('a'.repeat(32), 100);
    seedClone('b'.repeat(32), 200);

    const { collectRepositories, repositoryStatus } =
      await import('../../../src/services/repositoryStore.js');

    expect(await collectRepositories({ all: true })).toEqual({ removed: 2, bytes: 300 });
    expect((await repositoryStatus()).entries).toBe(0);
  });

  it('keeps a clone that is inside the retention window', async () => {
    seedClone('f'.repeat(32), 100);

    const { collectRepositories } = await import('../../../src/services/repositoryStore.js');

    expect(await collectRepositories({ retentionDays: 30 })).toEqual({ removed: 0, bytes: 0 });
  });

  it('creates the cache root privately', async () => {
    const { default: GitHubUrlHandler } = await import('../../../src/services/GitHubUrlHandler.js');
    const { statSync } = await import('fs');

    new GitHubUrlHandler('https://github.com/user/repo');

    // Whole checkouts of repositories that may be private, under a directory
    // that would otherwise inherit the umask.
    if (process.platform !== 'win32') {
      expect(statSync(GitHubUrlHandler.cacheRoot()).mode & 0o777).toBe(0o700);
    }
  });
});
