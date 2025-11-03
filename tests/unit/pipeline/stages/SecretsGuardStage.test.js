import SecretsGuardStage from '../../../../src/pipeline/stages/SecretsGuardStage.js';
import GitleaksAdapter from '../../../../src/services/GitleaksAdapter.js';
import { SecretsDetectedError } from '../../../../src/utils/errors.js';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../../src/services/GitleaksAdapter.js');
jest.mock('../../../../src/config/ConfigManager.js', () => ({
  config: () => ({
    get: jest.fn((key, defaultValue) => defaultValue),
  }),
}));

// Mock p-limit as it's a pure ESM package that Jest struggles with
jest.mock('p-limit', () => {
  // p-limit's default export is a function that returns a limiter.
  // The limiter function takes an async function and returns a promise.
  // This mock simulates that, ignoring concurrency for the test.
  return (concurrency) => (fn) => Promise.resolve(fn());
});

describe('SecretsGuardStage', () => {
  let stage;
  let mockGitleaks;

  beforeEach(() => {
    mockGitleaks = {
      isAvailable: jest.fn().mockResolvedValue(true),
      getVersion: jest.fn().mockResolvedValue('8.19.0'),
      scanString: jest.fn().mockResolvedValue([]),
    };

    GitleaksAdapter.mockImplementation(() => mockGitleaks);

    stage = new SecretsGuardStage({
      enabled: true,
      redactionMode: 'typed',
      failOnSecrets: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(stage.enabled).toBe(true);
      expect(stage.redactionMode).toBe('typed');
      expect(stage.failOnSecrets).toBe(false);
      expect(stage.redactInline).toBe(true);
      expect(stage.maxFileBytes).toBe(5_000_000);
      expect(stage.parallelism).toBe(4);
    });

    it('should accept custom options', () => {
      const customStage = new SecretsGuardStage({
        enabled: false,
        redactionMode: 'generic',
        failOnSecrets: true,
        maxFileBytes: 500_000,
        parallelism: 8,
      });

      expect(customStage.enabled).toBe(false);
      expect(customStage.redactionMode).toBe('generic');
      expect(customStage.failOnSecrets).toBe(true);
      expect(customStage.maxFileBytes).toBe(500_000);
      expect(customStage.parallelism).toBe(8);
    });
  });

  describe('onInit', () => {
    it('should check gitleaks availability', async () => {
      await stage.onInit({});

      expect(mockGitleaks.isAvailable).toHaveBeenCalled();
      expect(mockGitleaks.getVersion).toHaveBeenCalled();
    });

    it('should disable stage if gitleaks not available', async () => {
      mockGitleaks.isAvailable.mockResolvedValue(false);

      await stage.onInit({});

      expect(stage.enabled).toBe(false);
    });
  });

  describe('process', () => {
    it('should return input unchanged when disabled', async () => {
      stage.enabled = false;

      const input = { files: [{ path: 'test.js', content: 'test' }] };
      const result = await stage.process(input);

      expect(result).toEqual(input);
      expect(mockGitleaks.scanString).not.toHaveBeenCalled();
    });

    it('should scan files and return clean results', async () => {
      const input = {
        files: [{ path: 'test.js', content: 'const foo = "bar";', size: 100 }],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.stats.secretsGuard.secretsFound).toBe(0);
      expect(result.stats.secretsGuard.secretsRedacted).toBe(0);
      expect(mockGitleaks.scanString).toHaveBeenCalledWith('const foo = "bar";', 'test.js');
    });

    it('should redact secrets when found', async () => {
      mockGitleaks.scanString.mockResolvedValue([
        {
          RuleID: 'aws-access-key',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 14,
          EndColumn: 34,
        },
      ]);

      const input = {
        files: [
          {
            path: 'config.js',
            content: 'const key = "AKIAIOSFODNN7EXAMPLE";',
            size: 100,
          },
        ],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toContain('***REDACTED:AWS-ACCESS-KEY***');
      expect(result.files[0].content).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.files[0].secretsRedacted).toBe(true);
      expect(result.stats.secretsGuard.secretsFound).toBe(1);
      expect(result.stats.secretsGuard.secretsRedacted).toBe(1);
    });

    it('should exclude files matching exclude patterns', async () => {
      const input = {
        files: [
          { path: '.env', content: 'SECRET=value', size: 100 },
          { path: 'test.js', content: 'code', size: 100 },
        ],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('test.js');
      expect(result.stats.secretsGuard.filesExcluded).toBe(1);
    });

    it('should exclude files matching basename patterns', async () => {
      const input = {
        files: [
          { path: 'path/to/.env', content: 'SECRET=value', size: 100 },
          { path: 'test.js', content: 'code', size: 100 },
        ],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('test.js');
      expect(result.stats.secretsGuard.filesExcluded).toBe(1);
    });

    it('should skip binary files', async () => {
      const input = {
        files: [
          { path: 'binary.png', isBinary: true, size: 1000 },
          { path: 'test.js', content: 'code', size: 100 },
        ],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(2);
      expect(mockGitleaks.scanString).toHaveBeenCalledTimes(1);
      expect(mockGitleaks.scanString).toHaveBeenCalledWith('code', 'test.js');
    });

    it('should skip files larger than maxFileBytes', async () => {
      stage.maxFileBytes = 1_000_000; // Override for this test

      const input = {
        files: [
          { path: 'large.js', content: 'x'.repeat(2_000_000), size: 2_000_000 },
          { path: 'small.js', content: 'code', size: 100 },
        ],
      };

      const result = await stage.process(input);

      expect(mockGitleaks.scanString).toHaveBeenCalledTimes(1);
      expect(mockGitleaks.scanString).toHaveBeenCalledWith('code', 'small.js');
    });

    it('should skip files without content', async () => {
      const input = {
        files: [
          { path: 'empty.js', size: 0 },
          { path: 'test.js', content: 'code', size: 100 },
        ],
      };

      const result = await stage.process(input);

      expect(mockGitleaks.scanString).toHaveBeenCalledTimes(1);
      expect(mockGitleaks.scanString).toHaveBeenCalledWith('code', 'test.js');
    });

    it('should handle scan errors gracefully', async () => {
      mockGitleaks.scanString.mockRejectedValue(new Error('Scan failed'));

      const input = {
        files: [{ path: 'test.js', content: 'code', size: 100 }],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('code'); // Unchanged
    });

    it('should throw SecretsDetectedError when failOnSecrets is true', async () => {
      stage.failOnSecrets = true;

      const secretContent = 'AKIAIOSFODNN7EXAMPLE';  // Fake AWS key
      mockGitleaks.scanString.mockResolvedValue([
        {
          RuleID: 'aws-access-key',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 1,
          EndColumn: 20,
          Match: secretContent,
        },
      ]);

      const input = {
        files: [{ path: 'config.js', content: secretContent, size: 100 }],
      };

      try {
        await stage.process(input);
        fail('Expected SecretsDetectedError to be thrown');
      } catch (error) {
        // Verify it's the right error type
        expect(error).toBeInstanceOf(SecretsDetectedError);

        // CRITICAL: Verify the error payload doesn't contain the raw secret
        const errorString = JSON.stringify(error);
        const errorMessage = error.message || '';
        const errorFindings = error.findings || [];

        // Check that raw secret text is NOT in error message
        expect(errorMessage).not.toContain(secretContent);

        // Check that raw secret text is NOT in serialized error
        expect(errorString).not.toContain(secretContent);

        // If findings are included, verify they're sanitized
        for (const finding of errorFindings) {
          const findingString = JSON.stringify(finding);
          expect(findingString).not.toContain(secretContent);
        }
      }
    });

    it('should respect allowlist patterns', async () => {
      stage.allowlistGlobs = ['**/test/**'];

      const input = {
        files: [{ path: 'test/fixtures/secrets.js', content: 'SECRET', size: 100 }],
      };

      const result = await stage.process(input);

      expect(mockGitleaks.scanString).not.toHaveBeenCalled();
      expect(result.files).toHaveLength(1);
    });

    it('should exclude entire file when redactInline is false', async () => {
      stage.redactInline = false;

      mockGitleaks.scanString.mockResolvedValue([
        {
          RuleID: 'secret',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 1,
          EndColumn: 10,
        },
      ]);

      const input = {
        files: [{ path: 'config.js', content: 'secret123', size: 100 }],
      };

      const result = await stage.process(input);

      expect(result.files).toHaveLength(0);
      expect(result.stats.secretsGuard.filesExcluded).toBe(1);
    });
  });

  describe('shouldExcludeFile', () => {
    it('should match .env file', () => {
      expect(stage.shouldExcludeFile('.env')).toBe(true);
    });

    it('should match .env.* files', () => {
      expect(stage.shouldExcludeFile('.env.local')).toBe(true);
      expect(stage.shouldExcludeFile('.env.production')).toBe(true);
    });

    it('should match private key files', () => {
      expect(stage.shouldExcludeFile('private.pem')).toBe(true);
      expect(stage.shouldExcludeFile('cert.key')).toBe(true);
      expect(stage.shouldExcludeFile('id_rsa')).toBe(true);
    });

    it('should match credentials files', () => {
      expect(stage.shouldExcludeFile('credentials.json')).toBe(true);
      expect(stage.shouldExcludeFile('secrets.yml')).toBe(true);
    });

    it('should match basename for nested paths', () => {
      expect(stage.shouldExcludeFile('path/to/.env')).toBe(true);
      expect(stage.shouldExcludeFile('config/credentials.json')).toBe(true);
    });

    it('should not match safe files', () => {
      expect(stage.shouldExcludeFile('test.js')).toBe(false);
      expect(stage.shouldExcludeFile('README.md')).toBe(false);
      expect(stage.shouldExcludeFile('.gitignore')).toBe(false);
    });
  });

  describe('isAllowlisted', () => {
    beforeEach(() => {
      stage.allowlistGlobs = ['**/test/**', '**/fixtures/**'];
    });

    it('should match allowlisted patterns', () => {
      expect(stage.isAllowlisted('test/secrets.js')).toBe(true);
      expect(stage.isAllowlisted('fixtures/data.json')).toBe(true);
    });

    it('should not match non-allowlisted paths', () => {
      expect(stage.isAllowlisted('src/config.js')).toBe(false);
    });

    it('should return false when allowlist is empty', () => {
      stage.allowlistGlobs = [];
      expect(stage.isAllowlisted('test/secrets.js')).toBe(false);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      stage = new SecretsGuardStage({
        enabled: true,
        redactionMode: 'typed',
        failOnSecrets: false,
      });
    });

    it('should return summary of findings', async () => {
      mockGitleaks.scanString.mockResolvedValue([
        {
          RuleID: 'aws-access-key',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 1,
          EndColumn: 20,
        },
      ]);

      const input = {
        files: [{ path: 'config.js', content: 'AKIAIOSFODNN7EXAMPLE', size: 100 }],
      };

      await stage.process(input);

      const summary = stage.getSummary();

      expect(summary.filesExcluded).toBe(0);
      expect(summary.secretsFound).toBe(1);
      expect(summary.secretsRedacted).toBe(1);
      expect(summary.findings).toHaveLength(1);
      expect(summary.findings[0]).toEqual({
        file: 'config.js',
        line: 1,
        rule: 'aws-access-key',
      });
    });

    it('should not include raw secret values', async () => {
      mockGitleaks.scanString.mockResolvedValue([
        {
          RuleID: 'secret',
          Secret: 'SHOULD_NOT_BE_IN_SUMMARY',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 1,
          EndColumn: 10,
        },
      ]);

      const input = {
        files: [{ path: 'test.js', content: 'secret', size: 100 }],
      };

      await stage.process(input);

      const summary = stage.getSummary();
      const summaryStr = JSON.stringify(summary);

      expect(summaryStr).not.toContain('SHOULD_NOT_BE_IN_SUMMARY');
    });
  });
});
