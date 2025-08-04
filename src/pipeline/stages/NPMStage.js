const Stage = require('../Stage');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../../utils/logger');

/**
 * NPM stage - Include NPM package instruction files from node_modules directory
 */
class NPMStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.instructionFileName = options.instructionFileName || '.copytree';
    this.enabled = options.enabled !== false;
  }

  /**
   * Process files and add NPM package instructions
   */
  async process(input) {
    const { files } = input;
    
    if (!this.enabled) {
      this.log('NPM stage disabled', 'debug');
      return input;
    }
    
    // Find package.json in the files
    const packageJson = files.find((f) => f.name === 'package.json' && f.relativePath === 'package.json');
    
    if (!packageJson) {
      this.log('No package.json found, skipping NPM stage', 'debug');
      return input;
    }
    
    const startTime = Date.now();
    const instructionFiles = [];
    
    try {
      // Parse package.json
      const packageData = JSON.parse(packageJson.content);
      const packages = this.extractPackages(packageData);
      
      this.log(`Found ${packages.length} NPM packages`, 'info');
      
      // Look for instruction files in node_modules directory
      for (const packageName of packages) {
        const instructionPath = path.join('node_modules', packageName, this.instructionFileName);
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
              isNpmInstruction: true,
              package: packageName,
              type: 'text',
            });
            
            logger.debug('Found NPM package instruction file', {
              package: packageName,
              path: instructionPath,
            });
          } catch (error) {
            logger.warn('Failed to read NPM instruction file', {
              package: packageName,
              path: instructionPath,
              error: error.message,
            });
          }
        }
      }
      
      // Also check for scoped packages
      const nodeModulesPath = path.join(input.basePath || process.cwd(), 'node_modules');
      if (await fs.pathExists(nodeModulesPath)) {
        const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith('@')) {
            // This is a scope directory
            const scopePath = path.join(nodeModulesPath, entry.name);
            const scopedPackages = await fs.readdir(scopePath);
            
            for (const scopedPackage of scopedPackages) {
              const fullPackageName = `${entry.name}/${scopedPackage}`;
              if (packages.includes(fullPackageName)) {
                const instructionPath = path.join('node_modules', fullPackageName, this.instructionFileName);
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
                      isNpmInstruction: true,
                      package: fullPackageName,
                      type: 'text',
                    });
                    
                    logger.debug('Found scoped NPM package instruction file', {
                      package: fullPackageName,
                      path: instructionPath,
                    });
                  } catch (error) {
                    logger.warn('Failed to read scoped NPM instruction file', {
                      package: fullPackageName,
                      path: instructionPath,
                      error: error.message,
                    });
                  }
                }
              }
            }
          }
        }
      }
      
      const elapsed = this.getElapsedTime(startTime);
      
      if (instructionFiles.length > 0) {
        this.log(`Added ${instructionFiles.length} NPM instruction file(s) in ${elapsed}`, 'info');
      } else {
        this.log(`No NPM instruction files found in ${elapsed}`, 'debug');
      }
      
    } catch (error) {
      logger.error('Failed to process package.json', {
        error: error.message,
      });
      // Don't fail the pipeline for NPM errors
    }
    
    return {
      ...input,
      files: [...files, ...instructionFiles],
    };
  }

  /**
   * Extract package names from package.json data
   */
  extractPackages(packageData) {
    const packages = [];
    
    // Get packages from dependencies
    if (packageData.dependencies && typeof packageData.dependencies === 'object') {
      Object.keys(packageData.dependencies).forEach((packageName) => {
        packages.push(packageName);
      });
    }
    
    // Get packages from devDependencies
    if (packageData.devDependencies && typeof packageData.devDependencies === 'object') {
      Object.keys(packageData.devDependencies).forEach((packageName) => {
        if (!packages.includes(packageName)) {
          packages.push(packageName);
        }
      });
    }
    
    // Get packages from peerDependencies
    if (packageData.peerDependencies && typeof packageData.peerDependencies === 'object') {
      Object.keys(packageData.peerDependencies).forEach((packageName) => {
        if (!packages.includes(packageName)) {
          packages.push(packageName);
        }
      });
    }
    
    // Get packages from optionalDependencies
    if (packageData.optionalDependencies && typeof packageData.optionalDependencies === 'object') {
      Object.keys(packageData.optionalDependencies).forEach((packageName) => {
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

module.exports = NPMStage;