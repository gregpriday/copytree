// Static imports for Node.js modules
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Use dynamic import for module under test
let InstructionsLoader;

beforeAll(async () => {
  const instructionsLoaderModule = await import('../../../src/services/InstructionsLoader.js');
  InstructionsLoader = instructionsLoaderModule.default;
});

// Mock fs-extra
jest.mock('fs-extra');

describe('InstructionsLoader', () => {
  let loader;
  const mockUserDir = '/home/user/.copytree/instructions';
  const mockAppDir = '/app/src/templates/instructions';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock os.homedir()
    jest.spyOn(os, 'homedir').mockReturnValue('/home/user');
    
    // Mock __dirname for app directory
    loader = new InstructionsLoader();
    loader.userDir = mockUserDir;
    loader.appDir = mockAppDir;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('load()', () => {
    it('should load instructions from user directory first', async () => {
      const mockContent = 'User instructions content';
      
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockUserDir, 'default.md'));
      });
      
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load('default');

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockUserDir, 'default.md'), 'utf8');
    });

    it('should fallback to app directory if user directory does not exist', async () => {
      const mockContent = 'App instructions content';
      
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockAppDir, 'default.md'));
      });
      
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load('default');

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockAppDir, 'default.md'), 'utf8');
    });

    it('should load custom instructions by name', async () => {
      const mockContent = 'Custom instructions content';
      
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockUserDir, 'custom.md'));
      });
      
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load('custom');

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockUserDir, 'custom.md'), 'utf8');
    });

    it('should cache loaded instructions', async () => {
      const mockContent = 'Instructions content';
      
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      // Load twice
      const result1 = await loader.load('default');
      const result2 = await loader.load('default');

      expect(result1).toBe(mockContent);
      expect(result2).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledTimes(1); // Should only read once due to caching
    });

    it('should throw error when instructions not found', async () => {
      fs.pathExists.mockResolvedValue(false);

      await expect(loader.load('nonexistent')).rejects.toThrow("Instructions 'nonexistent' not found");
    });

    it('should use default name when no name provided', async () => {
      const mockContent = 'Default instructions';
      
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockUserDir, 'default.md'));
      });
      
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.load();

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockUserDir, 'default.md'), 'utf8');
    });
  });

  describe('list()', () => {
    it('should list instructions from both directories', async () => {
      fs.pathExists.mockImplementation((dirPath) => {
        return Promise.resolve([mockUserDir, mockAppDir].includes(dirPath));
      });
      
      fs.readdir.mockImplementation((dirPath) => {
        if (dirPath === mockUserDir) {
          return Promise.resolve(['custom.md', 'user-specific.md', 'other.txt']);
        }
        if (dirPath === mockAppDir) {
          return Promise.resolve(['default.md', 'built-in.md']);
        }
        return Promise.resolve([]);
      });

      const result = await loader.list();

      expect(result).toEqual(['built-in', 'custom', 'default', 'user-specific']);
    });

    it('should handle missing directories gracefully', async () => {
      fs.pathExists.mockImplementation((dirPath) => {
        return Promise.resolve(dirPath === mockAppDir);
      });
      
      fs.readdir.mockImplementation((dirPath) => {
        if (dirPath === mockAppDir) {
          return Promise.resolve(['default.md']);
        }
        return Promise.resolve([]);
      });

      const result = await loader.list();

      expect(result).toEqual(['default']);
    });

    it('should only include .md files', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readdir.mockResolvedValue([
        'valid.md',
        'also-valid.md',
        'invalid.txt',
        'no-extension',
        'readme.MD' // Should handle case insensitivity
      ]);

      const result = await loader.list();

      expect(result).toEqual(['also-valid', 'readme', 'valid']);
    });

    it('should deduplicate instructions with same name', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.readdir.mockImplementation((dirPath) => {
        // Both directories have 'default.md'
        return Promise.resolve(['default.md']);
      });

      const result = await loader.list();

      expect(result).toEqual(['default']); // Should only appear once
    });
  });

  describe('exists()', () => {
    it('should return true when instructions exist in user directory', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockUserDir, 'test.md'));
      });

      const result = await loader.exists('test');
      expect(result).toBe(true);
    });

    it('should return true when instructions exist in app directory', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockAppDir, 'test.md'));
      });

      const result = await loader.exists('test');
      expect(result).toBe(true);
    });

    it('should return false when instructions do not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await loader.exists('nonexistent');
      expect(result).toBe(false);
    });

    it('should use default name when no name provided', async () => {
      fs.pathExists.mockImplementation((filePath) => {
        return Promise.resolve(filePath === path.join(mockUserDir, 'default.md'));
      });

      const result = await loader.exists();
      expect(result).toBe(true);
    });
  });

  describe('clearCache()', () => {
    it('should clear the instructions cache', async () => {
      const mockContent = 'Instructions content';
      
      fs.pathExists.mockResolvedValue(true);
      fs.readFile.mockResolvedValue(mockContent);

      // Load instructions to populate cache
      await loader.load('test');
      
      // Clear cache
      loader.clearCache();
      
      // Load again - should call fs.readFile again
      await loader.load('test');

      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', async () => {
      const mockContent = 'Instructions content';
      
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
  });
});