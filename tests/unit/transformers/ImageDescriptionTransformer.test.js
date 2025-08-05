// Mock the BaseTransformer to avoid its dependencies
jest.mock('../../../src/transforms/BaseTransformer.js', () => {
  return class BaseTransformer {
    constructor(options = {}) {
      this.options = options;
      this.logger = {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn()
      };
      this.config = {
        get: jest.fn((key, defaultValue) => defaultValue)
      };
      this.cacheEnabled = false;
      this.isHeavy = false;
    }
    
    async transform(file) {
      this.logger.debug(`Transforming ${file.path}`);
      return this.doTransform(file);
    }
    
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  };
});

jest.mock('@google/generative-ai');
jest.mock('fs-extra');

import ImageDescriptionTransformer from '../../../src/transforms/transformers/ImageDescriptionTransformer.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs-extra';

describe('ImageDescriptionTransformer', () => {
  let transformer;
  let mockModel;
  let mockGenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up the mock for GoogleGenerativeAI
    mockModel = {
      generateContent: jest.fn(),
      model: 'gemini-1.5-flash'
    };
    
    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    };
    
    GoogleGenerativeAI.mockImplementation(() => mockGenAI);
    
    // Set API key environment variable
    process.env.GEMINI_API_KEY = 'test-api-key';
    
    // Create transformer with cache disabled
    transformer = new ImageDescriptionTransformer({ cache: false });
  });
  
  afterEach(() => {
    // Clean up environment
    delete process.env.GEMINI_API_KEY;
  });

  describe('canTransform', () => {
    it('should transform common image formats', () => {
      expect(!!transformer.canTransform({ path: 'image.jpg' })).toBe(true);
      expect(!!transformer.canTransform({ path: 'photo.jpeg' })).toBe(true);
      expect(!!transformer.canTransform({ path: 'diagram.png' })).toBe(true);
      expect(!!transformer.canTransform({ path: 'icon.gif' })).toBe(true);
      expect(!!transformer.canTransform({ path: 'logo.webp' })).toBe(true);
    });

    it('should not transform non-image files', () => {
      expect(transformer.canTransform({ path: 'script.js' })).toBe(false);
      expect(transformer.canTransform({ path: 'document.pdf' })).toBe(false);
      expect(transformer.canTransform({ path: 'styles.css' })).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(!!transformer.canTransform({ path: 'IMAGE.JPG' })).toBe(true);
      expect(!!transformer.canTransform({ path: 'Photo.PNG' })).toBe(true);
    });
    
    it('should not transform when API key is missing', () => {
      // Create transformer without API key
      delete process.env.GEMINI_API_KEY;
      const noKeyTransformer = new ImageDescriptionTransformer();
      expect(!!noKeyTransformer.canTransform({ path: 'image.jpg' })).toBe(false);
    });
  });

  describe('transform', () => {
    const mockImageBuffer = Buffer.from('fake-image-data');

    beforeEach(() => {
      fs.readFile.mockResolvedValue(mockImageBuffer);
      fs.pathExists.mockResolvedValue(true);
    });

    it('should generate AI description for image', async () => {
      const file = {
        path: 'screenshot.png',
        absolutePath: '/project/screenshot.png',
        stats: { size: 1048576 }
      };
      const mockDescription = 'A screenshot showing a login form with username and password fields';
      
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => mockDescription
        }
      });
      
      const result = await transformer.transform(file);
      
      expect(mockModel.generateContent).toHaveBeenCalledWith([
        expect.stringContaining('Describe this image'),
        {
          inlineData: {
            mimeType: 'image/png',
            data: mockImageBuffer.toString('base64')
          }
        }
      ]);
      expect(result.content).toContain('[Image: screenshot.png');
      expect(result.content).toContain(mockDescription);
      expect(result.content).toContain('1 MB');
      expect(result.content).toContain('[AI-generated description by ImageDescriptionTransformer]');
      expect(result.transformed).toBe(true);
      expect(result.transformedBy).toBe('ImageDescriptionTransformer');
    });

    it('should handle AI service errors gracefully', async () => {
      const file = {
        path: 'image.jpg',
        absolutePath: '/project/image.jpg',
        stats: { size: 1048576 }
      };
      
      mockModel.generateContent.mockRejectedValue(new Error('API error'));
      
      const result = await transformer.transform(file);
      
      expect(result.content).toContain('[Image: image.jpg');
      expect(result.content).toContain('[Description generation failed: API error]');
      expect(result.content).toContain('1 MB');
      expect(result.transformed).toBe(true);
      expect(result.metadata.error).toBe('API error');
    });

    it('should handle missing API key', async () => {
      const file = {
        path: 'image.png',
        absolutePath: '/project/image.png',
        stats: { size: 1048576 }
      };
      
      // Create transformer without API key
      delete process.env.GEMINI_API_KEY;
      const noKeyTransformer = new ImageDescriptionTransformer();
      
      // Should not be able to transform without API key
      expect(!!noKeyTransformer.canTransform(file)).toBe(false);
    });

    it('should format file size correctly', async () => {
      const testCases = [
        { size: 500, expected: '500 B' },
        { size: 1024, expected: '1 KB' },
        { size: 1048576, expected: '1 MB' },
        { size: 1073741824, expected: '1 GB' }
      ];

      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Test description'
        }
      });

      for (const { size, expected } of testCases) {
        const result = await transformer.transform({
          path: 'test.jpg',
          absolutePath: '/test.jpg',
          stats: { size }
        });
        
        expect(result.content).toContain(expected);
      }
    });

    it('should handle files without size in stats', async () => {
      const file = {
        path: 'corrupt.jpg',
        absolutePath: '/project/corrupt.jpg',
        content: mockImageBuffer
      };
      
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Test description'
        }
      });
      
      const result = await transformer.transform(file);
      
      // Should use buffer length when stats.size is not available
      expect(result.content).toContain(`${mockImageBuffer.length} B`);
    });

    it('should handle large files', async () => {
      const file = {
        path: 'large.png',
        absolutePath: '/project/large.png',
        stats: { size: 15 * 1024 * 1024 } // 15MB
      };
      
      const result = await transformer.transform(file);
      
      expect(result.content).toContain('[Image too large for description: 15 MB]');
      expect(result.transformed).toBe(true);
      expect(result.metadata.skippedReason).toBe('size_limit_exceeded');
    });

    it('should include metadata when available', async () => {
      const file = {
        path: 'detailed.png',
        absolutePath: '/detailed.png',
        stats: { size: 5242880 },
        metadata: {
          dimensions: {
            width: 3840,
            height: 2160
          }
        }
      };
      
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => '4K screenshot'
        }
      });
      
      const result = await transformer.transform(file);
      
      expect(result.content).toContain('(3840x2160)');
      expect(result.content).toContain('5 MB');
      expect(result.content).toContain('4K screenshot');
    });
  });

});