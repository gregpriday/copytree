/**
 * Real InstructionsLoader tests
 * Tests the actual implementation with controlled fs-extra mocks
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';

// Mock fs-extra locally for this test
jest.mock('fs-extra');

// Mock logger to avoid import.meta issues
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import the real InstructionsLoader (no global mock in this project)
import InstructionsLoader from '../../../src/services/InstructionsLoader.js';

describe('InstructionsLoader (Real Implementation)', () => {
  let loader;
  const mockUserDir = '/home/user/.copytree/instructions';
  const mockAppDir = path.join(process.cwd(), 'src', 'templates', 'instructions');

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock os.homedir()
    jest.spyOn(os, 'homedir').mockReturnValue('/home/user');

    // Create new loader instance
    loader = new InstructionsLoader();

    // Override directories for testing
    loader.userDir = mockUserDir;
    loader.appDir = mockAppDir;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('load()', () => {
    it('should load instructions from user directory when available', async () => {
      const mockContent = '# Default Instructions\nUser override content';

      // Mock that user file exists
      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockUserDir, 'default.md');
      });

      // Mock readFile to return content
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load('default');

      expect(result).toBe(mockContent);
      expect(fs.pathExists).toHaveBeenCalledWith(path.join(mockUserDir, 'default.md'));
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockUserDir, 'default.md'), 'utf8');
    });

    it('should load instructions from app directory when user file does not exist', async () => {
      const mockContent = '# Default Instructions\nBuilt-in content';

      // Mock that app file exists but user file doesn't
      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockAppDir, 'custom.md');
      });

      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load('custom');

      expect(result).toBe(mockContent);
      expect(fs.pathExists).toHaveBeenCalledWith(path.join(mockUserDir, 'custom.md'));
      expect(fs.pathExists).toHaveBeenCalledWith(path.join(mockAppDir, 'custom.md'));
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockAppDir, 'custom.md'), 'utf8');
    });

    it('should cache loaded instructions and avoid redundant I/O', async () => {
      const mockContent = '# Test Instructions';

      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockAppDir, 'default.md');
      });
      fs.readFile.mockResolvedValue(mockContent);

      // Load twice
      const result1 = await loader.load('default');
      const result2 = await loader.load('default');

      // Both results should be identical
      expect(result1).toBe(result2);

      // readFile should only be called once (cached on second call)
      expect(fs.readFile).toHaveBeenCalledTimes(1);

      // Check cache stats
      const stats = loader.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toContain('default');
    });

    it('should throw error when instructions not found', async () => {
      // Mock that no files exist
      fs.pathExists.mockResolvedValue(false);

      await expect(loader.load('nonexistent')).rejects.toThrow(
        "Instructions 'nonexistent' not found",
      );
    });

    it('should use default name when no name provided', async () => {
      const mockContent = '# Default Instructions';

      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockAppDir, 'default.md');
      });
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load();

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockAppDir, 'default.md'), 'utf8');
    });

    it('should prioritize user directory over app directory', async () => {
      const userContent = '# User Override';

      // Both files exist
      fs.pathExists.mockResolvedValue(true);

      // First readFile call is for user directory
      fs.readFile.mockResolvedValueOnce(userContent);

      const result = await loader.load('test');

      expect(result).toBe(userContent);
      // Should only check and read user file, not app file
      expect(fs.readFile).toHaveBeenCalledTimes(1);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockUserDir, 'test.md'), 'utf8');
    });
  });

  describe('list()', () => {
    it('should return array of available instructions from both directories', async () => {
      // Mock user directory with some files
      fs.pathExists.mockResolvedValue(true);
      fs.readdir
        .mockResolvedValueOnce(['default.md', 'custom.md']) // user dir
        .mockResolvedValueOnce(['default.md', 'another.md']); // app dir

      const result = await loader.list();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('default');
      expect(result).toContain('custom');
      expect(result).toContain('another');
      // Should dedupe 'default' which appears in both
      expect(result.filter((name) => name === 'default').length).toBe(1);
    });

    it('should handle missing directories gracefully', async () => {
      // Mock that directories don't exist
      fs.pathExists.mockResolvedValue(false);

      const result = await loader.list();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should filter out non-markdown files', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readdir.mockResolvedValue(['test.md', 'README.txt', 'other.js', 'valid.md']);

      const result = await loader.list();

      expect(result).toEqual(['test', 'valid']);
      expect(result).not.toContain('README');
      expect(result).not.toContain('other');
    });
  });

  describe('exists()', () => {
    it('should return true when instructions exist in user directory', async () => {
      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockUserDir, 'default.md');
      });

      const result = await loader.exists('default');
      expect(result).toBe(true);
    });

    it('should return true when instructions exist in app directory', async () => {
      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockAppDir, 'custom.md');
      });

      const result = await loader.exists('custom');
      expect(result).toBe(true);
    });

    it('should return false for non-existent instructions', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await loader.exists('definitely-not-there');
      expect(result).toBe(false);
    });

    it('should use default name when no name provided', async () => {
      fs.pathExists.mockImplementation(async (filePath) => {
        return filePath === path.join(mockAppDir, 'default.md');
      });

      const result = await loader.exists();
      expect(result).toBe(true);
    });
  });

  describe('clearCache()', () => {
    it('should clear the instructions cache', async () => {
      const mockContent = '# Test';
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      // Load some instructions to populate cache
      await loader.load('test1');
      await loader.load('test2');

      // Verify cache has items
      let stats = loader.getCacheStats();
      expect(stats.size).toBe(2);

      // Clear cache
      loader.clearCache();

      // Verify cache is empty
      stats = loader.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', async () => {
      const mockContent = '# Test';
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      // Load some instructions
      await loader.load('test1');
      await loader.load('test2');

      const stats = loader.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toEqual(['test1', 'test2']);
    });

    it('should return empty stats for empty cache', () => {
      const stats = loader.getCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });

    it('should reflect cache changes', async () => {
      const mockContent = '# Test';
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      // Start with empty cache
      let stats = loader.getCacheStats();
      expect(stats.size).toBe(0);

      // Add one item
      await loader.load('test');
      stats = loader.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toEqual(['test']);

      // Clear cache
      loader.clearCache();
      stats = loader.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('constructor and initialization', () => {
    it('should create instance with default settings', () => {
      const newLoader = new InstructionsLoader();
      expect(newLoader).toBeDefined();
      expect(newLoader.instructionsCache).toBeDefined();
      expect(newLoader.userDir).toBeDefined();
      expect(newLoader.appDir).toBeDefined();
    });

    it('should accept base path parameter', () => {
      const customPath = '/custom/path';
      const newLoader = new InstructionsLoader(customPath);
      expect(newLoader.basePath).toBe(customPath);
    });
  });
});
