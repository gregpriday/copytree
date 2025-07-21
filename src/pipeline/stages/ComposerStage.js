const Stage = require('../Stage');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../../utils/logger');

/**
 * Composer stage - Include PHP package instruction files from vendor directory
 */
class ComposerStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.instructionFileName = options.instructionFileName || '.copytree';
    this.enabled = options.enabled !== false;
  }

  /**
   * Process files and add composer package instructions
   */
  async process(input) {
    const { files } = input;
    
    if (!this.enabled) {
      this.log('Composer stage disabled', 'debug');
      return input;
    }
    
    // Find composer.json in the files
    const composerJson = files.find(f => f.name === 'composer.json' && f.relativePath === 'composer.json');
    
    if (!composerJson) {
      this.log('No composer.json found, skipping composer stage', 'debug');
      return input;
    }
    
    const startTime = Date.now();
    const instructionFiles = [];
    
    try {
      // Parse composer.json
      const composerData = JSON.parse(composerJson.content);
      const packages = this.extractPackages(composerData);
      
      this.log(`Found ${packages.length} composer packages`, 'info');
      
      // Look for instruction files in vendor directory
      for (const packageName of packages) {
        const instructionPath = path.join('vendor', packageName, this.instructionFileName);
        const fullPath = path.join(input.basePath || process.cwd(), instructionPath);
        
        if (await fs.pathExists(fullPath)) {
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            
            instructionFiles.push({
              name: this.instructionFileName,
              relativePath: instructionPath,
              path: fullPath,
              content: content,
              stats: await fs.stat(fullPath),
              isComposerInstruction: true,
              package: packageName,
              type: 'text'
            });
            
            logger.debug('Found composer package instruction file', {
              package: packageName,
              path: instructionPath
            });
          } catch (error) {
            logger.warn('Failed to read composer instruction file', {
              package: packageName,
              path: instructionPath,
              error: error.message
            });
          }
        }
      }
      
      const elapsed = this.getElapsedTime(startTime);
      
      if (instructionFiles.length > 0) {
        this.log(`Added ${instructionFiles.length} composer instruction file(s) in ${elapsed}`, 'info');
      } else {
        this.log(`No composer instruction files found in ${elapsed}`, 'debug');
      }
      
    } catch (error) {
      logger.error('Failed to process composer.json', {
        error: error.message
      });
      // Don't fail the pipeline for composer errors
    }
    
    return {
      ...input,
      files: [...files, ...instructionFiles]
    };
  }

  /**
   * Extract package names from composer.json data
   */
  extractPackages(composerData) {
    const packages = [];
    
    // Get packages from require
    if (composerData.require && typeof composerData.require === 'object') {
      Object.keys(composerData.require).forEach(packageName => {
        // Skip PHP version and extensions
        if (!packageName.startsWith('php') && !packageName.startsWith('ext-')) {
          packages.push(packageName);
        }
      });
    }
    
    // Get packages from require-dev
    if (composerData['require-dev'] && typeof composerData['require-dev'] === 'object') {
      Object.keys(composerData['require-dev']).forEach(packageName => {
        if (!packages.includes(packageName)) {
          packages.push(packageName);
        }
      });
    }
    
    return packages;
  }

  /**
   * Validate input
   */
  validate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('Input must be an object');
    }
    
    if (!Array.isArray(input.files)) {
      throw new Error('Input must have a files array');
    }
    
    return true;
  }
}

module.exports = ComposerStage;