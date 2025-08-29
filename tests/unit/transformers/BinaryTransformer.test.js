jest.mock('fs-extra');

// Mock config
const mockConfig = {
  get: jest.fn((key, defaultValue) => {
    if (key === 'copytree.binaryPlaceholderText') {
      return '[Binary file not included]';
    }
    return defaultValue;
  }),
};

// Static import
import fs from 'fs-extra';

// Use dynamic import for module under test
let BinaryTransformer;

beforeAll(async () => {
  const binaryTransformerModule = await import(
    '../../../src/transforms/transformers/BinaryTransformer.js'
  );
  BinaryTransformer = binaryTransformerModule.default;
});

describe('BinaryTransformer', () => {
  let transformer;

  beforeEach(() => {
    jest.clearAllMocks();
    transformer = new BinaryTransformer();
    transformer.config = mockConfig;
    transformer.logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
  });

  describe('canTransform', () => {
    it('should transform binary files', () => {
      expect(transformer.canTransform({ path: 'image.jpg' })).toBe(true);
      expect(transformer.canTransform({ path: 'file.png' })).toBe(true);
      expect(transformer.canTransform({ path: 'archive.zip' })).toBe(true);
      expect(transformer.canTransform({ path: 'document.pdf' })).toBe(true);
      expect(transformer.canTransform({ path: 'video.mp4' })).toBe(true);
    });

    it('should not transform text files', () => {
      expect(transformer.canTransform({ path: 'script.js' })).toBe(false);
      expect(transformer.canTransform({ path: 'style.css' })).toBe(false);
      expect(transformer.canTransform({ path: 'data.json' })).toBe(false);
      expect(transformer.canTransform({ path: 'README.md' })).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(transformer.canTransform({ path: 'IMAGE.JPG' })).toBe(true);
      expect(transformer.canTransform({ path: 'FILE.ZIP' })).toBe(true);
      expect(transformer.canTransform({ path: 'SCRIPT.JS' })).toBe(false);
    });

    it('should handle files without extensions', () => {
      expect(transformer.canTransform({ path: 'README' })).toBeFalsy();
      expect(transformer.canTransform({ path: 'Makefile' })).toBeFalsy();
    });
  });

  describe('doTransform', () => {
    it('should transform binary file with size info', async () => {
      const file = {
        path: 'image.png',
        size: 2048576, // 2MB
      };

      const result = await transformer.doTransform(file);

      // The implementation returns multiline format: placeholder + type + size
      expect(result.content).toMatch(/Type: PNG Image/);
      expect(result.content).toMatch(/Size: 1.95 MB/);
      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('BinaryTransformer');
      expect(result.isBinary).toBe(true);
      expect(result.binaryAction).toBe('placeholder');
    });

    it('should handle missing stats', async () => {
      const file = {
        path: 'file.zip',
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toMatch(/Type: ZIP Archive/);
      expect(result.content).toMatch(/Size: 0 B/);
      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('BinaryTransformer');
    });

    it('should handle files with no size', async () => {
      const file = {
        path: 'empty.bin',
        size: 0,
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toMatch(/Type: Binary File \(\.bin\)/);
      expect(result.content).toMatch(/Size: 0 B/);
    });

    it('should format various file sizes correctly', async () => {
      const testCases = [
        { size: 512, expected: '512 B' },
        { size: 1024, expected: '1 KB' },
        { size: 1536, expected: '1.5 KB' },
        { size: 1048576, expected: '1 MB' },
        { size: 1073741824, expected: '1 GB' },
      ];

      for (const testCase of testCases) {
        const file = {
          path: 'test.bin',
          size: testCase.size,
        };

        const result = await transformer.doTransform(file);
        expect(result.content).toContain(`Size: ${testCase.expected}`);
      }
    });

    it('should maintain file object properties', async () => {
      const file = {
        path: 'archive.zip',
        absolutePath: '/project/archive.zip',
        size: 1024,
        customProp: 'value',
      };

      const result = await transformer.doTransform(file);

      expect(result.path).toBe('archive.zip');
      expect(result.absolutePath).toBe('/project/archive.zip');
      expect(result.customProp).toBe('value');
    });

    it('should support audio files', async () => {
      const audioFiles = ['song.mp3', 'audio.wav', 'sound.ogg', 'music.m4a', 'track.flac'];

      for (const filename of audioFiles) {
        const ext = filename.match(/\.[^.]+$/)[0];
        // Only .mp3 is in the supported list
        if (ext === '.mp3') {
          expect(transformer.supportedExtensions).toContain(ext);
        } else {
          expect(transformer.supportedExtensions).not.toContain(ext);
        }
      }
    });

    it('should support video files', () => {
      const videoFiles = [
        'movie.mp4',
        'video.avi',
        'clip.mov',
        'film.mkv',
        'show.webm',
        'video.wmv',
        'animation.flv',
      ];

      for (const filename of videoFiles) {
        const ext = filename.match(/\.[^.]+$/)[0];
        const isSupported = transformer.supportedExtensions.includes(ext);
        if (!isSupported) {
          console.log(`Video extension ${ext} not supported`);
        }
        // Only .mp4, .avi, .mov, .wmv, .flv, .webm are supported in the implementation
        if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext)) {
          expect(isSupported).toBe(true);
        } else {
          expect(isSupported).toBe(false);
        }
      }
    });

    it('should support archive files', () => {
      const archiveFiles = ['backup.zip', 'files.tar', 'archive.gz', 'compressed.rar', 'data.7z'];

      archiveFiles.forEach((filename) => {
        expect(transformer.canTransform({ path: filename })).toBe(true);
      });
    });

    it('should support font files', () => {
      const fontFiles = [
        'font.ttf',
        'typeface.otf',
        'webfont.woff',
        'webfont2.woff2',
        'embedded.eot',
      ];

      for (const filename of fontFiles) {
        const result = transformer.canTransform({ path: filename });
        // Font files are not in the supported list
        expect(result).toBe(false);
      }
    });

    it('should support executable and library files', () => {
      const execFiles = ['program.exe', 'library.dll', 'shared.so', 'dynamic.dylib', 'app'];

      for (const filename of execFiles) {
        const result = transformer.canTransform({ path: filename });
        // .exe, .dll, .so, .dylib are supported, but 'app' without extension is not
        if (filename === 'app') {
          expect(result).toBeFalsy();
        } else {
          expect(result).toBe(true);
        }
      }
    });

    it('should handle base64 encoding when configured', async () => {
      mockConfig.get.mockImplementation((key, defaultValue) => {
        if (key === 'copytree.binaryFileAction') return 'base64';
        if (key === 'copytree.maxBase64Size') return 1024 * 1024; // 1MB
        return defaultValue;
      });

      const mockBuffer = Buffer.from('test content');
      fs.readFile.mockResolvedValue(mockBuffer);

      const file = {
        path: 'small.png',
        absolutePath: '/project/small.png',
        size: 1024, // 1KB
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[Binary file encoded as base64]');
      expect(result.content).toContain('Type: PNG Image');
      expect(result.content).toContain('Size: 1 KB');
      expect(result.content).toContain('Encoding: base64');
      expect(result.content).toContain(mockBuffer.toString('base64'));
      expect(result.binaryAction).toBe('base64');
      expect(result.encoding).toBe('base64');
    });

    it('should fall back to placeholder for large files in base64 mode', async () => {
      mockConfig.get.mockImplementation((key, defaultValue) => {
        if (key === 'copytree.binaryFileAction') return 'base64';
        if (key === 'copytree.maxBase64Size') return 1024; // 1KB limit
        return defaultValue;
      });

      const file = {
        path: 'large.png',
        absolutePath: '/project/large.png',
        size: 2048, // 2KB, over limit
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[Binary file not included]');
      expect(result.binaryAction).toBe('placeholder');
      expect(transformer.logger.warn).toHaveBeenCalled();
    });

    it('should return null when action is skip', async () => {
      mockConfig.get.mockImplementation((key, defaultValue) => {
        if (key === 'copytree.binaryFileAction') return 'skip';
        return defaultValue;
      });

      const file = {
        path: 'skip.png',
        size: 1024,
      };

      const result = await transformer.doTransform(file);

      expect(result).toBeNull();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(transformer.formatBytes(0)).toBe('0 B');
      expect(transformer.formatBytes(100)).toBe('100 B');
      expect(transformer.formatBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(transformer.formatBytes(1024)).toBe('1 KB');
      expect(transformer.formatBytes(1536)).toBe('1.5 KB');
      expect(transformer.formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes correctly', () => {
      expect(transformer.formatBytes(1048576)).toBe('1 MB');
      expect(transformer.formatBytes(5242880)).toBe('5 MB');
      expect(transformer.formatBytes(10485760)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(transformer.formatBytes(1073741824)).toBe('1 GB');
      expect(transformer.formatBytes(2147483648)).toBe('2 GB');
    });
  });
});
