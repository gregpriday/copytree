import { execFile } from 'child_process';
import crypto from 'crypto';
import { URL } from 'url';
import path from 'path';
import fs from '../utils/fsx.js';
import os from 'os';
import { logger } from '../utils/logger.js';
import { CommandError } from '../utils/errors.js';

/** How long any single git command may run before it is stopped. */
const GIT_TIMEOUT_MS = 120_000;

/** How long a superseded per-run worktree is kept before it is reclaimed. */
const WORKTREE_RETENTION_MS = 24 * 60 * 60_000;

/**
 * How long a lock may go un-renewed before it is treated as abandoned.
 *
 * The holder refreshes it every `LOCK_RENEW_MS`, so this is a multiple of the
 * renewal interval rather than a guess at how long a clone takes.
 */
const LOCK_STALE_MS = 60_000;

/** How often the holder refreshes its lease. */
const LOCK_RENEW_MS = 10_000;

/** How often a waiter re-checks. */
const LOCK_POLL_MS = 100;

/**
 * How long to wait for a lock before giving up.
 *
 * Longer than the stale window on purpose: a waiter must always outlive it, or
 * a lock abandoned by a crashed process can never be taken over — the waiter
 * would time out before the lock aged enough to be reclaimed.
 */
const LOCK_TIMEOUT_MS = 5 * 60_000;

/**
 * Strip credentials out of anything git says.
 *
 * A remote URL can carry a token — `https://x-access-token:ghp_…@github.com/…` —
 * and git echoes the URL back in most of its failure messages. Those messages
 * reach logs, `stats`, and whatever the embedding application does with both.
 *
 * @param {Error} error - The failure
 * @param {string} repoUrl - The remote, for context
 * @returns {Error} The same error, with credentials removed
 */
function sanitizeGitError(error, repoUrl) {
  const scrub = (text) => sanitizeUrl(text);

  error.message = scrub(error.message);
  if (error.stderr) error.stderr = scrub(error.stderr);
  if (error.stdout) error.stdout = scrub(error.stdout);
  error.repoUrl = scrub(repoUrl);
  return error;
}

/**
 * Remove anything credential-shaped from a URL before it is displayed.
 *
 * Userinfo and query parameters both carry tokens in the wild.
 *
 * @param {string} url - The URL
 * @returns {string} A URL safe to log
 */
function sanitizeUrl(url) {
  return (
    String(url ?? '')
      // Anything before an `@` is userinfo, whatever shape it takes.
      .replace(/\/\/[^/\s@]+@/g, '//***@')
      // Every query value, unconditionally.
      //
      // Not an allow-list of parameter names, and not a length or character
      // heuristic: both only protect against the shapes someone thought of,
      // and a short token under an unexpected name slips through either. A
      // GitHub URL has no query value worth preserving in a log line, so the
      // parameter *names* are kept — enough to diagnose a malformed URL — and
      // the values are always gone.
      .replace(/([?&][^=&\s]+=)[^&\s]*/g, '$1***')
  );
}

/**
 * Handles GitHub URLs by cloning/updating repositories and managing cache
 */
