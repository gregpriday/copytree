const CacheService = require('../../../src/services/CacheService');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('CacheService', () => {
  let cacheService;
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-cache-test-'));
    cacheService = new CacheService({
      cacheDir: tempDir,
      maxSize: 10 * 1024 * 1024, // 10MB
      ttl: 3600 * 1000, // 1 hour
      cleanupInterval: 100 // 100ms for testing
    });
  });

  afterEach(async () => {
    if (cacheService) {
      await cacheService.clear();
      cacheService.destroy();
    }
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('constructor', () => {
    test('should create cache service with default options', () => {
      const defaultCache = new CacheService();
      expect(defaultCache.options.enabled).toBe(true);
      expect(defaultCache.options.ttl).toBe(24 * 60 * 60 * 1000); // 24 hours
      defaultCache.destroy();
    });

    test('should accept custom options', () => {
      expect(cacheService.options.maxSize).toBe(10 * 1024 * 1024);
      expect(cacheService.options.ttl).toBe(3600 * 1000);
    });
  });

  describe('set and get', () => {
    test('should store and retrieve string values', async () => {
      await cacheService.set('test-key', 'test-value');
      const value = await cacheService.get('test-key');
      expect(value).toBe('test-value');
    });

    test('should store and retrieve object values', async () => {
      const testObject = { name: 'test', data: [1, 2, 3] };
      await cacheService.set('object-key', testObject);
      const value = await cacheService.get('object-key');
      expect(value).toEqual(testObject);
    });

    test('should return null for non-existent keys', async () => {
      const value = await cacheService.get('non-existent');
      expect(value).toBeNull();
    });

    test('should handle buffer values', async () => {
      const buffer = Buffer.from('test buffer content');
      await cacheService.set('buffer-key', buffer);
      const value = await cacheService.get('buffer-key');
      expect(Buffer.isBuffer(value)).toBe(true);
      expect(value.toString()).toBe('test buffer content');
    });
  });

  describe('has', () => {
    test('should return true for existing keys', async () => {
      await cacheService.set('exists', 'value');
      expect(await cacheService.has('exists')).toBe(true);
    });

    test('should return false for non-existent keys', async () => {
      expect(await cacheService.has('does-not-exist')).toBe(false);
    });
  });

  describe('delete', () => {
    test('should delete existing entries', async () => {
      await cacheService.set('to-delete', 'value');
      expect(await cacheService.has('to-delete')).toBe(true);
      
      await cacheService.delete('to-delete');
      expect(await cacheService.has('to-delete')).toBe(false);
    });

    test('should handle deletion of non-existent keys', async () => {
      await expect(cacheService.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    test('should clear all cache entries', async () => {
      await cacheService.set('key1', 'value1');
      await cacheService.set('key2', 'value2');
      
      expect(await cacheService.has('key1')).toBe(true);
      expect(await cacheService.has('key2')).toBe(true);
      
      await cacheService.clear();
      
      expect(await cacheService.has('key1')).toBe(false);
      expect(await cacheService.has('key2')).toBe(false);
    });
  });

  describe('TTL (Time To Live)', () => {
    test('should expire entries after TTL', async () => {
      const shortTtlCache = new CacheService({
        cacheDir: tempDir,
        ttl: 50 // 50ms
      });

      await shortTtlCache.set('expire-key', 'value');
      expect(await shortTtlCache.get('expire-key')).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(await shortTtlCache.get('expire-key')).toBeNull();
      shortTtlCache.destroy();
    });

    test('should allow custom TTL per entry', async () => {
      await cacheService.set('short-lived', 'value', { ttl: 50 });
      expect(await cacheService.get('short-lived')).toBe('value');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(await cacheService.get('short-lived')).toBeNull();
    });
  });

  describe('size management', () => {
    test('should track cache size', async () => {
      const sizeBefore = await cacheService.getSize();
      await cacheService.set('size-test', 'some content here');
      const sizeAfter = await cacheService.getSize();
      
      expect(sizeAfter).toBeGreaterThan(sizeBefore);
    });

    test('should enforce max size limits', async () => {
      const smallCache = new CacheService({
        cacheDir: tempDir,
        maxSize: 100 // Very small limit
      });

      // Try to store content larger than limit
      const largeContent = 'x'.repeat(200);
      await expect(smallCache.set('large', largeContent)).rejects.toThrow();
      
      smallCache.destroy();
    });
  });

  describe('key validation', () => {
    test('should validate cache keys', async () => {
      // Valid keys
      await expect(cacheService.set('valid-key', 'value')).resolves.not.toThrow();
      await expect(cacheService.set('valid_key_123', 'value')).resolves.not.toThrow();

      // Invalid keys
      await expect(cacheService.set('', 'value')).rejects.toThrow();
      await expect(cacheService.set('key/with/slashes', 'value')).rejects.toThrow();
      await expect(cacheService.set('key with spaces', 'value')).rejects.toThrow();
    });
  });

  describe('statistics', () => {
    test('should provide cache statistics', async () => {
      await cacheService.set('stat1', 'value1');
      await cacheService.set('stat2', 'value2');
      
      const stats = await cacheService.getStats();
      
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('missRate');
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
    });

    test('should track hit and miss rates', async () => {
      await cacheService.set('hit-test', 'value');
      
      // Generate hits
      await cacheService.get('hit-test');
      await cacheService.get('hit-test');
      
      // Generate misses
      await cacheService.get('miss-test1');
      await cacheService.get('miss-test2');
      
      const stats = await cacheService.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.missRate).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    test('should clean up expired entries', async () => {
      const cleanupCache = new CacheService({
        cacheDir: tempDir,
        ttl: 50,
        cleanupInterval: 25
      });

      await cleanupCache.set('cleanup-test', 'value');
      expect(await cleanupCache.has('cleanup-test')).toBe(true);
      
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(await cleanupCache.has('cleanup-test')).toBe(false);
      cleanupCache.destroy();
    });
  });

  describe('disabled cache', () => {
    test('should not store when disabled', async () => {
      const disabledCache = new CacheService({
        enabled: false
      });

      await disabledCache.set('disabled-key', 'value');
      expect(await disabledCache.get('disabled-key')).toBeNull();
      
      disabledCache.destroy();
    });
  });

  describe('error handling', () => {
    test('should handle file system errors gracefully', async () => {
      const invalidCache = new CacheService({
        cacheDir: '/invalid/path/that/does/not/exist'
      });

      await expect(invalidCache.set('test', 'value')).rejects.toThrow();
      invalidCache.destroy();
    });

    test('should handle corrupted cache files', async () => {
      // Create a corrupted cache file
      const corruptedPath = path.join(tempDir, 'corrupted-key.cache');
      await fs.writeFile(corruptedPath, 'invalid json content');
      
      // Should return null for corrupted entries
      expect(await cacheService.get('corrupted-key')).toBeNull();
    });
  });

  describe('namespace support', () => {
    test('should support cache namespaces', async () => {
      const ns1 = cacheService.namespace('namespace1');
      const ns2 = cacheService.namespace('namespace2');
      
      await ns1.set('key', 'value1');
      await ns2.set('key', 'value2');
      
      expect(await ns1.get('key')).toBe('value1');
      expect(await ns2.get('key')).toBe('value2');
    });

    test('should isolate namespace operations', async () => {
      const ns1 = cacheService.namespace('isolated1');
      const ns2 = cacheService.namespace('isolated2');
      
      await ns1.set('shared-key', 'ns1-value');
      await ns2.set('shared-key', 'ns2-value');
      
      await ns1.clear();
      
      expect(await ns1.get('shared-key')).toBeNull();
      expect(await ns2.get('shared-key')).toBe('ns2-value');
    });
  });
});