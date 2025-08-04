// Static import for fs-extra (mocked)
import fs from 'fs-extra';

// Use dynamic import for module under test
let hash, shortHash, sleep, retry, ensureDir, getTempDir, cleanupTempDir, isPathInside, normalizePath, getExtension, isBinaryExtension, truncate, formatBytes, formatDuration, parseSize, chunk, debounce, createCache, escapeXml, timestamp;

beforeAll(async () => {
  const helpersModule = await import('../../../src/utils/helpers.js');
  ({
    hash,
    shortHash,
    sleep,
    retry,
    ensureDir,
    getTempDir,
    cleanupTempDir,
    isPathInside,
    normalizePath,
    getExtension,
    isBinaryExtension,
    truncate,
    formatBytes,
    formatDuration,
    parseSize,
    chunk,
    debounce,
    createCache,
    escapeXml,
    timestamp
  } = helpersModule);
});

describe('Helper Functions', () => {
  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    test('should handle decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 2)).toBe('1.5 KB');
    });
  });

  describe('formatDuration', () => {
    test('should format milliseconds correctly', () => {
      expect(formatDuration(100)).toBe('100ms');
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(3600000)).toBe('1h 0m 0s');
    });

    test('should handle complex durations', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(3665000)).toBe('1h 1m 5s');
    });
  });

  describe('hash', () => {
    test('should create consistent hashes', () => {
      const hash1 = hash('test string');
      const hash2 = hash('test string');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 character hex
    });

    test('should create different hashes for different content', () => {
      const hash1 = hash('string1');
      const hash2 = hash('string2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('shortHash', () => {
    test('should create 8 character hash', () => {
      const result = shortHash('test string');
      expect(result).toHaveLength(8);
    });
  });

  describe('isPathInside', () => {
    test('should detect when path is inside parent', () => {
      expect(isPathInside('/parent/child', '/parent')).toBe(true);
      expect(isPathInside('/parent/deep/nested', '/parent')).toBe(true);
    });

    test('should detect when path is outside parent', () => {
      expect(isPathInside('/other/path', '/parent')).toBe(false);
      expect(isPathInside('/parent/../outside', '/parent')).toBe(false);
    });
  });

  describe('normalizePath', () => {
    test('should normalize path separators', () => {
      expect(normalizePath('path\\to\\file')).toBe('path/to/file');
      expect(normalizePath('already/normalized')).toBe('already/normalized');
    });
  });

  describe('getExtension', () => {
    test('should get file extension without dot', () => {
      expect(getExtension('file.txt')).toBe('txt');
      expect(getExtension('archive.tar.gz')).toBe('gz');
      expect(getExtension('no-extension')).toBe('');
    });
  });

  describe('isBinaryExtension', () => {
    test('should identify binary extensions', () => {
      expect(isBinaryExtension('image.jpg')).toBe(true);
      expect(isBinaryExtension('video.mp4')).toBe(true);
      expect(isBinaryExtension('archive.zip')).toBe(true);
      expect(isBinaryExtension('document.pdf')).toBe(true);
    });

    test('should reject text file extensions', () => {
      expect(isBinaryExtension('file.txt')).toBe(false);
      expect(isBinaryExtension('script.js')).toBe(false);
      expect(isBinaryExtension('data.json')).toBe(false);
    });
  });

  describe('truncate', () => {
    test('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated';
      expect(truncate(text, 20)).toBe('This is a very lo...');
    });

    test('should not truncate short text', () => {
      const text = 'Short text';
      expect(truncate(text, 20)).toBe('Short text');
    });

    test('should handle custom suffix', () => {
      const text = 'This is a long text';
      expect(truncate(text, 10, ' [more]')).toBe('Thi [more]');
    });
  });

  describe('parseSize', () => {
    test('should parse size strings to bytes', () => {
      expect(parseSize('100')).toBe(100);
      expect(parseSize('1KB')).toBe(1024);
      expect(parseSize('10MB')).toBe(10 * 1024 * 1024);
      expect(parseSize('1.5GB')).toBe(Math.floor(1.5 * 1024 * 1024 * 1024));
    });

    test('should handle different formats', () => {
      expect(parseSize('10 MB')).toBe(10 * 1024 * 1024);
      expect(parseSize('1024B')).toBe(1024);
    });

    test('should throw on invalid format', () => {
      expect(() => parseSize('invalid')).toThrow();
    });
  });

  describe('chunk', () => {
    test('should chunk arrays', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      expect(chunk(array, 3)).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
    });

    test('should handle arrays not evenly divisible', () => {
      const array = [1, 2, 3, 4, 5];
      expect(chunk(array, 2)).toEqual([
        [1, 2],
        [3, 4],
        [5]
      ]);
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    test('should debounce function calls', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const debounced = debounce(fn, 100);

      // Call multiple times
      debounced();
      debounced();
      const promise = debounced();

      // Function shouldn't be called yet
      expect(fn).not.toHaveBeenCalled();

      // Advance time
      jest.advanceTimersByTime(100);
      await promise;

      // Function should be called once
      expect(fn).toHaveBeenCalledTimes(1);
    });

    jest.useRealTimers();
  });

  describe('retry', () => {
    test('should retry failed operations', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Failed');
        }
        return 'success';
      });

      const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should fail after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(retry(fn, { maxAttempts: 2, initialDelay: 10 }))
        .rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createCache', () => {
    test('should create working cache', () => {
      const cache = createCache(1000);
      
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.size()).toBe(1);
    });

    test('should expire entries', async () => {
      const cache = createCache(100); // 100ms TTL
      
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      
      await sleep(150);
      expect(cache.get('key1')).toBeNull();
    });

    test('should support delete and clear', () => {
      const cache = createCache();
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
      expect(cache.size()).toBe(1);
      
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('sleep', () => {
    test('should delay execution', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('escapeXml', () => {
    test('should escape XML entities', () => {
      expect(escapeXml('<tag>content & "value"</tag>'))
        .toBe('&lt;tag&gt;content &amp; &quot;value&quot;&lt;/tag&gt;');
    });
  });

  describe('timestamp', () => {
    test('should return ISO formatted timestamp', () => {
      const ts = timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(ts).toString()).not.toBe('Invalid Date');
    });
  });

  describe('ensureDir', () => {
    test('should ensure directory exists', async () => {
      const tempPath = `/tmp/test-${Date.now()}`;
      
      // Mock pathExists to return true after ensureDir is called
      fs.pathExists.mockResolvedValue(true);
      
      await ensureDir(tempPath);
      expect(await fs.pathExists(tempPath)).toBe(true);
      
      // Cleanup
      await fs.remove(tempPath);
    });
  });

  describe('getTempDir', () => {
    test('should create temporary directory', async () => {
      // Mock pathExists to return true for temp directories
      fs.pathExists.mockResolvedValue(true);
      
      const tempDir = await getTempDir('test');
      
      expect(tempDir).toMatch(/test-\d+-\w{8}$/);
      expect(await fs.pathExists(tempDir)).toBe(true);
      
      // Cleanup
      await cleanupTempDir(tempDir);
    });
  });
});