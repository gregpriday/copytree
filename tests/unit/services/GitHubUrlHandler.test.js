// Mock dependencies before imports
jest.mock('../../../src/utils/fsx.js');
jest.mock('child_process');
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import fs from '../../../src/utils/fsx.js';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import GitHubUrlHandler from '../../../src/services/GitHubUrlHandler.js';

/** Build `git ls-remote` style output from ref names. */
const lsRemote = (...refs) =>
  refs.map((ref, i) => `${(i + 1).toString(16).padStart(40, '0')}\t${ref}`).join('\n') + '\n';

/** The argv of the first `git <subcommand>` invocation. */
const gitCall = (subcommand) =>
  execFileSync.mock.calls.find((call) => call[0] === 'git' && call[1][0] === subcommand);

/** Every git subcommand invoked, in order. */
const gitSubcommands = () =>
  execFileSync.mock.calls.filter((call) => call[0] === 'git').map((call) => call[1][0]);

/** The value passed immediately after `flag`, proving adjacency. */
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];

describe('GitHubUrlHandler', () => {
  /** Paths the fake filesystem reports as existing. */
  let existing;

  beforeEach(() => {
    jest.clearAllMocks();
    existing = new Set();

    fs.existsSync.mockImplementation((p) => existing.has(String(p)));
    fs.ensureDirSync.mockImplementation(() => {});
    fs.rmSync = jest.fn((p) => existing.delete(String(p)));
    fs.removeSync.mockImplementation((p) => existing.delete(String(p)));
    // Identity realpath: individual tests override to model symlinks
    fs.realpathSync = jest.fn((p) => String(p));
  });

  /** Make git calls behave like a working remote, and record clones. */
  const mockGit = ({ refs = [], head = 'main', contents = [] } = {}) => {
    execFileSync.mockImplementation((file, args) => {
      const [subcommand] = args;
      if (subcommand === 'ls-remote') {
        if (args.includes('--symref')) return `ref: refs/heads/${head}\tHEAD\n`;
        return lsRemote(...refs);
      }
      if (subcommand === 'clone') {
        const dir = args[args.length - 1];
        existing.add(dir);
        existing.add(path.join(dir, '.git'));
        contents.forEach((entry) => existing.add(path.join(dir, entry)));
      }
      if (subcommand === 'rev-parse') {
        // git exits non-zero when the ref does not exist
        const wanted = args[args.length - 1];
        if (!refs.includes(wanted)) {
          const error = new Error(`Command failed: git rev-parse ${wanted}`);
          error.status = 1;
          throw error;
        }
        return 'abc123\n';
      }
      return '';
    });
  };

  describe('isGitHubUrl', () => {
    it('should identify valid GitHub URLs', () => {
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo')).toBe(true);
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo/tree/main')).toBe(true);
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo/tree/main/src')).toBe(true);
    });

    it('should reject non-GitHub URLs', () => {
      expect(GitHubUrlHandler.isGitHubUrl('https://gitlab.com/user/repo')).toBe(false);
      expect(GitHubUrlHandler.isGitHubUrl('http://github.com/user/repo')).toBe(false);
      expect(GitHubUrlHandler.isGitHubUrl('/local/path')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse repository URL correctly', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('');
      expect(handler.subPath).toBe('');
    });

    it('should parse URL with branch', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('develop');
      expect(handler.subPath).toBe('');
    });

    it('should parse URL with branch and path', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/src/components');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('main');
      expect(handler.subPath).toBe('src/components');
    });

    it('should tolerate a .git suffix and trailing slash', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo.git/');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('');
    });

    it('should discard query strings and fragments', () => {
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/main/src?plain=1#L10',
      );
      expect(handler.treePath).toBe('main/src');
    });

    it('should percent-decode the path', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/My%20Docs');
      expect(handler.treePath).toBe('main/My Docs');
    });

    it('should keep the full tree path for later resolution', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/a/src');
      expect(handler.treePath).toBe('feature/a/src');
      expect(handler.refResolved).toBe(false);
    });

    it('should reject /blob/ URLs with an actionable message', () => {
      expect(() => new GitHubUrlHandler('https://github.com/user/repo/blob/main/src/a.js')).toThrow(
        /point at a single file/,
      );
    });

    it('should reject a non-GitHub origin', () => {
      expect(() => new GitHubUrlHandler('https://evil.com/user/repo')).toThrow(
        'Invalid GitHub URL format',
      );
    });

    it('should throw error for invalid URL format', () => {
      expect(() => new GitHubUrlHandler('not-a-url')).toThrow('Invalid GitHub URL format');
    });
  });

  describe('resolveRef', () => {
    it('should resolve a branch name containing slashes', async () => {
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/feature/render-trust-signature-removal',
      );

      // The provisional split is the bug being fixed
      expect(handler.branch).toBe('feature');

      mockGit({
        refs: ['refs/heads/master', 'refs/heads/feature/render-trust-signature-removal'],
      });

      await handler.resolveRef();

      expect(handler.branch).toBe('feature/render-trust-signature-removal');
      expect(handler.subPath).toBe('');
    });

    it('should split a slashed branch from its subpath', async () => {
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/feature/new-ui/src/components',
      );

      mockGit({ refs: ['refs/heads/feature/new-ui', 'refs/heads/main'] });

      await handler.resolveRef();

      expect(handler.branch).toBe('feature/new-ui');
      expect(handler.subPath).toBe('src/components');
    });

    it('should prefer the longest matching ref', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/release/1.0/docs');

      mockGit({ refs: ['refs/heads/release', 'refs/heads/release/1.0'] });

      await handler.resolveRef();

      expect(handler.branch).toBe('release/1.0');
      expect(handler.subPath).toBe('docs');
    });

    it('should resolve tags and record the ref kind', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/v1.0/src');

      mockGit({ refs: ['refs/tags/v1.0'] });

      await handler.resolveRef();

      expect(handler.branch).toBe('v1.0');
      expect(handler.refKind).toBe('tag');
      expect(handler.subPath).toBe('src');
    });

    it('should prefer a branch over a tag of the same name', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/v1.0/src');

      mockGit({ refs: ['refs/tags/v1.0', 'refs/heads/v1.0'] });

      await handler.resolveRef();

      expect(handler.refKind).toBe('head');
    });

    it('should tolerate CRLF line endings from git', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x/src');

      execFileSync.mockReturnValue('abc\trefs/heads/feature/x\r\n');

      await handler.resolveRef();

      expect(handler.branch).toBe('feature/x');
      expect(handler.subPath).toBe('src');
    });

    it('should change the cache key when the branch is corrected', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x');
      const provisionalKey = handler.cacheKey;

      mockGit({ refs: ['refs/heads/feature/x'] });

      await handler.resolveRef();

      expect(handler.cacheKey).not.toBe(provisionalKey);
      expect(handler.repoDir).toContain(handler.cacheKey);
    });

    it('should not query the remote for a single-segment tree path', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');

      await handler.resolveRef();

      expect(execFileSync).not.toHaveBeenCalled();
      expect(handler.branch).toBe('develop');
    });

    it('should query the remote only once across repeated calls', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x/src');
      mockGit({ refs: ['refs/heads/feature/x'] });

      await handler.resolveRef();
      await handler.resolveRef();

      expect(execFileSync.mock.calls.filter((c) => c[1][0] === 'ls-remote')).toHaveLength(1);
    });

    it('should error rather than guess when no ref matches', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/src');

      mockGit({ refs: ['refs/heads/other'] });

      await expect(handler.resolveRef()).rejects.toThrow(/No branch or tag matches 'main\/src'/);
    });

    it('should name commit-SHA URLs as unsupported', async () => {
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/8f694bbd91f4488fbbca8b6d4be402b4/src',
      );

      mockGit({ refs: ['refs/heads/main'] });

      await expect(handler.resolveRef()).rejects.toThrow(/commit SHA are not supported/);
    });

    it('should surface the real cause when refs cannot be listed', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x/src');

      execFileSync.mockImplementation(() => {
        const error = new Error('Command failed');
        error.stderr = Buffer.from('fatal: Authentication failed for https://github.com/\n');
        throw error;
      });

      await expect(handler.resolveRef()).rejects.toThrow('Access denied');
    });

    it('should stay retryable after a failed lookup', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x/src');

      execFileSync.mockImplementationOnce(() => {
        throw new Error('network down');
      });
      await expect(handler.resolveRef()).rejects.toThrow();

      mockGit({ refs: ['refs/heads/feature/x'] });
      await handler.resolveRef();

      expect(handler.branch).toBe('feature/x');
    });
  });

  describe('getFiles', () => {
    it('should clone repository if not cached', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo');
      mockGit({ head: 'main' });

      const targetPath = await handler.getFiles();

      expect(gitCall('clone')).toBeDefined();
      expect(targetPath).toBe(handler.repoDir);
    });

    it('should clone the resolved slashed branch', async () => {
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/feature/render-trust-signature-removal',
      );
      mockGit({ refs: ['refs/heads/feature/render-trust-signature-removal'] });

      await handler.getFiles();

      const args = gitCall('clone')[1];
      expect(valueAfter(args, '--branch')).toBe('feature/render-trust-signature-removal');
    });

    it('should reuse the cache for a bare URL instead of recloning', async () => {
      mockGit({ head: 'main' });

      await new GitHubUrlHandler('https://github.com/user/repo').getFiles();
      expect(gitSubcommands()).toContain('clone');

      execFileSync.mockClear();
      await new GitHubUrlHandler('https://github.com/user/repo').getFiles();

      expect(gitSubcommands()).not.toContain('clone');
      expect(gitCall('fetch')).toBeDefined();
    });

    it('should update rather than reclone a cached slashed branch', async () => {
      mockGit({ refs: ['refs/heads/feature/x'] });

      await new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x').getFiles();

      execFileSync.mockClear();
      mockGit({ refs: ['refs/heads/feature/x'] });
      await new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x').getFiles();

      expect(gitSubcommands()).not.toContain('clone');
    });

    it('should reject a traversing subpath before touching the network', async () => {
      // The dots are encoded so that URL normalization cannot collapse them
      const handler = new GitHubUrlHandler(
        'https://github.com/user/repo/tree/main/%2e%2e%2f%2e%2e%2fetc',
      );
      mockGit({ refs: ['refs/heads/main'] });

      await expect(handler.getFiles()).rejects.toThrow('resolves outside the repository');
      expect(gitSubcommands()).not.toContain('clone');
    });

    it('should reject a subpath that is a symlink out of the repository', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/docs');
      mockGit({ refs: ['refs/heads/main'], contents: ['docs'] });

      fs.realpathSync.mockImplementation((p) => (String(p).endsWith('docs') ? '/etc' : String(p)));

      await expect(handler.getFiles()).rejects.toThrow('resolves outside the repository');
    });

    it('should accept a directory whose name begins with dots', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/..draft');
      mockGit({ refs: ['refs/heads/main'], contents: ['..draft'] });

      const targetPath = await handler.getFiles();

      expect(targetPath).toBe(path.join(handler.repoDir, '..draft'));
    });

    it('should report a missing subpath', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/nope');
      mockGit({ refs: ['refs/heads/main'] });
      // Clone creates only the repo root, not the requested subdirectory
      fs.existsSync.mockImplementation(
        (p) => existing.has(String(p)) && !String(p).endsWith('nope'),
      );

      await expect(handler.getFiles()).rejects.toThrow("Path 'nope' not found in repository");
    });

    it('should never route git through a shell', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main;touch pwned');
      mockGit();

      await handler.getFiles();

      const [file, args, options] = gitCall('clone');
      expect(file).toBe('git');
      expect(valueAfter(args, '--branch')).toBe('main;touch pwned');
      expect(options.shell).toBeFalsy();
      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('updateRepository', () => {
    it('should reset a branch onto the fetched remote ref', async () => {
      mockGit({ refs: ['refs/heads/feature/x'] });
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/feature/x');
      await handler.getFiles();

      execFileSync.mockClear();
      mockGit({ refs: ['refs/heads/feature/x'] });
      await handler.getFiles();

      expect(gitCall('fetch')[1]).toEqual([
        'fetch',
        '--force',
        'origin',
        '+refs/heads/feature/x:refs/remotes/origin/feature/x',
      ]);
      expect(gitCall('reset')[1]).toEqual(['reset', '--hard', 'refs/remotes/origin/feature/x']);
    });

    it('should fetch a tag through refs/tags', async () => {
      mockGit({ refs: ['refs/tags/v1.0'] });
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/v1.0');
      handler.refKind = 'tag';
      existing.add(handler.repoDir);
      existing.add(path.join(handler.repoDir, '.git'));

      await handler.getFiles();

      expect(gitCall('fetch')[1]).toContain('+refs/tags/v1.0:refs/tags/v1.0');
      expect(gitCall('reset')[1]).toContain('refs/tags/v1.0');
      expect(gitSubcommands()).not.toContain('clone');
    });

    it('should reclone when the update fails', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main');
      existing.add(handler.repoDir);
      existing.add(path.join(handler.repoDir, '.git'));

      execFileSync.mockImplementation((file, args) => {
        if (args[0] === 'fetch') throw new Error('corrupt');
        if (args[0] === 'clone') {
          existing.add(args[args.length - 1]);
        }
        return '';
      });

      await handler.getFiles();

      expect(gitCall('clone')).toBeDefined();
    });
  });

  describe('clone error reporting', () => {
    let handler;

    beforeEach(() => {
      handler = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');
    });

    const failClone = (stderr) => {
      execFileSync.mockImplementation(() => {
        const error = new Error('Command failed: git clone');
        if (stderr !== undefined) error.stderr = Buffer.from(stderr);
        throw error;
      });
    };

    it('should report a missing branch as a branch error', async () => {
      failClone('fatal: Remote branch develop not found in upstream origin\n');

      await expect(handler.getFiles()).rejects.toThrow(
        "Branch 'develop' not found in https://github.com/user/repo.git",
      );
    });

    it('should report a missing repository as not found or inaccessible', async () => {
      failClone("remote: Repository not found.\nfatal: repository 'x' not found\n");

      await expect(handler.getFiles()).rejects.toThrow('Repository not found or not accessible');
    });

    it('should report authentication failures', async () => {
      failClone('fatal: Authentication failed for https://github.com/user/repo.git\n');

      await expect(handler.getFiles()).rejects.toThrow('Access denied');
    });

    it('should classify an SSH permission failure as access denied', async () => {
      failClone('git@github.com: Permission denied (publickey).\n');

      await expect(handler.getFiles()).rejects.toThrow('Access denied');
    });

    it('should survive an error carrying no stderr', async () => {
      failClone(undefined);

      await expect(handler.getFiles()).rejects.toThrow('Failed to reach repository');
    });
  });

  describe('detectDefaultBranch', () => {
    let handler;

    beforeEach(() => {
      handler = new GitHubUrlHandler('https://github.com/user/repo');
    });

    it('should detect default branch from remote', async () => {
      execFileSync.mockReturnValue('ref: refs/heads/main\tHEAD\n');

      const branch = await handler.detectDefaultBranch();
      expect(branch).toBe('main');
    });

    it('should fallback to main on error', async () => {
      execFileSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const branch = await handler.detectDefaultBranch();
      expect(branch).toBe('main');
    });
  });

  describe('cache management', () => {
    it('should generate consistent cache keys', () => {
      const handler1 = new GitHubUrlHandler('https://github.com/user/repo');
      const handler2 = new GitHubUrlHandler('https://github.com/user/repo');

      expect(handler1.cacheKey).toBe(handler2.cacheKey);
    });

    it('should generate different cache keys for different branches', () => {
      const handler1 = new GitHubUrlHandler('https://github.com/user/repo/tree/main');
      const handler2 = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');

      expect(handler1.cacheKey).not.toBe(handler2.cacheKey);
    });

    it('should not collide across repositories whose names embed .git', () => {
      const handler1 = new GitHubUrlHandler('https://github.com/o/a.gitbc');
      const handler2 = new GitHubUrlHandler('https://github.com/o/ab.gitc');

      expect(handler1.cacheKey).not.toBe(handler2.cacheKey);
    });

    it('should clear cache when requested', async () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo');
      existing.add(handler.repoDir);

      await handler.clearCache();

      expect(fs.removeSync).toHaveBeenCalledWith(handler.repoDir);
    });
  });
});
