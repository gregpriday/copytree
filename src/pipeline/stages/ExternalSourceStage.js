const path = require('path');
const fs = require('fs-extra');
const Stage = require('../Stage');
const GitHubUrlHandler = require('../../services/GitHubUrlHandler');
const FileLoader = require('../../utils/fileLoader');
const RulesetFilter = require('../../utils/rulesetFilter');
const { logger } = require('../../utils/logger');

/**
 * External source stage - Include files from external sources (GitHub, local paths)
 */
class ExternalSourceStage extends Stage {
  constructor(externalItems = []) {
    super();
    this.externalItems = externalItems; // Array of {source, destination, rules}
  }

  /**
   * Process external sources and merge with input files
   */
  async process(input) {
    const { files } = input;
    
    if (!this.externalItems || this.externalItems.length === 0) {
      this.log('No external sources configured', 'debug');
      return input;
    }
    
    const startTime = Date.now();
    const externalFiles = [];
    
    this.log(`Processing ${this.externalItems.length} external source(s)`, 'info');
    
    for (const item of this.externalItems) {
      try {
        const itemFiles = await this.processExternalItem(item);
        externalFiles.push(...itemFiles);
        
        this.log(`Added ${itemFiles.length} files from ${item.source}`, 'info');
      } catch (error) {
        logger.error('Failed to process external source', {
          source: item.source,
          error: error.message
        });
        
        if (!item.optional) {
          throw error;
        }
        
        this.log(`Skipping optional external source: ${item.source}`, 'warn');
      }
    }
    
    const elapsed = this.getElapsedTime(startTime);
    this.log(`External sources processed in ${elapsed}, added ${externalFiles.length} files`, 'info');
    
    // Merge external files with input files
    return {
      ...input,
      files: [...files, ...externalFiles]
    };
  }

  /**
   * Process a single external item
   */
  async processExternalItem(item) {
    const { source, destination = '', rules = [] } = item;
    
    // Validate source and destination
    if (!source) {
      throw new Error('External source must have a source property');
    }
    
    // Get source path
    let sourcePath;
    if (GitHubUrlHandler.isGitHubUrl(source)) {
      // Handle GitHub URLs
      const githubHandler = new GitHubUrlHandler(source);
      sourcePath = await githubHandler.getFiles();
      
      logger.info('Processing GitHub source', {
        url: source,
        cachePath: sourcePath
      });
    } else {
      // Handle local paths
      sourcePath = path.resolve(source);
      
      if (!await fs.pathExists(sourcePath)) {
        throw new Error(`External source path does not exist: ${sourcePath}`);
      }
    }
    
    // Load files from source
    const fileLoader = new FileLoader({
      basePath: sourcePath,
      includeHidden: false,
      followSymlinks: false
    });
    
    const sourceFiles = await fileLoader.loadFiles({
      include: ['**/*'],
      exclude: ['**/.git/**', '**/node_modules/**']
    });
    
    // Apply rules if provided
    let filteredFiles = sourceFiles;
    if (rules && rules.length > 0) {
      const filter = new RulesetFilter([], [], rules);
      filteredFiles = sourceFiles.filter(file => filter.accept(file));
    }
    
    // Remap paths with destination prefix
    const remappedFiles = filteredFiles.map(file => {
      const newPath = destination 
        ? path.join(destination, file.relativePath)
        : file.relativePath;
      
      return {
        ...file,
        relativePath: newPath,
        path: newPath,
        isExternal: true,
        externalSource: source,
        externalDestination: destination
      };
    });
    
    return remappedFiles;
  }

  /**
   * Validate configuration
   */
  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }
    
    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }
    
    // Validate external items
    for (const item of this.externalItems) {
      if (!item.source) {
        throw new Error('Each external item must have a source property');
      }
      
      if (item.destination && typeof item.destination !== 'string') {
        throw new Error('External item destination must be a string');
      }
      
      if (item.rules && !Array.isArray(item.rules)) {
        throw new Error('External item rules must be an array');
      }
    }
    
    return true;
  }
}

module.exports = ExternalSourceStage;