class GitHubUrlHandler {
  /**
   * @param {string} url - GitHub URL
   * @param {Object} [options={}] - Options
   * @param {AbortSignal} [options.signal] - Cancels clones, fetches and lock waits
   */
  constructor(url, options = {}) {
    this.url = url;
    this.signal = options.signal ?? null;
    // Set when isolation could not be established and the run is reading the
    // shared cache directly.
    this.isolated = true;
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
   * Run a git command.
   *
   * Asynchronous, and deliberately so. This was `execFileSync`, which blocks
   * the event loop for the entire duration of a clone — so an application
   * embedding CopyTree froze, progress callbacks stopped firing, and an
   * `AbortSignal` could not be observed because nothing else could run.
   *
   * Arguments are passed as an array, so values taken from the URL — branch
   * names in particular — never reach a shell.
   *
   * @param {string[]} args - Git arguments
   * @param {Object} [options={}] - Options
   * @param {string} [options.cwd] - Working directory
   * @param {AbortSignal} [options.signal] - Cancels the command
   * @param {number} [options.timeout] - Milliseconds before the child is killed
   * @returns {Promise<string>} stdout
   */
  runGit(args, options = {}) {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        args,
        {
          cwd: options.cwd,
          encoding: 'utf8',
          // A repository with many refs can exceed the 1MB default and fail as
          // ENOBUFS. Bounded rather than unbounded: a hostile or broken remote
          // must not be able to grow this process without limit.
          maxBuffer: 64 * 1024 * 1024,
          // A network operation that has stopped making progress is not going
          // to start again on its own.
          timeout: options.timeout ?? GIT_TIMEOUT_MS,
          killSignal: 'SIGTERM',
          signal: options.signal ?? this.signal ?? undefined,
          env: {
            ...process.env,
            // Fail fast instead of blocking on a credential prompt for a
            // private repo.
            GIT_TERMINAL_PROMPT: '0',
            ...options.env,
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            reject(sanitizeGitError(error, this.repoUrl));
            return;
          }
          resolve(String(stdout ?? ''));
        },
      );
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

    const refs = await this.listRemoteRefs();

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
  async listRemoteRefs() {
    let output;
    try {
      output = await this.runGit(['ls-remote', '--refs', '--heads', '--tags', this.repoUrl]);
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
   * Where cloned repositories are kept.
   *
   * A module-level answer, not an instance one, so `copytree cache` can report
   * and reclaim this without constructing a handler for a URL nobody asked
   * about.
   *
   * @returns {string} Absolute path to the repository cache root
   */
  static cacheRoot() {
    // Overridable, and deliberately so. Without this the only way to exercise
    // the cache is against the developer's own — `os.homedir()` reads the
    // password database and ignores `HOME` on macOS, so a test that thought it
    // had redirected the home directory deleted a gigabyte of real clones
    // instead. A cache that can only be tested destructively is a cache nobody
    // writes a test for.
    //
    // Resolved to an absolute path, and only honoured when it names a directory
    // of its own. `cache clear --repositories` removes everything one level
    // under this root, so a blank or bare relative value would aim that at the
    // working directory — which is, very often, the project being copied.
    const raw = process.env.COPYTREE_REPO_CACHE_PATH;
    if (raw === undefined) return path.join(os.homedir(), '.copytree', 'repos');

    // Present but unusable is an error, not a reason to quietly use the real
    // cache instead. Falling back was worse than either alternative: someone
    // who set this to protect their own clones — which is the entire reason it
    // exists — would have been silently redirected at them.
    const override = raw.trim();

    if (override === '' || !path.isAbsolute(override)) {
      throw new CommandError(
        `COPYTREE_REPO_CACHE_PATH must be an absolute path; received ${JSON.stringify(raw)}`,
        'repo-cache-path',
      );
    }

    const resolved = path.resolve(override);

    // A filesystem root or a home directory is never a cache of its own.
    if (resolved === path.parse(resolved).root || resolved === os.homedir()) {
      throw new CommandError(
        `COPYTREE_REPO_CACHE_PATH must name a directory of its own, not ${resolved}`,
        'repo-cache-path',
      );
    }

    return resolved;
  }

  /**
   * Set up cache directory for cloned repositories
   */
  setupCacheDirectory() {
    this.cacheDir = GitHubUrlHandler.cacheRoot();
    try {
      // `0700`. This holds complete checkouts of repositories that may be
      // private, under a directory that would otherwise inherit the umask —
      // and a world-readable copy of a private repository in a home directory
      // is a copy the owner does not know they made.
      fs.ensureDirSync(this.cacheDir, { mode: 0o700 });

      // `mkdir` applies a mode only when it creates the directory, and this one
      // has existed since before it was created privately. Narrowing it on the
      // way past is the only thing that fixes an already-loose cache.
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(this.cacheDir, 0o700);
        } catch {
          // A cache directory that cannot be narrowed is still usable, and
          // failing the copy over it would be a worse outcome than the loose
          // permissions it is warning about.
        }
      }
    } catch (error) {
      throw new CommandError(
        `Failed to create repository cache directory at ${this.cacheDir}: ${error.message}. ` +
          // Not "set a custom cache path via configuration": there is no such
          // key, and sending someone to look for one wastes the time the
          // remediation was supposed to save.
          'Ensure your home directory is writable.',
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

      // Everything that mutates the shared cache happens under an exclusive
      // lock, and the run then reads an immutable checkout rather than the
      // cache itself. Two concurrent runs against the same repository used to
      // `reset --hard` and `clean -fd` the very directory the other was
      // scanning, so one run's files changed underneath it mid-walk.
      const scanRoot = await this.withCacheLock(async () => {
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

        return this.checkoutImmutable();
      });

      const targetPath = this.subPath ? path.join(scanRoot, this.subPath) : scanRoot;

      if (!fs.existsSync(targetPath)) {
        throw new CommandError(`Path '${this.subPath}' not found in repository`, 'github-path');
      }

      // Re-check against the resolved paths: a repository is free to commit a
      // symlink, and discovery treats a symlinked root's target as its root,
      // so a lexical check alone would let `docs -> /etc` relocate the scan.
      this.assertContained(fs.realpathSync(targetPath), fs.realpathSync(scanRoot));

      return targetPath;
    } catch (error) {
      logger.error('Failed to get files from GitHub', {
        // Sanitised: the URL a caller supplied can carry a token in its
        // userinfo or its query string, and this goes straight to a log.
        url: sanitizeUrl(this.url),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check out the resolved commit into a directory only this run will read.
   *
   * The commit, not the ref. A branch can move between the fetch and the walk —
   * a colleague pushes, CI force-pushes — and a scan that follows the branch
   * would then describe two different trees in one document. Resolving to a SHA
   * first means the run reports what it actually read.
   *
   * A detached worktree is cheap: it shares the object store with the cached
   * clone and costs one checkout of the working tree.
   *
   * @returns {Promise<string>} The directory to scan
   */
  async checkoutImmutable() {
    const isTag = await this.isCachedAsTag();
    const ref = isTag ? `refs/tags/${this.branch}` : `refs/remotes/origin/${this.branch}`;

    let commit;
    try {
      commit = (
        await this.runGit(['rev-parse', '--verify', `${ref}^{commit}`], {
          cwd: this.repoDir,
        })
      ).trim();
    } catch {
      // A fresh `clone --single-branch` leaves HEAD on the requested ref, and
      // some remotes do not produce the remote-tracking ref this expects.
      commit = (
        await this.runGit(['rev-parse', '--verify', 'HEAD'], {
          cwd: this.repoDir,
        })
      ).trim();
    }

    this.commit = commit;

    const worktreeDir = path.join(
      this.cacheDir,
      'worktrees',
      `${this.cacheKey}-${commit.slice(0, 12)}`,
    );

    // Reuse an existing worktree for the same commit: the content is identical
    // by construction, so there is nothing to refresh.
    if (fs.existsSync(worktreeDir)) {
      // Touch it before pruning. Retention is measured from mtime, and a
      // worktree that is being reused right now is the last one that should be
      // considered abandoned — without this, a long-running scan of a reused
      // worktree can have its files deleted underneath it.
      try {
        const now = new Date();
        fs.utimesSync(worktreeDir, now, now);
      } catch {
        // Not fatal; the retention window is generous.
      }
      this.pruneOldWorktrees(worktreeDir);
      return worktreeDir;
    }

    try {
      fs.ensureDirSync(path.dirname(worktreeDir));
      await this.runGit(['worktree', 'add', '--detach', '--force', worktreeDir, commit], {
        cwd: this.repoDir,
      });
      // Trust the exit code only as far as the directory it was supposed to
      // produce. A success with nothing on disk would send the whole scan at a
      // path that does not exist.
      if (fs.existsSync(worktreeDir)) {
        this.pruneOldWorktrees(worktreeDir);
        return worktreeDir;
      }
      logger.warn(
        'Could not isolate this run; scanning the shared cache directly. ' +
          'A concurrent CopyTree run against the same repository may change these files mid-scan.',
        { worktreeDir },
      );
      this.isolated = false;
      return this.repoDir;
    } catch (error) {
      // Scanning the shared cache is what CopyTree always did, and it still
      // works for the single-run case that is the overwhelming majority. It is
      // not silent, though: without a worktree a concurrent run can reset these
      // files underneath this scan, and the person running it should know that
      // rather than discover it as a corrupted export.
      logger.warn(
        `Could not isolate this run (${error.message}); scanning the shared cache directly. ` +
          'A concurrent CopyTree run against the same repository may change these files mid-scan.',
        { repoDir: this.repoDir },
      );
      this.isolated = false;
      return this.repoDir;
    }
  }

  /**
   * Remove superseded worktrees for this repository.
   *
   * One per commit would otherwise accumulate for the lifetime of the machine —
   * every branch update leaves the previous checkout behind, and nothing else
   * reclaims them.
   *
   * Only worktrees older than the retention window are removed, and never the
   * one this run is about to read. A concurrent run may still be walking the
   * worktree it created moments ago; deleting it out from under that walk would
   * turn a tidy-up into a failed export.
   *
   * @param {string} keep - The worktree this run will use
   */
  pruneOldWorktrees(keep) {
    const root = path.join(this.cacheDir, 'worktrees');
    const cutoff = Date.now() - WORKTREE_RETENTION_MS;

    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.startsWith(`${this.cacheKey}-`)) continue;

      const candidate = path.join(root, entry);
      if (candidate === keep) continue;

      try {
        if (fs.statSync(candidate).mtimeMs > cutoff) continue;
        fs.rmSync(candidate, { recursive: true, force: true });
      } catch {
        // A worktree we cannot inspect or remove simply stays.
      }
    }

    // Let git forget the administrative entries for what we just deleted.
    void this.runGit(['worktree', 'prune'], { cwd: this.repoDir }).catch(() => {});
  }

  /**
   * Run `fn` with exclusive access to this repository's cache entry.
   *
   * `mkdir` is atomic on every filesystem CopyTree supports, which makes it a
   * usable mutex without a dependency.
   *
   * Two details make it safe rather than merely present:
   *
   * **Ownership.** The lock directory holds a token written by whoever created
   * it, and release only removes a lock still carrying that token. Without
   * this, a run whose lock had been declared stale and replaced would delete
   * the *new* owner's lock on its way out, and two runs would mutate the same
   * clone believing they held it.
   *
   * **A lease, not a deadline.** The token file's mtime is refreshed while the
   * critical section runs, so a slow clone is not mistaken for a dead process.
   * Staleness then means what it should — nobody is alive to renew it.
   *
   * @param {Function} fn - The critical section
   * @returns {Promise<*>} Whatever `fn` returns
   */
  async withCacheLock(fn) {
    const lockDir = `${this.repoDir}.lock`;
    const tokenFile = path.join(lockDir, 'owner');
    const token = `${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;

    /**
     * Whether the lock on disk is still ours.
     * @returns {boolean} True when the token matches
     */
    const stillOurs = () => {
      try {
        return fs.readFileSync(tokenFile, 'utf8') === token;
      } catch {
        return false;
      }
    };

    for (;;) {
      try {
        fs.mkdirSync(lockDir);
        fs.writeFileSync(tokenFile, token, { mode: 0o600 });
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;

        this.signal?.throwIfAborted();

        let age;
        try {
          age = Date.now() - fs.statSync(tokenFile).mtimeMs;
        } catch {
          // No token yet, or released while we looked. Fall back to the
          // directory itself, and retry.
          try {
            age = Date.now() - fs.statSync(lockDir).mtimeMs;
          } catch {
            continue;
          }
        }

        if (age > LOCK_STALE_MS) {
          // Claim the stale lock by *renaming* it, not by deleting it.
          //
          // Deleting is a race with every other waiter: two processes both see
          // the same stale lock, both delete, both create — and the second
          // delete removes the first one's freshly acquired lock, leaving two
          // runs each believing they hold it. `rename` is atomic and fails for
          // whoever arrives second, so exactly one waiter performs the takeover
          // and the rest go back to waiting.
          const claimed = `${lockDir}.stale-${crypto.randomBytes(6).toString('hex')}`;
          try {
            fs.renameSync(lockDir, claimed);
          } catch {
            // Someone else claimed or released it first.
            continue;
          }

          logger.warn('Took over a stale repository cache lock', { lockDir, ageMs: age });
          try {
            fs.rmSync(claimed, { recursive: true, force: true });
          } catch {
            // The takeover already succeeded; the leftover is cosmetic.
          }
          continue;
        }

        if (Date.now() > deadline) {
          throw new CommandError(
            `Timed out waiting for another CopyTree run to finish with ${sanitizeUrl(this.repoUrl)}`,
            'github-cache-locked',
            { suggestion: `Remove ${lockDir} if no other run is in progress` },
          );
        }

        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      }
    }

    // Renew while we work, so a slow clone is never mistaken for a dead one.
    const renew = setInterval(() => {
      try {
        if (stillOurs()) {
          const now = new Date();
          fs.utimesSync(tokenFile, now, now);
        }
      } catch {
        // Nothing useful to do; the stale window is generous.
      }
    }, LOCK_RENEW_MS);
    renew.unref?.();

    try {
      return await fn();
    } finally {
      clearInterval(renew);
      try {
        // Only if it is still ours. Removing a lock we no longer own would
        // release someone else's critical section.
        if (stillOurs()) fs.rmSync(lockDir, { recursive: true, force: true });
      } catch {
        // Losing the lock file is not worth failing a completed operation.
      }
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

      await this.runGit([
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
      // `this.branch` is empty until a ref has been resolved, and this
      // classifier runs during that resolution — so a bare repository URL
      // produced "Branch '' not found", which reads as a bug in CopyTree
      // rather than a fact about the remote.
      return new CommandError(
        this.branch
          ? `Branch '${this.branch}' not found in ${this.repoUrl}`
          : `The requested branch was not found in ${this.repoUrl}`,
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

      const isTag = await this.isCachedAsTag();
      const refspec = isTag
        ? `+refs/tags/${this.branch}:refs/tags/${this.branch}`
        : `+refs/heads/${this.branch}:refs/remotes/origin/${this.branch}`;
      const localRef = isTag ? `refs/tags/${this.branch}` : `refs/remotes/origin/${this.branch}`;

      await this.runGit(['fetch', '--force', 'origin', refspec], { cwd: this.repoDir });
      await this.runGit(['reset', '--hard', localRef], { cwd: this.repoDir });
      await this.runGit(['clean', '-fd'], { cwd: this.repoDir });

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
  async isCachedAsTag() {
    if (this.refKind === 'tag') {
      return true;
    }
    try {
      await this.runGit(['rev-parse', '--verify', '--quiet', `refs/tags/${this.branch}`], {
        cwd: this.repoDir,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask the remote which branch its HEAD points at.
   *
   * Failures are reported, not guessed past. This used to catch everything and
   * return `'main'`, which turned an authentication failure, an unreachable
   * network or a missing repository into a later, wronger error — "Branch
   * 'main' not found" — sent to someone whose actual problem was a missing
   * token. And plenty of repositories do not use `main`: for those the guess
   * failed even when everything else worked.
   *
   * A remote that answers but advertises no symbolic HEAD is a different case,
   * and a real one: an empty repository has no default branch to name. That is
   * reported as itself rather than as a network problem.
   *
   * @returns {Promise<string>} The default branch name
   * @throws {CommandError} If the remote cannot be reached or has no HEAD
   */
  async detectDefaultBranch() {
    let output;
    try {
      output = await this.runGit(['ls-remote', '--symref', this.repoUrl, 'HEAD']);
    } catch (error) {
      // Cancellation is the caller's decision, not a remote failure. Classified
      // as one it became "Failed to reach repository", which describes the
      // network rather than the Ctrl+C that caused it.
      if (error?.name === 'AbortError') throw error;
      throw this.describeCloneError(error);
    }

    const match = output.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);

    if (!match) {
      throw new CommandError(
        `${this.repoUrl} did not advertise a default branch. The repository may be empty; ` +
          `name a branch explicitly if it has one.`,
        'github-no-default-branch',
      );
    }

    logger.info('Detected default branch', { branch: match[1] });
    return match[1];
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
        commitCount: Number.parseInt(
          (await this.runGit(['rev-list', '--count', 'HEAD'], { cwd: this.repoDir })).trim(),
          10,
        ),
        currentCommit: (await this.runGit(['rev-parse', 'HEAD'], { cwd: this.repoDir }))
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
