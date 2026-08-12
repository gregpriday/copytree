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

// Mock clipboardy to prevent ESM import issues.
// The mock object is set as its own `.default` so that dynamic ESM imports
// (`const { default: clipboardy } = await import('clipboardy')`) resolve correctly.
jest.mock('clipboardy', () => {
  const mock = {
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(''),
    writeSync: jest.fn(),
    readSync: jest.fn().mockReturnValue(''),
  };
  mock.default = mock;
  return mock;
});

// Mock `src/utils/fsx.js`.
//
// The mock surface is derived from the real module rather than hand-listed, so
// the two cannot diverge. The old list did both kinds of diverging at once: it
// declared thirteen names the real module does not export — `unlink`, `copy`,
// `move`, `outputFile`, `mkdtempSync` and friends, left over from when this
// wrapped `fs-extra` — so a test could exercise, and pass against, an API that
// does not exist in production; and it omitted sixteen that the real module
// does export, so any code path reaching one of those got `undefined`.
//
// Defaults are declared as data rather than baked into `jest.fn()` calls,
// because `resetMocks: true` strips implementations before every test — even
// the one passed to `jest.fn(impl)`. Without re-arming, `fs.readFile` resolved
// to `undefined` in every test in this project, and `FileLoadingStage` was
// handed nothing to classify. That went unnoticed for as long as it did only
// because the stage used to swallow the resulting `TypeError` into an
// `[Error loading file: ...]` string and carry on.
//
// `tests/setup.js` re-applies the table in a `beforeEach`.
jest.mock('../src/utils/fsx.js', () => {
  const actual = jest.requireActual('../src/utils/fsx.js');

  const defaults = {
    pathExists: ['resolve', true],
    stat: ['resolve', { isDirectory: () => true }],
    lstat: ['resolve', { isDirectory: () => true, isSymbolicLink: () => false }],
    statSync: ['return', { isDirectory: () => true }],
    writeFile: ['resolve', undefined],
    createWriteStream: ['impl', () => ({ write: () => {}, end: (cb) => cb?.() })],
    ensureDir: ['resolve', undefined],
    ensureDirSync: ['return', undefined],
    mkdir: ['resolve', undefined],
    mkdirSync: ['return', undefined],
    // A Buffer, not a string: the one-argument form of `readFile` returns
    // bytes, and the binary detector reads `.length` off them.
    readFile: ['impl', (_path, encoding) => Promise.resolve(encoding ? '' : Buffer.alloc(0))],
    readFileSync: ['impl', (_path, encoding) => (encoding ? '' : Buffer.alloc(0))],
    readdir: ['resolve', []],
    readdirSync: ['return', []],
    remove: ['resolve', undefined],
    removeSync: ['return', undefined],
    rm: ['resolve', undefined],
    rmSync: ['return', undefined],
    rmdir: ['resolve', undefined],
    rename: ['resolve', undefined],
    renameSync: ['return', undefined],
    writeFileSync: ['return', undefined],
    existsSync: ['return', false],
    readJson: ['resolve', {}],
    readJsonSync: ['return', {}],
    writeJson: ['resolve', undefined],
    utimesSync: ['return', undefined],
    realpath: ['impl', (target) => Promise.resolve(target)],
    realpathSync: ['impl', (target) => target],
  };

  // Classes are functions too, so `typeof value === 'function'` would have
  // replaced `fs.Dirent` and `fs.Stats` with `jest.fn()` — and a mocked
  // constructor is not something an `instanceof` check or a `new` call can use.
  // A class is distinguishable by having a prototype with more than just
  // `constructor` on it, but naming them is clearer than sniffing for them.
  const passThrough = new Set(['Dirent', 'Stats']);

  const mock = {};
  for (const [name, value] of Object.entries(actual.default ?? actual)) {
    mock[name] = typeof value === 'function' && !passThrough.has(name) ? jest.fn() : value;
  }

  // Read back by `tests/setup.js`. A plain global rather than an import,
  // because `setupFiles` run before the module registry a test can import from.
  globalThis.__COPYTREE_FSX_MOCK__ = { mock, defaults };

  mock.default = mock;
  return mock;
});
