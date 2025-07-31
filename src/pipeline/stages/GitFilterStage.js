const Stage = require('../Stage');
const GitUtils = require('../../utils/GitUtils');
const path = require('path');

/**
 * Git filter stage - filters files based on git status
 */
class GitFilterStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.basePath = options.basePath || process.cwd();
    this.modified = options.modified || false;
    this.changed = options.changed || null;
    this.includeGitStatus = options.withGitStatus || false;
    
    this.gitUtils = new GitUtils(this.basePath);
  }

  async process(input) {
    // Use basePath from input if provided, otherwise fall back to constructor option
    if (input.basePath) {
      this.basePath = input.basePath;
      this.gitUtils = new GitUtils(this.basePath);
    }
    
    // Skip if no git filtering is requested
    if (!this.modified && !this.changed && !this.includeGitStatus) {
      return input;
    }

    this.log('Applying git filters', 'debug');
    const startTime = Date.now();

    try {
      // Check if we're in a git repository
      if (!await this.gitUtils.isGitRepository()) {
        this.log('Not a git repository, skipping git filters', 'warn');
        return input;
      }

      let filteredFiles = input.files;
      let gitFiles = [];

      // Get the appropriate file list based on options
      if (this.modified) {
        gitFiles = await this.gitUtils.getModifiedFiles();
        this.log(`Found ${gitFiles.length} modified files`, 'debug');
      } else if (this.changed) {
        gitFiles = await this.gitUtils.getChangedFiles(this.changed);
        this.log(`Found ${gitFiles.length} changed files since ${this.changed}`, 'debug');
      }

      // Filter files if git filtering is active
      if (this.modified || this.changed) {
        const gitFileSet = new Set(gitFiles.map(f => path.normalize(f)));
        
        filteredFiles = input.files.filter(file => {
          const normalizedPath = path.normalize(file.path);
          return gitFileSet.has(normalizedPath) || gitFileSet.has(file.path);
        });

        this.log(
          `Filtered to ${filteredFiles.length} files (from ${input.files.length}) based on git status`,
          'info'
        );
      }

      // Add git status to files if requested
      if (this.includeGitStatus) {
        const filePaths = filteredFiles.map(f => f.path);
        const statuses = await this.gitUtils.getFileStatuses(filePaths);
        
        filteredFiles = filteredFiles.map(file => ({
          ...file,
          gitStatus: statuses[file.path] || 'unknown'
        }));
      }

      // Add git metadata to result
      const gitMetadata = {
        branch: await this.gitUtils.getCurrentBranch(),
        lastCommit: await this.gitUtils.getLastCommit(),
        hasUncommittedChanges: await this.gitUtils.hasUncommittedChanges(),
        filterType: this.modified ? 'modified' : this.changed ? `changed:${this.changed}` : null
      };

      this.log(`Git filtering completed in ${this.getElapsedTime(startTime)}`, 'info');

      return {
        ...input,
        files: filteredFiles,
        gitMetadata,
        stats: {
          ...input.stats,
          gitFiltered: input.files.length - filteredFiles.length
        }
      };
    } catch (error) {
      this.log(`Git filtering error: ${error.message}`, 'error');
      
      // Continue without git filtering on error
      return input;
    }
  }
}

module.exports = GitFilterStage;