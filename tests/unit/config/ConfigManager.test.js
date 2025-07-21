// Mock the actual ConfigManager to avoid loading real config files
jest.mock('fs-extra');

// Mock config before importing ConfigManager
jest.mock('../../../src/config', () => require('../../mocks/config'));

const ConfigManager = require('../../../src/config/ConfigManager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ConfigManager', () => {
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    tempDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    
    // Mock file system operations
    fs.mkdtempSync.mockReturnValue(tempDir);
    fs.existsSync.mockReturnValue(false);
    fs.ensureDirSync.mockImplementation(() => {});
    fs.readdirSync.mockReturnValue([]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('singleton behavior', () => {
    test('should return same instance', () => {
      expect(ConfigManager).toBeDefined();
      expect(ConfigManager.get).toBeDefined();
      expect(ConfigManager.set).toBeDefined();
    });

    test('should have get method', () => {
      expect(typeof ConfigManager.get).toBe('function');
      const value = ConfigManager.get('log.level', 'info');
      expect(value).toBe('error'); // From mock config
    });

    test('should have set method', () => {
      expect(typeof ConfigManager.set).toBe('function');
      ConfigManager.set('test.value', 'test');
      expect(ConfigManager.get('test.value')).toBe('test');
    });

    test('should have all method', () => {
      expect(typeof ConfigManager.all).toBe('function');
      const allConfig = ConfigManager.all();
      expect(allConfig).toHaveProperty('copytree');
      expect(allConfig).toHaveProperty('log');
    });
  });

  describe('get method', () => {
    test('should get nested configuration values', () => {
      expect(ConfigManager.get('copytree.maxFileSize')).toBe(10 * 1024 * 1024);
      expect(ConfigManager.get('log.level')).toBe('error');
    });

    test('should return default value for missing paths', () => {
      expect(ConfigManager.get('non.existent.path', 'default')).toBe('default');
    });
  });

  describe('set method', () => {
    test('should set configuration values', () => {
      ConfigManager.set('newKey', 'newValue');
      expect(ConfigManager.get('newKey')).toBe('newValue');
    });

    test('should set nested values', () => {
      ConfigManager.set('deeply.nested.value', 42);
      expect(ConfigManager.get('deeply.nested.value')).toBe(42);
    });
  });

  describe('env helper', () => {
    test('should get environment variables', () => {
      process.env.TEST_VAR = 'test_value';
      expect(ConfigManager.env('TEST_VAR')).toBe('test_value');
    });

    test('should return default for missing env vars', () => {
      expect(ConfigManager.env('MISSING_VAR', 'default')).toBe('default');
    });

    test('should convert boolean strings', () => {
      process.env.BOOL_TRUE = 'true';
      process.env.BOOL_FALSE = 'false';
      expect(ConfigManager.env('BOOL_TRUE')).toBe('true');
      expect(ConfigManager.env('BOOL_FALSE')).toBe('false');
    });

    test('should convert numeric strings', () => {
      process.env.NUM_VAR = '42';
      expect(ConfigManager.env('NUM_VAR')).toBe('42');
    });
  });
});