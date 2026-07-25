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
    expect(result.findings.some((f) => f.ruleId === 'GENERIC_TOKEN')).toBe(true);
    expect(result.files[0].content).toContain('***REDACTED***');
  });

  // Findings outlive the content they came from: they land in stats, in events,
  // and on the thrown error. Anything carrying the matched bytes carries the
  // secret to wherever the embedder logs those.
  test('never exposes the matched secret on a finding', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    const result = await stage.process(buildInput('password = supersecretvalue12345'));

    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(JSON.stringify(finding)).not.toContain('supersecretvalue12345');
      expect(finding.Match).toBeUndefined();
      expect(finding.fingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(finding.matchLength).toBeGreaterThan(0);
    }
  });

  test('keeps the secret out of the thrown error when failOnSecrets is set', async () => {
    mockGitleaks.isAvailable.mockResolvedValue(false);

    const stage = new SecretsGuardStage({ enabled: true, failOnSecrets: true });
    await stage.onInit();

    const error = await stage
      .process(buildInput('password=supersecretvalue12345'))
      .then(() => null)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(SecretsDetectedError);
    expect(error.code).toBe('ERR_SECRETS_DETECTED');
    expect(error.secretsCount).toBeGreaterThan(0);
    expect(JSON.stringify(error.details)).not.toContain('supersecretvalue12345');
    expect(error.message).not.toContain('supersecretvalue12345');
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

  // A file too large to scan used to pass through unscanned while the run still
  // reported that secrets protection was on. Excluding it is the only default
  // that does not overstate the protection.
  describe('files too large to scan', () => {
    test('excludes them by default rather than emitting them unscanned', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(false);

      const stage = new SecretsGuardStage({ enabled: true, maxFileBytes: 10 });
      await stage.onInit();

      const result = await stage.process(buildInput('password=supersecretvalue12345'));

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.excludedUnscannable).toBe(1);
    });

    test('scans them anyway under oversizePolicy: scan', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(false);

      const stage = new SecretsGuardStage({
        enabled: true,
        maxFileBytes: 10,
        oversizePolicy: 'scan',
      });
      await stage.onInit();

      const result = await stage.process(buildInput('password=supersecretvalue12345'));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toContain('***REDACTED');
    });

    test('fails the run under oversizePolicy: fail', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(false);

      const stage = new SecretsGuardStage({
        enabled: true,
        maxFileBytes: 10,
        oversizePolicy: 'fail',
      });
      await stage.onInit();

      await expect(stage.process(buildInput('anything at all here'))).rejects.toBeInstanceOf(
        SecretsDetectedError,
      );
    });
  });

  test('drops secret-prone files and records why', async () => {
    const stage = new SecretsGuardStage({ enabled: true });
    await stage.onInit();

    const recorded = [];
    const input = {
      files: [
        { path: '.env', relativePath: '.env', content: 'SECRET=123', size: 10 },
        { path: 'normal.txt', relativePath: 'normal.txt', content: 'hello', size: 5 },
      ],
      exclusionReport: { add: (detail) => recorded.push(detail) },
      stats: {},
    };

    const result = await stage.process(input);

    // Dropped, not left as a null tombstone for every later stage to skip past.
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe('hello');
    expect(recorded).toEqual([expect.objectContaining({ path: '.env', reason: 'secretFile' })]);
    expect(result.stats.secretsGuard.excludedSecretFiles).toBe(1);
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

      expect(result.files.map((file) => file.path)).toEqual(['normal.txt']);
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

      // .ENV should NOT be excluded on Linux (case-sensitive) — content must pass
      // through unchanged. .env should be the only one dropped.
      expect(result.files.map((file) => file.path)).toEqual(['.ENV']);
      expect(result.files[0].content).toBe('SECRET=123');
      expect(result.findings).toHaveLength(0);
    });

    test('excludes secret-prone names at any depth', async () => {
      // Bare names are meant at any depth. Anchoring them to the root meant
      // `keys/id_rsa` was scanned rather than excluded, and the scanner's job on
      // a private key is much harder than simply not emitting it.
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process({
        files: [
          { path: 'keys/id_rsa', relativePath: 'keys/id_rsa', content: 'key', size: 3 },
          { path: 'certs/a.pem', relativePath: 'certs/a.pem', content: 'pem', size: 3 },
          { path: 'deep/cfg/.env', relativePath: 'deep/cfg/.env', content: 'A=1', size: 3 },
          { path: 'src/index.ts', relativePath: 'src/index.ts', content: 'export {};', size: 10 },
        ],
        stats: {},
      });

      expect(result.files.map((file) => file.path)).toEqual(['src/index.ts']);
      expect(result.stats.secretsGuard.excludedSecretFiles).toBe(3);
    });
  });

  describe('non-text content', () => {
    test('excludes Buffer content instead of throwing', async () => {
      // A document transformer can leave content as a Buffer. The scanner would
      // coerce it to a string to match against, then the redactor would call
      // `.split()` on the Buffer and throw — and this stage is fatal, so that
      // TypeError took the whole run down.
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process({
        files: [
          {
            path: 'doc.pdf',
            relativePath: 'doc.pdf',
            content: Buffer.from('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYzRt9q2Lk'),
            size: 60,
          },
          { path: 'src/a.ts', relativePath: 'src/a.ts', content: 'export {};', size: 10 },
        ],
        stats: {},
      });

      expect(result.files.map((file) => file.path)).toEqual(['src/a.ts']);
      expect(result.stats.secretsGuard.excludedUnscannable).toBe(1);
    });

    test('passes through a file with no content at all', async () => {
      const stage = new SecretsGuardStage({ enabled: true });
      await stage.onInit();

      const result = await stage.process({
        files: [
          { path: 'a.ts', relativePath: 'a.ts', size: 10 },
          { path: 'b.ts', relativePath: 'b.ts', content: '', size: 0 },
          { path: null },
        ],
        stats: {},
      });

      expect(result.files).toHaveLength(3);
    });
  });

  describe('plan mode', () => {
    test('applies glob exclusions without content and scans nothing', async () => {
      const stage = new SecretsGuardStage({ enabled: true, planOnly: true });
      await stage.onInit();

      const result = await stage.process({
        files: [
          { path: '.env', relativePath: '.env', size: 20 },
          { path: 'src/a.ts', relativePath: 'src/a.ts', size: 10 },
        ],
        stats: {},
      });

      expect(result.files.map((file) => file.path)).toEqual(['src/a.ts']);
      expect(result.stats.secretsGuard).toMatchObject({
        planOnly: true,
        scanner: 'none',
        findings: 0,
        excludedSecretFiles: 1,
      });
    });

    test('applies the scan size ceiling from stat size', async () => {
      const stage = new SecretsGuardStage({
        enabled: true,
        planOnly: true,
        maxFileBytes: 100,
      });
      await stage.onInit();

      const result = await stage.process({
        files: [
          { path: 'big.ts', relativePath: 'big.ts', size: 5000 },
          { path: 'small.ts', relativePath: 'small.ts', size: 10 },
        ],
        stats: {},
      });

      expect(result.files.map((file) => file.path)).toEqual(['small.ts']);
      expect(result.stats.secretsGuard.excludedUnscannable).toBe(1);
    });
  });
});
