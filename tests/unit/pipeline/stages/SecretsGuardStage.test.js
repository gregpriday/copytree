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

const buildInput = (content) => ({
  files: [{ path: 'test.js', relativePath: 'test.js', content, size: Buffer.byteLength(content) }],
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

    const input = buildInput('const token = "abc";');
    await stage.process(input);

    expect(mockGitleaks.scanString).toHaveBeenCalledWith(expect.any(String), 'test.js');
  });

  test('falls back to basic regex when gitleaks unavailable', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);
    const stage = new SecretsGuardStage({ enabled: true, redactionMode: 'generic' });
    await stage.onInit();

    const input = buildInput('AKIA1234567890TEST');
    const result = await stage.process(input);

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.files[0].content).toContain('***REDACTED');
  });

  test('throws when failOnSecrets is enabled', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);
    const stage = new SecretsGuardStage({ enabled: true, failOnSecrets: true });
    await stage.onInit();

    await expect(stage.process(buildInput('password = secretvalue12345'))).rejects.toBeInstanceOf(
      SecretsDetectedError,
    );
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

    expect(result.files[0]).toBeNull(); // excluded
    expect(result.files[1].content).toBe('hello');
  });
});
