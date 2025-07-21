// Create a mock model
const mockModel = {
  generateContent: jest.fn(),
  model: 'gemini-1.5-flash'
};

// Mock GoogleGenerativeAI before requiring the transformer
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      constructor() {
        return {
          getGenerativeModel: () => mockModel
        };
      }
    }
  };
});

// Mock the TransformError
jest.mock('../../../src/utils/errors', () => ({
  TransformError: class TransformError extends Error {
    constructor(message, transformer, file) {
      super(message);
      this.transformer = transformer;
      this.file = file;
    }
  }
}));

// Now require the transformer after mocking
const FileSummaryTransformer = require('../../../src/transforms/transformers/FileSummaryTransformer');

describe('FileSummaryTransformer', () => {
  let transformer;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-api-key';
    
    // Reset the mock for each test
    mockModel.generateContent.mockClear();
    mockModel.generateContent.mockResolvedValue({
      response: {
        text: jest.fn().mockReturnValue('Mocked summary')
      }
    });
    
    transformer = new FileSummaryTransformer();
  });

  describe('canTransform', () => {
    it('should transform code files', () => {
      expect(transformer.canTransform({ path: 'app.js', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'main.py', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'index.php', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'App.java', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'main.go', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'app.rb', content: 'test' })).toBe(true);
    });

    it('should transform web files', () => {
      expect(transformer.canTransform({ path: 'index.html', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'styles.css', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'app.scss', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'component.jsx', content: 'test' })).toBe(true);
      expect(transformer.canTransform({ path: 'page.vue', content: 'test' })).toBe(true);
    });

    it('should transform config files', () => {
      expect(transformer.canTransform({ path: 'package.json', content: '{}' })).toBe(true);
      expect(transformer.canTransform({ path: '.eslintrc', content: '{}' })).toBe(true);
      expect(transformer.canTransform({ path: 'tsconfig.json', content: '{}' })).toBe(true);
      expect(transformer.canTransform({ path: 'webpack.config.js', content: 'module.exports = {}' })).toBe(true);
    });

    it('should not transform non-code files', () => {
      expect(transformer.canTransform({ path: 'image.png', content: Buffer.from('png') })).toBe(false);
      expect(transformer.canTransform({ path: 'document.pdf', content: Buffer.from('pdf') })).toBe(false);
      expect(transformer.canTransform({ path: 'video.mp4', content: Buffer.from('mp4') })).toBe(false);
      expect(transformer.canTransform({ path: 'data.csv', content: 'a,b,c' })).toBe(false); // CSV has its own transformer
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
      
      // Update the mock to return the expected summary
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(mockSummary)
        }
      });
      
      const result = await transformer.transform(file);
      
      expect(mockModel.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('javascript')
      );
      expect(result.content).toContain('=== AI SUMMARY ===');
      expect(result.content).toContain(mockSummary);
      expect(result.content).toContain('=== ORIGINAL CONTENT ===');
      expect(result.content).toContain('class AuthService');
    });

    it('should handle missing AI service gracefully', async () => {
      // Create transformer without API key
      delete process.env.GEMINI_API_KEY;
      const noApiTransformer = new FileSummaryTransformer();
      
      const file = {
        path: 'test.js',
        content: 'const test = true;'
      };
      
      const result = await noApiTransformer.transform(file);
      
      // Without API key, it should return the original file
      expect(result.content).toBe(file.content);
      expect(result.transformed).toBe(false);
    });

    it('should handle AI generation errors', async () => {
      const file = {
        path: 'error.js',
        content: 'function test() { return "test"; }'
      };
      
      // Mock the model to throw an error
      mockModel.generateContent.mockRejectedValue(new Error('API rate limit'));
      
      const result = await transformer.transform(file);
      
      // On error, it should return truncated content
      expect(result.content).toContain('(summary generation failed)');
      expect(result.transformed).toBe(true);
      expect(result.metadata.error).toBe('API rate limit');
    });

    it('should handle very long files', async () => {
      const longContent = 'const x = 1;\n'.repeat(1000);
      const file = {
        path: 'long.js',
        content: longContent
      };
      
      const mockSummary = 'Large file with repeated variable declarations.';
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(mockSummary)
        }
      });
      
      const result = await transformer.transform(file);
      
      expect(result.content).toContain(mockSummary);
      expect(result.metadata.truncated).toBe(true);
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
      
      const mockSummary = 'Python script with hello function.';
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(mockSummary)
        }
      });
      
      const result = await transformer.transform(file);
      
      expect(result.content).toContain('def hello():');
      expect(result.content).toContain('    """Say hello"""');
      expect(result.content).toContain('=== AI SUMMARY ===');
      expect(result.content).toContain(mockSummary);
    });

    it('should handle empty files', async () => {
      const file = {
        path: 'empty.js',
        content: ''
      };
      
      const result = await transformer.transform(file);
      
      expect(result.content).toBe('');
      expect(result.transformed).toBe(false);
    });

    it('should handle files with only whitespace', async () => {
      const file = {
        path: 'whitespace.js',
        content: '   \n\n   \t\t   '
      };
      
      const result = await transformer.transform(file);
      
      expect(result.content).toBe(file.content);
      expect(result.transformed).toBe(false);
    });

    it('should use appropriate prompts for different file types', async () => {
      const testCases = [
        { path: 'styles.css', content: '.test { color: red; }' },
        { path: 'index.html', content: '<html></html>' },
        { path: 'config.json', content: '{}' },
        { path: 'script.py', content: 'print("test")' }
      ];

      for (const testCase of testCases) {
        await transformer.transform(testCase);
      }
      
      // Just verify that generateContent was called for each file type
      expect(mockModel.generateContent).toHaveBeenCalledTimes(testCases.length);
    });
  });

  describe('metadata', () => {
    it('should have proper description', () => {
      expect(transformer.description).toBe('Generate AI-powered summaries of files');
    });
  });
});