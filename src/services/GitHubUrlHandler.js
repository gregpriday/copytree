import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs-extra';
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
   * Parse GitHub URL to extract repository, branch, and subpath
   */
  parseUrl() {
    const pattern = /^https:\/\/github\.com\/([^/]+\/[^/]+)(?:\/tree\/([^/]+))?(?:\/(.*?))?$/;
    const matches = this.url.match(pattern);

    if (!matches) {
      throw new CommandError('Invalid GitHub URL format', 'github-url');
    }

    this.repoUrl = `https://github.com/${matches[1]}.git`;
    this.branch = matches[2] || '';
    this.subPath = matches[3] || '';
    this.updateCacheKey();
  }

  /**
   * Update cache key based on repository and branch
   */
  updateCacheKey() {
    const identifier = this.repoUrl.replace('https://github.com/', '').replace('.git', '');
    this.cacheKey = crypto
      .createHash('md5')
      .update(`${identifier}/${this.branch || 'default'}`)
      .digest('hex');
  }

  /**
   * Set up cache directory for cloned repositories
   */
  setupCacheDirectory() {
    this.cacheDir = path.join(os.homedir(), '.copytree', 'repos');
    fs.ensureDirSync(this.cacheDir);
    this.repoDir = path.join(this.cacheDir, this.cacheKey);
  }

  /**
   * Get files from GitHub repository
   */
  async getFiles() {
    try {
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
    // Detect default branch if needed
    if (!this.branch) {
      this.branch = await this.detectDefaultBranch();
      this.updateCacheKey();
      this.repoDir = path.join(this.cacheDir, this.cacheKey);
    }

    // Clean up existing directory if it exists
    if (fs.existsSync(this.repoDir)) {
      logger.warn('Repository cache already exists, removing...', {
        cacheDir: this.repoDir,
      });
      fs.rmSync(this.repoDir, { recursive: true, force: true });
    }

    const command = `git clone --branch ${this.branch} --single-branch ${this.repoUrl} ${this.repoDir}`;

    try {
      logger.info('Cloning repository', {
        repo: this.repoUrl,
        branch: this.branch,
      });

      execSync(command, { stdio: 'pipe' });

      logger.info('Repository cloned successfully', {
        repo: this.repoUrl,
        cacheDir: this.repoDir,
      });
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('Authentication failed')) {
        throw new CommandError(
          'GitHub authentication failed. Repository may be private.',
          'github-auth',
        );
      } else if (error.message.includes('not found')) {
        throw new CommandError(`Repository not found: ${this.repoUrl}`, 'github-not-found');
      } else {
        throw new CommandError(`Failed to clone repository: ${error.message}`, 'github-clone');
      }
    }
  }

  /**
   * Update existing repository
   */
  async updateRepository() {
    try {
      logger.info('Updating repository', {
        repo: this.repoUrl,
        cacheDir: this.repoDir,
      });

      // Fetch latest changes
      execSync('git fetch', { cwd: this.repoDir, stdio: 'pipe' });

      // Check if behind origin
      const behindCount = parseInt(
        execSync(`git rev-list HEAD..origin/${this.branch} --count`, {
          cwd: this.repoDir,
          encoding: 'utf8',
        }).trim(),
      );

      if (behindCount > 0) {
        logger.info(`Repository is ${behindCount} commits behind, updating...`);

        // Reset and clean to avoid conflicts
        execSync('git reset --hard HEAD', { cwd: this.repoDir, stdio: 'pipe' });
        execSync('git clean -fd', { cwd: this.repoDir, stdio: 'pipe' });

        // Pull latest changes
        execSync(`git pull origin ${this.branch}`, { cwd: this.repoDir, stdio: 'pipe' });

        logger.info('Repository updated successfully');
      } else {
        logger.info('Repository is up to date');
      }
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
   * Detect default branch for repository
   */
  async detectDefaultBranch() {
    try {
      const output = execSync(`git ls-remote --symref ${this.repoUrl} HEAD`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });

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
          execSync('git rev-list --count HEAD', {
            cwd: this.repoDir,
            encoding: 'utf8',
          }).trim(),
        ),
        currentCommit: execSync('git rev-parse HEAD', {
          cwd: this.repoDir,
          encoding: 'utf8',
        })
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
