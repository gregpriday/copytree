import SecretsGuardStage from '../../../../src/pipeline/stages/SecretsGuardStage.js';
import GitleaksAdapter from '../../../../src/services/GitleaksAdapter.js';
import { SecretsDetectedError } from '../../../../src/utils/errors.js';
import { jest } from '@jest/globals';

jest.mock('../../../../src/services/GitleaksAdapter.js');
jest.mock('../../../../src/config/ConfigManager.js', () => ({
  config: () => ({
    get: jest.fn((_key, defaultValue) => defaultValue),
  }),
}));

const buildInput = (content, path = 'test.js') => ({
  files: [{ path, relativePath: path, content, size: Buffer.byteLength(content) }],
  stats: {},
});

describe('SecretsGuardStage', () => {
  let mockGitleaks;

  beforeEach(() => {
    mockGitleaks = {
      isAvailable: jest.fn().mockResolvedValue(true),
      getVersion: jest.fn().mockResolvedValue('1.0.0'),
      scanString: jest.fn().mockResolvedValue([]),
    };

    GitleaksAdapter.mockImplementation(() => mockGitleaks);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns input unchanged when disabled', async () => {
    const stage = new SecretsGuardStage({ enabled: false });
    const input = buildInput('const a = 1;');

    const result = await stage.process(input);

    expect(result).toEqual(input);
    expect(mockGitleaks.scanString).not.toHaveBeenCalled();
  });

  test('uses gitleaks when available', async () => {
    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    await stage.process(buildInput('const token = "abc";'));

    expect(mockGitleaks.scanString).toHaveBeenCalledWith(expect.any(String), 'test.js');
  });

  test('falls back to basic regex scanning when gitleaks is unavailable', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({ enabled: true, redactionMode: 'generic' });
    await stage.onInit();

    const result = await stage.process(buildInput('password = supersecretvalue12345'));

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.RuleID === 'GENERIC_TOKEN')).toBe(true);
    expect(result.files[0].content).toContain('***REDACTED***');
  });

  test('falls back to basic scan when gitleaks call errors', async () => {
    mockGitleaks.scanString.mockRejectedValue(new Error('gitleaks timed out'));

    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    const result = await stage.process(buildInput('token=abcdefghijklmno12345'));

    expect(mockGitleaks.scanString).toHaveBeenCalledTimes(1);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.files[0].redacted).toBe(true);
  });

  test('throws when failOnSecrets is enabled', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({ enabled: true, failOnSecrets: true });
    await stage.onInit();

    await expect(
      stage.process(buildInput('password=supersecretvalue12345')),
    ).rejects.toBeInstanceOf(SecretsDetectedError);
  });

  test('throws immediately when redaction is disabled and failOnSecrets is enabled', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({
      enabled: true,
      redactInline: false,
      failOnSecrets: true,
    });
    await stage.onInit();

    await expect(stage.process(buildInput('token=abcdefghijklmno12345'))).rejects.toBeInstanceOf(
      SecretsDetectedError,
    );
  });

  test('skips scanning files beyond maxFileBytes', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({ enabled: true, maxFileBytes: 10 });
    await stage.onInit();

    const input = buildInput('password=supersecretvalue12345');
    const result = await stage.process(input);

    expect(result.findings).toEqual([]);
    expect(result.files[0].content).toBe('password=supersecretvalue12345');
  });

  test('excludes secret-prone files entirely', async () => {
    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    const input = {
      files: [
        { path: '.env', relativePath: '.env', content: 'SECRET=123', size: 10 },
        { path: 'normal.txt', relativePath: 'normal.txt', content: 'hello', size: 5 },
      ],
      stats: {},
    };

    const result = await stage.process(input);

    expect(result.files[0]).toBeNull();
    expect(result.files[1].content).toBe('hello');
  });

  describe('case-insensitive exclusion on Windows', () => {
    let originalPlatform;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    test('excludes secret-prone files case-insensitively on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const input = {
        files: [
          { path: '.ENV', relativePath: '.ENV', content: 'SECRET=123', size: 10 },
          { path: 'Credentials.JSON', relativePath: 'Credentials.JSON', content: '{}', size: 2 },
          { path: 'normal.txt', relativePath: 'normal.txt', content: 'hello', size: 5 },
        ],
        stats: {},
      };

      const result = await stage.process(input);

      expect(result.files[0]).toBeNull();
      expect(result.files[1]).toBeNull();
      expect(result.files[2].content).toBe('hello');
    });

    test('is case-sensitive on non-Windows platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const input = {
        files: [
          { path: '.ENV', relativePath: '.ENV', content: 'SECRET=123', size: 10 },
          { path: '.env', relativePath: '.env', content: 'SECRET=456', size: 10 },
        ],
        stats: {},
      };

      const result = await stage.process(input);

      // .ENV should NOT be excluded on Linux (case-sensitive) — content must pass through unchanged
      expect(result.files[0]).not.toBeNull();
      expect(result.files[0].content).toBe('SECRET=123');
      expect(result.findings).toHaveLength(0);
      // .env should be excluded
      expect(result.files[1]).toBeNull();
    });
  });
});
