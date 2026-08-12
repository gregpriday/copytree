import fs from '../utils/fsx.js';
import path from 'path';
import os from 'os';
import {
  cloneDeep,
  get as pathGet,
  has as pathHas,
  isEqual,
  merge,
  set as pathSet,
} from './objectUtils.js';
import { fileURLToPath, pathToFileURL } from 'url';
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
 * The conventional per-user configuration directory for this platform.
 *
 * Data configuration lives here. The legacy `~/.copytree` directory is still
 * read, with a warning, so nobody's setup breaks on upgrade.
 *
 * @returns {string} Absolute directory path
 */
export function defaultDataConfigPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'CopyTree');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'CopyTree');
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'copytree');
}

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
    // Data configuration, in the platform's conventional location. Preferred
    // over the legacy directory because it is data rather than executable
    // JavaScript: `~/.copytree/*.js` runs arbitrary code in the host process,
    // which is inappropriate for an embedder and unreproducible for everyone.
    this.dataConfigPath =
      options.dataConfigPath || process.env.COPYTREE_DATA_CONFIG_PATH || defaultDataConfigPath();

    // Which sources contribute, in precedence order.
    const requested = Array.isArray(options.configSources) ? options.configSources : null;
    this.enabledSources =
      requested ?? (options.userConfig === false ? ['defaults'] : [...CONFIG_SOURCES]);

    // When strict, a source that fails to load throws instead of leaving the
    // instance quietly empty. An empty config means no exclusions at all, which
    // looks like success and is not.
    this.strict = options.strict === true;

    // Where non-fatal load warnings go. Defaults to stderr; an embedder passes
    // its own sink so a desktop app is not writing to the host console.
    this.onWarning = typeof options.onWarning === 'function' ? options.onWarning : null;

    // Load status, so callers can distinguish "loaded" from "loaded nothing".
    this.defaultsLoaded = false;
    this.userConfigLoaded = false;
    this.loadErrors = [];

    // Check if validation should be disabled via options or environment
    this.validationEnabled =
      !options.noValidate &&
      process.env.COPYTREE_NO_VALIDATE !== 'true' &&
      process.env.NODE_ENV !== 'test';

    // AJV is built on demand — see `loadSchema()`. Constructing it here meant
    // every run paid for the validator, the format extensions, the schema read
    // and the schema compile, including the runs that never validate anything.
    this.ajv = null;

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
    // 1. Load default configuration files
    if (this.enabledSources.includes('defaults')) {
      await this.loadDefaults();
    }

    // 2. Load user configuration overrides
    if (this.enabledSources.includes('user')) {
      await this.loadUserConfig();
    }

    // 3. Validate the final configuration, when there is anything to validate.
    //
    // Schema validation exists to catch bad *user* input. With no user config
    // file and no environment overrides, the merged result is exactly the
    // defaults that shipped inside this package — so validating re-proves, on
    // every single invocation, something the test suite already proves once.
    // The cost is a schema read, an Ajv construction and a schema compile.
    if (this.validationEnabled && this._hasUntrustedConfig()) {
      await this.loadSchema();
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

    this._warn(`Failed to load config ${scope}: ${error.message}`);
  }

  /**
   * Emit a non-fatal configuration warning.
   *
   * Routed through an injectable sink rather than the shared logger: `logger.js`
   * imports this module, so reaching back for it here would close an import
   * cycle. An embedder that wants these in its own log passes `onWarning`.
   *
   * @param {string} message - Warning text
   * @private
   */
  _warn(message) {
    if (this.onWarning) {
      try {
        this.onWarning(message);
        return;
      } catch {
        // A broken warning sink must not take the configuration load down with it.
      }
    }
    console.error(message);
  }

  async loadDefaults() {
    let configFiles;
    try {
      // Sorted, because readdir order is filesystem-dependent and later files
      // merge over earlier ones. Unsorted, two machines could resolve the same
      // key differently.
      configFiles = fs
        .readdirSync(this.configPath)
        .filter((file) => file.endsWith('.js'))
        .sort();
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
        this.config[configName] = cloneDeep(configData);
        this.defaultConfig[configName] = cloneDeep(configData);
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
    let loaded = 0;

    // Legacy first, data configuration second, so a migrated setting wins over
    // the file it was migrated from.
    loaded += await this._loadLegacyUserConfig();
    loaded += await this._loadDataConfig();

    // Set only once something actually loaded. The directory existing says
    // nothing: an empty ~/.copytree, or one whose every file failed to parse,
    // contributed no user configuration and should not report that it did.
    this.userConfigLoaded = loaded > 0;
  }

  /**
   * Load `~/.copytree/*.{js,json}`.
   *
   * Retained for migration only. A `.js` file here is executed in the host
   * process, which is why the replacement is data and why loading one says so.
   *
   * @returns {Promise<number>} How many files contributed
   * @private
   */
  async _loadLegacyUserConfig() {
    if (!fs.existsSync(this.userConfigPath)) return 0;

    const files = fs
      .readdirSync(this.userConfigPath)
      .filter((file) => file.endsWith('.js') || file.endsWith('.json'))
      .sort();

    let loaded = 0;
    for (const file of files) {
      const configName = path.basename(file).replace(/\.(js|json)$/, '');
      const filePath = path.join(this.userConfigPath, file);

      try {
        let data;
        if (file.endsWith('.json')) {
          data = fs.readJsonSync(filePath);
        } else {
          this._warn(
            `Executable configuration is deprecated: ${filePath}. ` +
              `Run 'copytree config migrate' to convert it to a data file.`,
          );
          const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
          const configModule = await import(moduleUrl);
          data = configModule.default || configModule;
        }

        this.userConfig[configName] = cloneDeep(data);
        this.config[configName] = merge({}, this.config[configName] || {}, data);
        this.configSources[configName] = filePath;
        loaded += 1;
      } catch (error) {
        this._recordLoadError(`user:${configName}`, error);
      }
    }

    return loaded;
  }

  /**
   * Load data configuration from the platform's configuration directory.
   *
   * Accepts either one `config.yaml` carrying every section, or a file per
   * section. Both are data: no module is imported and nothing is executed.
   *
   * @returns {Promise<number>} How many files contributed
   * @private
   */
  async _loadDataConfig() {
    if (!this.dataConfigPath || !fs.existsSync(this.dataConfigPath)) return 0;

    const files = fs
      .readdirSync(this.dataConfigPath)
      .filter((file) => /\.(ya?ml|json)$/i.test(file))
      .sort();

    let loaded = 0;
    for (const file of files) {
      const filePath = path.join(this.dataConfigPath, file);
      const stem = path.basename(file).replace(/\.(ya?ml|json)$/i, '');

      try {
        let data;
        if (/\.json$/i.test(file)) {
          data = fs.readJsonSync(filePath);
        } else {
          // Loaded on demand: most runs have no data configuration at all, and
          // a YAML parser is a real import.
          const { default: yaml } = await import('js-yaml');
          data = yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('configuration file must contain a mapping');
        }

        // `config.yaml` carries sections; `copytree.yaml` is one section.
        const sections = stem === 'config' ? data : { [stem]: data };
        for (const [section, value] of Object.entries(sections)) {
          this.userConfig[section] = merge({}, this.userConfig[section] || {}, cloneDeep(value));
          this.config[section] = merge({}, this.config[section] || {}, value);
          this.configSources[section] = filePath;
        }
        loaded += 1;
      } catch (error) {
        this._recordLoadError(`data:${stem}`, error);
      }
    }

    return loaded;
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
    // Plain dotted keys, which is nearly all of them, are walked directly
    // against a cache of pre-split segments, because hot paths ask for the same
    // handful of keys once per file. Anything with brackets or a non-string path
    // goes through the general accessor, which re-parses but is rare.
    if (typeof path === 'string' && !path.includes('[')) {
      const segments = SEGMENT_CACHE.get(path) ?? cacheSegments(path);
      let current = this.config;
      for (let i = 0; i < segments.length; i++) {
        if (current === null || current === undefined) return defaultValue;
        current = current[segments[i]];
      }
      return current === undefined ? defaultValue : current;
    }

    return pathGet(this.config, path, defaultValue);
  }

  /**
   * Set configuration value at runtime
   * @param {string} path - Configuration path
   * @param {*} value - Value to set
   */
  set(path, value) {
    pathSet(this.config, path, value);
  }

  /**
   * Check if configuration path exists
   * @param {string} path - Configuration path
   * @returns {boolean}
   */
  has(path) {
    return pathHas(this.config, path);
  }

  /**
   * Get all configuration
   * @returns {Object} All configuration (deep copy)
   */
  all() {
    return cloneDeep(this.config);
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
   * Whether anything outside the packaged defaults contributed to the config.
   *
   * @returns {boolean} True when a user config file or env override was applied
   * @private
   */
  _hasUntrustedConfig() {
    return (
      this.userConfigLoaded ||
      Object.keys(this.userConfig).length > 0 ||
      Object.keys(this.envOverrides).length > 0
    );
  }

  /**
   * Load and compile the JSON schema, once.
   */
  async loadSchema() {
    if (this.validate) return;

    try {
      const schemaPath = path.join(this.configPath, 'schema.json');

      if (await fs.pathExists(schemaPath)) {
        this.schema = await fs.readJson(schemaPath);

        // Create a unique schema ID to avoid conflicts
        const uniqueSchema = {
          ...this.schema,
          $id: `${this.schema.$id || 'copytree-config'}-${Date.now()}`,
        };

        // Imported here rather than at module scope: `ajv` and `ajv-formats`
        // together are a measurable share of CLI startup, and a run with no
        // user configuration to check never reaches this point.
        const [{ default: Ajv }, { default: addFormats }] = await Promise.all([
          import('ajv'),
          import('ajv-formats'),
        ]);

        this.ajv = new Ajv({
          allErrors: true,
          removeAdditional: false,
          strict: false,
          coerceTypes: true,
        });
        addFormats(this.ajv);

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
   * Reload configuration from disk.
   *
   * Every piece of state that `loadConfiguration()` guards on or accumulates into
   * has to be reset here. Clearing `config` alone left `_initialized` true, so
   * `loadConfiguration()` returned immediately and the instance was emptied
   * rather than reloaded.
   *
   * @returns {Promise<void>} Resolves once the configuration has been re-read
   */
  async reload() {
    this.config = {};
    this.configSources = {};
    this.defaultConfig = {};
    this.userConfig = {};
    this.envOverrides = {};

    this.defaultsLoaded = false;
    this.userConfigLoaded = false;
    this.loadErrors = [];

    this.schema = null;
    this.validate = null;

    this._initialized = false;
    this._initializing = false;
    this._initPromise = null;

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
    // Name the file, not just the tier. "user-config" is not enough to go and
    // change a value, which is the only reason to ask where it came from.
    if (this._isFromUserConfig(path, value)) {
      const section = String(path).split('.')[0];
      return this.configSources[section] || 'user-config';
    }

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
    const userValue = pathGet(this.userConfig, path);
    return userValue !== undefined && isEqual(userValue, value);
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
