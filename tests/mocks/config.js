// Mock config function for tests
const mockConfig = {
  copytree: {
    maxFileSize: 10 * 1024 * 1024,
    maxTotalSize: 100 * 1024 * 1024,
    defaultExclusions: ['node_modules', '.git'],
    cache: {
      enabled: false,
      ttl: 86400000,
      driver: 'file',
      prefix: 'copytree_',
      defaultTtl: 3600,
    },
  },
  log: {
    level: 'error',
    format: 'simple',
  },
  pipeline: {
    continueOnError: false,
    emitProgress: true,
  },
  app: {
    maxConcurrency: 5,
  },
  cache: {
    enabled: false,
    driver: 'file',
    prefix: 'copytree_',
    defaultTtl: 3600,
  },
};

function config() {
  return {
    get: (key, defaultValue = null) => {
      const keys = key.split('.');
      let value = mockConfig;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return defaultValue;
        }
      }

      return value;
    },
    set: (key, value) => {
      const keys = key.split('.');
      let target = mockConfig;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target)) {
          target[keys[i]] = {};
        }
        target = target[keys[i]];
      }

      target[keys[keys.length - 1]] = value;
    },
    all: () => ({ ...mockConfig }),
    has: (key) => {
      const keys = key.split('.');
      let value = mockConfig;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return false;
        }
      }

      return true;
    },
  };
}

// Also export env function
config.env = (key, defaultValue = null) => {
  return process.env[key] || defaultValue;
};

export default config;
