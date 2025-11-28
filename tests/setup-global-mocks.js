/**
 * Global mocks setup for the "mocked" Jest project
 * This file contains jest.mock() calls that replace real modules with mocks
 */

// Mock ConfigManager
jest.mock('../src/config/ConfigManager.js', () => {
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
      transformations: {
        enabled: false, // Default for non-AI transformers
        ttl: 86400,
      },
    },
  };

  const mockConfig = function () {
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
      },
    };
  };

  mockConfig.env = (key, defaultValue = null) => {
    const value = process.env[key];
    if (value === undefined) {
      return defaultValue;
    }
    // Type conversion to match the real implementation
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (value.match(/^\d+$/)) return parseInt(value);
    if (value.match(/^\d+\.\d+$/)) return parseFloat(value);
    return value;
  };

  // Mock ConfigManager class
  class MockConfigManager {
    constructor() {
      // Deep clone to ensure each instance has fully isolated config
      this._data = JSON.parse(JSON.stringify(mockConfigData));
    }

    get(key, defaultValue = null) {
      const keys = key.split('.');
      let value = this._data;

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
      let target = this._data;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target)) {
          target[keys[i]] = {};
        }
        target = target[keys[i]];
      }

      target[keys[keys.length - 1]] = value;
    }

    all() {
      return { ...this._data };
    }

    has(key) {
      const keys = key.split('.');
      let value = this._data;

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return false;
        }
      }

      return true;
    }

    async loadConfiguration() {
      return this;
    }

    static async create(_options = {}) {
      const instance = new MockConfigManager();
      return instance;
    }
  }

  // Create singleton instance
  let singletonInstance = null;

  const configFactory = () => {
    if (!singletonInstance) {
      singletonInstance = mockConfig();
    }
    return singletonInstance;
  };

  const configAsyncFactory = async () => {
    if (!singletonInstance) {
      singletonInstance = mockConfig();
    }
    return singletonInstance;
  };

  return {
    ConfigManager: MockConfigManager,
    config: configFactory,
    configAsync: configAsyncFactory,
    env: mockConfig.env,
  };
});

// Mock logger
const createMockLogger = () => {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    success: jest.fn(),
    startSpinner: jest.fn(),
    updateSpinner: jest.fn(),
    succeedSpinner: jest.fn(),
    failSpinner: jest.fn(),
    stopSpinner: jest.fn(),
    table: jest.fn(),
    line: jest.fn(),
    styled: jest.fn(),
    tree: jest.fn(),
    formatBytes: jest.fn((bytes) => `${bytes} B`),
    formatDuration: jest.fn((ms) => `${ms}ms`),
    progress: jest.fn(),
  };
  logger.child = jest.fn(() => createMockLogger());
  return logger;
};

const mockLogger = createMockLogger();

jest.mock('../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock clipboardy to prevent ESM import issues
jest.mock('clipboardy', () => ({
  write: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue(''),
  writeSync: jest.fn(),
  readSync: jest.fn().mockReturnValue(''),
}));

// Mock fs-extra (comprehensive mock with all functions)
jest.mock('fs-extra', () => {
  const pathExists = jest.fn().mockResolvedValue(true);
  const stat = jest.fn().mockResolvedValue({ isDirectory: () => true });
  const writeFile = jest.fn().mockResolvedValue();
  const createWriteStream = jest.fn(() => ({
    write: jest.fn(),
    end: jest.fn((cb) => cb?.()),
  }));
  const ensureDir = jest.fn().mockResolvedValue();
  const ensureDirSync = jest.fn();
  const readFile = jest.fn().mockResolvedValue('');
  const readdir = jest.fn().mockResolvedValue([]);
  const remove = jest.fn().mockResolvedValue();
  const readFileSync = jest.fn().mockReturnValue('');
  const writeFileSync = jest.fn();
  const existsSync = jest.fn().mockReturnValue(false);
  const removeSync = jest.fn();
  const mkdtempSync = jest.fn().mockReturnValue('/tmp/test-temp-dir');
  const readdirSync = jest.fn().mockReturnValue([]);
  const rmSync = jest.fn();
  const readJson = jest.fn().mockResolvedValue({});
  const readJsonSync = jest.fn().mockReturnValue({});
  const writeJson = jest.fn().mockResolvedValue();
  const writeJsonSync = jest.fn();
  const copy = jest.fn().mockResolvedValue();
  const copySync = jest.fn();
  const move = jest.fn().mockResolvedValue();
  const moveSync = jest.fn();
  const emptyDir = jest.fn().mockResolvedValue();
  const emptyDirSync = jest.fn();
  const outputFile = jest.fn().mockResolvedValue();
  const outputFileSync = jest.fn();
  const outputJson = jest.fn().mockResolvedValue();
  const outputJsonSync = jest.fn();
  const unlink = jest.fn().mockResolvedValue();

  const mock = {
    pathExists,
    stat,
    writeFile,
    createWriteStream,
    ensureDir,
    ensureDirSync,
    readFile,
    readdir,
    remove,
    readFileSync,
    writeFileSync,
    existsSync,
    removeSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    readJson,
    readJsonSync,
    writeJson,
    writeJsonSync,
    copy,
    copySync,
    move,
    moveSync,
    emptyDir,
    emptyDirSync,
    outputFile,
    outputFileSync,
    outputJson,
    outputJsonSync,
    unlink,
  };

  mock.default = mock;
  return mock;
});
