const {
  formatBytes,
  formatDuration,
  parseGitignorePattern,
  expandTilde,
  sanitizeFilename,
  isTextFile,
  isBinaryFile,
  calculateHash,
  deepMerge,
  debounce,
  throttle,
  retryWithBackoff,
  validateEmail,
  validateUrl,
  truncateText,
  escapeXml,
  unescapeXml,
  createProgressBar,
  isEmptyDirectory,
  isValidPath,
  normalizeLineEndings,
  extractFileExtension,
  getMimeType,
  isImageFile,
  isPdfFile,
  isArchiveFile
} = require('../../../src/utils/helpers');

describe('Helper Functions', () => {
  describe('formatBytes', () => {
    test('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.0 GB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    test('should handle decimal places', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 2)).toBe('1.50 KB');
    });
  });

  describe('formatDuration', () => {
    test('should format milliseconds correctly', () => {
      expect(formatDuration(100)).toBe('100ms');
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(60000)).toBe('1.0m');
      expect(formatDuration(3600000)).toBe('1.0h');
    });

    test('should handle complex durations', () => {
      expect(formatDuration(65000)).toBe('1.1m');
      expect(formatDuration(3665000)).toBe('1.0h');
    });
  });

  describe('parseGitignorePattern', () => {
    test('should parse simple patterns', () => {
      expect(parseGitignorePattern('*.log')).toEqual({
        pattern: '**/*.log',
        isNegated: false,
        isDirectory: false
      });
    });

    test('should handle negation', () => {
      expect(parseGitignorePattern('!important.log')).toEqual({
        pattern: '**/important.log',
        isNegated: true,
        isDirectory: false
      });
    });

    test('should handle directory patterns', () => {
      expect(parseGitignorePattern('build/')).toEqual({
        pattern: '**/build/**',
        isNegated: false,
        isDirectory: true
      });
    });

    test('should handle root patterns', () => {
      expect(parseGitignorePattern('/node_modules')).toEqual({
        pattern: 'node_modules',
        isNegated: false,
        isDirectory: false
      });
    });
  });

  describe('expandTilde', () => {
    test('should expand tilde to home directory', () => {
      const result = expandTilde('~/test');
      expect(result).toMatch(/^\/.*\/test$/);
      expect(result).not.toContain('~');
    });

    test('should not modify paths without tilde', () => {
      expect(expandTilde('/absolute/path')).toBe('/absolute/path');
      expect(expandTilde('relative/path')).toBe('relative/path');
    });
  });

  describe('sanitizeFilename', () => {
    test('should remove invalid characters', () => {
      expect(sanitizeFilename('file<>name')).toBe('filename');
      expect(sanitizeFilename('file:name')).toBe('filename');
      expect(sanitizeFilename('file/name')).toBe('filename');
    });

    test('should handle replacement character', () => {
      expect(sanitizeFilename('file:name', '_')).toBe('file_name');
    });

    test('should handle reserved names', () => {
      expect(sanitizeFilename('CON')).toBe('CON_');
      expect(sanitizeFilename('aux.txt')).toBe('aux_.txt');
    });
  });

  describe('isTextFile', () => {
    test('should identify text files', () => {
      expect(isTextFile('test.txt')).toBe(true);
      expect(isTextFile('test.js')).toBe(true);
      expect(isTextFile('test.json')).toBe(true);
      expect(isTextFile('test.md')).toBe(true);
    });

    test('should reject binary files', () => {
      expect(isTextFile('test.jpg')).toBe(false);
      expect(isTextFile('test.exe')).toBe(false);
      expect(isTextFile('test.pdf')).toBe(false);
    });
  });

  describe('isBinaryFile', () => {
    test('should identify binary files', () => {
      expect(isBinaryFile('test.jpg')).toBe(true);
      expect(isBinaryFile('test.exe')).toBe(true);
      expect(isBinaryFile('test.pdf')).toBe(true);
    });

    test('should reject text files', () => {
      expect(isBinaryFile('test.txt')).toBe(false);
      expect(isBinaryFile('test.js')).toBe(false);
    });
  });

  describe('calculateHash', () => {
    test('should calculate consistent hash', () => {
      const hash1 = calculateHash('test content');
      const hash2 = calculateHash('test content');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should produce different hashes for different content', () => {
      const hash1 = calculateHash('content1');
      const hash2 = calculateHash('content2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deepMerge', () => {
    test('should merge objects deeply', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { b: { d: 3 }, e: 4 };
      const result = deepMerge(obj1, obj2);
      
      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 3 },
        e: 4
      });
    });

    test('should handle arrays', () => {
      const obj1 = { arr: [1, 2] };
      const obj2 = { arr: [3, 4] };
      const result = deepMerge(obj1, obj2);
      
      expect(result.arr).toEqual([3, 4]); // Arrays are replaced, not merged
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    test('should debounce function calls', () => {
      const fn = jest.fn();
      const debounced = debounce(fn, 100);
      
      debounced();
      debounced();
      debounced();
      
      expect(fn).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
      jest.clearAllTimers();
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    test('should throttle function calls', () => {
      const fn = jest.fn();
      const throttled = throttle(fn, 100);
      
      throttled();
      throttled();
      throttled();
      
      expect(fn).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    afterEach(() => {
      jest.clearAllTimers();
    });
  });

  describe('retryWithBackoff', () => {
    test('should retry failed operations', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });
      
      const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Permanent failure'));
      
      await expect(retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 }))
        .rejects.toThrow('Permanent failure');
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('validateEmail', () => {
    test('should validate correct emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
    });

    test('should reject invalid emails', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
    });
  });

  describe('validateUrl', () => {
    test('should validate correct URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://sub.domain.org/path')).toBe(true);
    });

    test('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('truncateText', () => {
    test('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated';
      expect(truncateText(text, 20)).toBe('This is a very lo...');
    });

    test('should not truncate short text', () => {
      const text = 'Short text';
      expect(truncateText(text, 20)).toBe('Short text');
    });

    test('should handle custom suffix', () => {
      const text = 'This is a long text';
      expect(truncateText(text, 10, ' [more]')).toBe('This is a [more]');
    });
  });

  describe('escapeXml', () => {
    test('should escape XML entities', () => {
      expect(escapeXml('<tag>content & "value"</tag>'))
        .toBe('&lt;tag&gt;content &amp; &quot;value&quot;&lt;/tag&gt;');
    });
  });

  describe('unescapeXml', () => {
    test('should unescape XML entities', () => {
      expect(unescapeXml('&lt;tag&gt;content &amp; &quot;value&quot;&lt;/tag&gt;'))
        .toBe('<tag>content & "value"</tag>');
    });
  });

  describe('file type helpers', () => {
    test('should identify image files', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.png')).toBe(true);
      expect(isImageFile('text.txt')).toBe(false);
    });

    test('should identify PDF files', () => {
      expect(isPdfFile('document.pdf')).toBe(true);
      expect(isPdfFile('document.PDF')).toBe(true);
      expect(isPdfFile('text.txt')).toBe(false);
    });

    test('should identify archive files', () => {
      expect(isArchiveFile('archive.zip')).toBe(true);
      expect(isArchiveFile('backup.tar.gz')).toBe(true);
      expect(isArchiveFile('text.txt')).toBe(false);
    });
  });

  describe('extractFileExtension', () => {
    test('should extract file extensions', () => {
      expect(extractFileExtension('file.txt')).toBe('.txt');
      expect(extractFileExtension('archive.tar.gz')).toBe('.gz');
      expect(extractFileExtension('no-extension')).toBe('');
    });
  });

  describe('normalizeLineEndings', () => {
    test('should normalize line endings to LF', () => {
      expect(normalizeLineEndings('line1\r\nline2\r\nline3')).toBe('line1\nline2\nline3');
      expect(normalizeLineEndings('line1\rline2\rline3')).toBe('line1\nline2\nline3');
    });
  });
});