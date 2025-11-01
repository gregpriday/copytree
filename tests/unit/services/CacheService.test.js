// Use automatic mocking for logger
jest.mock('../../../src/utils/logger.js');

// Mock fs-extra methods that CacheService uses
jest.mock('fs-extra', () => ({
  ensureDirSync: jest.fn(),
  pathExists: jest.fn().mockResolvedValue(false),
  readJson: jest.fn().mockRejectedValue(new Error('File not found')),
  remove: jest.fn().mockResolvedValue(undefined),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  writeJson: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 1024, mtimeMs: Date.now() }),
}));

import { CacheService } from '../../../src/services/CacheService.js';
import fs from 'fs-extra';
import { withTempDir, settleFs } from '../../helpers/tempfs.js';

describe('CacheService', () => {
  describe('basic functionality', () => {
    test('should create cache service instance', async () => {
      await withTempDir('cache-service-instance', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        expect(cacheService).toBeDefined();
        expect(cacheService.enabled).toBe(true);
        expect(cacheService.driver).toBe('file');
        expect(cacheService.logger).toBeDefined();
        expect(typeof cacheService.logger.error).toBe('function');
      });
    });

    test('should set and get values', async () => {
      // Create a memory-based cache to avoid file system issues
      const memCache = new CacheService({
        driver: 'memory',
        enabled: true,
      });

      const result = await memCache.set('test-key', 'test-value');
      expect(result).toBe(true);

      const value = await memCache.get('test-key');
      expect(value).toBe('test-value');
    });

    test('should return null for non-existent keys', async () => {
      await withTempDir('cache-non-existent-keys', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        const value = await cacheService.get('non-existent');
        expect(value).toBeNull();
      });
    });

    test('should check if key exists', async () => {
      await withTempDir('cache-key-exists', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        await cacheService.set('exists', 'value');
        await settleFs(50);

        expect(await cacheService.has('exists')).toBe(true);
        expect(await cacheService.has('not-exists')).toBe(false);
      });
    });

    test('should delete keys', async () => {
      await withTempDir('cache-delete-keys', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        await cacheService.set('to-delete', 'value');
        await settleFs(50);
        expect(await cacheService.has('to-delete')).toBe(true);

        await cacheService.forget('to-delete');
        await settleFs(50);
        expect(await cacheService.has('to-delete')).toBe(false);
      });
    });

    test('should generate consistent keys', async () => {
      await withTempDir('cache-consistent-keys', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        const key1 = cacheService.generateKey('test');
        const key2 = cacheService.generateKey('test');
        expect(key1).toBe(key2);
      });
    });

    test('should clear cache', async () => {
      await withTempDir('cache-clear', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        await cacheService.set('key1', 'value1');
        await cacheService.set('key2', 'value2');
        await settleFs(50);

        const cleared = await cacheService.clear();
        expect(cleared).toBeGreaterThan(0);

        await settleFs(50);
        expect(await cacheService.has('key1')).toBe(false);
        expect(await cacheService.has('key2')).toBe(false);
      });
    });
  });

  describe('TTL functionality', () => {
    test('should expire entries after TTL', async () => {
      await withTempDir('cache-ttl-expiration', async (tempDir) => {
        const cacheService = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        // Set with 1 second TTL
        await cacheService.set('expire-test', 'value', 1);

        // Should exist immediately
        expect(await cacheService.get('expire-test')).toBe('value');

        // Wait for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));

        // Should be expired
        expect(await cacheService.get('expire-test')).toBeNull();
      });
    });
  });

  describe('disabled cache', () => {
    test('should not store when disabled', async () => {
      await withTempDir('cache-disabled', async (tempDir) => {
        const disabledCache = new CacheService({
          cachePath: tempDir,
          enabled: false,
        });

        await disabledCache.set('test', 'value');
        expect(await disabledCache.get('test')).toBeNull();
      });
    });
  });

  describe('memory driver', () => {
    test('should use memory cache', async () => {
      const memCache = new CacheService({
        driver: 'memory',
        enabled: true,
      });

      await memCache.set('key', 'value');
      expect(await memCache.get('key')).toBe('value');
    });
  });
});
