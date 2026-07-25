import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import _ from 'lodash';
import { fileURLToPath, pathToFileURL } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ConfigurationError, ERROR_CODES } from '../utils/errors.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Split dotted config paths, cached.
 *
 * The set of distinct config keys a process asks for is small and fixed, while
 * the number of lookups scales with the number of files. Bounded so a caller
 * generating keys dynamically cannot grow it without limit.
 */
const SEGMENT_CACHE = new Map();
const SEGMENT_CACHE_LIMIT = 512;

/**
 * Split and remember a dotted path.
 * @param {string} path - Dotted config path
 * @returns {string[]} Path segments
 */
function cacheSegments(path) {
  const segments = path.split('.');
  if (SEGMENT_CACHE.size < SEGMENT_CACHE_LIMIT) {
    SEGMENT_CACHE.set(path, segments);
  }
  return segments;
}

/** Configuration sources, in precedence order (later wins). */
const CONFIG_SOURCES = Object.freeze(['defaults', 'user']);

/**
 * Hierarchical configuration loader.
 *
 * Everything resolves from the package directory and the explicit `basePath`
 * passed to the API; nothing consults `process.cwd()`. An embedder whose
 * working directory is an app bundle rather than the target repository gets the
 * same configuration either way.
 *
 * **Reuse and concurrency:** a loaded instance is immutable in practice and safe
 * to share across concurrent `copy()` / `scan()` calls. Create one per process
 * (or per project), not one per call — loading parses every config file and
 * compiles the JSON schema, which is measurable startup cost. Only `set()` and
 * `reload()` mutate an instance; if you call either, do not do it while an
 * operation is in flight.
 *
 * **Hermetic mode:** pass `{ userConfig: false }` (or
 * `{ configSources: ['defaults'] }`) to skip `~/.copytree` entirely. For a CLI,
 * a user config directory is a feature. For an application embedding CopyTree,
 * it means the context an agent receives depends on a file outside the project,
 * outside the app's control, invisible in its UI, different on every machine —
 * and a `.js` file there is arbitrary code executed in the host process.
 */
class ConfigManager {
  constructor(options = {}) {
    this.config = {};
    this.configPath = path.join(moduleDir, '../../config');
    this.userConfigPath = options.userConfigPath || path.join(os.homedir(), '.copytree');

    // Which sources contribute, in precedence order.
    const requested = Array.isArray(options.configSources) ? options.configSources : null;
    this.enabledSources =
      requested ?? (options.userConfig === false ? ['defaults'] : [...CONFIG_SOURCES]);

    // When strict, a source that fails to load throws instead of leaving the
    // instance quietly empty. An empty config means no exclusions at all, which
    // looks like success and is not.
    this.strict = options.strict === true;

    // Load status, so callers can distinguish "loaded" from "loaded nothing".
    this.defaultsLoaded = false;
    this.userConfigLoaded = false;
    this.loadErrors = [];

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
   *
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.userConfig=true] - Load `~/.copytree`. Set false for a hermetic,
   *   reproducible configuration that depends only on the package defaults.
   * @param {string[]} [options.configSources] - Explicit source list, e.g. `['defaults']`.
   *   Takes precedence over `userConfig`.
   * @param {string} [options.userConfigPath] - Override the user config directory
   * @param {boolean} [options.strict=false] - Throw `ERR_CONFIG_INVALID` when a source fails
   *   to load, instead of warning and continuing with a partial configuration
   * @param {boolean} [options.noValidate=false] - Skip JSON schema validation
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
    if (this.enabledSources.includes('defaults')) {
      await this.loadDefaults();
    }

    // 3. Load user configuration overrides
    if (this.enabledSources.includes('user')) {
      await this.loadUserConfig();
    }

    // 4. Validate final configuration if enabled
    if (this.validationEnabled) {
      this.validateConfig();
    }

