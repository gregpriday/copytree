// Moved inside describe block

describe('CacheService', () => {
  let CacheService;
  let cacheService;
  let tempDir;
  let fs;
  const path = require('path');
  const os = require('os');

  beforeEach(async () => {
    // Reset modules to ensure clean state
    jest.resetModules();
    
    // Require fs-extra first before any mocking
    fs = require('fs-extra');
    
    // Mock dependencies before requiring CacheService
    jest.doMock('../../../src/utils/logger', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
        silly: jest.fn(),
        child: jest.fn(() => ({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          verbose: jest.fn(),
          silly: jest.fn()
        }))
      }
    }));

    // Mock ConfigManager to avoid loading actual config files
    jest.doMock('../../../src/config/ConfigManager', () => ({
      config: () => ({
        get: jest.fn((key, defaultValue) => defaultValue)
      })
    }));

    // Now require CacheService with mocked dependencies
    const CacheServiceModule = require('../../../src/services/CacheService');
    CacheService = CacheServiceModule.CacheService;

    // Create temp directory for tests
    tempDir = path.join(os.tmpdir(), 'copytree-cache-test-' + Date.now());
    await fs.ensureDir(tempDir);
    
    // Create cache service instance
    cacheService = new CacheService({
      cachePath: tempDir,
      defaultTtl: 3600,
      enabled: true,
      driver: 'file'
    });
  });

  afterEach(async () => {
    // Clean up
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
    jest.dontMock('../../../src/utils/logger');
    jest.dontMock('../../../src/config/ConfigManager');
  });

  describe('basic functionality', () => {
    test('should create cache service instance', () => {
      expect(cacheService).toBeDefined();
      expect(cacheService.enabled).toBe(true);
      expect(cacheService.driver).toBe('file');
    });

    test('should set and get values', async () => {
      // Create a memory-based cache to avoid file system issues
      const memCache = new CacheService({
        driver: 'memory',
        enabled: true
      });
      
      const result = await memCache.set('test-key', 'test-value');
      expect(result).toBe(true);

      const value = await memCache.get('test-key');
      expect(value).toBe('test-value');
    });

    test('should return null for non-existent keys', async () => {
      const value = await cacheService.get('non-existent');
      expect(value).toBeNull();
    });

    test('should check if key exists', async () => {
      await cacheService.set('exists', 'value');
      
      expect(await cacheService.has('exists')).toBe(true);
      expect(await cacheService.has('not-exists')).toBe(false);
    });

    test('should delete keys', async () => {
      await cacheService.set('to-delete', 'value');
      expect(await cacheService.has('to-delete')).toBe(true);

      await cacheService.forget('to-delete');
      expect(await cacheService.has('to-delete')).toBe(false);
    });

    test('should generate consistent keys', () => {
      const key1 = cacheService.generateKey('test');
      const key2 = cacheService.generateKey('test');
      expect(key1).toBe(key2);
    });

    test('should clear cache', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');

      const cleared = await cacheService.clear();
      expect(cleared).toBeGreaterThan(0);

      expect(await cacheService.has('key1')).toBe(false);
      expect(await cacheService.has('key2')).toBe(false);
    });
  });

  describe('TTL functionality', () => {
    test('should expire entries after TTL', async () => {
      // Set with 1 second TTL
      await cacheService.set('expire-test', 'value', 1);
      
      // Should exist immediately
      expect(await cacheService.get('expire-test')).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(await cacheService.get('expire-test')).toBeNull();
    });
  });

  describe('disabled cache', () => {
    test('should not store when disabled', async () => {
      const disabledCache = new CacheService({
        cachePath: tempDir,
        enabled: false
      });

      await disabledCache.set('test', 'value');
      expect(await disabledCache.get('test')).toBeNull();
    });
  });

  describe('memory driver', () => {
    test('should use memory cache', async () => {
      const memCache = new CacheService({
        driver: 'memory',
        enabled: true
      });

      await memCache.set('key', 'value');
      expect(await memCache.get('key')).toBe('value');
    });
  });
});