// Unit tests for GitUtils using a mocked simple-git instance

import path from 'path';

let mockGitInstance;

// Mock simple-git to return our controllable instance
jest.mock('simple-git', () => {
  return () => mockGitInstance;
});

describe('GitUtils', () => {
  let GitUtils;
  let mockLogger;

  beforeAll(async () => {
    ({ default: GitUtils } = await import('../../../src/utils/GitUtils.js'));
  });

  beforeEach(() => {
    mockGitInstance = {
      revparse: jest.fn(),
      status: jest.fn(),
      diffSummary: jest.fn(),
      log: jest.fn(),
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      child: jest.fn(function() { return this; }),
    };
  });

  test('isGitRepository caches positive and negative results', async () => {
    // Positive
    mockGitInstance.revparse.mockResolvedValue('.git');
    const utils1 = new GitUtils('/repo', { logger: mockLogger });
    expect(await utils1.isGitRepository()).toBe(true);
    expect(await utils1.isGitRepository()).toBe(true);
    expect(mockGitInstance.revparse).toHaveBeenCalledTimes(1);

    // Negative cached
    const utils2 = new GitUtils('/not-repo', { logger: mockLogger });
    mockGitInstance.revparse.mockRejectedValue(new Error('not a repo'));
    expect(await utils2.isGitRepository()).toBe(false);
    expect(await utils2.isGitRepository()).toBe(false);
    expect(mockGitInstance.revparse).toHaveBeenCalledTimes(2); // one for utils1, one for utils2
  });

  test('getModifiedFiles returns normalized, de-duplicated results and caches', async () => {
    mockGitInstance.revparse.mockResolvedValue('.git');
    mockGitInstance.status.mockResolvedValue({
      modified: ['src/a.js'],
      staged: ['src/a.js', 'src/b.js'],
      not_added: ['src/c.js'],
      created: ['src/b.js'],
    });

    const utils = new GitUtils('/repo', { logger: mockLogger });
    const files1 = await utils.getModifiedFiles();
    const expected = [
      path.normalize('src/a.js'),
      path.normalize('src/b.js'),
      path.normalize('src/c.js'),
    ];
    // Order not strictly guaranteed; compare as sets
    expect(new Set(files1)).toEqual(new Set(expected));
    expect(mockGitInstance.status).toHaveBeenCalledTimes(1);

    // Cached
    const files2 = await utils.getModifiedFiles();
    expect(new Set(files2)).toEqual(new Set(expected));
    expect(mockGitInstance.status).toHaveBeenCalledTimes(1);

    // clearCache should drop cache and repo flag
    utils.clearCache();
    await utils.isGitRepository(); // will call revparse again after clear
    expect(mockGitInstance.revparse).toHaveBeenCalledTimes(2);
  });

  test('getModifiedFiles wraps errors as GitError with context', async () => {
    mockGitInstance.revparse.mockRejectedValue(new Error('not a repo'));
    const utils = new GitUtils('/not-repo', { logger: mockLogger });
    await expect(utils.getModifiedFiles()).rejects.toThrow('Failed to get modified files:');
  });

  test('getChangedFiles returns non-binary changed files and caches by ref', async () => {
    mockGitInstance.revparse.mockResolvedValue('.git');
    mockGitInstance.diffSummary.mockImplementation((args) => {
      // args like ['HEAD'] or ['HEAD~3','HEAD']
      return Promise.resolve({
        files: [
          { file: 'README.md', binary: false },
          { file: 'image.png', binary: true },
          { file: 'src/index.js', binary: false },
        ],
      });
    });

    const utils = new GitUtils('/repo', { logger: mockLogger });
    const filesHead = await utils.getChangedFiles('HEAD');
    expect(new Set(filesHead)).toEqual(
      new Set([path.normalize('README.md'), path.normalize('src/index.js')]),
    );

    // toRef path
    const filesRange = await utils.getChangedFiles('HEAD~3', 'HEAD');
    expect(new Set(filesRange)).toEqual(
      new Set([path.normalize('README.md'), path.normalize('src/index.js')]),
    );
  });

  test('getFileStatuses maps statuses and tolerates non-repo', async () => {
    // Non-repo
    mockGitInstance.revparse.mockRejectedValue(new Error('not a repo'));
    const utils1 = new GitUtils('/not-repo', { logger: mockLogger });
    expect(await utils1.getFileStatuses(['a.js'])).toEqual({});

    // Repo with statuses
    mockGitInstance.revparse.mockResolvedValue('.git');
    mockGitInstance.status.mockResolvedValue({
      modified: ['a.js'],
      staged: [],
      not_added: [],
      created: [],
      deleted: [],
      renamed: [],
      conflicted: [],
    });
    const utils2 = new GitUtils('/repo', { logger: mockLogger });
    expect(await utils2.getFileStatuses(['a.js', 'b.js'])).toEqual({
      'a.js': 'modified',
      'b.js': 'unmodified',
    });
  });

  test('getCurrentBranch and getLastCommit return info or null gracefully', async () => {
    // Repo: branch
    mockGitInstance.revparse.mockResolvedValueOnce('.git'); // for isGitRepository()
    mockGitInstance.revparse.mockResolvedValueOnce('main'); // for --abbrev-ref HEAD
    const utils = new GitUtils('/repo', { logger: mockLogger });
    expect(await utils.getCurrentBranch()).toBe('main');

    // Repo: last commit
    mockGitInstance.revparse.mockResolvedValue('.git');
    mockGitInstance.log.mockResolvedValue({
      latest: {
        hash: 'abc123',
        message: 'feat: test',
        author_name: 'Dev',
        date: '2024-01-01',
      },
    });
    const commit = await utils.getLastCommit();
    expect(commit).toEqual({
      hash: 'abc123',
      message: 'feat: test',
      author: 'Dev',
      date: '2024-01-01',
    });

    // Non-repo: returns null without throwing (use fresh instance)
    const utils3 = new GitUtils('/not-repo', { logger: mockLogger });
    mockGitInstance.revparse.mockRejectedValue(new Error('not a repo'));
    expect(await utils3.getCurrentBranch()).toBeNull();
    expect(await utils3.getLastCommit()).toBeNull();
  });

  test('hasUncommittedChanges returns false on error and when clean', async () => {
    // Repo clean
    mockGitInstance.revparse.mockResolvedValue('.git');
    mockGitInstance.status.mockResolvedValue({ isClean: () => true });
    const utils = new GitUtils('/repo', { logger: mockLogger });
    expect(await utils.hasUncommittedChanges()).toBe(false);

    // Repo dirty
    mockGitInstance.status.mockResolvedValue({ isClean: () => false });
    expect(await utils.hasUncommittedChanges()).toBe(true);

    // Error path
    mockGitInstance.status.mockRejectedValue(new Error('status failed'));
    expect(await utils.hasUncommittedChanges()).toBe(false);
  });
});
