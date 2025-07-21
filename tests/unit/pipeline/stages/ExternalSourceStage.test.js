const ExternalSourceStage = require('../../../../src/pipeline/stages/ExternalSourceStage');
const GitHubUrlHandler = require('../../../../src/services/GitHubUrlHandler');
const FileLoader = require('../../../../src/services/FileLoader');
const fs = require('fs-extra');
const path = require('path');

// Mock dependencies
jest.mock('../../../../src/services/GitHubUrlHandler');
jest.mock('../../../../src/services/FileLoader');
jest.mock('fs-extra');

describe('ExternalSourceStage', () => {
  let stage;
  let mockContext;

  beforeEach(() => {
    jest.clearAllMocks();
    stage = new ExternalSourceStage();
    mockContext = {
      emit: jest.fn(),
      basePath: '/test/project',
      profile: {
        external: [
          'https://github.com/user/repo',
          '/local/path'
        ]
      }
    };
  });

  describe('process', () => {
    it('should return files unchanged when no external sources', async () => {
      const files = [{ path: 'test.js' }];
      mockContext.profile = {};
      
      const result = await stage.process(files, mockContext);
      
      expect(result).toBe(files);
      expect(GitHubUrlHandler.isGitHubUrl).not.toHaveBeenCalled();
    });

    it('should process GitHub URLs', async () => {
      const files = [{ path: 'test.js' }];
      const externalFiles = [
        { path: 'external/file1.js', content: 'content1' },
        { path: 'external/file2.js', content: 'content2' }
      ];
      
      GitHubUrlHandler.isGitHubUrl.mockReturnValue(true);
      GitHubUrlHandler.prototype.getFiles = jest.fn().mockResolvedValue('/cached/repo');
      FileLoader.prototype.loadFromDirectory = jest.fn().mockResolvedValue(externalFiles);
      
      const result = await stage.process(files, mockContext);
      
      expect(GitHubUrlHandler.isGitHubUrl).toHaveBeenCalledWith('https://github.com/user/repo');
      expect(GitHubUrlHandler).toHaveBeenCalledWith('https://github.com/user/repo');
      expect(result).toHaveLength(3);
      expect(result).toContain(files[0]);
      expect(result).toContainEqual(expect.objectContaining({
        path: 'external/file1.js',
        externalSource: 'https://github.com/user/repo'
      }));
    });

    it('should process local directories', async () => {
      const files = [{ path: 'test.js' }];
      const externalFiles = [
        { path: 'local/file1.js', content: 'content1' }
      ];
      
      GitHubUrlHandler.isGitHubUrl.mockReturnValue(false);
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ isDirectory: () => true });
      FileLoader.prototype.loadFromDirectory = jest.fn().mockResolvedValue(externalFiles);
      
      const result = await stage.process(files, mockContext);
      
      expect(fs.existsSync).toHaveBeenCalledWith('/local/path');
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({
        path: 'local/file1.js',
        externalSource: '/local/path'
      });
    });

    it('should handle errors gracefully', async () => {
      const files = [{ path: 'test.js' }];
      
      GitHubUrlHandler.isGitHubUrl.mockReturnValue(true);
      GitHubUrlHandler.prototype.getFiles = jest.fn()
        .mockRejectedValue(new Error('Clone failed'));
      
      const result = await stage.process(files, mockContext);
      
      expect(mockContext.emit).toHaveBeenCalledWith('warning', 
        expect.stringContaining('Failed to load external source'));
      expect(result).toEqual(files);
    });

    it('should skip non-existent local paths', async () => {
      const files = [{ path: 'test.js' }];
      mockContext.profile.external = ['/non/existent'];
      
      GitHubUrlHandler.isGitHubUrl.mockReturnValue(false);
      fs.existsSync.mockReturnValue(false);
      
      const result = await stage.process(files, mockContext);
      
      expect(mockContext.emit).toHaveBeenCalledWith('warning',
        expect.stringContaining('does not exist'));
      expect(result).toEqual(files);
    });

    it('should emit progress events', async () => {
      const files = [];
      const externalFiles = Array(50).fill(null).map((_, i) => ({
        path: `file${i}.js`,
        content: `content${i}`
      }));
      
      GitHubUrlHandler.isGitHubUrl.mockReturnValue(true);
      GitHubUrlHandler.prototype.getFiles = jest.fn().mockResolvedValue('/cached');
      FileLoader.prototype.loadFromDirectory = jest.fn().mockResolvedValue(externalFiles);
      
      await stage.process(files, mockContext);
      
      expect(mockContext.emit).toHaveBeenCalledWith('external:loaded',
        expect.objectContaining({
          source: 'https://github.com/user/repo',
          fileCount: 50
        })
      );
    });
  });

  describe('shouldApply', () => {
    it('should apply when external sources exist', () => {
      expect(stage.shouldApply(mockContext)).toBe(true);
    });

    it('should not apply when no external sources', () => {
      mockContext.profile = {};
      expect(stage.shouldApply(mockContext)).toBe(false);
    });

    it('should not apply when external array is empty', () => {
      mockContext.profile.external = [];
      expect(stage.shouldApply(mockContext)).toBe(false);
    });
  });
});