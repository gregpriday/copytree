const {
  BaseError,
  CommandError,
  ConfigurationError,
  FileSystemError,
  ProfileError,
  TransformationError,
  AIError,
  GitError,
  CacheError
} = require('../../../src/utils/errors');

describe('Error Classes', () => {
  describe('BaseError', () => {
    test('should create error with message and code', () => {
      const error = new BaseError('Test message', 'TEST_CODE');
      
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('BaseError');
      expect(error).toBeInstanceOf(Error);
    });

    test('should include details if provided', () => {
      const details = { key: 'value', nested: { prop: 123 } };
      const error = new BaseError('Test message', 'TEST_CODE', details);
      
      expect(error.details).toEqual(details);
    });

    test('should have proper JSON serialization', () => {
      const error = new BaseError('Test message', 'TEST_CODE', { key: 'value' });
      const json = error.toJSON();
      
      expect(json.name).toBe('BaseError');
      expect(json.message).toBe('Test message');
      expect(json.code).toBe('TEST_CODE');
      expect(json.details).toEqual({ key: 'value' });
      expect(json.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('CommandError', () => {
    test('should create command error with command info', () => {
      const error = new CommandError('Command failed', 'copy', { exitCode: 1 });
      
      expect(error.message).toBe('Command failed');
      expect(error.command).toBe('copy');
      expect(error.details).toEqual({ exitCode: 1 });
      expect(error.name).toBe('CommandError');
    });
  });

  describe('FileSystemError', () => {
    test('should create filesystem error with path and operation', () => {
      const error = new FileSystemError('File not found', '/test/path', 'read', { errno: -2 });
      
      expect(error.message).toBe('File not found');
      expect(error.path).toBe('/test/path');
      expect(error.operation).toBe('read');
      expect(error.details).toEqual({ errno: -2 });
      expect(error.name).toBe('FileSystemError');
    });
  });

  describe('ProfileError', () => {
    test('should create profile error with profile name', () => {
      const error = new ProfileError('Invalid profile', 'test-profile', { line: 5 });
      
      expect(error.message).toBe('Invalid profile');
      expect(error.profileName).toBe('test-profile');
      expect(error.details).toEqual({ line: 5 });
      expect(error.name).toBe('ProfileError');
    });
  });

  describe('TransformationError', () => {
    test('should create transformation error with transformer and file info', () => {
      const error = new TransformationError(
        'Transform failed', 
        'pdf-transformer', 
        '/test/file.pdf', 
        { stage: 'parsing' }
      );
      
      expect(error.message).toBe('Transform failed');
      expect(error.transformer).toBe('pdf-transformer');
      expect(error.filePath).toBe('/test/file.pdf');
      expect(error.details).toEqual({ stage: 'parsing' });
      expect(error.name).toBe('TransformationError');
    });
  });

  describe('AIError', () => {
    test('should create AI error with provider and operation info', () => {
      const error = new AIError('API failed', 'gemini', 'complete', { status: 429 });
      
      expect(error.message).toBe('API failed');
      expect(error.provider).toBe('gemini');
      expect(error.operation).toBe('complete');
      expect(error.details).toEqual({ status: 429 });
      expect(error.name).toBe('AIError');
    });
  });

  describe('GitError', () => {
    test('should create git error with command and repository info', () => {
      const error = new GitError('Git command failed', 'status', '/repo/path', { exitCode: 128 });
      
      expect(error.message).toBe('Git command failed');
      expect(error.gitCommand).toBe('status');
      expect(error.repositoryPath).toBe('/repo/path');
      expect(error.details).toEqual({ exitCode: 128 });
      expect(error.name).toBe('GitError');
    });
  });

  describe('CacheError', () => {
    test('should create cache error with key and operation info', () => {
      const error = new CacheError('Cache write failed', 'test-key', 'write', { disk: 'full' });
      
      expect(error.message).toBe('Cache write failed');
      expect(error.cacheKey).toBe('test-key');
      expect(error.operation).toBe('write');
      expect(error.details).toEqual({ disk: 'full' });
      expect(error.name).toBe('CacheError');
    });
  });

  describe('Error inheritance', () => {
    test('all error classes should be instances of BaseError', () => {
      const errors = [
        new CommandError('test', 'cmd'),
        new ConfigurationError('test', 'config'),
        new FileSystemError('test', '/path', 'op'),
        new ProfileError('test', 'profile'),
        new TransformationError('test', 'transformer', '/file'),
        new AIError('test', 'provider', 'op'),
        new GitError('test', 'cmd', '/repo'),
        new CacheError('test', 'key', 'op')
      ];
      
      errors.forEach(error => {
        expect(error).toBeInstanceOf(BaseError);
        expect(error).toBeInstanceOf(Error);
      });
    });
  });
});