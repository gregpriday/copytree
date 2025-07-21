// Global mocks setup
// This file sets up mocks that need to be available before any modules are loaded

// Mock ConfigManager
jest.mock('../src/config/ConfigManager', () => {
  const mockConfigData = {
    copytree: {
      maxFileSize: 10 * 1024 * 1024,
      maxTotalSize: 100 * 1024 * 1024,
      defaultExclusions: ['node_modules', '.git'],
      cache: {
        enabled: false,
        ttl: 86400000,
        driver: 'file',
        prefix: 'copytree_',
        defaultTtl: 3600
      }
    },
    log: {
      level: 'error',
      format: 'simple'
    },
    pipeline: {
      continueOnError: false,
      emitProgress: true
    },
    app: {
      maxConcurrency: 5
    },
    cache: {
      enabled: false,
      driver: 'file',
      prefix: 'copytree_',
      defaultTtl: 3600
    }
  };

  const mockConfig = function() {
    return {
      get: (key, defaultValue = null) => {
        const keys = key.split('.');
        let value = mockConfigData;
        
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
        let target = mockConfigData;
        
        for (let i = 0; i < keys.length - 1; i++) {
          if (!(keys[i] in target)) {
            target[keys[i]] = {};
          }
          target = target[keys[i]];
        }
        
        target[keys[keys.length - 1]] = value;
      },
      all: () => ({ ...mockConfigData }),
      has: (key) => {
        const keys = key.split('.');
        let value = mockConfigData;
        
        for (const k of keys) {
          if (value && typeof value === 'object' && k in value) {
            value = value[k];
          } else {
            return false;
          }
        }
        
        return true;
      }
    };
  };

  mockConfig.env = (key, defaultValue = null) => {
    return process.env[key] || defaultValue;
  };

  // Mock ConfigManager class
  const MockConfigManager = {
    get: (key, defaultValue) => mockConfig().get(key, defaultValue),
    set: (key, value) => mockConfig().set(key, value),
    all: () => mockConfig().all(),
    has: (key) => mockConfig().has(key),
    env: mockConfig.env
  };

  return {
    ConfigManager: MockConfigManager,
    config: mockConfig,
    env: mockConfig.env
  };
});

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn(),
  child: jest.fn(() => mockLogger) // Return itself for chaining
};

jest.mock('../src/utils/logger', () => ({
  logger: mockLogger
}));