    this._initialized = true;
  }

  /**
   * Record a load failure, throwing in strict mode.
   * @param {string} scope - What failed to load
   * @param {Error} error - The failure
   * @private
   */
  _recordLoadError(scope, error) {
    const detail = { scope, message: error.message };
    this.loadErrors.push(detail);

    if (this.strict) {
      throw new ConfigurationError(
        `Failed to load configuration (${scope}): ${error.message}`,
        scope,
        { code: ERROR_CODES.CONFIG_INVALID, loadErrors: this.loadErrors, cause: error.message },
      );
    }

    console.error(`Failed to load config ${scope}:`, error.message);
  }

  async loadDefaults() {
    let configFiles;
    try {
      configFiles = fs.readdirSync(this.configPath).filter((file) => file.endsWith('.js'));
    } catch (error) {
      this._recordLoadError('defaults', error);
      return;
    }

    let loaded = 0;
    for (const file of configFiles) {
      const configName = path.basename(file, '.js');
      try {
        const filePath = path.join(this.configPath, file);
        const moduleUrl = pathToFileURL(filePath).href;
        const configModule = await import(moduleUrl);
        const configData = configModule.default || configModule;
        // Clone, do not alias. The ES module cache hands every ConfigManager the
        // same object, so assigning it directly made `set()` on one instance
        // mutate the defaults every other instance would go on to read — which
        // defeats the isolation that makes concurrent copy() calls safe.
        this.config[configName] = _.cloneDeep(configData);
        this.defaultConfig[configName] = _.cloneDeep(configData);
        loaded++;
      } catch (error) {
        this._recordLoadError(configName, error);
      }
    }

    // `copytree` carries every exclusion list. Without it a run silently
    // includes everything, which is the failure mode this flag exists to expose.
    this.defaultsLoaded = loaded > 0 && Boolean(this.config.copytree);
  }

  async loadUserConfig() {
    if (!fs.existsSync(this.userConfigPath)) {
      return;
    }
    this.userConfigLoaded = true;

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
        this._recordLoadError(`user:${configName}`, error);
      }
    }
  }

  /**
   * Whether the package default configuration loaded successfully.
   *
   * False means the run would proceed with no exclusion lists at all, which
   * looks like success and is not. Check this after `create()` when embedding.
   *
   * @returns {boolean} True when defaults are present
   */
  get isDefaultsLoaded() {
    return this.defaultsLoaded;
  }

  /**
   * Load failures encountered during initialization.
   * @returns {Array<{scope: string, message: string}>} Failures, empty when clean
   */
  getLoadErrors() {
    return [...this.loadErrors];
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
    // Plain dotted keys, which is nearly all of them, are walked directly.
    // `_.get` re-parses the path string on every call, and hot paths ask for the
    // same handful of keys once per file. Anything with brackets or a non-string
    // path still goes through lodash so the full accessor grammar keeps working.
    if (typeof path === 'string' && !path.includes('[')) {
      const segments = SEGMENT_CACHE.get(path) ?? cacheSegments(path);
      let current = this.config;
      for (let i = 0; i < segments.length; i++) {
        if (current === null || current === undefined) return defaultValue;
        current = current[segments[i]];
      }
      return current === undefined ? defaultValue : current;
    }

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
 *
 * @deprecated Use `ConfigManager.create()` instead for new code. The singleton
 * pattern prevents safe concurrent operations with different configurations.
 * This function will be removed in the next major version.
 *
 * For synchronous usage (backward compatibility), creates instance without waiting
 * Ensures initialization happens in background for first access
 * @param {Object} options - Configuration options
 * @returns {ConfigManager} ConfigManager instance (may not be fully initialized yet)
 */
export function config(options = {}) {
  // Deprecation warning removed to prevent CLI noise until migration is complete
  /*
  // Emit deprecation warning (only once per process)
  if (!config._deprecationWarned && process.env.NODE_ENV !== 'test') {
    config._deprecationWarned = true;
    console.warn(
      '[CopyTree] config() singleton is deprecated. Use ConfigManager.create() for concurrent operations.',
    );
  }
  */

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
 *
 * @deprecated Use `ConfigManager.create()` instead for new code. The singleton
 * pattern prevents safe concurrent operations with different configurations.
 * This function will be removed in the next major version.
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<ConfigManager>} Fully initialized ConfigManager instance
 */
export async function configAsync(options = {}) {
  // Deprecation warning removed to prevent CLI noise until migration is complete
  /*
  // Emit deprecation warning (only once per process)
  if (!configAsync._deprecationWarned && process.env.NODE_ENV !== 'test') {
    configAsync._deprecationWarned = true;
    console.warn(
      '[CopyTree] configAsync() singleton is deprecated. Use ConfigManager.create() for concurrent operations.',
    );
  }
  */

  if (!instance) {
    instance = await ConfigManager.create(options);
  } else {
    // Await any in-flight initialization
    if (initPromise) {
      await initPromise;
    }
    if (options.noValidate !== undefined) {
      instance.setValidationEnabled(!options.noValidate);
    }
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
