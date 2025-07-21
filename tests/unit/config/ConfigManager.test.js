const { ConfigManager, config, env } = require('../../../src/config/ConfigManager');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('ConfigManager', () => {
  let configManager;
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-test-'));
    configManager = new ConfigManager();
  });

  afterEach(() => {
    process.env = originalEnv;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.removeSync(tempDir);
    }
  });

  describe('constructor and initialization', () => {
    test('should create instance and load configuration', () => {
      expect(configManager).toBeInstanceOf(ConfigManager);
      expect(configManager.config).toBeDefined();
      expect(typeof configManager.config).toBe('object');
    });

    test('should set correct paths', () => {
      expect(configManager.configPath).toContain('config');
      expect(configManager.userConfigPath).toContain('.copytree');
    });
  });

  describe('get method', () => {
    test('should get nested configuration values', () => {
      // Set up test config
      configManager.config = {
        app: {
          name: 'copytree',
          nested: {
            value: 'test'
          }
        }
      };

      expect(configManager.get('app.name')).toBe('copytree');
      expect(configManager.get('app.nested.value')).toBe('test');
      expect(configManager.get('app.missing', 'default')).toBe('default');
    });

    test('should return default value for missing paths', () => {
      expect(configManager.get('nonexistent.path', 'default')).toBe('default');
      expect(configManager.get('nonexistent.path')).toBe(null);
    });
  });

  describe('set method', () => {
    test('should set configuration values', () => {
      configManager.set('test.path', 'value');
      expect(configManager.get('test.path')).toBe('value');
    });

    test('should set nested values', () => {
      configManager.set('deep.nested.path', 'nested-value');
      expect(configManager.get('deep.nested.path')).toBe('nested-value');
      expect(configManager.get('deep.nested')).toEqual({ path: 'nested-value' });
    });
  });

  describe('has method', () => {
    test('should check if configuration path exists', () => {
      configManager.config = {
        existing: {
          path: 'value'
        }
      };

      expect(configManager.has('existing.path')).toBe(true);
      expect(configManager.has('nonexistent.path')).toBe(false);
    });
  });

  describe('all method', () => {
    test('should return all configuration', () => {
      const testConfig = { test: 'value' };
      configManager.config = testConfig;
      
      expect(configManager.all()).toEqual(testConfig);
    });
  });

  describe('env method', () => {
    test('should get environment variables with type conversion', () => {
      process.env.TEST_STRING = 'hello';
      process.env.TEST_NUMBER = '123';
      process.env.TEST_FLOAT = '123.45';
      process.env.TEST_BOOL_TRUE = 'true';
      process.env.TEST_BOOL_FALSE = 'false';
      process.env.TEST_NULL = 'null';

      expect(configManager.env('TEST_STRING')).toBe('hello');
      expect(configManager.env('TEST_NUMBER')).toBe(123);
      expect(configManager.env('TEST_FLOAT')).toBe(123.45);
      expect(configManager.env('TEST_BOOL_TRUE')).toBe(true);
      expect(configManager.env('TEST_BOOL_FALSE')).toBe(false);
      expect(configManager.env('TEST_NULL')).toBe(null);
      expect(configManager.env('NONEXISTENT', 'default')).toBe('default');
    });
  });

  describe('applyEnvOverrides', () => {
    test('should apply environment variable overrides', () => {
      process.env.APP_NAME = 'overridden-name';
      process.env.APP_DEBUG = 'true';
      process.env.APP_PORT = '8080';

      const config = {
        app: {
          name: 'original-name',
          debug: false,
          port: 3000
        }
      };

      configManager.applyEnvOverrides(config);

      expect(config.app.name).toBe('overridden-name');
      expect(config.app.debug).toBe(true);
      expect(config.app.port).toBe(8080);
    });

    test('should handle nested overrides', () => {
      process.env.DATABASE_CONNECTION_HOST = 'localhost';
      process.env.DATABASE_CONNECTION_PORT = '5432';

      const config = {
        database: {
          connection: {
            host: 'original-host',
            port: 3306
          }
        }
      };

      configManager.applyEnvOverrides(config);

      expect(config.database.connection.host).toBe('localhost');
      expect(config.database.connection.port).toBe(5432);
    });
  });

  describe('reload method', () => {
    test('should reload configuration', () => {
      configManager.config = { old: 'config' };
      configManager.reload();
      
      // After reload, config should be refreshed (not the old one)
      expect(configManager.config).not.toEqual({ old: 'config' });
      expect(typeof configManager.config).toBe('object');
    });
  });

  describe('singleton pattern', () => {
    test('config() should return singleton instance', () => {
      const instance1 = config();
      const instance2 = config();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ConfigManager);
    });

    test('env() should work through singleton', () => {
      process.env.TEST_SINGLETON = 'singleton-value';
      
      expect(env('TEST_SINGLETON')).toBe('singleton-value');
      expect(env('NONEXISTENT_SINGLETON', 'default')).toBe('default');
    });
  });

  describe('loadDefaults', () => {
    test('should handle missing config files gracefully', () => {
      // Create a ConfigManager with non-existent config path
      const testConfigManager = new ConfigManager();
      testConfigManager.configPath = '/nonexistent/path';
      
      // Should not throw
      expect(() => testConfigManager.loadDefaults()).not.toThrow();
    });
  });

  describe('loadUserConfig', () => {
    test('should handle missing user config directory', () => {
      const testConfigManager = new ConfigManager();
      testConfigManager.userConfigPath = '/nonexistent/user/path';
      
      // Should not throw
      expect(() => testConfigManager.loadUserConfig()).not.toThrow();
    });

    test('should load JSON user config files', async () => {
      const userConfigPath = path.join(tempDir, '.copytree');
      await fs.ensureDir(userConfigPath);
      
      const userConfig = { custom: { setting: 'user-value' } };
      await fs.writeJson(path.join(userConfigPath, 'custom.json'), userConfig);
      
      const testConfigManager = new ConfigManager();
      testConfigManager.userConfigPath = userConfigPath;
      testConfigManager.config = { custom: { setting: 'default-value' } };
      
      testConfigManager.loadUserConfig();
      
      expect(testConfigManager.config.custom.setting).toBe('user-value');
    });
  });

  describe('error handling', () => {
    test('should handle invalid JSON config files', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const testConfigManager = new ConfigManager();
      testConfigManager.userConfigPath = tempDir;
      
      // Create invalid JSON file
      fs.writeFileSync(path.join(tempDir, 'invalid.json'), '{ invalid json }');
      
      expect(() => testConfigManager.loadUserConfig()).not.toThrow();
      expect(spy).toHaveBeenCalled();
      
      spy.mockRestore();
    });

    test('should handle missing require files', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const testConfigManager = new ConfigManager();
      testConfigManager.configPath = tempDir;
      
      // Create a JS file that will fail to require
      fs.writeFileSync(path.join(tempDir, 'broken.js'), 'this is not valid javascript');
      
      expect(() => testConfigManager.loadDefaults()).not.toThrow();
      expect(spy).toHaveBeenCalled();
      
      spy.mockRestore();
    });
  });
});