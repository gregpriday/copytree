// Mock the actual ConfigManager to avoid loading real config files
jest.mock('fs-extra');

// Mock config before importing ConfigManager
jest.mock('../../../src/config.js', () => import('../../mocks/config.js'));

// Static imports for Node.js modules
import fs from 'fs-extra';

// Import temp file management helpers
import { withTempDir, settleFs } from '../../helpers/tempfs.js';

// Use dynamic import for module under test
let config, env;

beforeAll(async () => {
  const configManagerModule = await import('../../../src/config/ConfigManager.js');
  config = configManagerModule.config;
  env = configManagerModule.env;
});

describe('ConfigManager', () => {
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    // Mock file system operations
    fs.mkdtempSync.mockReturnValue('/mocked-temp');
    fs.existsSync.mockReturnValue(false);
    fs.ensureDirSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('singleton behavior', () => {
    test('should return same instance', () => {
      const instance1 = config();
      const instance2 = config();
      expect(instance1).toBe(instance2);
    });

    test('should have get method', () => {
      const configInstance = config();
      expect(typeof configInstance.get).toBe('function');
      // Mock the loaded config
      configInstance.config = {
        log: { level: 'error' },
        copytree: { maxFileSize: 10 * 1024 * 1024 },
      };
      const value = configInstance.get('log.level', 'info');
      expect(value).toBe('error');
    });

    test('should have set method', () => {
      const configInstance = config();
      expect(typeof configInstance.set).toBe('function');
      configInstance.set('test.value', 'test');
      expect(configInstance.get('test.value')).toBe('test');
    });

    test('should have all method', () => {
      const configInstance = config();
      expect(typeof configInstance.all).toBe('function');
      // Set up mock config
      configInstance.config = {
        copytree: { maxFileSize: 10 * 1024 * 1024 },
        log: { level: 'error' },
      };
      const allConfig = configInstance.all();
      expect(allConfig).toHaveProperty('copytree');
      expect(allConfig).toHaveProperty('log');
    });
  });

  describe('get method', () => {
    test('should get nested configuration values', () => {
      const configInstance = config();
      configInstance.config = {
        copytree: { maxFileSize: 10 * 1024 * 1024 },
        log: { level: 'error' },
      };
      expect(configInstance.get('copytree.maxFileSize')).toBe(10 * 1024 * 1024);
      expect(configInstance.get('log.level')).toBe('error');
    });

    test('should return default value for missing paths', () => {
      const configInstance = config();
      expect(configInstance.get('non.existent.path', 'default')).toBe('default');
    });
  });

  describe('set method', () => {
    test('should set configuration values', () => {
      const configInstance = config();
      configInstance.set('newKey', 'newValue');
      expect(configInstance.get('newKey')).toBe('newValue');
    });

    test('should set nested values', () => {
      const configInstance = config();
      configInstance.set('deeply.nested.value', 42);
      expect(configInstance.get('deeply.nested.value')).toBe(42);
    });
  });

  describe('env helper', () => {
    test('should get environment variables', () => {
      process.env.TEST_VAR = 'test_value';
      expect(env('TEST_VAR')).toBe('test_value');
    });

    test('should return default for missing env vars', () => {
      expect(env('MISSING_VAR', 'default')).toBe('default');
    });

    test('should convert boolean strings', () => {
      process.env.BOOL_TRUE = 'true';
      process.env.BOOL_FALSE = 'false';
      expect(env('BOOL_TRUE')).toBe(true);
      expect(env('BOOL_FALSE')).toBe(false);
    });

    test('should convert numeric strings', () => {
      process.env.NUM_VAR = '42';
      expect(env('NUM_VAR')).toBe(42);
    });
  });
});
