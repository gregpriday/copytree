// Mock dependencies
jest.mock('../../../../src/utils/GitUtils.js');

import GitFilterStage from '../../../../src/pipeline/stages/GitFilterStage.js';
import GitUtils from '../../../../src/utils/GitUtils.js';

describe('GitFilterStage', () => {
  let stage;
  let mockGitUtils;

  const createTestInput = () => ({
    files: [
      { path: 'src/file1.js', content: 'file1' },
      { path: 'src/file2.js', content: 'file2' },
      { path: 'src/file3.js', content: 'file3' },
      { path: 'other/file4.js', content: 'file4' }
    ],
    stats: { totalFiles: 4 }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock GitUtils instance
    mockGitUtils = {
      isGitRepository: jest.fn().mockResolvedValue(true),
      getModifiedFiles: jest.fn().mockResolvedValue(['src/file1.js', 'src/file2.js']),
      getChangedFiles: jest.fn().mockResolvedValue(['src/changed1.js', 'src/changed2.js']),
      getFileStatuses: jest.fn().mockResolvedValue({
        'src/file1.js': 'modified',
        'src/file2.js': 'added',
        'src/file3.js': 'unmodified'
      }),
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      getLastCommit: jest.fn().mockResolvedValue({
        hash: 'abc123',
        message: 'Latest commit',
        author: 'Test User',
        date: '2024-01-01T00:00:00Z'
      }),
      hasUncommittedChanges: jest.fn().mockResolvedValue(true)
    };
    
    // Mock the GitUtils constructor to return our mock instance
    GitUtils.mockImplementation(() => mockGitUtils);
    
    stage = new GitFilterStage({
      basePath: '/project'
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const stage = new GitFilterStage();
      expect(stage.basePath).toBe(process.cwd());
      expect(stage.modified).toBe(false);
      expect(stage.changed).toBe(null);
      expect(stage.includeGitStatus).toBe(false);
    });

    it('should accept custom options', () => {
      const stage = new GitFilterStage({
        basePath: '/custom/path',
        modified: true,
        changed: 'HEAD~5',
        withGitStatus: true
      });
      
      expect(stage.basePath).toBe('/custom/path');
      expect(stage.modified).toBe(true);
      expect(stage.changed).toBe('HEAD~5');
      expect(stage.includeGitStatus).toBe(true);
    });

    it('should create GitUtils instance with correct basePath', () => {
      expect(GitUtils).toHaveBeenCalledWith('/project');
    });
  });

  describe('process', () => {

    it('should skip processing when no git options are set', async () => {
      const stage = new GitFilterStage(); // No options set
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result).toBe(input); // Should return same object
      expect(mockGitUtils.isGitRepository).not.toHaveBeenCalled();
    });

    it('should skip processing when not in git repository', async () => {
      mockGitUtils.isGitRepository.mockResolvedValue(false);
      stage = new GitFilterStage({ modified: true });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result).toBe(input);
      expect(mockGitUtils.getModifiedFiles).not.toHaveBeenCalled();
    });

    it('should filter files by modified status', async () => {
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(mockGitUtils.getModifiedFiles).toHaveBeenCalled();
      expect(result.files).toHaveLength(2);
      expect(result.files.map(f => f.path)).toEqual(['src/file1.js', 'src/file2.js']);
      expect(result.stats.gitFiltered).toBe(2); // 4 - 2 = 2 filtered out
    });

    it('should filter files by changed status', async () => {
      mockGitUtils.getChangedFiles.mockResolvedValue(['src/file1.js', 'other/file4.js']);
      stage = new GitFilterStage({ changed: 'HEAD~3', basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(mockGitUtils.getChangedFiles).toHaveBeenCalledWith('HEAD~3');
      expect(result.files).toHaveLength(2);
      expect(result.files.map(f => f.path)).toEqual(['src/file1.js', 'other/file4.js']);
      expect(result.gitMetadata.filterType).toBe('changed:HEAD~3');
    });

    it('should add git status to files when withGitStatus is true', async () => {
      stage = new GitFilterStage({ 
        modified: true, 
        withGitStatus: true, 
        basePath: '/project' 
      });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(mockGitUtils.getFileStatuses).toHaveBeenCalledWith(['src/file1.js', 'src/file2.js']);
      expect(result.files[0].gitStatus).toBe('modified');
      expect(result.files[1].gitStatus).toBe('added');
    });

    it('should only add git status without filtering when only withGitStatus is set', async () => {
      stage = new GitFilterStage({ withGitStatus: true, basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(4); // No filtering
      expect(mockGitUtils.getFileStatuses).toHaveBeenCalledWith([
        'src/file1.js', 'src/file2.js', 'src/file3.js', 'other/file4.js'
      ]);
      expect(result.files[0].gitStatus).toBe('modified');
      expect(result.files[1].gitStatus).toBe('added');
      expect(result.files[2].gitStatus).toBe('unmodified');
      expect(result.files[3].gitStatus).toBe('unknown');
    });

    it('should include comprehensive git metadata', async () => {
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.gitMetadata).toEqual({
        branch: 'main',
        lastCommit: {
          hash: 'abc123',
          message: 'Latest commit',
          author: 'Test User',
          date: '2024-01-01T00:00:00Z'
        },
        hasUncommittedChanges: true,
        filterType: 'modified'
      });
    });

    it('should handle git errors gracefully', async () => {
      mockGitUtils.getModifiedFiles.mockRejectedValue(new Error('Git command failed'));
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      // The stage should catch errors and return original input
      const result = await stage.process(input);
      expect(result).toBe(input); // Should return unchanged input on error
    });

    it('should handle path normalization correctly', async () => {
      mockGitUtils.getModifiedFiles.mockResolvedValue(['src/file1.js']); // Same format
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = {
        files: [
          { path: 'src/file1.js', content: 'file1' },
          { path: 'src/file2.js', content: 'file2' }
        ],
        stats: { totalFiles: 2 }
      };
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/file1.js');
    });

    it('should handle empty git file lists', async () => {
      mockGitUtils.getModifiedFiles.mockResolvedValue([]);
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(0);
      expect(result.stats.gitFiltered).toBe(4);
    });

    it('should handle git status for non-existent files', async () => {
      mockGitUtils.getFileStatuses.mockResolvedValue({
        'src/file1.js': 'modified'
        // file2.js missing from status
      });
      
      stage = new GitFilterStage({ 
        modified: true, 
        withGitStatus: true, 
        basePath: '/project' 
      });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.files[0].gitStatus).toBe('modified');
      expect(result.files[1].gitStatus).toBe('unknown');
    });

    it('should preserve other input properties', async () => {
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = {
        ...createTestInput(),
        customProperty: 'value',
        metadata: { test: true }
      };
      
      const result = await stage.process(input);
      
      expect(result.customProperty).toBe('value');
      expect(result.metadata).toEqual({ test: true });
    });
  });

  describe('git metadata handling', () => {
    it('should handle missing git metadata gracefully', async () => {
      mockGitUtils.getCurrentBranch.mockResolvedValue(null);
      mockGitUtils.getLastCommit.mockResolvedValue(null);
      
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.gitMetadata.branch).toBeNull();
      expect(result.gitMetadata.lastCommit).toBeNull();
    });

    it('should handle git metadata errors', async () => {
      mockGitUtils.getCurrentBranch.mockRejectedValue(new Error('Branch error'));
      
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = createTestInput();
      
      // Should catch the error and return original input
      const result = await stage.process(input);
      expect(result).toBe(input);
    });
  });

  describe('filter combinations', () => {
    it('should prioritize modified over changed when both are set', async () => {
      stage = new GitFilterStage({ 
        modified: true, 
        changed: 'HEAD~3', 
        basePath: '/project' 
      });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(mockGitUtils.getModifiedFiles).toHaveBeenCalled();
      expect(mockGitUtils.getChangedFiles).not.toHaveBeenCalled();
      expect(result.gitMetadata.filterType).toBe('modified');
    });

    it('should handle both filtering and git status', async () => {
      stage = new GitFilterStage({ 
        modified: true, 
        withGitStatus: true, 
        basePath: '/project' 
      });
      const input = createTestInput();
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(2); // Filtered
      expect(result.files[0].gitStatus).toBe('modified'); // Status added
      expect(result.files[1].gitStatus).toBe('added');
    });
  });

  describe('edge cases', () => {
    it('should handle empty file list', async () => {
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = { files: [], stats: { totalFiles: 0 } };
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(0);
      expect(result.stats.gitFiltered).toBe(0);
    });

    it('should handle files with relative paths', async () => {
      mockGitUtils.getModifiedFiles.mockResolvedValue(['./src/file1.js']);
      stage = new GitFilterStage({ modified: true, basePath: '/project' });
      const input = {
        files: [{ path: 'src/file1.js', content: 'file1' }],
        stats: { totalFiles: 1 }
      };
      
      const result = await stage.process(input);
      
      expect(result.files).toHaveLength(1);
    });
  });
});