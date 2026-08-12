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
  SecretsDetectedError,
  ScopeError,
  ERROR_CODES,
  describeError,
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
    SecretsDetectedError,
    ScopeError,
    ERROR_CODES,
    describeError,
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

    test('every error class carries a code from the public registry', () => {
      // These used to be bare `COMMAND_ERROR`-style strings that appeared in no
      // registry and in no TypeScript union, while the docs told consumers to
      // switch on `error.code`. A code outside the union is a code a typed
      // consumer cannot write a case for.
      const thrown = [
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

      const registry = new Set(Object.values(ERROR_CODES));
      for (const error of thrown) {
        expect(registry.has(error.code)).toBe(true);
      }

      expect(new CommandError('test', 'cmd').code).toBe(ERROR_CODES.COMMAND_FAILED);
      expect(new ConfigurationError('test', 'config').code).toBe(ERROR_CODES.CONFIG_INVALID);
      expect(new FileSystemError('test', '/path', 'op').code).toBe(ERROR_CODES.FILESYSTEM);
      expect(new ProfileError('test', 'profile').code).toBe(ERROR_CODES.PROFILE_INVALID);
      expect(new TransformError('test', 't', '/f').code).toBe(ERROR_CODES.TRANSFORM);
      expect(new GitError('test', 'status').code).toBe(ERROR_CODES.GIT);
      expect(new ValidationError('test', 'f', 'v').code).toBe(ERROR_CODES.VALIDATION);
      expect(new PipelineError('test', 'stage').code).toBe(ERROR_CODES.PIPELINE_STAGE);
      expect(new InstructionsError('test', 'i').code).toBe(ERROR_CODES.INSTRUCTIONS);
    });

    test('toJSON withholds the stack and toDebugJSON supplies it', () => {
      // `toJSON()` is what a logging integration and `JSON.stringify(error)`
      // both reach for, and a stack names absolute paths on the machine that
      // ran the command.
      const error = new FileSystemError('test', '/path', 'op', {
        cause: new Error('underlying'),
      });

      expect(error.toJSON().stack).toBeUndefined();
      expect(error.toJSON().details.cause).toBeUndefined();
      expect(error.toDebugJSON().stack).toContain('FileSystemError');
      expect(error.toDebugJSON().cause).toContain('underlying');
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

describe('describeError', () => {
  // Built from `error.code`, never from matching message text: the codes are
  // the stable contract and the messages are not.
  test('describes a missing path with a next action', () => {
    const error = new CopyTreeError('Path does not exist: /x', ERROR_CODES.PATH_NOT_FOUND, {
      path: './x',
    });

    expect(describeError(error)).toMatchObject({
      status: 'error',
      title: 'Path not found',
      subject: './x',
      suggestion: 'Check the path or run copytree from the project root',
      code: ERROR_CODES.PATH_NOT_FOUND,
    });
  });

  test('names the project root when a scope escapes it', () => {
    const error = new ScopeError('outside', ERROR_CODES.SCOPE_OUTSIDE_ROOT, '../shared');
    const described = describeError(error, { basePath: '/home/greg/project' });

    expect(described.subject).toBe('../shared');
    expect(described.suggestion).toBe('Choose a path inside /home/greg/project');
  });

  test('lists the valid formats when one is unknown', () => {
    const error = new ValidationError('Unknown output format: yaml', 'format', 'yaml', {
      code: ERROR_CODES.INVALID_FORMAT,
      value: 'yaml',
    });

    expect(describeError(error).suggestion).toBe(
      'Choose xml, markdown, json, ndjson, sarif or tree',
    );
  });

  test('offers a safe report when secrets stop the run', () => {
    const error = new SecretsDetectedError('secrets found', [{}, {}, {}]);
    const described = describeError(error);

    expect(described.title).toContain('3 possible secrets found');
    expect(described.suggestion).toContain('--secrets-report');
  });

  test('keeps an option error as its own problem statement', () => {
    const error = new ValidationError("Invalid --max-files value 'x'", 'max-files', 'x', {
      code: ERROR_CODES.INVALID_OPTION,
      suggestion: 'Use a positive integer',
    });

    expect(describeError(error).title).toBe("Invalid --max-files value 'x'");
    expect(describeError(error).suggestion).toBe('Use a positive integer');
  });

  // An unrecognised error still has to answer "what do I do now".
  test('falls back to a generic description with a diagnostic step', () => {
    const described = describeError(new Error('kaboom'));

    expect(described.title).toBe('CopyTree could not complete the operation');
    expect(described.suggestion).toBe('Run again with --verbose for diagnostic details');
  });
});
