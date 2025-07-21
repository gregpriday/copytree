const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const joi = require('joi');
const { ProfileError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { config } = require('../config/ConfigManager');

/**
 * Profile loader and manager
 * Handles loading, validation, and merging of profiles
 */
class ProfileLoader {
  constructor(options = {}) {
    this.options = options;
    this.logger = options.logger || logger.child('ProfileLoader');
    this.config = config();
    
    // Profile directories
    this.builtInProfilesDir = path.join(__dirname, '../../profiles');
    this.userProfilesDir = path.join(
      require('os').homedir(),
      '.copytree',
      'profiles'
    );
    this.projectProfilesDir = path.join(process.cwd(), '.copytree');
    
    // Cache for loaded profiles
    this.profileCache = new Map();
  }

  /**
   * Load a profile by name or path
   * @param {string} profileNameOrPath - Profile name or path
   * @param {Object} overrides - Options to override profile settings
   * @returns {Promise<Object>} Loaded and validated profile
   */
  async load(profileNameOrPath, overrides = {}) {
    try {
      // Check cache first
      const cacheKey = `${profileNameOrPath}:${JSON.stringify(overrides)}`;
      if (this.profileCache.has(cacheKey)) {
        return this.profileCache.get(cacheKey);
      }

      // Load base profile
      let profile = await this.loadProfileFile(profileNameOrPath);
      
      // Handle profile inheritance
      if (profile.extends) {
        const parentProfile = await this.load(profile.extends);
        profile = this.mergeProfiles(parentProfile, profile);
      }

      // Apply overrides
      profile = this.mergeProfiles(profile, overrides);

      // Validate profile
      const validated = await this.validateProfile(profile);

      // Cache the result
      this.profileCache.set(cacheKey, validated);

      return validated;
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw new ProfileError(
        `Failed to load profile: ${error.message}`,
        profileNameOrPath,
        { originalError: error }
      );
    }
  }

  /**
   * Load profile file from various locations
   * @param {string} profileNameOrPath - Profile name or path
   * @returns {Promise<Object>} Raw profile data
   */
  async loadProfileFile(profileNameOrPath) {
    // If it's a path, load directly
    if (profileNameOrPath.includes('/') || profileNameOrPath.includes('\\')) {
      return await this.loadFromPath(profileNameOrPath);
    }

    // Search for profile by name
    const searchPaths = [
      // Project-specific profiles have highest priority
      path.join(this.projectProfilesDir, `${profileNameOrPath}.yml`),
      path.join(this.projectProfilesDir, `${profileNameOrPath}.yaml`),
      path.join(this.projectProfilesDir, `${profileNameOrPath}.json`),
      
      // User profiles
      path.join(this.userProfilesDir, `${profileNameOrPath}.yml`),
      path.join(this.userProfilesDir, `${profileNameOrPath}.yaml`),
      path.join(this.userProfilesDir, `${profileNameOrPath}.json`),
      
      // Built-in profiles
      path.join(this.builtInProfilesDir, `${profileNameOrPath}.yml`),
      path.join(this.builtInProfilesDir, `${profileNameOrPath}.yaml`),
      path.join(this.builtInProfilesDir, `${profileNameOrPath}.json`),
    ];

    for (const searchPath of searchPaths) {
      if (await fs.pathExists(searchPath)) {
        this.logger.debug(`Loading profile from: ${searchPath}`);
        return await this.loadFromPath(searchPath);
      }
    }

    throw new ProfileError(
      `Profile not found: ${profileNameOrPath}`,
      profileNameOrPath,
      { searchPaths }
    );
  }

  /**
   * Load profile from a specific path
   * @param {string} filePath - Profile file path
   * @returns {Promise<Object>} Profile data
   */
  async loadFromPath(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    let data;
    switch (ext) {
      case '.yml':
      case '.yaml':
        data = yaml.load(content);
        break;
      case '.json':
        data = JSON.parse(content);
        break;
      default:
        throw new ProfileError(
          `Unsupported profile format: ${ext}`,
          filePath
        );
    }

    // Add metadata
    data._source = filePath;
    data._loadedAt = new Date().toISOString();

    return data;
  }

  /**
   * Validate profile against schema
   * @param {Object} profile - Profile to validate
   * @returns {Object} Validated profile
   */
  async validateProfile(profile) {
    const schema = joi.object({
      // Basic info
      name: joi.string().required(),
      description: joi.string(),
      version: joi.string(),
      extends: joi.string(),
      
      // File selection
      include: joi.array().items(joi.string()),
      exclude: joi.array().items(joi.string()),
      filter: joi.array().items(joi.string()),
      always: joi.array().items(joi.string()),
      
      // External sources
      external: joi.array().items(
        joi.object({
          source: joi.string().required(),
          destination: joi.string(),
          rules: joi.array().items(joi.string()),
          optional: joi.boolean()
        })
      ),
      
      // Options
      options: joi.object({
        includeHidden: joi.boolean(),
        followSymlinks: joi.boolean(),
        respectGitignore: joi.boolean(),
        maxFileSize: joi.number().positive(),
        maxTotalSize: joi.number().positive(),
        maxFileCount: joi.number().positive().integer(),
        maxDepth: joi.number().positive().integer(),
      }),
      
      // Transformations
      transformers: joi.object().pattern(
        joi.string(),
        joi.alternatives().try(
          joi.boolean(),
          joi.object({
            enabled: joi.boolean(),
            options: joi.object()
          })
        )
      ),
      
      // Output
      output: joi.object({
        format: joi.string().valid('xml', 'json', 'tree', 'markdown'),
        includeMetadata: joi.boolean(),
        addLineNumbers: joi.boolean(),
        prettyPrint: joi.boolean(),
        characterLimit: joi.number().positive()
      }),
      
      // Pipeline configuration
      pipeline: joi.object({
        stages: joi.array().items(joi.string()),
        parallel: joi.boolean(),
        stopOnError: joi.boolean()
      }),
      
      // Metadata
      _source: joi.string(),
      _loadedAt: joi.string(),
      created: joi.string(),
      author: joi.string(),
      tags: joi.array().items(joi.string())
    });

    const { error, value } = schema.validate(profile, {
      allowUnknown: true,
      stripUnknown: false
    });

    if (error) {
      throw new ProfileError(
        `Profile validation failed: ${error.message}`,
        profile.name || 'unknown',
        { validationError: error.details }
      );
    }

    return value;
  }

  /**
   * Merge two profiles
   * @param {Object} base - Base profile
   * @param {Object} overlay - Profile to merge on top
   * @returns {Object} Merged profile
   */
  mergeProfiles(base, overlay) {
    const merged = { ...base };

    // Simple properties - overlay wins
    ['name', 'description', 'version', 'extends'].forEach(prop => {
      if (overlay[prop] !== undefined) {
        merged[prop] = overlay[prop];
      }
    });

    // Arrays - concatenate and deduplicate
    ['include', 'exclude', 'filter'].forEach(prop => {
      if (overlay[prop]) {
        merged[prop] = [...new Set([
          ...(base[prop] || []),
          ...(overlay[prop] || [])
        ])];
      }
    });

    // Objects - deep merge
    ['options', 'transformers', 'output'].forEach(prop => {
      if (overlay[prop]) {
        merged[prop] = {
          ...(base[prop] || {}),
          ...(overlay[prop] || {})
        };
      }
    });

    return merged;
  }

  /**
   * List all available profiles
   * @returns {Promise<Array>} List of profile info
   */
  async listAvailable() {
    const profiles = [];
    const seen = new Set();

    // Helper to add profiles from a directory
    const addProfilesFromDir = async (dir, source) => {
      if (!await fs.pathExists(dir)) return;

      const files = await fs.readdir(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.yml', '.yaml', '.json'].includes(ext)) {
          const name = path.basename(file, ext);
          
          if (!seen.has(name)) {
            seen.add(name);
            
            try {
              const filePath = path.join(dir, file);
              const profile = await this.loadFromPath(filePath);
              
              profiles.push({
                name,
                description: profile.description || 'No description',
                source,
                path: filePath,
                version: profile.version
              });
            } catch (error) {
              this.logger.warn(`Failed to load profile ${file}: ${error.message}`);
            }
          }
        }
      }
    };

    // Load from all sources
    await addProfilesFromDir(this.projectProfilesDir, 'project');
    await addProfilesFromDir(this.userProfilesDir, 'user');
    await addProfilesFromDir(this.builtInProfilesDir, 'built-in');

    return profiles;
  }

  /**
   * Create default profile
   * @static
   * @returns {Object} Default profile
   */
  static createDefault() {
    return {
      name: 'default',
      description: 'Default profile with standard settings',
      version: '1.0.0',
      
      include: ['**/*'],
      exclude: [],
      filter: [],
      
      options: {
        includeHidden: false,
        followSymlinks: false,
        respectGitignore: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxTotalSize: 100 * 1024 * 1024, // 100MB
        maxFileCount: 10000
      },
      
      transformers: {
        'file-loader': { enabled: true },
        'markdown': { enabled: true, options: { mode: 'strip' } },
        'csv': { enabled: true, options: { maxRows: 10 } },
        'binary': { enabled: true }
      },
      
      output: {
        format: 'xml',
        includeMetadata: true,
        addLineNumbers: false,
        prettyPrint: true
      }
    };
  }

  /**
   * Clear profile cache
   */
  clearCache() {
    this.profileCache.clear();
  }
}

module.exports = ProfileLoader;