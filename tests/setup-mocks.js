// Global mocks setup
// This file sets up mocks that need to be available before any modules are loaded

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
      defaultTtl: 3600,
      transformations: {
        enabled: true,
        ttl: 86400
      }
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
  const MockConfigManager = {
    get: (key, defaultValue) => mockConfig().get(key, defaultValue),
    set: (key, value) => mockConfig().set(key, value),
    all: () => mockConfig().all(),
    has: (key) => mockConfig().has(key),
    env: mockConfig.env
  };

  // Create singleton instance
  let singletonInstance = null;
  
  const configFactory = () => {
    if (!singletonInstance) {
      singletonInstance = mockConfig();
    }
    return singletonInstance;
  };
  
  return {
    ConfigManager: MockConfigManager,
    config: configFactory,
    env: mockConfig.env
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
    progress: jest.fn()
  };
  logger.child = jest.fn(() => createMockLogger());
  return logger;
};

const mockLogger = createMockLogger();

jest.mock('../src/utils/logger.js', () => ({
  logger: mockLogger
}));

// Mock AIService to prevent API key validation at load time
jest.mock('../src/services/AIService.js', () => {
  return {
    summarizeFile: jest.fn().mockResolvedValue('Mocked file summary'),
    describeImage: jest.fn().mockResolvedValue('Mocked image description'),
    summarizeText: jest.fn().mockResolvedValue('Mocked text summary'),
    summarizeUnitTests: jest.fn().mockResolvedValue('Mocked unit test summary'),
    describeSVG: jest.fn().mockResolvedValue('Mocked SVG description'),
    isAvailable: jest.fn().mockReturnValue(true),
    getProvider: jest.fn().mockReturnValue('mock-provider'),
    getModel: jest.fn().mockReturnValue('mock-model')
  };
});

// Mock clipboardy to prevent ESM import issues
jest.mock('clipboardy', () => ({
  write: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue(''),
  writeSync: jest.fn(),
  readSync: jest.fn().mockReturnValue('')
}));

// Mock fs-extra
jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(true),
  stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
  writeFile: jest.fn().mockResolvedValue(undefined),
  createWriteStream: jest.fn(() => ({
    write: jest.fn(),
    end: jest.fn((cb) => cb && cb())
  })),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  ensureDirSync: jest.fn(),
  readFile: jest.fn().mockResolvedValue(''),
  readdir: jest.fn().mockResolvedValue([]),
  remove: jest.fn().mockResolvedValue(undefined),
  readFileSync: jest.fn().mockReturnValue(''),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
  removeSync: jest.fn(),
  mkdtempSync: jest.fn().mockReturnValue('/tmp/test-temp-dir'),
  readdirSync: jest.fn().mockReturnValue([]),
  rmSync: jest.fn()
}));

