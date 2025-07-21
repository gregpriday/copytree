const copy = require('../../../src/commands/copy');
const Pipeline = require('../../../src/pipeline/Pipeline');
const ProfileLoader = require('../../../src/profiles/ProfileLoader');
const ProfileGuesser = require('../../../src/profiles/ProfileGuesser');
const AIService = require('../../../src/services/AIService');
const fs = require('fs-extra');
const clipboard = require('clipboardy');
const ora = require('ora');

// Mock all dependencies
jest.mock('../../../src/pipeline/Pipeline');
jest.mock('../../../src/profiles/ProfileLoader');
jest.mock('../../../src/profiles/ProfileGuesser');
jest.mock('../../../src/services/AIService');
jest.mock('fs-extra');
jest.mock('clipboardy');
jest.mock('ora');

describe('copy command', () => {
  let mockPipeline;
  let mockSpinner;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock spinner
    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      info: jest.fn().mockReturnThis(),
      text: ''
    };
    ora.mockReturnValue(mockSpinner);
    
    // Mock Pipeline
    mockPipeline = {
      execute: jest.fn().mockResolvedValue({
        files: [
          { path: 'file1.js', content: 'content1' },
          { path: 'file2.js', content: 'content2' }
        ],
        output: '<copytree>\n<file path="file1.js">content1</file>\n</copytree>',
        stats: {
          totalFiles: 2,
          totalSize: 100,
          duration: 150
        }
      })
    };
    Pipeline.mockImplementation(() => mockPipeline);
    
    // Mock ProfileLoader
    ProfileLoader.load = jest.fn().mockResolvedValue({
      name: 'default',
      patterns: ['**/*'],
      exclude: ['node_modules/**']
    });
    
    // Mock ProfileGuesser
    ProfileGuesser.guessProfile = jest.fn().mockResolvedValue('default');
    
    // Mock fs
    fs.pathExists.mockResolvedValue(true);
    fs.stat.mockResolvedValue({ isDirectory: () => true });
    fs.writeFile.mockResolvedValue(undefined);
    
    // Mock clipboard
    clipboard.write.mockResolvedValue(undefined);
    
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('basic functionality', () => {
    it('should copy current directory with default options', async () => {
      await copy('.', {});
      
      expect(ProfileGuesser.guessProfile).toHaveBeenCalledWith('.');
      expect(ProfileLoader.load).toHaveBeenCalledWith('default');
      expect(mockPipeline.execute).toHaveBeenCalled();
      expect(clipboard.write).toHaveBeenCalledWith(expect.stringContaining('<copytree>'));
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('should use specified profile', async () => {
      await copy('/project', { profile: 'laravel' });
      
      expect(ProfileGuesser.guessProfile).not.toHaveBeenCalled();
      expect(ProfileLoader.load).toHaveBeenCalledWith('laravel');
    });

    it('should save output to file when specified', async () => {
      await copy('.', { output: 'output.xml' });
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        'output.xml',
        expect.stringContaining('<copytree>'),
        'utf-8'
      );
      expect(clipboard.write).not.toHaveBeenCalled();
    });

    it('should display output when display option is set', async () => {
      await copy('.', { display: true });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('<copytree>'));
      expect(clipboard.write).not.toHaveBeenCalled();
    });
  });

  describe('dry run mode', () => {
    it('should not execute pipeline in dry run mode', async () => {
      mockPipeline.execute.mockResolvedValue({
        files: [
          { path: 'test1.js' },
          { path: 'test2.js' }
        ],
        stats: { totalFiles: 2 }
      });
      
      await copy('.', { dryRun: true });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Would copy 2 files'));
      expect(clipboard.write).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('AI filtering', () => {
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should apply AI filter when specified', async () => {
      AIService.mockImplementation(() => ({
        filterFilesByQuery: jest.fn().mockResolvedValue([
          { path: 'auth/login.js' }
        ])
      }));
      
      await copy('.', { aiFilter: 'authentication files' });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          aiFilter: 'authentication files'
        })
      );
    });

    it('should warn when AI filter specified without API key', async () => {
      delete process.env.GEMINI_API_KEY;
      
      await copy('.', { aiFilter: 'test query' });
      
      expect(mockSpinner.info).toHaveBeenCalledWith(
        expect.stringContaining('AI filtering requires GEMINI_API_KEY')
      );
    });
  });

  describe('format options', () => {
    it('should support JSON format', async () => {
      mockPipeline.execute.mockResolvedValue({
        files: [{ path: 'test.js', content: 'test' }],
        output: '{"files":[{"path":"test.js","content":"test"}]}',
        stats: { totalFiles: 1 }
      });
      
      await copy('.', { format: 'json' });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'json' })
      );
      expect(clipboard.write).toHaveBeenCalledWith(
        expect.stringContaining('"files"')
      );
    });

    it('should support tree format', async () => {
      mockPipeline.execute.mockResolvedValue({
        files: [{ path: 'src/index.js' }],
        output: '.\n└── src/\n    └── index.js',
        stats: { totalFiles: 1 }
      });
      
      await copy('.', { format: 'tree', display: true });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('└── src/')
      );
    });
  });

  describe('git integration', () => {
    it('should filter modified files', async () => {
      await copy('.', { modified: true });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          gitFilter: 'modified'
        })
      );
    });

    it('should filter changed files with ref', async () => {
      await copy('.', { changed: 'main' });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          gitFilter: 'changed',
          gitRef: 'main'
        })
      );
    });
  });

  describe('external sources', () => {
    it('should include external sources', async () => {
      await copy('.', {
        external: ['https://github.com/user/repo', '/other/project']
      });
      
      expect(mockPipeline.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          external: ['https://github.com/user/repo', '/other/project']
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle pipeline errors', async () => {
      mockPipeline.execute.mockRejectedValue(new Error('Pipeline failed'));
      
      await expect(copy('.', {})).rejects.toThrow('Pipeline failed');
      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it('should handle profile loading errors', async () => {
      ProfileLoader.load.mockRejectedValue(new Error('Profile not found'));
      
      await expect(copy('.', { profile: 'invalid' })).rejects.toThrow('Profile not found');
    });

    it('should handle file write errors', async () => {
      fs.writeFile.mockRejectedValue(new Error('Permission denied'));
      
      await expect(copy('.', { output: '/root/output.xml' })).rejects.toThrow('Permission denied');
      expect(mockSpinner.fail).toHaveBeenCalled();
    });

    it('should handle clipboard errors gracefully', async () => {
      clipboard.write.mockRejectedValue(new Error('Clipboard not available'));
      
      // Should not throw, just log error
      await copy('.', {});
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('clipboard')
      );
    });
  });

  describe('info mode', () => {
    it('should display info table', async () => {
      mockPipeline.execute.mockResolvedValue({
        files: [
          { path: 'src/index.js', size: 1024 },
          { path: 'src/utils.js', size: 2048 }
        ],
        stats: {
          totalFiles: 2,
          totalSize: 3072,
          byExtension: {
            '.js': { count: 2, size: 3072 }
          }
        }
      });
      
      await copy('.', { info: true });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('File Statistics')
      );
      expect(clipboard.write).not.toHaveBeenCalled();
    });
  });

  describe('validation mode', () => {
    it('should validate profile without executing', async () => {
      ProfileLoader.load.mockResolvedValue({
        name: 'test',
        patterns: ['**/*.js'],
        validate: jest.fn().mockReturnValue({ valid: true })
      });
      
      await copy('.', { validate: true, profile: 'test' });
      
      expect(mockPipeline.execute).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Profile "test" is valid')
      );
    });
  });

  describe('performance', () => {
    it('should handle large file counts efficiently', async () => {
      const largeFileList = Array(10000).fill(null).map((_, i) => ({
        path: `file${i}.js`,
        content: `content${i}`
      }));
      
      mockPipeline.execute.mockResolvedValue({
        files: largeFileList,
        output: '<copytree>...</copytree>',
        stats: {
          totalFiles: 10000,
          totalSize: 10000000,
          duration: 5000
        }
      });
      
      const startTime = Date.now();
      await copy('.', {});
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete quickly
      expect(mockSpinner.succeed).toHaveBeenCalled();
    });
  });
});