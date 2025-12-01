import simpleGit from 'simple-git';
import path from 'path';
import { GitError } from './errors.js';
import { logger } from './logger.js';
import { createCache } from './helpers.js';

/**
 * Git utilities for file filtering and status
 */
class GitUtils {
  constructor(basePath = process.cwd(), options = {}) {
    this.basePath = basePath;
    this.git = simpleGit({
      baseDir: basePath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: true,
    });

    this.logger = options.logger || logger.child('GitUtils');

    // Cache for git operations (5 minute TTL)
    this.cache = createCache(300000);

    this._isRepo = null;
  }

  /**
   * Check if the directory is a git repository
   * @returns {Promise<boolean>}
   */
  async isGitRepository() {
    if (this._isRepo !== null) {
      return this._isRepo;
    }

    try {
      await this.git.revparse(['--git-dir']);
      this._isRepo = true;
      return true;
    } catch (error) {
      this._isRepo = false;
      return false;
    }
  }

  /**
   * Get list of modified files (unstaged and staged)
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async getModifiedFiles() {
    const cacheKey = 'modified-files';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      if (!(await this.isGitRepository())) {
        throw new GitError('Not a git repository', 'getModifiedFiles');
      }

      // Get status
      const status = await this.git.status();

      // Combine all modified files
      const modifiedFiles = [
        ...status.modified,
        ...status.staged,
        ...status.not_added,
        ...status.created,
      ];

      // Remove duplicates and normalize paths
      const uniqueFiles = [...new Set(modifiedFiles)].map((file) => path.normalize(file));

      this.cache.set(cacheKey, uniqueFiles);
      this.logger.logDebug(`Found ${uniqueFiles.length} modified files`);

      return uniqueFiles;
    } catch (error) {
      throw new GitError(`Failed to get modified files: ${error.message}`, 'getModifiedFiles', {
        originalError: error,
      });
    }
  }

  /**
   * Get files changed between two refs (commits/branches)
   * @param {string} fromRef - Starting ref (default: HEAD)
   * @param {string} toRef - Ending ref (optional)
   * @returns {Promise<Array<string>>} Array of changed file paths
   */
  async getChangedFiles(fromRef = 'HEAD', toRef = null) {
    const cacheKey = `changed-files:${fromRef}:${toRef || 'working'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      if (!(await this.isGitRepository())) {
        throw new GitError('Not a git repository', 'getChangedFiles');
      }

      let diffSummary;

      if (toRef) {
        // Diff between two refs
        diffSummary = await this.git.diffSummary([fromRef, toRef]);
      } else {
        // Diff from ref to working directory
        diffSummary = await this.git.diffSummary([fromRef]);
      }

      const changedFiles = diffSummary.files
        .filter((file) => file.file && !file.binary)
        .map((file) => path.normalize(file.file));

      this.cache.set(cacheKey, changedFiles);
      this.logger.logDebug(
        `Found ${changedFiles.length} changed files between ${fromRef} and ${toRef || 'working directory'}`,
      );

      return changedFiles;
    } catch (error) {
      throw new GitError(`Failed to get changed files: ${error.message}`, 'getChangedFiles', {
        fromRef,
        toRef,
        originalError: error,
      });
    }
  }

  /**
   * Get git status for files
   * @param {Array<string>} files - Array of file paths
   * @returns {Promise<Object>} Map of file path to git status
   */
  async getFileStatuses(files) {
    if (!files || files.length === 0) {
      return {};
    }

    try {
      if (!(await this.isGitRepository())) {
        return {};
      }

      const status = await this.git.status();
      const statusMap = {};

      // Build status map
      const allStatuses = {
        modified: status.modified,
        staged: status.staged,
        not_added: status.not_added,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        conflicted: status.conflicted,
      };

      files.forEach((file) => {
        const normalizedPath = path.normalize(file);

        for (const [statusType, fileList] of Object.entries(allStatuses)) {
          if (fileList.includes(file) || fileList.includes(normalizedPath)) {
            statusMap[file] = statusType;
            break;
          }
        }

        // Default to 'unmodified' if not in any status list
        if (!statusMap[file]) {
          statusMap[file] = 'unmodified';
        }
      });

      return statusMap;
    } catch (error) {
      this.logger.warn(`Failed to get file statuses: ${error.message}`);
      return {};
    }
  }

  /**
   * Get current branch name
   * @returns {Promise<string>} Branch name
   */
  async getCurrentBranch() {
    const cacheKey = 'current-branch';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      if (!(await this.isGitRepository())) {
        return null;
      }

      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      this.cache.set(cacheKey, branch);

      return branch;
    } catch (error) {
      this.logger.warn(`Failed to get current branch: ${error.message}`);
      return null;
    }
  }

  /**
   * Get last commit info
   * @returns {Promise<Object>} Commit info
   */
  async getLastCommit() {
    const cacheKey = 'last-commit';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      if (!(await this.isGitRepository())) {
        return null;
      }

      const log = await this.git.log({ n: 1 });
      const commit = log.latest;

      if (commit) {
        const commitInfo = {
          hash: commit.hash,
          message: commit.message,
          author: commit.author_name,
          date: commit.date,
        };

        this.cache.set(cacheKey, commitInfo);
        return commitInfo;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get last commit: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if there are uncommitted changes
   * @returns {Promise<boolean>}
   */
  async hasUncommittedChanges() {
    try {
      if (!(await this.isGitRepository())) {
        return false;
      }

      const status = await this.git.status();
      return !status.isClean();
    } catch (error) {
      this.logger.warn(`Failed to check uncommitted changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear git cache
   */
  clearCache() {
    this.cache.clear();
    this._isRepo = null;
  }
}

export default GitUtils;
