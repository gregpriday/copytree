const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('child_process');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Now require GitHubUrlHandler after mocks are set up
const GitHubUrlHandler = require('../../../src/services/GitHubUrlHandler');

describe('GitHubUrlHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Add rmSync to fs mock
    fs.rmSync = jest.fn();
  });

  describe('isGitHubUrl', () => {
    it('should identify valid GitHub URLs', () => {
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo')).toBe(true);
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo/tree/main')).toBe(true);
      expect(GitHubUrlHandler.isGitHubUrl('https://github.com/user/repo/tree/main/src')).toBe(true);
    });

    it('should reject non-GitHub URLs', () => {
      expect(GitHubUrlHandler.isGitHubUrl('https://gitlab.com/user/repo')).toBe(false);
      expect(GitHubUrlHandler.isGitHubUrl('http://github.com/user/repo')).toBe(false);
      expect(GitHubUrlHandler.isGitHubUrl('/local/path')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('should parse repository URL correctly', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('');
      expect(handler.subPath).toBe('');
    });

    it('should parse URL with branch', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('develop');
      expect(handler.subPath).toBe('');
    });

    it('should parse URL with branch and path', () => {
      const handler = new GitHubUrlHandler('https://github.com/user/repo/tree/main/src/components');
      expect(handler.repoUrl).toBe('https://github.com/user/repo.git');
      expect(handler.branch).toBe('main');
      expect(handler.subPath).toBe('src/components');
    });

    it('should throw error for invalid URL format', () => {
      expect(() => new GitHubUrlHandler('not-a-url')).toThrow('Invalid GitHub URL format');
    });
  });

  describe('getFiles', () => {
    let handler;

    beforeEach(() => {
      handler = new GitHubUrlHandler('https://github.com/user/repo');
      fs.existsSync.mockReturnValue(false);
      fs.ensureDirSync.mockImplementation(() => {});
      execSync.mockImplementation(() => {});
    });

    it('should clone repository if not cached', async () => {
      // Mock that the target path exists after cloning
      fs.existsSync
        .mockReturnValueOnce(false) // repoDir doesn't exist (line 68)
        .mockReturnValueOnce(false) // repoDir check in else block (line 72)
        .mockReturnValueOnce(false) // repoDir check before removal in cloneRepository (line 111)
        .mockReturnValueOnce(true); // targetPath exists after clone (line 85)
      
      // Mock detectDefaultBranch to return 'main'
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('ls-remote')) {
          return 'ref: refs/heads/main\tHEAD\n';
        }
        return '';
      });
      
      const targetPath = await handler.getFiles();
      
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.any(Object)
      );
      expect(targetPath).toBe(handler.repoDir);
    });

    it('should update repository if already cached', async () => {
      fs.existsSync.mockReturnValue(true);
      execSync.mockImplementation((cmd) => {
        if (cmd.includes('rev-list')) return '5\n';
        return '';
      });

      await handler.getFiles();
      
      expect(execSync).toHaveBeenCalledWith('git fetch', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('git pull'),
        expect.any(Object)
      );
    });

    it('should handle clone errors gracefully', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Authentication failed');
      });

      await expect(handler.getFiles()).rejects.toThrow('GitHub authentication failed');
    });
  });

  describe('detectDefaultBranch', () => {
    let handler;

    beforeEach(() => {
      handler = new GitHubUrlHandler('https://github.com/user/repo');
    });

    it('should detect default branch from remote', async () => {
      execSync.mockReturnValue('ref: refs/heads/main\tHEAD\n');
      
      const branch = await handler.detectDefaultBranch();
      expect(branch).toBe('main');
    });

    it('should fallback to main on error', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });
      
      const branch = await handler.detectDefaultBranch();
      expect(branch).toBe('main');
    });
  });

  describe('cache management', () => {
    let handler;

    beforeEach(() => {
      handler = new GitHubUrlHandler('https://github.com/user/repo');
    });

    it('should generate consistent cache keys', () => {
      const handler1 = new GitHubUrlHandler('https://github.com/user/repo');
      const handler2 = new GitHubUrlHandler('https://github.com/user/repo');
      
      expect(handler1.cacheKey).toBe(handler2.cacheKey);
    });

    it('should generate different cache keys for different branches', () => {
      const handler1 = new GitHubUrlHandler('https://github.com/user/repo/tree/main');
      const handler2 = new GitHubUrlHandler('https://github.com/user/repo/tree/develop');
      
      expect(handler1.cacheKey).not.toBe(handler2.cacheKey);
    });

    it('should clear cache when requested', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.removeSync.mockImplementation(() => {});
      
      await handler.clearCache();
      
      expect(fs.removeSync).toHaveBeenCalledWith(handler.repoDir);
    });
  });
});