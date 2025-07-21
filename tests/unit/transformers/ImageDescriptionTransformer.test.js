const ImageDescriptionTransformer = require('../../../src/transforms/transformers/ImageDescriptionTransformer');
const AIService = require('../../../src/services/AIService');
const sharp = require('sharp');
const fs = require('fs-extra');

// Mock dependencies
jest.mock('../../../src/services/AIService');
jest.mock('sharp');
jest.mock('fs-extra');

describe('ImageDescriptionTransformer', () => {
  let transformer;
  let mockAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAIService = {
      describeImage: jest.fn()
    };
    AIService.mockImplementation(() => mockAIService);
    
    transformer = new ImageDescriptionTransformer();
  });

  describe('canTransform', () => {
    it('should transform common image formats', () => {
      expect(transformer.canTransform('image.jpg')).toBe(true);
      expect(transformer.canTransform('photo.jpeg')).toBe(true);
      expect(transformer.canTransform('diagram.png')).toBe(true);
      expect(transformer.canTransform('icon.gif')).toBe(true);
      expect(transformer.canTransform('logo.webp')).toBe(true);
    });

    it('should not transform non-image files', () => {
      expect(transformer.canTransform('script.js')).toBe(false);
      expect(transformer.canTransform('document.pdf')).toBe(false);
      expect(transformer.canTransform('styles.css')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(transformer.canTransform('IMAGE.JPG')).toBe(true);
      expect(transformer.canTransform('Photo.PNG')).toBe(true);
    });
  });

  describe('transform', () => {
    const mockImageBuffer = Buffer.from('fake-image-data');
    const mockMetadata = {
      width: 1920,
      height: 1080,
      format: 'jpeg',
      size: 1048576
    };

    beforeEach(() => {
      fs.readFile.mockResolvedValue(mockImageBuffer);
      sharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue(mockMetadata)
      });
    });

    it('should generate AI description for image', async () => {
      const file = {
        path: 'screenshot.png',
        absolutePath: '/project/screenshot.png'
      };
      const mockDescription = 'A screenshot showing a login form with username and password fields';
      
      mockAIService.describeImage.mockResolvedValue(mockDescription);
      
      const result = await transformer.transform(file);
      
      expect(mockAIService.describeImage).toHaveBeenCalledWith(
        mockImageBuffer,
        expect.objectContaining({
          mimeType: 'image/png',
          metadata: mockMetadata
        })
      );
      expect(result).toContain('AI-Generated Description');
      expect(result).toContain(mockDescription);
      expect(result).toContain('1920x1080');
      expect(result).toContain('1.00 MB');
    });

    it('should handle AI service errors gracefully', async () => {
      const file = {
        path: 'image.jpg',
        absolutePath: '/project/image.jpg'
      };
      
      mockAIService.describeImage.mockRejectedValue(new Error('API error'));
      
      const result = await transformer.transform(file);
      
      expect(result).toContain('[Image file - AI description unavailable]');
      expect(result).toContain('Error: API error');
      expect(result).toContain('1920x1080');
    });

    it('should handle missing API key', async () => {
      const file = {
        path: 'image.png',
        absolutePath: '/project/image.png'
      };
      
      // Simulate no API key scenario
      AIService.mockImplementation(() => {
        throw new Error('GEMINI_API_KEY not configured');
      });
      
      const result = await transformer.transform(file);
      
      expect(result).toContain('[Image file - AI description not available]');
      expect(result).toContain('Configure GEMINI_API_KEY');
    });

    it('should format file size correctly', async () => {
      const testCases = [
        { size: 500, expected: '500 B' },
        { size: 1024, expected: '1.00 KB' },
        { size: 1048576, expected: '1.00 MB' },
        { size: 1073741824, expected: '1.00 GB' }
      ];

      for (const { size, expected } of testCases) {
        sharp.mockReturnValue({
          metadata: jest.fn().mockResolvedValue({ ...mockMetadata, size })
        });
        
        const result = await transformer.transform({
          path: 'test.jpg',
          absolutePath: '/test.jpg'
        });
        
        expect(result).toContain(expected);
      }
    });

    it('should handle metadata extraction errors', async () => {
      const file = {
        path: 'corrupt.jpg',
        absolutePath: '/project/corrupt.jpg'
      };
      
      sharp.mockReturnValue({
        metadata: jest.fn().mockRejectedValue(new Error('Invalid image'))
      });
      
      const result = await transformer.transform(file);
      
      expect(result).toContain('[Image file - metadata unavailable]');
    });

    it('should cache AI descriptions', async () => {
      const file = {
        path: 'cached.png',
        absolutePath: '/project/cached.png'
      };
      
      mockAIService.describeImage.mockResolvedValue('Cached description');
      
      // First call
      await transformer.transform(file);
      expect(mockAIService.describeImage).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      await transformer.transform(file);
      expect(mockAIService.describeImage).toHaveBeenCalledTimes(1);
    });

    it('should include detailed metadata in description', async () => {
      const detailedMetadata = {
        width: 3840,
        height: 2160,
        format: 'png',
        size: 5242880,
        channels: 4,
        density: 144,
        hasAlpha: true
      };
      
      sharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue(detailedMetadata)
      });
      mockAIService.describeImage.mockResolvedValue('4K screenshot');
      
      const result = await transformer.transform({
        path: 'detailed.png',
        absolutePath: '/detailed.png'
      });
      
      expect(result).toContain('3840x2160');
      expect(result).toContain('5.00 MB');
      expect(result).toContain('4K screenshot');
    });
  });

  describe('priority', () => {
    it('should have lower priority than other transformers', () => {
      expect(transformer.priority).toBe(90);
    });
  });
});