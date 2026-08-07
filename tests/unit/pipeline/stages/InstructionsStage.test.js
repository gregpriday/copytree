// Mock dependencies
jest.mock('../../../../src/services/InstructionsLoader.js');
jest.mock('../../../../src/config/ConfigManager.js', () => ({
  config: jest.fn(),
}));

import InstructionsStage from '../../../../src/pipeline/stages/InstructionsStage.js';
import InstructionsLoader from '../../../../src/services/InstructionsLoader.js';
import { config } from '../../../../src/config/ConfigManager.js';

describe('InstructionsStage', () => {
  let stage;
  let mockInstructionsLoader;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock InstructionsLoader
    mockInstructionsLoader = {
      load: jest.fn(),
      exists: jest.fn(),
    };
    InstructionsLoader.mockImplementation(() => mockInstructionsLoader);

    // Mock config
    config.mockReturnValue({
      get: jest.fn((key, defaultValue) => {
        if (key === 'app.defaultInstructions') return 'default';
        return defaultValue;
      }),
    });

    stage = new InstructionsStage();
  });

  describe('process()', () => {
    it('should return input unchanged when instructions are disabled', async () => {
      const input = {
        options: { noInstructions: true },
        basePath: '/test',
        files: [],
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
        files: [],
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
        files: [],
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
        files: [],
      };

      // Should not throw
      const result = await stage.process(input);

      expect(result).toBe(input);
      expect(result.instructions).toBeUndefined();
    });

    it('fails when a named instructions set cannot be loaded', async () => {
      mockInstructionsLoader.load.mockRejectedValue(new Error('Custom instructions not found'));

      const input = {
        options: { instructions: 'custom' },
        basePath: '/test',
        files: [],
      };

      // This used to return the input unchanged, while `validate()` — which the
      // pipeline ran first — threw for the same case. The two disagreed, and
      // only `validate()`'s answer ever reached a user. Now there is one answer:
      // a set asked for by name has to exist.
      await expect(stage.process(input)).rejects.toThrow('Custom instructions not found');
    });

    it('should handle empty instructions content gracefully', async () => {
      mockInstructionsLoader.load.mockResolvedValue('');

      const input = {
        options: {},
        basePath: '/test',
        files: [],
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
        metadata: { test: true },
      };

      const result = await stage.process(input);

      expect(result.basePath).toBe('/test');
      expect(result.files).toEqual([{ path: 'test.js' }]);
      expect(result.profile).toEqual({ name: 'test' });
      expect(result.metadata).toEqual({ test: true });
      expect(result.instructions).toBe(mockInstructions);
    });
  });

  /**
   * The "does this exist?" question now lives entirely in `process()`, which
   * has to load the file anyway. `validate()` used to ask it separately through
   * `exists()`, and `exists()` probed the user directory and then the app
   * directory — the same two paths `load()` probes moments later. Four
   * filesystem probes per run, on a stage that runs on every copy, to reach a
   * conclusion the load already reaches.
   */
  describe('missing instructions', () => {
    it('fails when a named set does not exist', async () => {
      mockInstructionsLoader.load.mockRejectedValue(new Error("Instructions 'custom' not found"));

      const input = { options: { instructions: 'custom' } };

      // Naming a set and silently getting a document without it is the failure
      // this rejection prevents.
      await expect(stage.process(input)).rejects.toThrow("Instructions 'custom' not found");
    });

    it('continues without instructions when the default set is missing', async () => {
      mockInstructionsLoader.load.mockRejectedValue(new Error('not found'));

      const input = { options: {} };
      const result = await stage.process(input);

      expect(result).toBe(input);
      expect(result.instructions).toBeUndefined();
    });

    it('validate() no longer probes the filesystem', async () => {
      expect(await stage.validate({ options: { instructions: 'custom' } })).toBe(true);
      expect(mockInstructionsLoader.exists).not.toHaveBeenCalled();
    });

    it('validate() returns true when instructions are disabled', async () => {
      expect(await stage.validate({ options: { noInstructions: true } })).toBe(true);
    });
  });
});
