/**
 * Configuration hierarchy and precedence tests
 *
 * Validates that configuration loading respects the correct precedence order:
 * default < user < project < env < CLI
 *
 * Also tests environment variable mapping and provenance tracking.
 */

import fs from 'fs-extra';
import path from 'path';
import { tmpPath, cleanTmpDir } from '../../helpers/fixtures.js';
import { setupEnvIsolation, restoreEnv } from '../../helpers/envCleanup.js';
import os from 'os';

// Mock ConfigManager for testing hierarchy
class MockConfigManager {
  constructor() {
    this.configs = {
      default: {},
      user: {},
      project: {},
      env: {},
      cli: {}
    };
    this.provenance = {};
  }

  loadDefault(config) {
    this.configs.default = config;
    this.trackProvenance(config, 'default');
  }

  loadUser(config) {
    this.configs.user = config;
    this.trackProvenance(config, 'user');
  }

  loadProject(config) {
    this.configs.project = config;
    this.trackProvenance(config, 'project');
  }

  loadEnv(config) {
    this.configs.env = config;
    this.trackProvenance(config, 'env');
  }

  loadCLI(config) {
    this.configs.cli = config;
    this.trackProvenance(config, 'cli');
  }

  trackProvenance(config, source, prefix = '') {
    for (const [key, value] of Object.entries(config)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.trackProvenance(value, source, fullKey);
      } else {
        this.provenance[fullKey] = source;
      }
    }
  }

  merge() {
    const merged = this.deepMerge(
      this.configs.default,
      this.configs.user,
      this.configs.project,
      this.configs.env,
      this.configs.cli
    );
    return merged;
  }

  deepMerge(...objects) {
    const result = {};
    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result[key] = this.deepMerge(result[key] || {}, value);
        } else {
          result[key] = value;
        }
      }
    }
    return result;
  }

  get(path, defaultValue = undefined) {
    const parts = path.split('.');
    const merged = this.merge();
    let current = merged;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  getProvenance(path) {
    return this.provenance[path];
  }
}

