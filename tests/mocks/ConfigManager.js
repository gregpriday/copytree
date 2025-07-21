// Mock ConfigManager for tests
class ConfigManager {
  constructor() {
    this.config = {
      copytree: {
        maxFileSize: 10 * 1024 * 1024,
        maxTotalSize: 100 * 1024 * 1024,
        defaultExclusions: ['node_modules', '.git'],
        cache: {
          enabled: false,
          ttl: 86400000
        }
      },
      log: {
        level: 'error',
        format: 'simple'
      }
    };
  }

  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    target[keys[keys.length - 1]] = value;
  }

  all() {
    return { ...this.config };
  }
}

module.exports = new ConfigManager();