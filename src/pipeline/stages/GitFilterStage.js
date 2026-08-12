import Stage from '../Stage.js';
import GitUtils from '../../utils/GitUtils.js';
import { GitError } from '../../utils/errors.js';
import { toPosix } from '../../utils/pathUtils.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';

/**
 * Git filter stage - filters files based on git status
 */
class GitFilterStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Selecting by Git status is a narrowing request. If it cannot be applied,
    // carrying on hands back the *whole* project — in CI, a full-repository
    // context where a diff was expected, at a size and token count nothing
    // about the run distinguishes from success. Annotating with `--git-status`
    // is different: it is polish, and its absence changes no selection.
    this.fatal = Boolean(options.modified || options.staged || options.changed);
    this.basePath = options.basePath || process.cwd();
    this.modified = options.modified || false;
    this.staged = options.staged || false;
    this.changed = options.changed || null;
    this.includeGitStatus = options.withGitStatus || options.gitStatus || false;

    this.gitUtils = new GitUtils(this.basePath);
  }

  /**
   * What the caller asked for, in their own words.
   * @returns {string} The flag that produced this stage
   */
  askedFor() {
    if (this.modified) return '--modified';
    if (this.staged) return '--staged';
    if (this.changed) return `--changed ${this.changed}`;
    return '--git-status';
  }

  /**
   * The Git selection mode, as a stable label for reports and metadata.
   * @returns {string|null} Mode label, or null when nothing is being filtered
   */
  gitModeLabel() {
    if (this.modified) return 'modified';
    if (this.staged) return 'staged';
    if (this.changed) return `changed:${this.changed}`;
    return null;
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
      this.gitUtils = new GitUtils(this.basePath);
    }

    // Skip if no git filtering is requested
    if (!this.modified && !this.staged && !this.changed && !this.includeGitStatus) {
      return input;
    }

    this.log('Applying git filters', 'debug');
    const startTime = Date.now();

    try {
      // Check if we're in a git repository
      if (!(await this.gitUtils.isGitRepository())) {
        if (this.fatal) {
          throw new GitError(
            `${this.askedFor()} needs a Git repository, and ${this.basePath} is not one`,
            'isGitRepository',
            { basePath: this.basePath },
          );
        }
        this.log('Not a git repository, skipping git status', 'warn');
        return input;
      }

      let filteredFiles = input.files;
      let gitFiles = [];

      // Get the appropriate file list based on options
      if (this.modified) {
        gitFiles = await this.gitUtils.getModifiedFiles();
        this.log(`Found ${gitFiles.length} modified files`, 'debug');
      } else if (this.staged) {
        gitFiles = await this.gitUtils.getStagedFiles();
        this.log(`Found ${gitFiles.length} staged files`, 'debug');
      } else if (this.changed) {
        gitFiles = await this.gitUtils.getChangedFiles(this.changed);
        this.log(`Found ${gitFiles.length} changed files since ${this.changed}`, 'debug');
      }

      // Filter files if git filtering is active
      if (this.modified || this.staged || this.changed) {
        const gitFileSet = new Set(gitFiles.map((f) => toPosix(f)));

        const gitLimited = input.files.filter((file) => {
          return gitFileSet.has(file.path);
        });

        // Preserve files marked as alwaysInclude even if not in git set
        const always = input.files.filter((f) => f.alwaysInclude);
        const byPath = new Map([...gitLimited, ...always].map((f) => [f.path, f]));
        filteredFiles = [...byPath.values()];

        // "Why isn't my file here?" is a fair question when --modified drops
        // hundreds of files, so the git filter accounts for its removals too.
        if (input.exclusionReport) {
          for (const file of input.files) {
            if (!byPath.has(file.path)) {
              input.exclusionReport.add({
                path: file.path,
                size: file.size || 0,
                reason: EXCLUSION_REASONS.GIT_FILTER,
                rule: this.gitModeLabel(),
              });
            }
          }
        }

        this.log(
          `Filtered to ${filteredFiles.length} files (from ${input.files.length}, ${always.length} force-included) based on git status`,
          'info',
        );
      }

      // Add git status to files if requested
      if (this.includeGitStatus) {
        const filePaths = filteredFiles.map((f) => f.path);
        const statuses = await this.gitUtils.getFileStatuses(filePaths);

        filteredFiles = filteredFiles.map((file) => ({
          ...file,
          gitStatus: statuses[file.path] || 'unknown',
        }));
      }

      // Add git metadata to result
      const gitMetadata = {
        branch: await this.gitUtils.getCurrentBranch(),
        lastCommit: await this.gitUtils.getLastCommit(),
        hasUncommittedChanges: await this.gitUtils.hasUncommittedChanges(),
        filterType: this.gitModeLabel(),
      };

      this.log(`Git filtering completed in ${this.getElapsedTime(startTime)}`, 'info');

      return {
        ...input,
        files: filteredFiles,
        gitMetadata,
        stats: {
          ...input.stats,
          gitFiltered: input.files.length - filteredFiles.length,
        },
      };
    } catch (error) {
      // A failed *selector* stops the run: see the constructor. A failed
      // annotation does not, because nothing about the selection changes.
      if (this.fatal) throw error;

      return this.degrade(
        input,
        `${this.askedFor()} could not be applied, so no git status was attached: ${error.message}`,
      );
    }
  }
}

export default GitFilterStage;
