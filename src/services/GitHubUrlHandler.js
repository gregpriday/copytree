import { execFileSync } from 'child_process';
import crypto from 'crypto';
import { URL } from 'url';
import path from 'path';
import fs from '../utils/fsx.js';
import os from 'os';
import { logger } from '../utils/logger.js';
import { CommandError } from '../utils/errors.js';

/**
 * Handles GitHub URLs by cloning/updating repositories and managing cache
 */
class GitHubUrlHandler {
  constructor(url) {
    this.url = url;
    this.parseUrl();
    this.setupCacheDirectory();
  }

  /**
   * Check if URL is a GitHub URL
   */
  static isGitHubUrl(url) {
    return url.startsWith('https://github.com/');
  }

  /**
   * Run a git command. Arguments are passed as an array so that values taken
   * from the URL (branch names in particular) never reach a shell.
   */
  runGit(args, options = {}) {
    return execFileSync('git', args, {
      stdio: 'pipe',
      encoding: 'utf8',
      // A repository with many refs can exceed the 1MB default and fail as ENOBUFS
      maxBuffer: 64 * 1024 * 1024,
      ...options,
      env: {
        ...process.env,
        // Fail fast instead of blocking on a credential prompt for a private repo
        GIT_TERMINAL_PROMPT: '0',
        ...options.env,
      },
    });
  }

  /**
   * Parse GitHub URL to extract repository, branch, and subpath.
   *
   * Everything after `/tree/` is kept intact as `treePath`, because the split
   * between branch and subpath is ambiguous: `tree/a/b/c` may be branch `a`
   * with path `b/c`, or branch `a/b/c`. The provisional split below assumes a
   * single-segment branch; `resolveRef()` corrects it against the real refs.
   */
  parseUrl() {
    let parsed;
    try {
      parsed = new URL(this.url);
    } catch {
      throw new CommandError('Invalid GitHub URL format', 'github-url');
    }

    if (parsed.origin !== 'https://github.com') {
      throw new CommandError('Invalid GitHub URL format', 'github-url');
    }

    // `?plain=1` and `#L10` come along when a URL is copied from the browser,
    // and belong to neither the ref nor the path
    let pathname;
    try {
      pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/, '');
    } catch {
      throw new CommandError('Invalid GitHub URL format', 'github-url');
    }

    // A /blob/ URL names a single file, and CopyTree copies directories
    if (/^\/[^/]+\/[^/]+\/blob\//.test(pathname)) {
      throw new CommandError(
        'GitHub /blob/ URLs point at a single file. Use the /tree/ URL of a directory instead.',
        'github-url',
      );
    }