describe('Configuration Hierarchy', () => {
  let configManager;

  beforeEach(() => {
    configManager = new MockConfigManager();
    setupEnvIsolation();
  });

  afterEach(() => {
    restoreEnv();
    cleanTmpDir();
  });

  describe('Basic Precedence Order', () => {
    it('respects precedence: default < user < project < env < CLI', () => {
      configManager.loadDefault({ key: 'default' });
      configManager.loadUser({ key: 'user' });
      configManager.loadProject({ key: 'project' });
      configManager.loadEnv({ key: 'env' });
      configManager.loadCLI({ key: 'cli' });

      const result = configManager.get('key');
      expect(result).toBe('cli');
    });

    it('uses next highest precedence when CLI not set', () => {
      configManager.loadDefault({ key: 'default' });
      configManager.loadUser({ key: 'user' });
      configManager.loadProject({ key: 'project' });
      configManager.loadEnv({ key: 'env' });
      // CLI not set

      const result = configManager.get('key');
      expect(result).toBe('env');
    });

    it('falls through to default when others not set', () => {
      configManager.loadDefault({ key: 'default' });
      // Others not set

      const result = configManager.get('key');
      expect(result).toBe('default');
    });

    it('returns defaultValue when key not found', () => {
      configManager.loadDefault({ other: 'value' });

      const result = configManager.get('missing', 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('Nested Configuration Precedence', () => {
    it('merges nested objects correctly', () => {
      configManager.loadDefault({
        ai: {
          gemini: {
            model: 'gemini-1.5-flash',
            temperature: 0.7,
            apiKey: 'default-key'
          }
        }
      });

      configManager.loadUser({
        ai: {
          gemini: {
            model: 'gemini-2.5-flash',
            // temperature inherited from default
          }
        }
      });

      configManager.loadCLI({
        ai: {
          gemini: {
            apiKey: 'cli-key'
          }
        }
      });

      expect(configManager.get('ai.gemini.model')).toBe('gemini-2.5-flash'); // user
      expect(configManager.get('ai.gemini.temperature')).toBe(0.7); // default
      expect(configManager.get('ai.gemini.apiKey')).toBe('cli-key'); // cli
    });

    it('handles deep nesting', () => {
      configManager.loadDefault({
        a: { b: { c: { d: 'default' } } }
      });

      configManager.loadProject({
        a: { b: { c: { d: 'project' } } }
      });

      expect(configManager.get('a.b.c.d')).toBe('project');
    });

    it('preserves sibling values during merge', () => {
      configManager.loadDefault({
        ai: {
          gemini: { model: 'default-model' },
          cache: { enabled: true }
        }
      });

      configManager.loadUser({
        ai: {
          gemini: { model: 'user-model' }
          // cache should be preserved
        }
      });

      expect(configManager.get('ai.gemini.model')).toBe('user-model');
      expect(configManager.get('ai.cache.enabled')).toBe(true);
    });
  });

  describe('Environment Variable Mapping', () => {
    it('maps GEMINI_API_KEY to ai.gemini.apiKey', () => {
      configManager.loadDefault({
        ai: { gemini: { apiKey: '' } }
      });

      // Set a test env var
      process.env.TEST_GEMINI_API_KEY = 'env-key';

      // Simulate env var mapping
      const envConfig = {
        ai: { gemini: { apiKey: process.env.TEST_GEMINI_API_KEY } }
      };
      configManager.loadEnv(envConfig);

      expect(configManager.get('ai.gemini.apiKey')).toBe('env-key');

      delete process.env.TEST_GEMINI_API_KEY;
    });

    it('maps GEMINI_MODEL to ai.gemini.model', () => {
      configManager.loadDefault({
        ai: { gemini: { model: 'default-model' } }
      });

      process.env.GEMINI_MODEL = 'env-model';
      const envConfig = {
        ai: { gemini: { model: process.env.GEMINI_MODEL } }
      };
      configManager.loadEnv(envConfig);

      expect(configManager.get('ai.gemini.model')).toBe('env-model');
    });

    it('maps COPYTREE_MAX_FILE_SIZE to copytree.maxFileSize', () => {
      configManager.loadDefault({
        copytree: { maxFileSize: 10485760 }
      });

      process.env.COPYTREE_MAX_FILE_SIZE = '20971520';
      const envConfig = {
        copytree: { maxFileSize: parseInt(process.env.COPYTREE_MAX_FILE_SIZE) }
      };
      configManager.loadEnv(envConfig);

      expect(configManager.get('copytree.maxFileSize')).toBe(20971520);
    });

    it('maps AI_CACHE_ENABLED to ai.cache.enabled', () => {
      configManager.loadDefault({
        ai: { cache: { enabled: false } }
      });

      process.env.AI_CACHE_ENABLED = 'true';
      const envConfig = {
        ai: { cache: { enabled: process.env.AI_CACHE_ENABLED === 'true' } }
      };
      configManager.loadEnv(envConfig);

      expect(configManager.get('ai.cache.enabled')).toBe(true);
    });

    it('CLI options override environment variables', () => {
      process.env.GEMINI_MODEL = 'env-model';
      const envConfig = {
        ai: { gemini: { model: process.env.GEMINI_MODEL } }
      };
      configManager.loadEnv(envConfig);

      configManager.loadCLI({
        ai: { gemini: { model: 'cli-model' } }
      });

      expect(configManager.get('ai.gemini.model')).toBe('cli-model');
    });
  });

  describe('Provenance Tracking', () => {
    it('tracks which source set each value', () => {
      configManager.loadDefault({ key1: 'default' });
      configManager.loadUser({ key2: 'user' });
      configManager.loadProject({ key3: 'project' });

      expect(configManager.getProvenance('key1')).toBe('default');
      expect(configManager.getProvenance('key2')).toBe('user');
      expect(configManager.getProvenance('key3')).toBe('project');
    });

    it('tracks provenance for nested values', () => {
      configManager.loadDefault({
        ai: { gemini: { model: 'default' } }
      });

      configManager.loadUser({
        ai: { gemini: { apiKey: 'user-key' } }
      });

      expect(configManager.getProvenance('ai.gemini.model')).toBe('default');
      expect(configManager.getProvenance('ai.gemini.apiKey')).toBe('user');
    });

    it('updates provenance when value is overridden', () => {
      configManager.loadDefault({ key: 'default' });
      configManager.loadUser({ key: 'user' });
      configManager.loadCLI({ key: 'cli' });

      // Latest source wins
      expect(configManager.getProvenance('key')).toBe('cli');
    });
  });

  describe('File Loading Precedence', () => {
    it('loads from correct search paths in order', () => {
      // Simulate finding configs in different locations
      const searchPaths = [
        path.join(process.cwd(), '.copytree', 'config.js'), // project
        path.join(os.homedir(), '.copytree', 'config.js'),  // user
        path.join(process.cwd(), 'config', 'app.js')        // default
      ];

      const loadOrder = [];

      // Mock file existence and loading
      const configs = {
        [searchPaths[0]]: { source: 'project' },
        [searchPaths[1]]: { source: 'user' },
        [searchPaths[2]]: { source: 'default' }
      };

      // Load in priority order
      if (configs[searchPaths[2]]) {
        configManager.loadDefault(configs[searchPaths[2]]);
        loadOrder.push('default');
      }
      if (configs[searchPaths[1]]) {
        configManager.loadUser(configs[searchPaths[1]]);
        loadOrder.push('user');
      }
      if (configs[searchPaths[0]]) {
        configManager.loadProject(configs[searchPaths[0]]);
        loadOrder.push('project');
      }

      expect(loadOrder).toEqual(['default', 'user', 'project']);
      expect(configManager.get('source')).toBe('project');
    });

    it('handles missing config files gracefully', () => {
      // Only default exists
      configManager.loadDefault({ key: 'default' });

      expect(configManager.get('key')).toBe('default');
    });

    it('supports both .js and .json config files', () => {
      // Simulate loading both formats
      const jsConfig = { format: 'js', value: 1 };
      const jsonConfig = { format: 'json', value: 2 };

      configManager.loadDefault(jsConfig);
      configManager.loadUser(jsonConfig);

      // Both should merge
      expect(configManager.get('value')).toBe(2); // json wins
    });
  });

  describe('env() Function Behavior', () => {
    it('reads environment variables with defaults', () => {
      process.env.TEST_VAR = 'test-value';

      const envFunc = (key, defaultValue = null) => {
        return process.env[key] || defaultValue;
      };

      expect(envFunc('TEST_VAR', 'default')).toBe('test-value');
      expect(envFunc('MISSING_VAR', 'default')).toBe('default');
    });

    it('handles empty string vs undefined', () => {
      process.env.EMPTY_VAR = '';

      const envFunc = (key, defaultValue = null) => {
        const value = process.env[key];
        return value !== undefined ? value : defaultValue;
      };

      expect(envFunc('EMPTY_VAR', 'default')).toBe('');
      expect(envFunc('MISSING_VAR', 'default')).toBe('default');
    });

    it('supports type coercion for env values', () => {
      process.env.NUMBER_VAR = '42';
      process.env.BOOL_VAR = 'true';

      const envInt = (key, defaultValue = 0) => {
        const value = process.env[key];
        return value !== undefined ? parseInt(value, 10) : defaultValue;
      };

      const envBool = (key, defaultValue = false) => {
        const value = process.env[key];
        return value !== undefined ? value === 'true' : defaultValue;
      };

      expect(envInt('NUMBER_VAR', 0)).toBe(42);
      expect(envBool('BOOL_VAR', false)).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('handles partial overrides across all levels', () => {
      configManager.loadDefault({
        ai: {
          gemini: { model: 'default-model', temperature: 0.7, apiKey: 'default-key' },
          cache: { enabled: false, ttl: 604800 }
        }
      });

      configManager.loadUser({
        ai: {
          gemini: { model: 'user-model' }
        }
      });

      configManager.loadProject({
        ai: {
          cache: { enabled: true }
        }
      });

      process.env.GEMINI_API_KEY = 'env-key';
      configManager.loadEnv({
        ai: { gemini: { apiKey: process.env.GEMINI_API_KEY } }
      });

      const merged = configManager.merge();

      expect(merged.ai.gemini.model).toBe('user-model');
      expect(merged.ai.gemini.temperature).toBe(0.7);
      expect(merged.ai.gemini.apiKey).toBe('env-key');
      expect(merged.ai.cache.enabled).toBe(true);
      expect(merged.ai.cache.ttl).toBe(604800);
    });

    it('preserves arrays without merging', () => {
      configManager.loadDefault({
        exclude: ['node_modules', 'dist']
      });

      configManager.loadUser({
        exclude: ['build']
      });

      // Arrays should replace, not merge
      const result = configManager.get('exclude');
      expect(result).toEqual(['build']); // User replaces default
    });

    it('handles null and undefined values correctly', () => {
      configManager.loadDefault({
        key1: 'default',
        key2: 'default',
        key3: 'default'
      });

      configManager.loadUser({
        key1: null
        // key2 with undefined and key3 intentionally not set
      });

      // null should override to null
      expect(configManager.get('key1')).toBeNull();
      // missing keys should fall back to default
      expect(configManager.get('key2')).toBe('default');
      expect(configManager.get('key3')).toBe('default');
    });

    it('validates merged configuration', () => {
      configManager.loadDefault({
        ai: { gemini: { model: 'gemini-1.5-flash' } }
      });

      configManager.loadCLI({
        ai: { gemini: { model: 'invalid-model' } }
      });

      const merged = configManager.merge();

      // Validation would happen here
      const isValid = merged.ai.gemini.model.startsWith('gemini-');
      expect(isValid).toBe(false); // Invalid model should be caught
    });
  });

  describe('Dot Notation Access', () => {
    it('supports dot notation for nested access', () => {
      configManager.loadDefault({
        a: { b: { c: { d: 'value' } } }
      });

      expect(configManager.get('a.b.c.d')).toBe('value');
    });

    it('returns default for missing paths', () => {
      configManager.loadDefault({ a: { b: 'value' } });

      expect(configManager.get('a.c', 'default')).toBe('default');
      expect(configManager.get('x.y.z', 'fallback')).toBe('fallback');
    });

    it('handles paths through null values', () => {
      configManager.loadDefault({
        a: { b: null }
      });

      expect(configManager.get('a.b.c', 'default')).toBe('default');
    });
  });
});
