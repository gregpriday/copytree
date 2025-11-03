import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

// Get module directory path - works in both ESM and CommonJS (Jest) contexts
const resolveEnv = () => {
  try {
    const metaUrl = import.meta.url;
    return {
      filename: fileURLToPath(metaUrl),
      dirname: path.dirname(fileURLToPath(metaUrl)),
    };
  } catch {
    return {
      filename: typeof __filename !== 'undefined' ? __filename : '',
      dirname: typeof __dirname !== 'undefined' ? __dirname : '',
    };
  }
};

const { filename: moduleFilename, dirname: moduleDir} = resolveEnv();

/**
 * Instructions loader and manager
 * Handles loading instructions from various locations
 */
class InstructionsLoader {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
    this.logger = logger?.child ? logger.child('InstructionsLoader') : logger;

    // Instructions directories (in order of priority)
    this.userDir = path.join(os.homedir(), '.copytree/instructions');
    this.appDir = path.join(moduleDir, '..', 'templates', 'instructions');

    // Cache for loaded instructions
    this.instructionsCache = new Map();
  }

  /**
   * Load instructions by name
   * @param {string} name - Instructions name (default: 'default')
   * @returns {Promise<string>} Instructions content
   */
  async load(name = 'default') {
    try {
      // Check cache first
      const cacheKey = name;
      if (this.instructionsCache.has(cacheKey)) {
        return this.instructionsCache.get(cacheKey);
      }

      // Search for instructions file
      const userPath = path.join(this.userDir, `${name}.md`);
      const appPath = path.join(this.appDir, `${name}.md`);

      let content;
      let foundPath;

      // Check user directory first (highest priority)
      if (await fs.pathExists(userPath)) {
        content = await fs.readFile(userPath, 'utf8');
        foundPath = userPath;
        if (this.logger?.debug) {
          this.logger.debug(`Loading instructions from user directory: ${userPath}`);
        }
      }
      // Then check app directory (built-in)
      else if (await fs.pathExists(appPath)) {
        content = await fs.readFile(appPath, 'utf8');
        foundPath = appPath;
        if (this.logger?.debug) {
          this.logger.debug(`Loading instructions from app directory: ${appPath}`);
        }
      } else {
        const { InstructionsError, CopyTreeError } = await import('../utils/errors.js');
        const ErrorClass = InstructionsError || CopyTreeError;
        throw new ErrorClass(`Instructions '${name}' not found`, name, {
          searchPaths: [userPath, appPath],
          userDir: this.userDir,
          appDir: this.appDir,
        });
      }

      // Cache the result
      this.instructionsCache.set(cacheKey, content);

      if (this.logger?.debug) {
        this.logger.debug(`Successfully loaded instructions '${name}' from ${foundPath}`);
      }
      return content;
    } catch (error) {
      if (this.logger?.error) {
        this.logger.error(`Failed to load instructions '${name}':`, error.message);
      }
      throw error;
    }
  }

  /**
   * List all available instructions
   * @returns {Promise<Array>} List of available instructions names
   */
  async list() {
    const instructionsSet = new Set();

    // Helper to add instructions from a directory
    const addInstructionsFromDir = async (dir) => {
      if (!(await fs.pathExists(dir))) return;

      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (ext === '.md') {
            const name = path.basename(file, path.extname(file)).toLowerCase();
            instructionsSet.add(name);
          }
        }
      } catch (error) {
        if (this.logger?.warn) {
          this.logger.warn(`Failed to read instructions directory ${dir}: ${error.message}`);
        }
      }
    };

    // Scan both directories
    await addInstructionsFromDir(this.userDir);
    await addInstructionsFromDir(this.appDir);

    return Array.from(instructionsSet).sort();
  }

  /**
   * Check if instructions exist
   * @param {string} name - Instructions name
   * @returns {Promise<boolean>} True if instructions exist
   */
  async exists(name = 'default') {
    const userPath = path.join(this.userDir, `${name}.md`);
    const appPath = path.join(this.appDir, `${name}.md`);

    return (await fs.pathExists(userPath)) || (await fs.pathExists(appPath));
  }

  /**
   * Clear instructions cache
   */
  clearCache() {
    this.instructionsCache.clear();
    if (this.logger?.debug) {
      this.logger.debug('Instructions cache cleared');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.instructionsCache.size,
      keys: Array.from(this.instructionsCache.keys()),
    };
  }
}

export default InstructionsLoader;
