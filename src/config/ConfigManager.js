import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import _ from 'lodash';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ConfigurationError } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

class ConfigManager {
  constructor(options = {}) {
    this.config = {};
    this.configPath = path.join(__dirname, '../../config');
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

    // Load configuration asynchronously
    this.loadConfiguration().catch(console.error);
  }

  async loadConfiguration() {
    // 1. Load schema for validation
    await this.loadSchema();

    // 2. Load default configuration files
    await this.loadDefaults();

    // 3. Load user configuration overrides
    await this.loadUserConfig();

    // 4. Apply environment variable overrides
    this.applyEnvironmentOverrides();

    // 5. Validate final configuration if enabled
    if (this.validationEnabled) {
      this.validateConfig();
    }
  }

  async loadDefaults() {
    const configFiles = fs.readdirSync(this.configPath).filter((file) => file.endsWith('.js'));

    for (const file of configFiles) {
      const configName = path.basename(file, '.js');
      try {
        const configModule = await import(path.join(this.configPath, file));
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
          const moduleUrl = `file://${filePath}?t=${Date.now()}`; // Add timestamp to bypass cache
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

  applyEnvironmentOverrides() {
    // Apply environment variables using Laravel-like env() function
    this.applyEnvOverrides(this.config);
  }

  applyEnvOverrides(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.applyEnvOverrides(value, prefix ? `${prefix}_${key}` : key);
      } else {
        const envKey = `${prefix ? prefix + '_' : ''}${key}`.toUpperCase();
        const envValue = process.env[envKey];

        if (envValue !== undefined) {
          // Convert string values to appropriate types
          let parsedValue = envValue;

          if (envValue === 'true') parsedValue = true;
          else if (envValue === 'false') parsedValue = false;
          else if (envValue.match(/^\d+$/)) parsedValue = parseInt(envValue);
          else if (envValue.match(/^\d+\.\d+$/)) parsedValue = parseFloat(envValue);

          // Track environment override for provenance
          const configPath = prefix ? `${prefix}.${key}` : key;
          _.set(this.envOverrides, configPath, { envKey, value: parsedValue });

          _.set(obj, key, parsedValue);
        }
      }
    }
  }

  /**
   * Get configuration value using dot notation
   * @param {string} path - Configuration path (e.g., 'ai.providers.openai.apiKey')
   * @param {*} defaultValue - Default value if config not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = null) {
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
   * @returns {Object} All configuration
   */
  all() {
    return this.config;
  }

  /**
   * Laravel-compatible env() helper
   * @param {string} key - Environment variable key
   * @param {*} defaultValue - Default value
   * @returns {*} Environment value or default
   */
  env(key, defaultValue = null) {
    const value = process.env[key];

    if (value === undefined) {
      return defaultValue;
    }

    // Type conversion
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value.match(/^\d+$/)) return parseInt(value);
    if (value.match(/^\d+\.\d+$/)) return parseFloat(value);

    return value;
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
    // Check if value came from environment variable override
    if (_.has(this.envOverrides, path)) {
      const envOverride = _.get(this.envOverrides, path);
      return `environment:${envOverride.envKey}`;
    }

    // Check if value exists in user config
    if (this._isFromUserConfig(path, value)) {
      return 'user-config';
    }

    // Check if this value likely came from an environment variable via env() function
    const envSource = this._detectEnvSource(path, value);
    if (envSource) {
      return envSource;
    }

    // Default to default config
    return 'default';
  }

