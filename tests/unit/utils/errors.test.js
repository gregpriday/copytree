// Use dynamic import for module under test
let CopyTreeError,
  CommandError,
  ConfigurationError,
  FileSystemError,
  ProfileError,
  TransformError,
  GitError,
  ValidationError,
  PipelineError,
  InstructionsError,
  handleError;

beforeAll(async () => {
  const errorsModule = await import('../../../src/utils/errors.js');
  ({
    CopyTreeError,
    CommandError,
    ConfigurationError,
    FileSystemError,
    ProfileError,
    TransformError,
    GitError,
    ValidationError,
    PipelineError,
    InstructionsError,
    handleError,
  } = errorsModule);
});

describe('Error Classes', () => {
  describe('CopyTreeError', () => {
    test('should create error with message and code', () => {
      const error = new CopyTreeError('Test message', 'TEST_CODE');

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('CopyTreeError');
      expect(error).toBeInstanceOf(Error);
    });

    test('should include details if provided', () => {
      const details = { key: 'value', nested: { prop: 123 } };
      const error = new CopyTreeError('Test message', 'TEST_CODE', details);

      expect(error.details).toEqual(details);
    });

    test('should have proper JSON serialization', () => {
      const error = new CopyTreeError('Test message', 'TEST_CODE', { key: 'value' });
      const json = error.toJSON();

      expect(json.name).toBe('CopyTreeError');
      expect(json.message).toBe('Test message');
      expect(json.code).toBe('TEST_CODE');
      expect(json.details).toEqual({ key: 'value' });
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('CommandError', () => {
    test('should create command error with command info', () => {
      const error = new CommandError('Command failed', 'copy', { exitCode: 1 });

      expect(error.message).toBe('Command failed');
      expect(error.command).toBe('copy');
      expect(error.details).toEqual({ command: 'copy', exitCode: 1 });
      expect(error.name).toBe('CommandError');
    });
  });

  describe('ConfigurationError', () => {
    test('should create configuration error with config key', () => {
      const error = new ConfigurationError('Invalid config value', 'maxFileSize', { value: '1TB' });

      expect(error.message).toBe('Invalid config value');
      expect(error.configKey).toBe('maxFileSize');
      expect(error.details).toEqual({ configKey: 'maxFileSize', value: '1TB' });
      expect(error.name).toBe('ConfigurationError');
    });
  });

  describe('FileSystemError', () => {
    test('should create filesystem error with path and operation', () => {
      const error = new FileSystemError('File not found', '/test/path', 'read', { errno: -2 });

      expect(error.message).toBe('File not found');
      expect(error.path).toBe('/test/path');
      expect(error.operation).toBe('read');
      expect(error.details).toEqual({ path: '/test/path', operation: 'read', errno: -2 });
      expect(error.name).toBe('FileSystemError');
    });
  });

  describe('ProfileError', () => {
    test('should create profile error with profile name', () => {
      const error = new ProfileError('Invalid profile', 'test-profile', { line: 5 });

      expect(error.message).toBe('Invalid profile');
      expect(error.profile).toBe('test-profile');
      expect(error.details).toEqual({ profile: 'test-profile', line: 5 });
      expect(error.name).toBe('ProfileError');
    });
  });

  describe('TransformError', () => {
    test('should create transform error with transformer and file info', () => {
      const error = new TransformError('Transform failed', 'pdf-transformer', '/test/file.pdf', {
        stage: 'parsing',
      });

      expect(error.message).toBe('Transform failed');
      expect(error.transformer).toBe('pdf-transformer');
      expect(error.file).toBe('/test/file.pdf');
      expect(error.details).toEqual({
        transformer: 'pdf-transformer',
        file: '/test/file.pdf',
        stage: 'parsing',
      });
      expect(error.name).toBe('TransformError');
    });
  });

  describe('GitError', () => {
    test('should create git error with operation info', () => {
      const error = new GitError('Git command failed', 'status', { exitCode: 128 });

      expect(error.message).toBe('Git command failed');
      expect(error.operation).toBe('status');
      expect(error.details).toEqual({ operation: 'status', exitCode: 128 });
      expect(error.name).toBe('GitError');
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with field and value info', () => {
      const error = new ValidationError('Invalid value', 'maxSize', '100MB', { expected: '10MB' });

      expect(error.message).toBe('Invalid value');
      expect(error.field).toBe('maxSize');
      expect(error.value).toBe('100MB');
      expect(error.details).toEqual({ field: 'maxSize', value: '100MB', expected: '10MB' });
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('PipelineError', () => {
    test('should create pipeline error with stage info', () => {
      const error = new PipelineError('Stage failed', 'FileDiscovery', { files: 0 });

      expect(error.message).toBe('Stage failed');
      expect(error.stage).toBe('FileDiscovery');
      expect(error.details).toEqual({ stage: 'FileDiscovery', files: 0 });
      expect(error.name).toBe('PipelineError');
    });
  });

  describe('InstructionsError', () => {
    test('should create instructions error with instructions name', () => {
      const error = new InstructionsError('Instructions not found', 'custom-template', {
        path: '/custom/path',
      });

      expect(error.message).toBe('Instructions not found');
      expect(error.instructionsName).toBe('custom-template');
      expect(error.details).toEqual({ instructionsName: 'custom-template', path: '/custom/path' });
      expect(error.name).toBe('InstructionsError');
    });
  });

  describe('Error inheritance', () => {
    test('all error classes should be instances of CopyTreeError', () => {
      const errors = [
        new CommandError('test', 'cmd'),
        new ConfigurationError('test', 'config'),
        new FileSystemError('test', '/path', 'op'),
        new ProfileError('test', 'profile'),
        new TransformError('test', 'transformer', '/file'),
        new GitError('test', 'status'),
        new ValidationError('test', 'field', 'value'),
        new PipelineError('test', 'stage'),
        new InstructionsError('test', 'instructions'),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(CopyTreeError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    test('all error classes should have correct error codes', () => {
      expect(new CommandError('test', 'cmd').code).toBe('COMMAND_ERROR');
      expect(new ConfigurationError('test', 'config').code).toBe('CONFIG_ERROR');
      expect(new FileSystemError('test', '/path', 'op').code).toBe('FILESYSTEM_ERROR');
      expect(new ProfileError('test', 'profile').code).toBe('PROFILE_ERROR');
      expect(new TransformError('test', 'transformer', '/file').code).toBe('TRANSFORM_ERROR');
      expect(new GitError('test', 'status').code).toBe('GIT_ERROR');
      expect(new ValidationError('test', 'field', 'value').code).toBe('VALIDATION_ERROR');
      expect(new PipelineError('test', 'stage').code).toBe('PIPELINE_ERROR');
      expect(new InstructionsError('test', 'instructions').code).toBe('INSTRUCTIONS_ERROR');
    });
  });

  describe('handleError', () => {
    let mockLogger;

    beforeEach(() => {
      mockLogger = jest.fn();
    });

    test('should handle CopyTreeError instances', () => {
      const error = new CopyTreeError('Test error', 'TEST_CODE');

      const result = handleError(error, {
        exit: false,
        verbose: false,
        logger: mockLogger,
      });

      expect(result).toBe(error);
      expect(mockLogger).toHaveBeenCalledWith('Error: Test error');
      expect(mockLogger).toHaveBeenCalledWith('Code: TEST_CODE');
    });

    test('should convert regular errors to CopyTreeError', () => {
      const error = new Error('Regular error');

      const result = handleError(error, {
        exit: false,
        verbose: false,
        logger: mockLogger,
      });

      expect(result).toBeInstanceOf(CopyTreeError);
      expect(result.message).toBe('Regular error');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.details.originalError).toBe('Error');
    });

    test('should log verbose information when requested', () => {
      const error = new CopyTreeError('Test error', 'TEST_CODE', { key: 'value' });

      handleError(error, {
        exit: false,
        verbose: true,
        logger: mockLogger,
      });

      expect(mockLogger).toHaveBeenCalledWith(error.toJSON());
    });

    test('should not exit in test environment', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const error = new CopyTreeError('Test error', 'TEST_CODE');

      handleError(error, {
        exit: true,
        verbose: false,
        logger: mockLogger,
      });

      expect(mockExit).not.toHaveBeenCalled();
      mockExit.mockRestore();
    });
  });
});
