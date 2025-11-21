import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import _ from 'lodash';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ConfigurationError } from '../utils/errors.js';

// Get module directory path - works in both ESM and CommonJS (Jest) contexts
// Use function to avoid top-level await and handle both ESM and CJS
const resolveEnv = () => {
  // Try ESM first - will fail in CJS/Jest environment
  try {
    // Access import.meta directly - Babel will transform this for us
    const metaUrl = import.meta.url;
    return {
      dir: path.dirname(fileURLToPath(metaUrl)),
      req: createRequire(metaUrl),
    };
  } catch {
    // Fallback to CJS globals (Jest/Node CommonJS environment)
    const fallbackDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filename);
    const fallbackReq = typeof require !== 'undefined' ? require : createRequire(__filename);
    return { dir: fallbackDir, req: fallbackReq };
  }
};

const { dir: moduleDir, req: moduleRequire } = resolveEnv();

class ConfigManager {
  constructor(options = {}) {
    this.config = {};
    this.configPath = path.join(moduleDir, '../../config');
    this.userConfigPath = path.join(os.homedir(), '.copytree');

    // Check if validation should be disabled via options or environment
    this.validationEnabled =
      !options.noValidate &&
      process.env.COPYTREE_NO_VALIDATE !== 'true' &&
      process.env.NODE_ENV !== 'test';

    // Initialize AJV validator
    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: false,
      strict: false,
      coerceTypes: true,
    });
    addFormats(this.ajv);

    this.schema = null;
    this.validate = null;
    this.schemaVersion = '1.0.0';

    // Track configuration sources for provenance
    this.configSources = {};
    this.defaultConfig = {};
    this.userConfig = {};
    this.envOverrides = {};

    // Flag to track if configuration has been loaded
    this._initialized = false;
  }

  /**
   * Static factory method to create and initialize a ConfigManager instance
   * @param {Object} options - Configuration options
   * @returns {Promise<ConfigManager>} Initialized ConfigManager instance
   */
  static async create(options = {}) {
    const instance = new ConfigManager(options);
    await instance.loadConfiguration();
    return instance;
  }

  async loadConfiguration() {
    // Prevent double initialization
    if (this._initialized) {
      return;
    }

    // If already initializing, wait for completion
    if (this._initializing) {
      return this._initPromise;
    }

    // Mark as initializing and create promise
    this._initializing = true;
    this._initPromise = this._doLoadConfiguration();

    try {
      await this._initPromise;
    } finally {
      this._initializing = false;
    }
  }

  async _doLoadConfiguration() {
    // 1. Load schema for validation
    await this.loadSchema();

    // 2. Load default configuration files
    await this.loadDefaults();

    // 3. Load user configuration overrides
    await this.loadUserConfig();

    // 4. Validate final configuration if enabled
    if (this.validationEnabled) {
      this.validateConfig();
    }

    this._initialized = true;
  }

  async loadDefaults() {
    const configFiles = fs.readdirSync(this.configPath).filter((file) => file.endsWith('.js'));

    for (const file of configFiles) {
      const configName = path.basename(file, '.js');
      try {
        const filePath = path.join(this.configPath, file);
        const moduleUrl = pathToFileURL(filePath).href;
        const configModule = await import(moduleUrl);
        const configData = configModule.default || configModule;
        this.config[configName] = configData;
        this.defaultConfig[configName] = _.cloneDeep(configData);
      } catch (error) {
        console.error(`Failed to load config ${configName}:`, error.message);
      }
    }
  }

  async loadUserConfig() {
    if (!fs.existsSync(this.userConfigPath)) {
      return;
    }

    const userConfigFiles = fs
      .readdirSync(this.userConfigPath)
      .filter((file) => file.endsWith('.js') || file.endsWith('.json'));

    for (const file of userConfigFiles) {
      const configName = path.basename(file).replace(/\.(js|json)$/, '');
      const filePath = path.join(this.userConfigPath, file);

      try {
        let userConfigData;
        if (file.endsWith('.json')) {
          userConfigData = fs.readJsonSync(filePath);
        } else {
          // Use dynamic import for ES modules
          const moduleUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`; // Add timestamp to bypass cache
          const configModule = await import(moduleUrl);
          userConfigData = configModule.default || configModule;
        }

        // Store user config for provenance tracking
        this.userConfig[configName] = _.cloneDeep(userConfigData);

        // Deep merge with existing config
        this.config[configName] = _.merge({}, this.config[configName] || {}, userConfigData);
      } catch (error) {
        console.error(`Failed to load user config ${configName}:`, error.message);
      }
    }
  }

  // Environment variable overrides have been removed for simplicity
  // Configuration is now hard-coded in config files only

  /**
   * Get configuration value using dot notation
   * @param {string} path - Configuration path (e.g., 'ai.providers.openai.apiKey')
   * @param {*} defaultValue - Default value if config not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue) {
    return _.get(this.config, path, defaultValue);
  }

  /**
   * Set configuration value at runtime
   * @param {string} path - Configuration path
   * @param {*} value - Value to set
   */
  set(path, value) {
    _.set(this.config, path, value);
  }

  /**
   * Check if configuration path exists
   * @param {string} path - Configuration path
   * @returns {boolean}
   */
  has(path) {
    return _.has(this.config, path);
  }

  /**
   * Get all configuration
   * @returns {Object} All configuration (deep copy)
   */
  all() {
    return _.cloneDeep(this.config);
  }

  /**
   * env() helper - now always returns default value (env vars no longer supported)
   * @param {string} key - Environment variable key (ignored)
   * @param {*} defaultValue - Default value
   * @returns {*} Always returns defaultValue
   */
  env(key, defaultValue = null) {
    // Environment variables are no longer supported - always return default
    return defaultValue;
  }

  /**
   * Load and compile JSON schema
   */
  async loadSchema() {
    try {
      const schemaPath = path.join(this.configPath, 'schema.json');

      if (await fs.pathExists(schemaPath)) {
        this.schema = await fs.readJson(schemaPath);

        // Create a unique schema ID to avoid conflicts
        const uniqueSchema = {
          ...this.schema,
          $id: `${this.schema.$id || 'copytree-config'}-${Date.now()}`,
        };

        this.validate = this.ajv.compile(uniqueSchema);
      } else {
        console.warn('Configuration schema not found. Validation disabled.');
        this.validationEnabled = false;
      }
    } catch (error) {
      console.warn(`Failed to load configuration schema: ${error.message}`);
      this.validationEnabled = false;
    }
  }

  /**
   * Validate configuration against schema
   */
  validateConfig() {
    if (!this.validationEnabled || !this.validate) {
      return; // Validation disabled or schema not loaded, skip validation
    }

    const isValid = this.validate(this.config);

    if (!isValid) {
      const errors = this.validate.errors
        .map((err) => {
          const path = err.instancePath || '(root)';
          const message = err.message;
          const value = err.data !== undefined ? ` (got: ${JSON.stringify(err.data)})` : '';
          return `${path}: ${message}${value}`;
        })
        .join('; ');

      throw new ConfigurationError(
        `Configuration validation failed: ${errors}`,
        'SCHEMA_VALIDATION_ERROR',
        {
          validationErrors: this.validate.errors,
          schemaVersion: this.schemaVersion,
          config: this.config,
        },
      );
    }
  }

  /**
   * Enable or disable validation
   * @param {boolean} enabled - Whether to enable validation
   */
  setValidationEnabled(enabled) {
    this.validationEnabled = enabled;
  }

  /**
   * Get validation status
   * @returns {boolean} Whether validation is enabled
   */
  isValidationEnabled() {
    return this.validationEnabled && this.validate !== null;
  }

  /**
   * Migrate configuration to newer schema version
   * @param {Object} config - Configuration to migrate
   * @param {string} fromVersion - Source schema version
   * @param {string} toVersion - Target schema version
   * @returns {Object} Migrated configuration
   */
  migrateConfig(config, fromVersion, toVersion) {
    // Schema migration logic can be added here
    // For now, just return the config unchanged
    console.log(`Config migration from ${fromVersion} to ${toVersion} not implemented yet`);
    return config;
  }

  /**
   * Get schema information
   * @returns {Object} Schema metadata
   */
  getSchemaInfo() {
    return {
      version: this.schemaVersion,
      loaded: this.schema !== null,
      validationEnabled: this.validationEnabled,
      schemaId: this.schema?.$id || null,
      title: this.schema?.title || null,
    };
  }

  /**
   * Reload configuration
   */
  async reload() {
    this.config = {};
    await this.loadConfiguration();
  }

  /**
   * Get effective configuration with provenance information
   * @param {Object} options - Options for effective config generation
   * @param {boolean} options.redact - Whether to redact sensitive values (default: true)
   * @param {string} options.section - Only return specific config section
   * @returns {Object} Configuration with provenance information
   */
  effective(options = {}) {
    const { redact = true, section = null } = options;
    const result = {};

    // Get the config to walk through
    const configToWalk = section ? this.config[section] || {} : this.config;
    const prefix = section || '';

    this._walkConfig(configToWalk, prefix, (path, value) => {
      const source = this._getConfigSource(path, value);
      const shouldRedact = redact && this._shouldRedact(path);

      result[path] = {
        value: shouldRedact ? '***' : value,
        source,
        type: typeof value,
        redacted: shouldRedact,
      };
    });

    return result;
  }

  /**
   * Walk through configuration object recursively
   * @private
   */
  _walkConfig(obj, prefix, callback) {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Handle nested objects
        this._walkConfig(value, path, callback);
      } else {
        // Call callback for leaf values
        callback(path, value);
      }
    }
  }

  /**
   * Determine the source of a configuration value
   * @private
   */
  _getConfigSource(path, value) {
    // Check if value exists in user config
    if (this._isFromUserConfig(path, value)) {
      return 'user-config';
    }

    // Default to default config
    return 'default';
  }

  /**
   * Check if a configuration value comes from user config
   * @private
   */
  _isFromUserConfig(path, value) {
    const pathParts = path.split('.');
    const configSection = pathParts[0];

    if (!this.userConfig[configSection]) {
      return false;
    }

    // Get the value from user config at this path
    const userValue = _.get(this.userConfig, path);
    return userValue !== undefined && _.isEqual(userValue, value);
  }

  /**
   * Check if a configuration path should be redacted
   * @private
   */
  _shouldRedact(path) {
    const redactKeys = ['apikey', 'password', 'secret', 'token', 'key', 'auth'];
    const lowerPath = path.toLowerCase();
    return redactKeys.some((key) => lowerPath.includes(key));
  }

  /**
   * Convert config path to environment variable key
   * @private
   */
  _pathToEnvKey(path) {
    return path.replace(/\./g, '_').toUpperCase();
  }
}

// Singleton instance
let instance = null;
let initPromise = null;

export { ConfigManager };

/**
 * Get or create the singleton ConfigManager instance
 * For synchronous usage (backward compatibility), creates instance without waiting
 * Ensures initialization happens in background for first access
 * @param {Object} options - Configuration options
 * @returns {ConfigManager} ConfigManager instance (may not be fully initialized yet)
 */
export function config(options = {}) {
  if (!instance) {
    instance = new ConfigManager(options);
    // Initialize asynchronously in background (for backward compatibility)
    // Consumers should await config().loadConfiguration() if they need to ensure initialization
    initPromise = instance.loadConfiguration().catch(console.error);
  } else if (options.noValidate !== undefined) {
    // Allow runtime disabling of validation
    instance.setValidationEnabled(!options.noValidate);
  }
  return instance;
}

/**
 * Async version of config() that ensures full initialization
 * Recommended for new code
 * @param {Object} options - Configuration options
 * @returns {Promise<ConfigManager>} Fully initialized ConfigManager instance
 */
export async function configAsync(options = {}) {
  if (!instance) {
    instance = await ConfigManager.create(options);
  } else if (options.noValidate !== undefined) {
    instance.setValidationEnabled(!options.noValidate);
  }
  return instance;
}

/**
 * Get environment variable with type conversion
 * NOTE: Environment variables are no longer supported - this always returns defaultValue
 * @param {string} key - Environment variable key (ignored)
 * @param {*} defaultValue - Default value
 * @returns {*} Always returns defaultValue
 */
export function env(key, defaultValue) {
  // Environment variables are no longer supported - always return default
  return defaultValue;
}
