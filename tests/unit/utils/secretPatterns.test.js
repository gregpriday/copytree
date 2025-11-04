import {
  BUILTIN_PATTERNS,
  validatePattern,
  getPatternByName,
  getHighSeverityPatterns,
  SecretPatternError,
} from '../../../src/utils/secretPatterns.js';

describe('secretPatterns', () => {
  describe('BUILTIN_PATTERNS', () => {
    it('should have patterns', () => {
      expect(BUILTIN_PATTERNS).toBeDefined();
      expect(Array.isArray(BUILTIN_PATTERNS)).toBe(true);
      expect(BUILTIN_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should have AWS patterns', () => {
      const awsPattern = getPatternByName('aws-access-key');
      expect(awsPattern).toBeDefined();
      expect(awsPattern.name).toBe('aws-access-key');
      expect(awsPattern.pattern).toBeInstanceOf(RegExp);
    });

    it('should have JWT pattern', () => {
      const jwtPattern = getPatternByName('jwt');
      expect(jwtPattern).toBeDefined();
      expect(jwtPattern.severity).toBe('high');
    });

    it('all patterns should be valid', () => {
      for (const pattern of BUILTIN_PATTERNS) {
        expect(() => validatePattern(pattern)).not.toThrow();
      }
    });

    it('all patterns should have global flag', () => {
      for (const pattern of BUILTIN_PATTERNS) {
        expect(pattern.pattern.flags).toContain('g');
      }
    });

    it('all patterns should have unique names', () => {
      const names = new Set();
      for (const pattern of BUILTIN_PATTERNS) {
        expect(names.has(pattern.name)).toBe(false);
        names.add(pattern.name);
      }
    });
  });

  describe('getHighSeverityPatterns', () => {
    it('should return only high severity patterns', () => {
      const highPatterns = getHighSeverityPatterns();
      expect(highPatterns.length).toBeGreaterThan(0);
      expect(highPatterns.every((p) => p.severity === 'high')).toBe(true);
    });
  });

  describe('validatePattern', () => {
    it('should throw for invalid pattern', () => {
      expect(() =>
        validatePattern({
          name: 'test',
          pattern: 'not a regex',
          description: 'test',
          severity: 'high',
        }),
      ).toThrow(SecretPatternError);
    });

    it('should throw for pattern without global flag', () => {
      expect(() =>
        validatePattern({
          name: 'test',
          pattern: /test/i, // Missing 'g'
          description: 'test',
          severity: 'high',
        }),
      ).toThrow(SecretPatternError);
    });

    it('should throw for pattern without name', () => {
      expect(() =>
        validatePattern({
          pattern: /test/g,
          description: 'test',
          severity: 'high',
        }),
      ).toThrow(SecretPatternError);
    });
  });

  describe('Pattern matching', () => {
    it('should match AWS access key', () => {
      const pattern = getPatternByName('aws-access-key');
      const text = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE';
      const matches = text.match(pattern.pattern);
      expect(matches).not.toBeNull();
      expect(matches[0]).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('should match JWT', () => {
      const pattern = getPatternByName('jwt');
      const text =
        'Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abcdef123456';
      const matches = text.match(pattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('should match GitHub token', () => {
      const pattern = getPatternByName('github-token');
      const text = 'GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
      const matches = text.match(pattern.pattern);
      expect(matches).not.toBeNull();
      expect(matches[0]).toContain('ghp_');
    });

    it('should match database URL', () => {
      const pattern = getPatternByName('database-url');
      const text = 'postgresql://user:password@localhost:5432/dbname';
      const matches = text.match(pattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('should match RSA private key', () => {
      const pattern = getPatternByName('rsa-private-key');
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
      const matches = text.match(pattern.pattern);
      expect(matches).not.toBeNull();
    });
  });
});
