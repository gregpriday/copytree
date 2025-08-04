const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const _ = require('lodash');

class ConfigManager {
  constructor() {
    this.config = {};
    this.configPath = path.join(__dirname, '../../config');
    this.userConfigPath = path.join(os.homedir(), '.copytree');
    
    this.loadConfiguration();
  }

  loadConfiguration() {
    // 1. Load default configuration files
    this.loadDefaults();
    
    // 2. Load user configuration overrides
    this.loadUserConfig();
    
    // 3. Apply environment variable overrides
    this.applyEnvironmentOverrides();
  }

  loadDefaults() {
    const configFiles = fs.readdirSync(this.configPath).filter((file) => file.endsWith('.js'));
    
    for (const file of configFiles) {
      const configName = path.basename(file, '.js');
      try {
        const configModule = require(path.join(this.configPath, file));
        this.config[configName] = configModule;
      } catch (error) {
        console.error(`Failed to load config ${configName}:`, error.message);
      }
    }
  }

  loadUserConfig() {
    if (!fs.existsSync(this.userConfigPath)) {
      return;
    }

    const userConfigFiles = fs.readdirSync(this.userConfigPath)
      .filter((file) => file.endsWith('.js') || file.endsWith('.json'));
    
    for (const file of userConfigFiles) {
      const configName = path.basename(file).replace(/\.(js|json)$/, '');
      const filePath = path.join(this.userConfigPath, file);
      
      try {
        let userConfig;
        if (file.endsWith('.json')) {
          userConfig = fs.readJsonSync(filePath);
        } else {
          delete require.cache[require.resolve(filePath)];
          userConfig = require(filePath);
        }
        
        // Deep merge with existing config
        this.config[configName] = _.merge({}, this.config[configName] || {}, userConfig);
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
   * Reload configuration
   */
  reload() {
    this.config = {};
    this.loadConfiguration();
  }
}

// Singleton instance
let instance = null;

module.exports = {
  ConfigManager,
  config() {
    if (!instance) {
      instance = new ConfigManager();
    }
    return instance;
  },
  env(key, defaultValue) {
    if (!instance) {
      instance = new ConfigManager();
    }
    return instance.env(key, defaultValue);
  },
};