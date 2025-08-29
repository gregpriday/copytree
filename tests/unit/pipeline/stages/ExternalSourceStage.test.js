// Mock dependencies before any imports
jest.mock('../../../../src/services/GitHubUrlHandler.js');
jest.mock('../../../../src/utils/fileLoader.js');
jest.mock('fs-extra');
jest.mock('globby', () => ({
  globby: jest.fn(),
}));

import ExternalSourceStage from '../../../../src/pipeline/stages/ExternalSourceStage.js';
import GitHubUrlHandler from '../../../../src/services/GitHubUrlHandler.js';
import FileLoader from '../../../../src/utils/fileLoader.js';
import fs from 'fs-extra';
import path from 'path';

describe('ExternalSourceStage', () => {
  let stage;
  let mockInput;
  let mockFileLoader;
  let mockGitHubHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock FileLoader
    mockFileLoader = {
      loadFiles: jest.fn().mockResolvedValue([
        { relativePath: 'file1.js', path: 'file1.js', content: 'content1' },
        { relativePath: 'file2.js', path: 'file2.js', content: 'content2' },
      ]),
    };
    FileLoader.mockImplementation(() => mockFileLoader);

    // Mock GitHubUrlHandler
    mockGitHubHandler = {
      getFiles: jest.fn().mockResolvedValue('/cached/repo/path'),
    };
    GitHubUrlHandler.mockImplementation(() => mockGitHubHandler);
    GitHubUrlHandler.isGitHubUrl = jest.fn();

    // Mock fs operations
    fs.pathExists = jest.fn();

    mockInput = {
      files: [{ path: 'existing.js', content: 'existing' }],
    };
  });

  describe('process', () => {
    it('should return files unchanged when no external sources', async () => {
      stage = new ExternalSourceStage([]);

      const result = await stage.process(mockInput);

      expect(result).toBe(mockInput);
      expect(GitHubUrlHandler.isGitHubUrl).not.toHaveBeenCalled();
    });

    it('should process GitHub URLs', async () => {
      const externalItems = [
        {
          source: 'https://github.com/user/repo',
          destination: 'external',
        },
      ];
      stage = new ExternalSourceStage(externalItems);

      GitHubUrlHandler.isGitHubUrl.mockReturnValue(true);

      const result = await stage.process(mockInput);

      expect(GitHubUrlHandler.isGitHubUrl).toHaveBeenCalledWith('https://github.com/user/repo');
      expect(GitHubUrlHandler).toHaveBeenCalledWith('https://github.com/user/repo');
      expect(mockGitHubHandler.getFiles).toHaveBeenCalled();
      expect(result.files).toHaveLength(3); // 1 existing + 2 external
      expect(result.files[0]).toBe(mockInput.files[0]);
      expect(result.files[1]).toMatchObject({
        path: 'external/file1.js',
        isExternal: true,
        externalSource: 'https://github.com/user/repo',
      });
    });

    it('should process local directories', async () => {
      const externalItems = [
        {
          source: '/local/path',
          destination: 'local',
        },
      ];
      stage = new ExternalSourceStage(externalItems);

      GitHubUrlHandler.isGitHubUrl.mockReturnValue(false);
      fs.pathExists.mockResolvedValue(true);

      const result = await stage.process(mockInput);

      expect(fs.pathExists).toHaveBeenCalledWith(path.resolve('/local/path'));
      expect(result.files).toHaveLength(3); // 1 existing + 2 external
      expect(result.files[1]).toMatchObject({
        path: 'local/file1.js',
        isExternal: true,
        externalSource: '/local/path',
      });
    });

    it('should handle errors gracefully for optional sources', async () => {
      const externalItems = [
        {
          source: 'https://github.com/user/repo',
          optional: true,
        },
      ];
      stage = new ExternalSourceStage(externalItems);

      GitHubUrlHandler.isGitHubUrl.mockReturnValue(true);
      mockGitHubHandler.getFiles.mockRejectedValue(new Error('Clone failed'));

      const result = await stage.process(mockInput);

      expect(result.files).toEqual(mockInput.files); // Only original files
    });

    it('should throw error for non-existent local paths', async () => {
      const externalItems = [
        {
          source: '/non/existent',
        },
      ];
      stage = new ExternalSourceStage(externalItems);

      GitHubUrlHandler.isGitHubUrl.mockReturnValue(false);
      fs.pathExists.mockResolvedValue(false);

      await expect(stage.process(mockInput)).rejects.toThrow('External source path does not exist');
    });

    it('should process multiple external sources', async () => {
      const externalItems = [
        { source: 'https://github.com/user/repo1' },
        { source: '/local/path', destination: 'local' },
      ];
      stage = new ExternalSourceStage(externalItems);

      GitHubUrlHandler.isGitHubUrl.mockReturnValueOnce(true).mockReturnValueOnce(false);
      fs.pathExists.mockResolvedValue(true);

      const result = await stage.process(mockInput);

      expect(result.files).toHaveLength(5); // 1 existing + 2 from first source + 2 from second source
      expect(GitHubUrlHandler.isGitHubUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe('validate', () => {
    it('should validate valid input', () => {
      stage = new ExternalSourceStage([]);
      expect(stage.validate(mockInput)).toBe(true);
    });

    it('should throw error for invalid input', () => {
      stage = new ExternalSourceStage([]);
      expect(() => stage.validate(null)).toThrow('Input must be an object');
      expect(() => stage.validate({})).toThrow('Input must have a files array');
    });

    it('should validate external items', () => {
      const invalidItems = [{ destination: 'test' }]; // Missing source
      stage = new ExternalSourceStage(invalidItems);
      expect(() => stage.validate(mockInput)).toThrow(
        'Each external item must have a source property',
      );
    });
  });
});
