// Mock dependencies before requiring
jest.mock('tesseract.js');
jest.mock('fs-extra');
jest.mock('os');

const ImageTransformer = require('../../../src/transforms/transformers/ImageTransformer');
const Tesseract = require('tesseract.js');
const fs = require('fs-extra');
const os = require('os');

describe('ImageTransformer', () => {
  let transformer;
  let mockWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Tesseract worker
    mockWorker = {
      loadLanguage: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      recognize: jest.fn().mockResolvedValue({
        data: {
          text: 'Sample extracted text from image',
          confidence: 85.5,
          blocks: [
            {
              text: 'Sample text',
              confidence: 88.2,
              bbox: { x0: 10, y0: 20, x1: 100, y1: 50 }
            }
          ]
        }
      }),
      terminate: jest.fn().mockResolvedValue(undefined)
    };

    Tesseract.createWorker.mockImplementation((lang) => {
      // If called with language string, proceed normally
      if (typeof lang === 'string') {
        return Promise.resolve(mockWorker);
      }
      // If called with old API (object), also return worker
      return Promise.resolve(mockWorker);
    });
    os.tmpdir.mockReturnValue('/tmp');
    
    transformer = new ImageTransformer();
    transformer.logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };
  });

  afterEach(async () => {
    // Clean up any workers
    if (transformer.worker) {
      await transformer.cleanup();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const transformer = new ImageTransformer();
      expect(transformer.enableOCR).toBe(true);
      expect(transformer.language).toBe('eng');
      expect(transformer.includeMetadata).toBe(true);
      expect(transformer.supportedExtensions).toContain('.jpg');
      expect(transformer.supportedExtensions).toContain('.png');
    });

    it('should accept custom options', () => {
      const transformer = new ImageTransformer({
        enableOCR: false,
        language: 'fra',
        includeMetadata: false
      });
      
      expect(transformer.enableOCR).toBe(false);
      expect(transformer.language).toBe('fra');
      expect(transformer.includeMetadata).toBe(false);
    });
  });

  describe('canTransform', () => {
    it('should transform supported image files', () => {
      const supportedFiles = [
        { path: 'photo.jpg' },
        { path: 'image.jpeg' },
        { path: 'graphic.png' },
        { path: 'animation.gif' },
        { path: 'bitmap.bmp' },
        { path: 'photo.tiff' },
        { path: 'image.tif' },
        { path: 'modern.webp' }
      ];

      supportedFiles.forEach(file => {
        expect(transformer.canTransform(file)).toBe(true);
      });
    });

    it('should not transform non-image files', () => {
      const unsupportedFiles = [
        { path: 'document.pdf' },
        { path: 'script.js' },
        { path: 'video.mp4' },
        { path: 'audio.mp3' },
        { path: 'text.txt' }
      ];

      unsupportedFiles.forEach(file => {
        expect(transformer.canTransform(file)).toBe(false);
      });
    });

    it('should be case-insensitive', () => {
      expect(transformer.canTransform({ path: 'IMAGE.JPG' })).toBe(true);
      expect(transformer.canTransform({ path: 'PHOTO.PNG' })).toBe(true);
    });

    it('should handle files without extensions', () => {
      expect(transformer.canTransform({ path: 'README' })).toBeFalsy();
      expect(transformer.canTransform({ path: '' })).toBeFalsy();
    });
  });

  describe('doTransform', () => {
    it('should extract text from image with OCR enabled', async () => {
      const file = {
        path: 'test.jpg',
        absolutePath: '/project/test.jpg',
        size: 50000
      };

      const result = await transformer.doTransform(file);

      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('ImageTransformer');
      expect(result.isImage).toBe(true);
      expect(result.content).toContain('=== Image Information ===');
      expect(result.content).toContain('File: test.jpg');
      expect(result.content).toContain('Size: 48.83 KB');
      expect(result.content).toContain('Type: JPEG Image');
      expect(result.content).toContain('=== Extracted Text (OCR) ===');
      expect(result.content).toContain('Confidence: 85.5%');
      expect(result.content).toContain('Sample extracted text from image');
      expect(result.content).toContain('=== Text Blocks ===');
    });

    it('should handle OCR disabled', async () => {
      transformer = new ImageTransformer({ enableOCR: false });
      transformer.logger = { debug: jest.fn() };

      const file = {
        path: 'test.png',
        absolutePath: '/project/test.png',
        size: 25000
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[OCR disabled - image content not extracted]');
      expect(result.content).not.toContain('=== Extracted Text (OCR) ===');
      expect(Tesseract.createWorker).not.toHaveBeenCalled();
    });

    it('should handle metadata disabled', async () => {
      transformer = new ImageTransformer({ includeMetadata: false });
      transformer.logger = { debug: jest.fn() };

      const file = {
        path: 'test.png',
        absolutePath: '/project/test.png'
      };

      const result = await transformer.doTransform(file);

      expect(result.content).not.toContain('=== Image Information ===');
      expect(result.content).not.toContain('File:');
      expect(result.content).not.toContain('Size:');
    });

    it('should handle base64 encoded images', async () => {
      const mockBuffer = Buffer.from('fake image data');
      const base64Content = mockBuffer.toString('base64');
      
      const file = {
        path: 'encoded.jpg',
        content: base64Content,
        encoding: 'base64',
        size: 1000
      };

      // Ensure fs.writeFile succeeds for this test
      fs.writeFile.mockResolvedValue(undefined);
      fs.remove.mockResolvedValue(undefined);

      const result = await transformer.doTransform(file);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/copytree-img-'),
        mockBuffer
      );
      expect(fs.remove).toHaveBeenCalled();
      expect(result.transformed).toBe(true);
      expect(result.content).toContain('Sample extracted text from image');
    });

    it('should handle missing file path', async () => {
      const file = {
        path: 'nopath.jpg',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      expect(result.transformed).toBe(false);
      expect(result.content).toBe('[Image file - no path available for OCR]');
    });

    it('should handle OCR with no text detected', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: '',
          confidence: 0,
          blocks: []
        }
      });

      const file = {
        path: 'blank.jpg',
        absolutePath: '/project/blank.jpg',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[No text detected in image]');
      expect(result.content).not.toContain('=== Extracted Text (OCR) ===');
    });

    it('should handle OCR errors gracefully', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('OCR processing failed'));

      const file = {
        path: 'corrupt.jpg',
        absolutePath: '/project/corrupt.jpg',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('[No text detected in image]');
      expect(transformer.logger.warn).toHaveBeenCalled();
    });

    it('should handle file processing errors', async () => {
      // Mock fs.writeFile to throw an error for the main doTransform to catch
      fs.writeFile.mockRejectedValue(new Error('File write failed'));

      const file = {
        path: 'error.jpg',
        content: 'base64content',
        encoding: 'base64',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      expect(result.transformed).toBe(false);
      expect(result.content).toBe('[Error processing image: File write failed]');
      expect(result.error).toBe('File write failed');
      expect(transformer.logger.error).toHaveBeenCalled();
    });

    it('should reuse existing worker', async () => {
      const file1 = {
        path: 'test1.jpg',
        absolutePath: '/project/test1.jpg',
        size: 1000
      };

      const file2 = {
        path: 'test2.jpg',
        absolutePath: '/project/test2.jpg',
        size: 1000
      };

      await transformer.doTransform(file1);
      await transformer.doTransform(file2);

      // Worker should be created only once
      expect(Tesseract.createWorker).toHaveBeenCalledTimes(1);
      expect(mockWorker.recognize).toHaveBeenCalledTimes(2);
    });

    it('should handle temp file cleanup errors', async () => {
      fs.remove.mockRejectedValue(new Error('Failed to remove temp file'));

      const file = {
        path: 'encoded.jpg',
        content: 'base64content',
        encoding: 'base64',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      // Should not throw error, just log it
      expect(result.transformed).toBe(true);
      expect(fs.remove).toHaveBeenCalled();
    });
  });

  describe('getImageType', () => {
    it('should return correct image types', () => {
      const testCases = [
        { path: 'photo.jpg', expected: 'JPEG Image' },
        { path: 'image.jpeg', expected: 'JPEG Image' },
        { path: 'graphic.png', expected: 'PNG Image' },
        { path: 'animation.gif', expected: 'GIF Animation' },
        { path: 'bitmap.bmp', expected: 'Bitmap Image' },
        { path: 'document.tiff', expected: 'TIFF Image' },
        { path: 'scan.tif', expected: 'TIFF Image' },
        { path: 'modern.webp', expected: 'WebP Image' },
        { path: 'unknown.xyz', expected: 'Image' }
      ];

      testCases.forEach(testCase => {
        expect(transformer.getImageType(testCase.path)).toBe(testCase.expected);
      });
    });

    it('should be case-insensitive', () => {
      expect(transformer.getImageType('PHOTO.JPG')).toBe('JPEG Image');
      expect(transformer.getImageType('Image.PNG')).toBe('PNG Image');
    });
  });

  describe('performOCR', () => {
    it('should create and configure worker on first use', async () => {
      const result = await transformer.performOCR('/path/to/image.jpg');

      expect(Tesseract.createWorker).toHaveBeenCalledWith('eng');
      expect(mockWorker.recognize).toHaveBeenCalledWith('/path/to/image.jpg');
      expect(result.text).toBe('Sample extracted text from image');
      expect(result.confidence).toBe(85.5);
    });

    it('should use custom language', async () => {
      transformer = new ImageTransformer({ language: 'fra' });
      transformer.logger = { debug: jest.fn(), warn: jest.fn() };

      await transformer.performOCR('/path/to/french.jpg');

      expect(Tesseract.createWorker).toHaveBeenCalledWith('fra');
    });

    it('should handle OCR errors', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('Recognition failed'));

      const result = await transformer.performOCR('/path/to/bad.jpg');

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.error).toBe('Recognition failed');
      expect(transformer.logger.warn).toHaveBeenCalled();
    });

    it('should format blocks correctly', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Multi block text',
          confidence: 90,
          blocks: [
            {
              text: 'Block 1',
              confidence: 85,
              bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }
            },
            {
              text: 'Block 2',
              confidence: 95,
              bbox: { x0: 0, y0: 25, x1: 50, y1: 45 }
            }
          ]
        }
      });

      const result = await transformer.performOCR('/path/to/multiblock.jpg');

      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0]).toEqual({
        text: 'Block 1',
        confidence: 85,
        bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }
      });
    });
  });

  describe('cleanup', () => {
    it('should terminate worker when cleanup is called', async () => {
      // Initialize worker first
      await transformer.performOCR('/path/to/image.jpg');
      expect(transformer.worker).toBeTruthy();

      await transformer.cleanup();

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(transformer.worker).toBeNull();
    });

    it('should handle cleanup when no worker exists', async () => {
      expect(transformer.worker).toBeNull();
      
      await transformer.cleanup();
      
      // Should not throw error
      expect(mockWorker.terminate).not.toHaveBeenCalled();
    });
  });

  describe('worker lifecycle', () => {
    it('should handle worker creation failure', async () => {
      Tesseract.createWorker.mockRejectedValue(new Error('Worker creation failed'));

      const result = await transformer.performOCR('/path/to/image.jpg');

      expect(result.error).toBe('Worker creation failed');
      expect(result.confidence).toBe(0);
    });

    // Note: In Tesseract.js v6, worker creation and initialization happen in one step
    // The loadLanguage and initialize methods no longer exist separately
  });

  describe('edge cases', () => {
    it('should handle very large images', async () => {
      const file = {
        path: 'huge.jpg',
        absolutePath: '/project/huge.jpg',
        size: 50 * 1024 * 1024 // 50MB
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Size: 50 MB');
      expect(result.transformed).toBe(true);
    });

    it('should handle empty file size', async () => {
      const file = {
        path: 'empty.jpg',
        absolutePath: '/project/empty.jpg'
        // No size property
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Size: 0 B');
    });

    it('should handle special characters in text', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Special chars: €£¥ñáéíóú "quotes" & symbols!',
          confidence: 80,
          blocks: []
        }
      });

      const file = {
        path: 'special.jpg',
        absolutePath: '/project/special.jpg',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      expect(result.content).toContain('Special chars: €£¥ñáéíóú "quotes" & symbols!');
    });

    it('should handle very low confidence OCR', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Barely readable text',
          confidence: 0.1,
          blocks: []
        }
      });

      const file = {
        path: 'blurry.jpg',
        absolutePath: '/project/blurry.jpg',
        size: 1000
      };

      const result = await transformer.doTransform(file);

      // 0.1 > 0, so it should still extract the text
      expect(result.content).toContain('Confidence: 0.1%');
      expect(result.content).toContain('Barely readable text');
    });
  });
});