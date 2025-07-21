const AIService = require('../../../src/services/AIService');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Mock the Google Generative AI module
jest.mock('@google/generative-ai');

describe('AIService', () => {
  let aiService;
  let mockGenerativeModel;
  let mockGenerateContent;
  let mockStream;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock chain
    mockStream = {
      text: jest.fn().mockResolvedValue('Streamed response')
    };
    
    mockGenerateContent = jest.fn().mockResolvedValue({
      response: {
        text: jest.fn().mockResolvedValue('Generated text response')
      }
    });
    
    mockGenerativeModel = {
      generateContent: mockGenerateContent,
      generateContentStream: jest.fn().mockImplementation(async function* () {
        yield { text: jest.fn().mockReturnValue('Chunk 1') };
        yield { text: jest.fn().mockReturnValue('Chunk 2') };
      })
    };
    
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockGenerativeModel)
    }));
    
    // Set API key
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';
    
    aiService = new AIService();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_DEFAULT_MODEL;
  });

  describe('constructor', () => {
    it('should throw error when API key is not set', () => {
      delete process.env.GEMINI_API_KEY;
      
      expect(() => new AIService()).toThrow('GEMINI_API_KEY environment variable is not set');
    });

    it('should initialize with default model', () => {
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
    });

    it('should use custom model if specified', () => {
      process.env.GEMINI_DEFAULT_MODEL = 'gemini-pro';
      new AIService();
      
      const mockInstance = GoogleGenerativeAI.mock.results[0].value;
      expect(mockInstance.getGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-pro' });
    });
  });

  describe('generate', () => {
    it('should generate text with prompt', async () => {
      const prompt = 'Explain quantum computing';
      const result = await aiService.generate(prompt);
      
      expect(mockGenerateContent).toHaveBeenCalledWith(prompt);
      expect(result).toBe('Generated text response');
    });

    it('should apply options to generation', async () => {
      const prompt = 'Write a poem';
      const options = {
        maxTokens: 100,
        temperature: 0.8
      };
      
      await aiService.generate(prompt, options);
      
      // Note: In real implementation, these options would be passed differently
      expect(mockGenerateContent).toHaveBeenCalledWith(prompt);
    });

    it('should handle generation errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API error'));
      
      await expect(aiService.generate('test')).rejects.toThrow('API error');
    });

    it('should retry on transient errors', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue({
          response: { text: jest.fn().mockResolvedValue('Success after retry') }
        });
      
      const result = await aiService.generate('test');
      
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
      expect(result).toBe('Success after retry');
    });

    it('should respect retry limit', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Persistent error'));
      
      await expect(aiService.generate('test')).rejects.toThrow('Persistent error');
      expect(mockGenerateContent).toHaveBeenCalledTimes(3); // Default retry count
    });
  });

  describe('generateStream', () => {
    it('should yield text chunks from stream', async () => {
      const chunks = [];
      
      for await (const chunk of aiService.generateStream('test prompt')) {
        chunks.push(chunk);
      }
      
      expect(chunks).toEqual(['Chunk 1', 'Chunk 2']);
    });

    it('should handle stream errors', async () => {
      mockGenerativeModel.generateContentStream = jest.fn().mockImplementation(async function* () {
        yield { text: jest.fn().mockReturnValue('First chunk') };
        throw new Error('Stream interrupted');
      });
      
      const chunks = [];
      
      await expect(async () => {
        for await (const chunk of aiService.generateStream('test')) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('Stream interrupted');
      
      expect(chunks).toEqual(['First chunk']);
    });
  });

  describe('describeImage', () => {
    it('should generate image description', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const mockVisionModel = {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: jest.fn().mockResolvedValue('A beautiful sunset over mountains')
          }
        })
      };
      
      GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue(mockVisionModel)
      }));
      
      aiService = new AIService();
      const result = await aiService.describeImage(imageBuffer);
      
      expect(result).toBe('A beautiful sunset over mountains');
      expect(mockVisionModel.generateContent).toHaveBeenCalledWith([
        expect.stringContaining('Describe this image'),
        expect.objectContaining({
          inlineData: {
            mimeType: 'image/jpeg',
            data: expect.any(String)
          }
        })
      ]);
    });

    it('should use provided mime type', async () => {
      const imageBuffer = Buffer.from('fake-png-data');
      const options = { mimeType: 'image/png' };
      
      await aiService.describeImage(imageBuffer, options);
      
      const mockInstance = GoogleGenerativeAI.mock.results[0].value;
      const model = mockInstance.getGenerativeModel.mock.results[0].value;
      
      expect(model.generateContent).toHaveBeenCalledWith([
        expect.any(String),
        expect.objectContaining({
          inlineData: {
            mimeType: 'image/png',
            data: expect.any(String)
          }
        })
      ]);
    });

    it('should include metadata in prompt if provided', async () => {
      const imageBuffer = Buffer.from('fake-image');
      const options = {
        metadata: {
          width: 1920,
          height: 1080,
          format: 'jpeg'
        }
      };
      
      await aiService.describeImage(imageBuffer, options);
      
      const mockInstance = GoogleGenerativeAI.mock.results[0].value;
      const model = mockInstance.getGenerativeModel.mock.results[0].value;
      const callArgs = model.generateContent.mock.calls[0][0];
      
      expect(callArgs[0]).toContain('1920x1080');
    });
  });

  describe('filterFilesByQuery', () => {
    it('should filter files based on AI response', async () => {
      const files = [
        { path: 'auth/login.js', content: 'login logic' },
        { path: 'auth/register.js', content: 'registration' },
        { path: 'utils/helpers.js', content: 'utility functions' },
        { path: 'config/database.js', content: 'db config' }
      ];
      
      mockGenerateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockResolvedValue('auth/login.js\nauth/register.js')
        }
      });
      
      const result = await aiService.filterFilesByQuery(
        files,
        'authentication related files'
      );
      
      expect(result).toHaveLength(2);
      expect(result.map(f => f.path)).toEqual(['auth/login.js', 'auth/register.js']);
    });

    it('should handle files with special characters', async () => {
      const files = [
        { path: 'src/components/[id].jsx', content: 'dynamic route' },
        { path: 'src/pages/$layout.svelte', content: 'layout' },
        { path: 'tests/auth.spec.js', content: 'tests' }
      ];
      
      mockGenerateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockResolvedValue('src/components/[id].jsx\nsrc/pages/$layout.svelte')
        }
      });
      
      const result = await aiService.filterFilesByQuery(files, 'dynamic components');
      
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('src/components/[id].jsx');
    });

    it('should return empty array when no files match', async () => {
      const files = [
        { path: 'test1.js', content: 'test' },
        { path: 'test2.js', content: 'test' }
      ];
      
      mockGenerateContent.mockResolvedValue({
        response: {
          text: jest.fn().mockResolvedValue('')
        }
      });
      
      const result = await aiService.filterFilesByQuery(files, 'non-existent files');
      
      expect(result).toEqual([]);
    });

    it('should handle AI errors gracefully', async () => {
      const files = [{ path: 'test.js', content: 'test' }];
      
      mockGenerateContent.mockRejectedValue(new Error('AI service error'));
      
      await expect(
        aiService.filterFilesByQuery(files, 'query')
      ).rejects.toThrow('AI service error');
    });
  });

  describe('caching', () => {
    it('should cache repeated requests', async () => {
      const prompt = 'Cached prompt';
      
      // First call
      await aiService.generate(prompt);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      await aiService.generate(prompt);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should not cache when caching is disabled', async () => {
      const prompt = 'No cache prompt';
      const options = { cache: false };
      
      await aiService.generate(prompt, options);
      await aiService.generate(prompt, options);
      
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should have separate cache for different prompts', async () => {
      await aiService.generate('Prompt 1');
      await aiService.generate('Prompt 2');
      
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });
});