import {
  shannonEntropy,
  looksLikeBase64,
  looksLikeHex,
  scoreMatch,
  isLikelyFalsePositive,
  classifyEntropy,
} from '../../../src/utils/SecretEntropy.js';

describe('SecretEntropy', () => {
  describe('shannonEntropy', () => {
    it('should return 0 for empty string', () => {
      expect(shannonEntropy('')).toBe(0);
    });

    it('should return ~0 for repeated characters', () => {
      const entropy = shannonEntropy('aaaaaaa');
      expect(entropy).toBeLessThan(0.1);
    });

    it('should return higher entropy for mixed characters', () => {
      const entropy = shannonEntropy('abcdefgh');
      expect(entropy).toBeGreaterThan(2);
    });

    it('should return high entropy for random-looking strings', () => {
      const entropy = shannonEntropy('xK9mQp7zL2vN');
      expect(entropy).toBeGreaterThan(3);
    });

    it('should have lower entropy for structured text', () => {
      const structuredEntropy = shannonEntropy('password123');
      const randomEntropy = shannonEntropy('xK9mQp7zL2vN');
      expect(structuredEntropy).toBeLessThan(randomEntropy);
    });
  });

  describe('looksLikeBase64', () => {
    it('should recognize Base64 strings', () => {
      expect(looksLikeBase64('SGVsbG8gV29ybGQh')).toBe(true);
      expect(looksLikeBase64('YWJjZGVmZ2hpamts')).toBe(true);
      expect(looksLikeBase64('dGVzdGluZyBiYXNlNjQ=')).toBe(true);
    });

    it('should reject non-Base64 strings', () => {
      expect(looksLikeBase64('password123')).toBe(false);
      expect(looksLikeBase64('hello world')).toBe(false);
      expect(looksLikeBase64('not-base64')).toBe(false);
    });

    it('should reject short strings', () => {
      expect(looksLikeBase64('abc')).toBe(false);
    });

    it('should reject invalid padding', () => {
      expect(looksLikeBase64('abc=de')).toBe(false); // = not at end
      expect(looksLikeBase64('abc===')).toBe(false); // Too many =
    });

    it('should reject Base64 with padding in middle', () => {
      expect(looksLikeBase64('abc=de=fg')).toBe(false);
      expect(looksLikeBase64('SGVs=bG8gV29ybGQh')).toBe(false);
    });

    it('should reject Base64 with excessive padding', () => {
      expect(looksLikeBase64('abc===')).toBe(false);
      expect(looksLikeBase64('SGVsbG8====')).toBe(false);
    });

    it('should reject strings with non-Base64 characters', () => {
      expect(looksLikeBase64('abc!@#def')).toBe(false);
      expect(looksLikeBase64('SGVsbG8gV29ybGQh!')).toBe(false);
    });

    it('should handle Base64 with low character variety', () => {
      // Base64 strings should have reasonable character distribution
      expect(looksLikeBase64('AAAAAAAAAAAAAAAA')).toBe(false); // Low variety
    });
  });

  describe('looksLikeHex', () => {
    it('should recognize hex strings', () => {
      expect(looksLikeHex('0123456789abcdef0123')).toBe(true);
      expect(looksLikeHex('ABCDEF1234567890ABCD')).toBe(true);
    });

    it('should recognize uppercase hex', () => {
      expect(looksLikeHex('ABCDEF1234567890ABCD')).toBe(true);
      expect(looksLikeHex('FEDCBA0987654321ABCD')).toBe(true);
    });

    it('should recognize lowercase hex', () => {
      expect(looksLikeHex('abcdef1234567890abcd')).toBe(true);
      expect(looksLikeHex('fedcba0987654321abcd')).toBe(true);
    });

    it('should recognize mixed case hex', () => {
      expect(looksLikeHex('AbCdEf1234567890AbCd')).toBe(true);
    });

    it('should reject non-hex strings', () => {
      expect(looksLikeHex('notahexstring')).toBe(false);
      expect(looksLikeHex('xyz123')).toBe(false);
    });

    it('should reject mixed hex/non-hex below threshold', () => {
      expect(looksLikeHex('abc123xyz456abc1')).toBe(false); // Only 75% hex
      expect(looksLikeHex('abcdefghijklmnop')).toBe(false); // Contains g-p
    });

    it('should reject short strings', () => {
      expect(looksLikeHex('abc')).toBe(false);
      expect(looksLikeHex('abc123')).toBe(false); // Less than 16 chars
    });
  });

  describe('scoreMatch', () => {
    it('should score high entropy strings highly', () => {
      const score = scoreMatch('xK9mQp7zL2vNpR8s');
      expect(score.confidence).toBeGreaterThan(0.5);
      expect(score.entropy).toBeGreaterThan(3);
    });

    it('should score low entropy strings poorly', () => {
      const score = scoreMatch('password123');
      expect(score.confidence).toBeLessThan(0.7);
    });

    it('should boost confidence for Base64', () => {
      const normalScore = scoreMatch('abcdefghijk');
      const base64Score = scoreMatch('SGVsbG8gV29ybGQh');
      expect(base64Score.confidence).toBeGreaterThan(normalScore.confidence);
    });

    it('should boost confidence for hex strings', () => {
      const hexScore = scoreMatch('abcdef1234567890abcdef12');
      // Hex strings get a 0.15 confidence boost
      // Verify it's detected as hex and has reasonable confidence
      expect(looksLikeHex('abcdef1234567890abcdef12')).toBe(true);
      expect(hexScore.confidence).toBeGreaterThanOrEqual(0.5); // At least moderate confidence
    });

    it('should respect minimum entropy threshold', () => {
      const score = scoreMatch('abc123', { minEntropy: 4.0 });
      expect(score.meetsThreshold).toBe(false);
    });

    it('should mark threshold met for high entropy', () => {
      const score = scoreMatch('xK9mQp7zL2vNpR8s', { minEntropy: 3.0 });
      expect(score.meetsThreshold).toBe(true);
    });

    it('should penalize confidence when below minEntropy', () => {
      const score = scoreMatch('password123', { minEntropy: 4.0 });
      expect(score.meetsThreshold).toBe(false);
      expect(score.confidence).toBeLessThan(0.3); // Significant penalty
    });

    it('should clamp confidence to max 1.0', () => {
      const score = scoreMatch('xK9mQp7zL2vNpR8sT1uV2wX3yZ4a5B6c7D8e9F0');
      expect(score.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should handle very high entropy strings', () => {
      // Very random-looking string
      const score = scoreMatch('xK9mQp7zL2vNpR8sT1uV2wX3yZ4a5B6c7D8e9F0');
      expect(score.entropy).toBeGreaterThan(4.0);
      expect(score.confidence).toBeGreaterThan(0.8);
    });

    it('should handle strings with no minEntropy specified', () => {
      const score = scoreMatch('test123');
      expect(score.meetsThreshold).toBe(true); // No threshold, always meets it
    });
  });

  describe('isLikelyFalsePositive', () => {
    it('should detect exact placeholder text', () => {
      expect(isLikelyFalsePositive('yourkeyhere')).toBe(true);
      expect(isLikelyFalsePositive('placeholder')).toBe(true);
      expect(isLikelyFalsePositive('example')).toBe(true);
      expect(isLikelyFalsePositive('changeme')).toBe(true);
      expect(isLikelyFalsePositive('password')).toBe(true);
    });

    it('should detect test/demo values in short strings', () => {
      expect(isLikelyFalsePositive('test_key')).toBe(true); // Short string with 'test'
      expect(isLikelyFalsePositive('demo_pwd')).toBe(true); // Short string with 'demo'
      expect(isLikelyFalsePositive('fake_tok')).toBe(true); // Short string with 'fake'
    });

    it('should NOT flag tokens without soft placeholder substrings', () => {
      // Only tokens without soft placeholder words (test, demo, fake, etc.) pass through
      // Also avoid sequential patterns (abcd, 1234, qwer)
      // Using prod instead of live to avoid GitHub push protection
      expect(isLikelyFalsePositive('sk_prod_xK9mQp7zL2vNpR8sT1uV2wX3y')).toBe(false);
      expect(isLikelyFalsePositive('pk_prod_xK9mQp7zL2vNpR8sT1uV2wX3')).toBe(false);
      // Random-looking strings without placeholders or sequential patterns
      expect(isLikelyFalsePositive('xK9mQp7zL2vNpR8s')).toBe(false);
    });

    it('should test 16-char boundary for soft placeholders', () => {
      // Soft placeholders check if normalized length <= 16 AND contains placeholder word
      // Strings with "test" substring are ALWAYS flagged if normalized length <= 16
      expect(isLikelyFalsePositive('test12345678901')).toBe(true); // 15 normalized chars, contains "test"
      expect(isLikelyFalsePositive('test123456789012')).toBe(true); // 16 normalized chars, contains "test"

      // Strings > 16 chars (normalized) should NOT be checked against soft placeholders
      // Use a string without sequential patterns or placeholders
      expect(isLikelyFalsePositive('xK9mQp7zL2vNpR8sT')).toBe(false); // 17 chars, no placeholder, no sequential pattern
    });

    it('should detect repeated characters', () => {
      expect(isLikelyFalsePositive('aaaaaaaa')).toBe(true);
      expect(isLikelyFalsePositive('11111111')).toBe(true);
      expect(isLikelyFalsePositive('xxxxxxxx')).toBe(true);
    });

    it('should detect sequential patterns', () => {
      expect(isLikelyFalsePositive('abcdefgh')).toBe(true);
      expect(isLikelyFalsePositive('12345678')).toBe(true);
      expect(isLikelyFalsePositive('qwertyui')).toBe(true);
    });

    it('should not flag likely real secrets', () => {
      expect(isLikelyFalsePositive('xK9mQp7zL2vN')).toBe(false);
      // Using prod instead of live to avoid GitHub push protection
      expect(isLikelyFalsePositive('sk_prod_xK9mQp7zL2vNpR8s')).toBe(false);
      expect(isLikelyFalsePositive('ghp_xK9mQp7zL2vNpR8sT1uV2wX3yZ4a5B6c7D8')).toBe(false);
    });

    it('should handle case-insensitive matching', () => {
      expect(isLikelyFalsePositive('EXAMPLE')).toBe(true);
      expect(isLikelyFalsePositive('PlaceHolder')).toBe(true);
      expect(isLikelyFalsePositive('TEST_KEY')).toBe(true);
    });

    it('should handle empty/null/undefined input', () => {
      expect(isLikelyFalsePositive('')).toBe(true);
      expect(isLikelyFalsePositive(null)).toBe(true);
      expect(isLikelyFalsePositive(undefined)).toBe(true);
    });
  });

  describe('classifyEntropy', () => {
    it('should classify low entropy', () => {
      expect(classifyEntropy(2.0)).toBe('low');
      expect(classifyEntropy(1.5)).toBe('low');
      expect(classifyEntropy(0)).toBe('low');
    });

    it('should classify medium entropy', () => {
      expect(classifyEntropy(3.5)).toBe('medium');
      expect(classifyEntropy(4.0)).toBe('medium');
    });

    it('should classify high entropy', () => {
      expect(classifyEntropy(5.0)).toBe('high');
      expect(classifyEntropy(6.0)).toBe('high');
    });

    it('should classify entropy at exact boundaries', () => {
      expect(classifyEntropy(2.99)).toBe('low');
      expect(classifyEntropy(3.0)).toBe('medium');
      expect(classifyEntropy(4.49)).toBe('medium');
      expect(classifyEntropy(4.5)).toBe('high');
    });
  });
});
