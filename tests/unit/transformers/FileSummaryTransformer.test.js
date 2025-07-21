const FileSummaryTransformer = require('../../../src/transforms/transformers/FileSummaryTransformer');
const AIService = require('../../../src/services/AIService');

jest.mock('../../../src/services/AIService');

describe('FileSummaryTransformer', () => {
  let transformer;
  let mockAIService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAIService = {
      generate: jest.fn()
    };
    AIService.mockImplementation(() => mockAIService);
    
    transformer = new FileSummaryTransformer();
  });

  describe('canTransform', () => {
    it('should transform code files', () => {
      expect(transformer.canTransform('app.js')).toBe(true);
      expect(transformer.canTransform('main.py')).toBe(true);
      expect(transformer.canTransform('index.php')).toBe(true);
      expect(transformer.canTransform('App.java')).toBe(true);
      expect(transformer.canTransform('main.go')).toBe(true);
      expect(transformer.canTransform('app.rb')).toBe(true);
    });

    it('should transform web files', () => {
      expect(transformer.canTransform('index.html')).toBe(true);
      expect(transformer.canTransform('styles.css')).toBe(true);
      expect(transformer.canTransform('app.jsx')).toBe(true);
      expect(transformer.canTransform('component.tsx')).toBe(true);
      expect(transformer.canTransform('styles.scss')).toBe(true);
    });

    it('should transform config files', () => {
      expect(transformer.canTransform('config.json')).toBe(true);
      expect(transformer.canTransform('settings.yaml')).toBe(true);
      expect(transformer.canTransform('app.yml')).toBe(true);
      expect(transformer.canTransform('config.toml')).toBe(true);
    });

    it('should not transform non-code files', () => {
      expect(transformer.canTransform('image.png')).toBe(false);
      expect(transformer.canTransform('document.pdf')).toBe(false);
      expect(transformer.canTransform('video.mp4')).toBe(false);
      expect(transformer.canTransform('data.csv')).toBe(false); // CSV has its own transformer
    });
  });

  describe('transform', () => {
    it('should generate AI summary for file content', async () => {
      const file = {
        path: 'auth.js',
        content: `
          const jwt = require('jsonwebtoken');
          
          class AuthService {
            generateToken(user) {
              return jwt.sign({ id: user.id }, process.env.JWT_SECRET);
            }
            
            verifyToken(token) {
              return jwt.verify(token, process.env.JWT_SECRET);
            }
          }
          
          module.exports = AuthService;
        `
      };
      
      const mockSummary = 'Authentication service that handles JWT token generation and verification using jsonwebtoken library.';
      mockAIService.generate.mockResolvedValue(mockSummary);
      
      const result = await transformer.transform(file);
      
      expect(mockAIService.generate).toHaveBeenCalledWith(
        expect.stringContaining('Summarize the following'),
        expect.objectContaining({
          maxTokens: 150,
          temperature: 0.3
        })
      );
      expect(result).toContain('=== AI SUMMARY ===');
      expect(result).toContain(mockSummary);
      expect(result).toContain('=== ORIGINAL CONTENT ===');
      expect(result).toContain('class AuthService');
    });

    it('should handle missing AI service gracefully', async () => {
      const file = {
        path: 'test.js',
        content: 'const test = true;'
      };
      
      AIService.mockImplementation(() => {
        throw new Error('API key not configured');
      });
      
      const result = await transformer.transform(file);
      
      expect(result).toBe(file.content);
    });

    it('should handle AI generation errors', async () => {
      const file = {
        path: 'error.js',
        content: 'function test() { return "test"; }'
      };
      
      mockAIService.generate.mockRejectedValue(new Error('API rate limit'));
      
      const result = await transformer.transform(file);
      
      expect(result).toContain('[AI Summary generation failed: API rate limit]');
      expect(result).toContain(file.content);
    });

    it('should handle very long files', async () => {
      const longContent = 'const x = 1;\n'.repeat(1000);
      const file = {
        path: 'long.js',
        content: longContent
      };
      
      mockAIService.generate.mockResolvedValue('Large file with repeated variable declarations.');
      
      const result = await transformer.transform(file);
      
      expect(mockAIService.generate).toHaveBeenCalledWith(
        expect.stringContaining(longContent.substring(0, 10000)),
        expect.any(Object)
      );
      expect(result).toContain('Large file with repeated variable declarations.');
    });

    it('should preserve original content structure', async () => {
      const file = {
        path: 'formatted.py',
        content: `def hello():
    """Say hello"""
    print("Hello, World!")
    
if __name__ == "__main__":
    hello()`
      };
      
      mockAIService.generate.mockResolvedValue('Python script with hello function.');
      
      const result = await transformer.transform(file);
      
      expect(result).toContain('def hello():');
      expect(result).toContain('    """Say hello"""');
      expect(result).toContain('=== AI SUMMARY ===');
      expect(result).toContain('Python script with hello function.');
    });

    it('should handle empty files', async () => {
      const file = {
        path: 'empty.js',
        content: ''
      };
      
      const result = await transformer.transform(file);
      
      expect(result).toBe('');
      expect(mockAIService.generate).not.toHaveBeenCalled();
    });

    it('should handle files with only whitespace', async () => {
      const file = {
        path: 'whitespace.js',
        content: '   \n\n   \t\t   '
      };
      
      const result = await transformer.transform(file);
      
      expect(result).toBe(file.content);
      expect(mockAIService.generate).not.toHaveBeenCalled();
    });

    it('should use appropriate prompts for different file types', async () => {
      const testCases = [
        { path: 'styles.css', expectedPrompt: 'CSS file' },
        { path: 'index.html', expectedPrompt: 'HTML' },
        { path: 'config.json', expectedPrompt: 'configuration' },
        { path: 'script.py', expectedPrompt: 'Python' }
      ];

      for (const { path, expectedPrompt } of testCases) {
        mockAIService.generate.mockResolvedValue('Summary');
        
        await transformer.transform({
          path,
          content: 'test content'
        });
        
        expect(mockAIService.generate).toHaveBeenCalledWith(
          expect.stringContaining(expectedPrompt),
          expect.any(Object)
        );
      }
    });
  });

  describe('priority', () => {
    it('should have lower priority to allow specific transformers first', () => {
      expect(transformer.priority).toBe(80);
    });
  });
});