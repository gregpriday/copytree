// Use automatic mocking for logger
jest.mock('../../../src/utils/logger.js');

// Unmock fs-extra to test real file operations
jest.unmock('fs-extra');

import { CacheService } from '../../../src/services/CacheService.js';
import fs from 'fs-extra';
import path from 'path';
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

  describe('persistence (file driver)', () => {
    test('should persist and load data across instances', async () => {
      await withTempDir('cache-persistence', async (tempDir) => {
        // First instance: write data
        const cache1 = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        await cache1.set('persistent-key', 'persistent-value');
        await cache1.set('another-key', { foo: 'bar' });
        await settleFs(50);

        // Verify files were written
        const files = await fs.readdir(tempDir);
        expect(files.length).toBeGreaterThan(0);

        // Second instance: read data (simulates restart)
        const cache2 = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        // Should read persisted data from disk
        expect(await cache2.get('persistent-key')).toBe('persistent-value');
        expect(await cache2.get('another-key')).toEqual({ foo: 'bar' });
      });
    });

    test('should respect TTL after restart', async () => {
      await withTempDir('cache-ttl-persistence', async (tempDir) => {
        // First instance: write with short TTL
        const cache1 = new CacheService({
          cachePath: tempDir,
          defaultTtl: 2, // 2 seconds
          enabled: true,
          driver: 'file',
        });

        await cache1.set('short-lived', 'value');
        await settleFs(50);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 2100));

        // Second instance: try to read expired data
        const cache2 = new CacheService({
          cachePath: tempDir,
          defaultTtl: 3600,
          enabled: true,
          driver: 'file',
        });

        // Should be null due to expiration
        expect(await cache2.get('short-lived')).toBeNull();
      });
    });
  });
});
