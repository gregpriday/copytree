import SecretRedactor from '../../../src/utils/SecretRedactor.js';

describe('SecretRedactor', () => {
  describe('redact', () => {
    it('should return original content when no findings', () => {
      const content = 'const foo = "bar";';
      const { content: result, count } = SecretRedactor.redact(content, [], 'typed');

      expect(result).toBe(content);
      expect(count).toBe(0);
    });

    it('should redact single-line secret with typed mode', () => {
      const content = 'const key = "AKIAIOSFODNN7EXAMPLE";';
      const findings = [
        {
          RuleID: 'aws-access-key',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 14, // Position of the quote + 1
          EndColumn: 34, // End of secret
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'typed');

      expect(result).toContain('***REDACTED:AWS-ACCESS-KEY***');
      expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(count).toBe(1);
    });

    it('should redact with generic mode', () => {
      const content = 'const key = "secret123";';
      const findings = [
        {
          RuleID: 'generic-secret',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 14,
          EndColumn: 23,
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'generic');

      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('***REDACTED:GENERIC-SECRET***');
      expect(count).toBe(1);
    });

    it('should redact with hash mode', () => {
      const content = 'const key = "secret123";';
      const findings = [
        {
          RuleID: 'generic-secret',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 14,
          EndColumn: 23,
          Match: 'secret123',
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'hash');

      expect(result).toMatch(/\*\*\*REDACTED:GENERIC-SECRET:[a-f0-9]{8}\*\*\*/);
      expect(result).not.toContain('secret123');
      expect(count).toBe(1);
    });

    it('should redact multiple secrets in correct order', () => {
      const content = 'key1="SECRET1" key2="SECRET2"';
      const findings = [
        {
          RuleID: 'secret',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 7,
          EndColumn: 14,
        },
        {
          RuleID: 'secret',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 22,
          EndColumn: 29,
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'typed');

      expect(result).not.toContain('SECRET1');
      expect(result).not.toContain('SECRET2');
      expect(count).toBe(2);
    });

    it('should handle multi-line secrets', () => {
      const content = `line1
const secret = "multi
line
secret";`;

      const findings = [
        {
          RuleID: 'multi-line-secret',
          StartLine: 2,
          EndLine: 4,
          StartColumn: 17,
          EndColumn: 7,
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'typed');

      expect(result).toContain('***REDACTED:MULTI-LINE-SECRET***');
      expect(result).not.toContain('multi\nline\nsecret');
      expect(count).toBe(1);
    });

    it('should preserve line numbers after redaction', () => {
      const content = `line1
line2 SECRET
line3`;

      const findings = [
        {
          RuleID: 'secret',
          StartLine: 2,
          EndLine: 2,
          StartColumn: 7,
          EndColumn: 13,
        },
      ];

      const { content: result } = SecretRedactor.redact(content, findings, 'typed');

      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('line1');
      expect(lines[1]).toContain('***REDACTED:SECRET***');
      expect(lines[2]).toBe('line3');
    });

    it('should handle findings that cannot be mapped', () => {
      const content = 'short';
      const findings = [
        {
          RuleID: 'secret',
          StartLine: 10, // Line doesn't exist
          EndLine: 10,
          StartColumn: 1,
          EndColumn: 10,
        },
      ];

      const { content: result, count } = SecretRedactor.redact(content, findings, 'typed');

      expect(result).toBe(content);
      expect(count).toBe(0);
    });

    it('should handle empty content', () => {
      const { content: result, count } = SecretRedactor.redact('', [], 'typed');

      expect(result).toBe('');
      expect(count).toBe(0);
    });
  });

  describe('getMarker', () => {
    it('should generate typed marker', () => {
      const finding = { RuleID: 'aws-access-key' };
      const marker = SecretRedactor.getMarker(finding, 'typed');

      expect(marker).toBe('***REDACTED:AWS-ACCESS-KEY***');
    });

    it('should generate generic marker', () => {
      const finding = { RuleID: 'aws-access-key' };
      const marker = SecretRedactor.getMarker(finding, 'generic');

      expect(marker).toBe('***REDACTED***');
    });

    it('should generate hash marker', () => {
      const finding = {
        RuleID: 'aws-access-key',
        Match: 'AKIAIOSFODNN7EXAMPLE',
      };
      const marker = SecretRedactor.getMarker(finding, 'hash');

      expect(marker).toMatch(/\*\*\*REDACTED:AWS-ACCESS-KEY:[a-f0-9]{8}\*\*\*/);
    });

    it('should handle unknown rule ID', () => {
      const finding = { RuleID: null };
      const marker = SecretRedactor.getMarker(finding, 'typed');

      expect(marker).toBe('***REDACTED:UNKNOWN***');
    });

    it('should default to generic for unknown mode', () => {
      const finding = { RuleID: 'test' };
      const marker = SecretRedactor.getMarker(finding, 'invalid-mode');

      expect(marker).toBe('***REDACTED***');
    });
  });

  describe('redactBatch', () => {
    it('should redact multiple files', () => {
      const files = [
        {
          content: 'secret1',
          findings: [
            {
              RuleID: 'secret',
              StartLine: 1,
              EndLine: 1,
              StartColumn: 1,
              EndColumn: 8,
            },
          ],
        },
        {
          content: 'secret2',
          findings: [
            {
              RuleID: 'secret',
              StartLine: 1,
              EndLine: 1,
              StartColumn: 1,
              EndColumn: 8,
            },
          ],
        },
      ];

      const results = SecretRedactor.redactBatch(files, 'typed');

      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('***REDACTED:SECRET***');
      expect(results[1].content).toContain('***REDACTED:SECRET***');
      expect(results[0].redactionCount).toBe(1);
      expect(results[1].redactionCount).toBe(1);
    });

    it('should preserve original file properties', () => {
      const files = [
        {
          path: 'test.js',
          size: 100,
          content: 'test',
          findings: [],
        },
      ];

      const results = SecretRedactor.redactBatch(files, 'typed');

      expect(results[0].path).toBe('test.js');
      expect(results[0].size).toBe(100);
    });
  });

  describe('_calculateLineOffsets', () => {
    it('should calculate correct offsets for single line', () => {
      const content = 'hello world';
      const offsets = SecretRedactor._calculateLineOffsets(content);

      expect(offsets).toEqual([0]);
    });

    it('should calculate correct offsets for multiple lines', () => {
      const content = 'line1\nline2\nline3';
      const offsets = SecretRedactor._calculateLineOffsets(content);

      expect(offsets).toEqual([0, 6, 12]);
    });

    it('should handle empty content', () => {
      const content = '';
      const offsets = SecretRedactor._calculateLineOffsets(content);

      expect(offsets).toEqual([0]);
    });

    it('should handle content with only newlines', () => {
      const content = '\n\n\n';
      const offsets = SecretRedactor._calculateLineOffsets(content);

      expect(offsets).toEqual([0, 1, 2, 3]);
    });
  });

  describe('_findingToIndices', () => {
    it('should convert single-line finding to indices', () => {
      const finding = {
        StartLine: 1,
        EndLine: 1,
        StartColumn: 5,
        EndColumn: 10,
      };
      const lines = ['hello world'];
      const offsets = [0];

      const { startIndex, endIndex } = SecretRedactor._findingToIndices(finding, lines, offsets);

      expect(startIndex).toBe(4); // 0 + (5-1)
      expect(endIndex).toBe(9); // 0 + (10-1)
    });

    it('should convert multi-line finding to indices', () => {
      const finding = {
        StartLine: 2,
        EndLine: 3,
        StartColumn: 1,
        EndColumn: 5,
      };
      const lines = ['line1', 'line2', 'line3'];
      const offsets = [0, 6, 12];

      const { startIndex, endIndex } = SecretRedactor._findingToIndices(finding, lines, offsets);

      expect(startIndex).toBe(6); // offset[1] + 0
      expect(endIndex).toBe(16); // offset[2] + 4
    });

    it('should return -1 for invalid line numbers', () => {
      const finding = {
        StartLine: 10,
        EndLine: 10,
        StartColumn: 1,
        EndColumn: 5,
      };
      const lines = ['line1'];
      const offsets = [0];

      const { startIndex, endIndex } = SecretRedactor._findingToIndices(finding, lines, offsets);

      expect(startIndex).toBe(-1);
      expect(endIndex).toBe(-1);
    });
  });
});