  /**
   * Detect if a config value likely came from an environment variable via env() function
   * @private
   */
  _detectEnvSource(path, value) {
    // Common environment variable patterns for this project
    const envPatterns = [
      // Direct mapping patterns
      { pattern: /^ai\.gemini\.apiKey$/, envVar: 'GEMINI_API_KEY' },
      { pattern: /^ai\.gemini\.baseUrl$/, envVar: 'GEMINI_BASE_URL' },
      { pattern: /^ai\.gemini\.timeout$/, envVar: 'GEMINI_TIMEOUT' },
      { pattern: /^ai\.gemini\.model$/, envVar: 'GEMINI_MODEL' },
      { pattern: /^ai\.defaults\.temperature$/, envVar: 'AI_DEFAULT_TEMPERATURE' },
      { pattern: /^ai\.defaults\.maxTokens$/, envVar: 'AI_DEFAULT_MAX_TOKENS' },
      { pattern: /^ai\.defaults\.topP$/, envVar: 'AI_DEFAULT_TOP_P' },
      { pattern: /^ai\.defaults\.topK$/, envVar: 'AI_DEFAULT_TOP_K' },
      { pattern: /^ai\.defaults\.stream$/, envVar: 'AI_DEFAULT_STREAM' },
      {
        pattern: /^ai\.tasks\.summarization\.temperature$/,
        envVar: 'AI_SUMMARIZATION_TEMPERATURE',
      },
      { pattern: /^ai\.tasks\.summarization\.maxTokens$/, envVar: 'AI_SUMMARIZATION_MAX_TOKENS' },
      {
        pattern: /^ai\.tasks\.classification\.temperature$/,
        envVar: 'AI_CLASSIFICATION_TEMPERATURE',
      },
      { pattern: /^ai\.tasks\.classification\.maxTokens$/, envVar: 'AI_CLASSIFICATION_MAX_TOKENS' },
      {
        pattern: /^ai\.tasks\.codeDescription\.temperature$/,
        envVar: 'AI_CODE_DESCRIPTION_TEMPERATURE',
      },
      {
        pattern: /^ai\.tasks\.codeDescription\.maxTokens$/,
        envVar: 'AI_CODE_DESCRIPTION_MAX_TOKENS',
      },
      {
        pattern: /^ai\.tasks\.imageDescription\.temperature$/,
        envVar: 'AI_IMAGE_DESCRIPTION_TEMPERATURE',
      },
      {
        pattern: /^ai\.tasks\.imageDescription\.maxTokens$/,
        envVar: 'AI_IMAGE_DESCRIPTION_MAX_TOKENS',
      },
      { pattern: /^ai\.tasks\.profileCreation\.temperature$/, envVar: 'AI_PROFILE_TEMPERATURE' },
      { pattern: /^ai\.tasks\.profileCreation\.maxTokens$/, envVar: 'AI_PROFILE_MAX_TOKENS' },
      { pattern: /^ai\.cache\.enabled$/, envVar: 'AI_CACHE_ENABLED' },
      { pattern: /^ai\.cache\.ttl$/, envVar: 'AI_CACHE_TTL' },
      { pattern: /^ai\.retry\.maxAttempts$/, envVar: 'AI_RETRY_MAX_ATTEMPTS' },
      { pattern: /^ai\.retry\.initialDelay$/, envVar: 'AI_RETRY_INITIAL_DELAY' },
      { pattern: /^ai\.retry\.maxDelay$/, envVar: 'AI_RETRY_MAX_DELAY' },
      { pattern: /^ai\.retry\.backoffMultiplier$/, envVar: 'AI_RETRY_BACKOFF' },
      { pattern: /^ai\.promptsPath$/, envVar: 'AI_PROMPTS_PATH' },
    ];

    for (const { pattern, envVar } of envPatterns) {
      if (pattern.test(path) && process.env[envVar] !== undefined) {
        // Check if the environment value matches the current value
        let envValue = process.env[envVar];

        // Type conversion (same as in env() function)
        if (envValue === 'true') envValue = true;
        else if (envValue === 'false') envValue = false;
        else if (envValue === 'null') envValue = null;
        else if (envValue.match(/^\d+$/)) envValue = parseInt(envValue);
        else if (envValue.match(/^\d+\.\d+$/)) envValue = parseFloat(envValue);

        if (_.isEqual(envValue, value)) {
          return `environment:${envVar}`;
        }
      }
    }

    return null;
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

export { ConfigManager };

export function config(options = {}) {
  if (!instance) {
    instance = new ConfigManager(options);
  } else if (options.noValidate !== undefined) {
    // Allow runtime disabling of validation
    instance.setValidationEnabled(!options.noValidate);
  }
  return instance;
}

export function env(key, defaultValue) {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance.env(key, defaultValue);
}