    const matches = pathname.match(/^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+))?$/);

    if (!matches) {
      throw new CommandError('Invalid GitHub URL format', 'github-url');
    }

    this.owner = matches[1];
    this.repo = matches[2];
    this.repoUrl = `https://github.com/${this.owner}/${this.repo}.git`;
    this.treePath = matches[3] || '';

    const [firstSegment, ...rest] = this.treePath.split('/');
    this.branch = firstSegment;
    this.subPath = rest.join('/');
    this.refKind = 'head';

    // A bare URL needs its default branch, and a multi-segment tree path needs
    // its branch/subpath boundary. Both decide the cache key, so both are
    // resolved before the cache is consulted.
    this.refResolved = Boolean(this.treePath) && !this.treePath.includes('/');

    this.updateCacheKey();
  }

  /**
   * Resolve the branch/subpath split against the repository's actual refs.
   *
   * Picks the longest ref that prefixes the tree path, which is how GitHub
   * itself disambiguates. Falls back to the provisional split when the refs
   * cannot be listed (offline, private repo) so the clone can report the real
   * failure instead of this one.
   */
  async resolveRef() {
    if (this.refResolved) {
      return;
    }

    // A bare repository URL follows the remote's HEAD
    if (!this.treePath) {
      this.branch = await this.detectDefaultBranch();
      this.refKind = 'head';
      this.applyRef();
      this.refResolved = true;
      return;
    }

    const refs = this.listRemoteRefs();

    const candidates = refs.filter(
      (ref) => this.treePath === ref.name || this.treePath.startsWith(`${ref.name}/`),
    );

    if (candidates.length === 0) {
      // The listing was authoritative, so the provisional guess is known to be
      // wrong. Cloning it anyway would either fail confusingly or, worse,
      // succeed against a branch the user did not ask for.
      const looksLikeSha = /^[0-9a-f]{7,40}$/i.test(this.treePath.split('/')[0]);
      throw new CommandError(
        looksLikeSha
          ? `No branch or tag matches '${this.treePath}' in ${this.repoUrl}. ` +
              'URLs that pin a commit SHA are not supported; use a branch or tag URL.'
          : `No branch or tag matches '${this.treePath}' in ${this.repoUrl}`,
        'github-ref-not-found',
      );
    }

    // Longest ref wins; a branch beats a tag of the same name.
    candidates.sort(
      (a, b) =>
        b.name.length - a.name.length || Number(b.kind === 'head') - Number(a.kind === 'head'),
    );
    const best = candidates[0];

    this.branch = best.name;
    this.refKind = best.kind;
    this.subPath = this.treePath.slice(best.name.length).replace(/^\//, '');

    logger.debug('Resolved GitHub ref', {
      branch: this.branch,
      refKind: this.refKind,
      subPath: this.subPath,
    });

    this.applyRef();
    this.refResolved = true;
  }

  /**
   * List the remote's branches and tags.
   *
   * `--refs` suppresses the peeled `^{}` entries that annotated tags would
   * otherwise add.
   */
  listRemoteRefs() {
    let output;
    try {
      output = this.runGit(['ls-remote', '--refs', '--heads', '--tags', this.repoUrl]);
    } catch (error) {
      throw this.describeCloneError(error);
    }

    const refs = [];
    for (const line of output.split('\n')) {
      const match = line.trimEnd().match(/\srefs\/(heads|tags)\/(.+)$/);
      if (match) {
        refs.push({ name: match[2], kind: match[1] === 'heads' ? 'head' : 'tag' });
      }
    }
    return refs;
  }

  /**
   * Throw unless `candidate` sits inside `root`.
   *
   * Compares path segments, not the raw string: a directory legitimately named
   * `..draft` starts with `..` without escaping anything.
   */
  assertContained(candidate, root) {
    const relative = path.relative(root, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new CommandError(
        `Path '${this.subPath}' resolves outside the repository`,
        'github-path',
      );
    }
  }

  /**
   * Re-derive the cache location after the ref changes
   */
  applyRef() {
    this.updateCacheKey();
    this.repoDir = path.join(this.cacheDir, this.cacheKey);
  }

  /**
   * Update cache key based on repository and branch
   */
  updateCacheKey() {
    // Hashed over separated components: joining with '/' would let a repository
    // named `a/b` collide with owner `a`, repo `b`. A branch and a tag of the
    // same name share an entry deliberately — the update path resets the clone
    // to whichever ref was asked for.
    this.cacheKey = crypto
      .createHash('md5')
      .update([this.owner, this.repo, this.branch].join('\0'))
      .digest('hex');
  }

  /**
   * Set up cache directory for cloned repositories
   */
  setupCacheDirectory() {
    this.cacheDir = path.join(os.homedir(), '.copytree', 'repos');
    try {
      fs.ensureDirSync(this.cacheDir);
    } catch (error) {
      throw new CommandError(
        `Failed to create repository cache directory at ${this.cacheDir}: ${error.message}. ` +
          'Ensure HOME is writable or set a custom cache path via configuration.',
        'GitHubUrlHandler',
        { originalError: error },
      );
    }
    this.repoDir = path.join(this.cacheDir, this.cacheKey);
  }

  /**
   * Get files from GitHub repository
   */
  async getFiles() {
    try {
      // Resolve branch vs subpath before anything depends on the cache key
      await this.resolveRef();

      // Reject a traversing subpath before doing any network or disk work
      this.assertContained(
        this.subPath ? path.join(this.repoDir, this.subPath) : this.repoDir,
        this.repoDir,
      );

      // Check if repository already exists with .git folder
      if (fs.existsSync(this.repoDir) && fs.existsSync(path.join(this.repoDir, '.git'))) {
        await this.updateRepository();
      } else {
        // Clean up any partial directory if it exists without .git
        if (fs.existsSync(this.repoDir)) {
          logger.warn('Found incomplete repository cache, removing...', {
            cacheDir: this.repoDir,
          });
          fs.rmSync(this.repoDir, { recursive: true, force: true });
        }
        await this.cloneRepository();
      }

      const targetPath = this.subPath ? path.join(this.repoDir, this.subPath) : this.repoDir;

      if (!fs.existsSync(targetPath)) {
        throw new CommandError(`Path '${this.subPath}' not found in repository`, 'github-path');
      }

      // Re-check against the resolved paths: a repository is free to commit a
      // symlink, and discovery treats a symlinked root's target as its root,
      // so a lexical check alone would let `docs -> /etc` relocate the scan.
      this.assertContained(fs.realpathSync(targetPath), fs.realpathSync(this.repoDir));

      return targetPath;
    } catch (error) {
      logger.error('Failed to get files from GitHub', {
        url: this.url,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clone repository from GitHub
   */
  async cloneRepository() {
    // Clean up existing directory if it exists
    if (fs.existsSync(this.repoDir)) {
      logger.warn('Repository cache already exists, removing...', {
        cacheDir: this.repoDir,
      });
      fs.rmSync(this.repoDir, { recursive: true, force: true });
    }

    try {
      logger.info('Cloning repository', {
        repo: this.repoUrl,
        branch: this.branch,
      });

      this.runGit([
        'clone',
        '--branch',
        this.branch,
        '--single-branch',
        this.repoUrl,
        this.repoDir,
      ]);

      logger.info('Repository cloned successfully', {
        repo: this.repoUrl,
        cacheDir: this.repoDir,
      });
    } catch (error) {
      throw this.describeCloneError(error);
    }
  }

  /**
   * Turn a git clone failure into a specific CommandError.
   *
   * Git reports a missing branch and a missing repository with messages that
   * both contain "not found", so the distinction has to be made deliberately.
   */
  describeCloneError(error) {
    const details = [error.message, error.stderr?.toString(), error.stdout?.toString()]
      .filter(Boolean)
      .join('\n');

    if (
      /Authentication failed|could not read Username|could not read Password|terminal prompts disabled|Permission denied \(publickey\)|HTTP 40[13]/i.test(
        details,
      )
    ) {
      return new CommandError(
        `Access denied for ${this.repoUrl}. It may be private, or your credentials may be missing.`,
        'github-auth',
      );
    }

    if (/Remote branch .* not found|Could not find remote branch/i.test(details)) {
      return new CommandError(
        `Branch '${this.branch}' not found in ${this.repoUrl}`,
        'github-branch-not-found',
      );
    }

    // GitHub returns "not found" for a private repository you cannot see, so
    // this genuinely cannot distinguish absent from inaccessible
    if (/repository .* not found|Repository not found/i.test(details)) {
      return new CommandError(
        `Repository not found or not accessible: ${this.repoUrl}`,
        'github-not-found',
      );
    }

    return new CommandError(`Failed to reach repository: ${details}`, 'github-clone');
  }

  /**
   * Update existing repository.
   *
   * Fetches the requested ref and resets the cache onto it, rather than
   * counting commits behind and pulling. A pull cannot represent a force-push
   * that moved the branch backwards: the cache would be strictly ahead of the
   * remote, report itself up to date, and serve content GitHub no longer has.
   */
  async updateRepository() {
    try {
      logger.info('Updating repository', {
        repo: this.repoUrl,
        cacheDir: this.repoDir,
      });

      const isTag = this.isCachedAsTag();
      const refspec = isTag
        ? `+refs/tags/${this.branch}:refs/tags/${this.branch}`
        : `+refs/heads/${this.branch}:refs/remotes/origin/${this.branch}`;
      const localRef = isTag ? `refs/tags/${this.branch}` : `refs/remotes/origin/${this.branch}`;

      this.runGit(['fetch', '--force', 'origin', refspec], { cwd: this.repoDir });
      this.runGit(['reset', '--hard', localRef], { cwd: this.repoDir });
      this.runGit(['clean', '-fd'], { cwd: this.repoDir });

      logger.info('Repository updated successfully');
    } catch (error) {
      logger.warn('Failed to update repository, re-cloning', {
        error: error.message,
      });

      // Re-clone on failure
      fs.removeSync(this.repoDir);
      await this.cloneRepository();
    }
  }

  /**
   * Whether the cached clone holds the requested ref as a tag.
   *
   * Decided from the clone rather than from `resolveRef()`, because an
   * unambiguous single-segment URL never consults the remote and so never
   * learns whether the name is a branch or a tag.
   */
  isCachedAsTag() {
    if (this.refKind === 'tag') {
      return true;
    }
    try {
      this.runGit(['rev-parse', '--verify', '--quiet', `refs/tags/${this.branch}`], {
        cwd: this.repoDir,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect default branch for repository
   */
  async detectDefaultBranch() {
    try {
      const output = this.runGit(['ls-remote', '--symref', this.repoUrl, 'HEAD']);

      const match = output.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
      const branch = match ? match[1] : 'main';

      logger.info('Detected default branch', { branch });
      return branch;
    } catch (error) {
      logger.warn('Failed to detect default branch, using "main"', {
        error: error.message,
      });
      return 'main';
    }
  }

  /**
   * Get cache information
   */
  getCacheInfo() {
    return {
      cacheKey: this.cacheKey,
      cacheDir: this.repoDir,
      exists: fs.existsSync(this.repoDir),
      repository: this.repoUrl,
      branch: this.branch,
      subPath: this.subPath,
    };
  }

  /**
   * Clear cache for this repository
   */
  async clearCache() {
    if (fs.existsSync(this.repoDir)) {
      logger.info('Clearing repository cache', { cacheDir: this.repoDir });
      fs.removeSync(this.repoDir);
    }
  }

  /**
   * Get repository statistics
   */
  async getStats() {
    if (!fs.existsSync(this.repoDir)) {
      return null;
    }

    try {
      const stats = {
        lastFetch: fs.statSync(path.join(this.repoDir, '.git', 'FETCH_HEAD')).mtime,
        size: await this.getDirectorySize(this.repoDir),
        commitCount: parseInt(
          this.runGit(['rev-list', '--count', 'HEAD'], { cwd: this.repoDir }).trim(),
        ),
        currentCommit: this.runGit(['rev-parse', 'HEAD'], { cwd: this.repoDir })
          .trim()
          .substring(0, 7),
      };

      return stats;
    } catch (error) {
      logger.warn('Failed to get repository stats', { error: error.message });
      return null;
    }
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath) {
    let size = 0;
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory() && file !== '.git') {
        size += await this.getDirectorySize(filePath);
      } else if (stat.isFile()) {
        size += stat.size;
      }
    }

    return size;
  }
}

export default GitHubUrlHandler;
