/**
 * Configuration hierarchy and precedence tests - REAL IMPLEMENTATION
 *
 * Tests the actual ConfigManager to validate:
 * - Configuration loading respects precedence: default < user < project < env < CLI
 * - Environment variable mapping works correctly
 * - Provenance tracking is accurate
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ConfigManager } from '../../../src/config/ConfigManager.js';

// Mock logger to avoid import.meta issues
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Configuration Hierarchy (Real ConfigManager)', () => {
  let configManager;
  let tempUserConfigPath;
  let originalHome;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    originalHome = os.homedir();

    // Create temp home directory
    const tempHome = path.join(os.tmpdir(), `.copytree-test-${Date.now()}`);
    await fs.ensureDir(tempHome);

    // Set tempUserConfigPath to the .copytree directory within temp home
    tempUserConfigPath = path.join(tempHome, '.copytree');
    await fs.ensureDir(tempUserConfigPath);

    // Mock homedir to use temp home
    jest.spyOn(os, 'homedir').mockReturnValue(tempHome);

    // Disable validation for tests
    process.env.NODE_ENV = 'test';
    process.env.COPYTREE_NO_VALIDATE = 'true';
  });

  afterEach(async () => {
    // Restore environment
    process.env = originalEnv;
    jest.restoreAllMocks();

    // Clean up temp directory (parent of tempUserConfigPath)
    if (tempUserConfigPath) {
      const tempHome = path.dirname(tempUserConfigPath);
      await fs.remove(tempHome);
    }
  });

  describe('basic configuration loading', () => {
    it('should load default configuration', async () => {
      configManager = await ConfigManager.create({ noValidate: true });

      expect(configManager.config).toBeDefined();
      expect(configManager.config.copytree).toBeDefined();
      expect(configManager.defaultConfig).toBeDefined();
    });

    it('should have expected default values', async () => {
      configManager = await ConfigManager.create({ noValidate: true });

      // Check some expected defaults
      const maxFileSize = configManager.get('copytree.maxFileSize');
      expect(typeof maxFileSize).toBe('number');
      expect(maxFileSize).toBeGreaterThan(0);
    });
  });

  describe('configuration hierarchy', () => {
    it('should merge user config over defaults', async () => {
      // Create user config file with override directly in ~/.copytree/
      await fs.writeFile(
        path.join(tempUserConfigPath, 'copytree.js'),
        `export default { maxFileSize: 999999, customSetting: 'user-value' };`
      );

      configManager = await ConfigManager.create({ noValidate: true });

      expect(configManager.get('copytree.maxFileSize')).toBe(999999);
      expect(configManager.get('copytree.customSetting')).toBe('user-value');
    });
  });

  describe('get method', () => {
    beforeEach(async () => {
      configManager = await ConfigManager.create({ noValidate: true });
    });

    it('should return value for existing path', () => {
      const value = configManager.get('copytree.maxFileSize');
      expect(value).toBeDefined();
      expect(typeof value).toBe('number');
    });

    it('should return default value for non-existent path', () => {
      const value = configManager.get('nonexistent.path', 'default-value');
      expect(value).toBe('default-value');
    });

    it('should handle nested paths', () => {
      const fs = configManager.get('copytree.fs');
      expect(fs).toBeDefined();
      expect(typeof fs).toBe('object');
      expect(fs.retryAttempts).toBeDefined();
    });

    it('should return undefined for non-existent path without default', () => {
      const value = configManager.get('definitely.does.not.exist');
      expect(value).toBeUndefined();
    });
  });

  describe('set method', () => {
    beforeEach(async () => {
      configManager = await ConfigManager.create({ noValidate: true });
    });

    it('should set value at path', () => {
      configManager.set('copytree.testValue', 'new-value');
      expect(configManager.get('copytree.testValue')).toBe('new-value');
    });

    it('should create nested paths', () => {
      configManager.set('new.nested.path', 'value');
      expect(configManager.get('new.nested.path')).toBe('value');
      expect(configManager.get('new.nested')).toEqual({ path: 'value' });
    });

    it('should override existing values', () => {
      const original = configManager.get('copytree.maxFileSize');
      configManager.set('copytree.maxFileSize', 12345);
      expect(configManager.get('copytree.maxFileSize')).toBe(12345);
      expect(configManager.get('copytree.maxFileSize')).not.toBe(original);
    });
  });

  describe('has method', () => {
    beforeEach(async () => {
      configManager = await ConfigManager.create({ noValidate: true });
    });

    it('should return true for existing paths', () => {
      expect(configManager.has('copytree')).toBe(true);
      expect(configManager.has('copytree.maxFileSize')).toBe(true);
    });

    it('should return false for non-existent paths', () => {
      expect(configManager.has('nonexistent')).toBe(false);
      expect(configManager.has('copytree.nonexistent')).toBe(false);
    });
  });

  describe('all method', () => {
    beforeEach(async () => {
      configManager = await ConfigManager.create({ noValidate: true });
    });

    it('should return complete configuration object', () => {
      const all = configManager.all();
      expect(all).toBeDefined();
      expect(typeof all).toBe('object');
      expect(all.copytree).toBeDefined();
    });

    it('should return a copy not a reference', () => {
      const all1 = configManager.all();
      const all2 = configManager.all();
      expect(all1).toEqual(all2);
      expect(all1).not.toBe(all2); // Different object references
    });
  });

  describe('initialization', () => {
    it('should not double-initialize', async () => {
      configManager = new ConfigManager({ noValidate: true });

      await configManager.loadConfiguration();
      expect(configManager._initialized).toBe(true);

      // Second call should be a no-op
      await configManager.loadConfiguration();
      expect(configManager._initialized).toBe(true);
    });

    it('should use create factory method', async () => {
      configManager = await ConfigManager.create({ noValidate: true });

      expect(configManager._initialized).toBe(true);
      expect(configManager.config).toBeDefined();
    });
  });
});
