const InstructionsStage = require('../../../../src/pipeline/stages/InstructionsStage');
const InstructionsLoader = require('../../../../src/services/InstructionsLoader');

// Mock dependencies
jest.mock('../../../../src/services/InstructionsLoader');
jest.mock('../../../../src/config/ConfigManager', () => ({
  config: jest.fn()
}));

const { config } = require('../../../../src/config/ConfigManager');

describe('InstructionsStage', () => {
  let stage;
  let mockInstructionsLoader;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock InstructionsLoader
    mockInstructionsLoader = {
      load: jest.fn(),
      exists: jest.fn()
    };
    InstructionsLoader.mockImplementation(() => mockInstructionsLoader);
    
    // Mock config
    config.mockReturnValue({
      get: jest.fn((key, defaultValue) => {
        if (key === 'app.defaultInstructions') return 'default';
        return defaultValue;
      })
    });

    stage = new InstructionsStage();
  });

  describe('process()', () => {
    it('should return input unchanged when instructions are disabled', async () => {
      const input = {
        options: { noInstructions: true },
        basePath: '/test',
        files: []
      };

      const result = await stage.process(input);

      expect(result).toBe(input);
      expect(mockInstructionsLoader.load).not.toHaveBeenCalled();
    });

    it('should load default instructions when no specific instructions specified', async () => {
      const mockInstructions = 'Default instructions content';
      mockInstructionsLoader.load.mockResolvedValue(mockInstructions);

      const input = {
        options: {},
        basePath: '/test',
        files: []
      };

      const result = await stage.process(input);

      expect(mockInstructionsLoader.load).toHaveBeenCalledWith('default');
      expect(result.instructions).toBe(mockInstructions);
      expect(result.instructionsName).toBe('default');
    });

    it('should load custom instructions when specified', async () => {
      const mockInstructions = 'Custom instructions content';
      mockInstructionsLoader.load.mockResolvedValue(mockInstructions);

      const input = {
        options: { instructions: 'custom' },
        basePath: '/test',
        files: []
      };

      const result = await stage.process(input);

      expect(mockInstructionsLoader.load).toHaveBeenCalledWith('custom');
      expect(result.instructions).toBe(mockInstructions);
      expect(result.instructionsName).toBe('custom');
    });

    it('should continue without instructions if default instructions fail to load', async () => {
      mockInstructionsLoader.load.mockRejectedValue(new Error('Instructions not found'));

      const input = {
        options: {},
        basePath: '/test',
        files: []
      };

      // Should not throw
      const result = await stage.process(input);
      
      expect(result).toBe(input);
      expect(result.instructions).toBeUndefined();
    });

    it('should handle gracefully when specific instructions fail to load', async () => {
      mockInstructionsLoader.load.mockRejectedValue(new Error('Custom instructions not found'));

      const input = {
        options: { instructions: 'custom' },
        basePath: '/test',
        files: []
      };

      const result = await stage.process(input);
      expect(result).toEqual(input); // Should return input unchanged when instructions fail to load
    });

    it('should handle empty instructions content gracefully', async () => {
      mockInstructionsLoader.load.mockResolvedValue('');

      const input = {
        options: {},
        basePath: '/test',
        files: []
      };

      const result = await stage.process(input);

      expect(result).toBe(input);
      expect(result.instructions).toBeUndefined();
    });

    it('should preserve other input properties', async () => {
      const mockInstructions = 'Instructions content';
      mockInstructionsLoader.load.mockResolvedValue(mockInstructions);

      const input = {
        options: {},
        basePath: '/test',
        files: [{ path: 'test.js' }],
        profile: { name: 'test' },
        metadata: { test: true }
      };

      const result = await stage.process(input);

      expect(result.basePath).toBe('/test');
      expect(result.files).toEqual([{ path: 'test.js' }]);
      expect(result.profile).toEqual({ name: 'test' });
      expect(result.metadata).toEqual({ test: true });
      expect(result.instructions).toBe(mockInstructions);
    });
  });

  describe('validate()', () => {
    it('should return true when instructions are disabled', async () => {
      const input = {
        options: { noInstructions: true }
      };

      const result = await stage.validate(input);
      expect(result).toBe(true);
    });

    it('should return true when default instructions exist', async () => {
      mockInstructionsLoader.exists.mockResolvedValue(true);

      const input = {
        options: {}
      };

      const result = await stage.validate(input);
      
      expect(result).toBe(true);
      expect(mockInstructionsLoader.exists).toHaveBeenCalledWith('default');
    });

    it('should return true when custom instructions exist', async () => {
      mockInstructionsLoader.exists.mockResolvedValue(true);

      const input = {
        options: { instructions: 'custom' }
      };

      const result = await stage.validate(input);
      
      expect(result).toBe(true);
      expect(mockInstructionsLoader.exists).toHaveBeenCalledWith('custom');
    });

    it('should throw error when specific instructions do not exist', async () => {
      mockInstructionsLoader.exists.mockResolvedValue(false);

      const input = {
        options: { instructions: 'custom' }
      };

      await expect(stage.validate(input)).rejects.toThrow("Instructions 'custom' not found");
    });

    it('should return true when default instructions do not exist (allows graceful fallback)', async () => {
      mockInstructionsLoader.exists.mockResolvedValue(false);

      const input = {
        options: {}
      };

      const result = await stage.validate(input);
      expect(result).toBe(true);
    });
  });
});