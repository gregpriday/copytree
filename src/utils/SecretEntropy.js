/**
 * Entropy scoring utilities for secret detection
 *
 * Helps reduce false positives by measuring randomness in matched strings.
 * Used with generic patterns like password/secret assignments.
 *
 * Shannon entropy: measure of information randomness
 * - Low entropy (< 3.0): structured text like "password123"
 * - Medium entropy (3.0-4.5): mixed alphanumeric like "MyP@ssw0rd2024"
 * - High entropy (> 4.5): random-looking strings like "xK9mQp7zL2vN"
 *
 * @see https://en.wikipedia.org/wiki/Entropy_(information_theory)
 */

/**
 * Calculate Shannon entropy of a string
 *
 * Shannon entropy measures the average information content (randomness)
 * in a string. Higher entropy indicates more randomness.
 *
 * Formula: H(X) = -Σ P(xi) * log2(P(xi))
 * where P(xi) is the probability of character xi
 *
 * @param {string} str - String to analyze
 * @returns {number} Shannon entropy (0 to ~log2(charset_size))
 *
 * @example
 * shannonEntropy("aaaa") // ~0 (no randomness)
 * shannonEntropy("abcd") // ~2.0 (some randomness)
 * shannonEntropy("xK9mQp7zL2vN") // ~3.5+ (high randomness)
 */
export function shannonEntropy(str) {
  if (!str || str.length === 0) {
    return 0;
  }

  // Count character frequencies
  const freq = new Map();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  // Calculate entropy
  const len = str.length;
  let entropy = 0;

  for (const count of freq.values()) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Check if string looks like Base64
 *
 * Base64 is commonly used for encoding secrets, keys, and tokens.
 * This checks for Base64-like characteristics without strict validation.
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string appears to be Base64
 *
 * @example
 * looksLikeBase64("SGVsbG8gV29ybGQ=") // true
 * looksLikeBase64("password123") // false
 */
export function looksLikeBase64(str) {
  if (!str || str.length < 16) {
    return false;
  }

  // Base64 uses A-Z, a-z, 0-9, +, /, and = for padding
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Pattern.test(str)) {
    return false;
  }

  // Check for reasonable Base64 characteristics
  // - Length should be divisible by 4 (or close, allowing for padding)
  // - Should have some variety in characters
  // - Padding (=) should only appear at the end
  const paddingMatch = str.match(/=+$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;

  // Invalid padding (more than 2 '=' at end, or not at end)
  if (padding > 2 || (padding > 0 && str.indexOf('=') !== str.length - padding)) {
    return false;
  }

  // Check character variety (Base64 typically has good distribution)
  const uniqueChars = new Set(str.replace(/=/g, '')).size;
  const variety = uniqueChars / Math.min(str.length, 64); // Normalize by string length

  // Base64 should have reasonable character variety (>20% unique chars)
  return variety > 0.2;
}

/**
 * Check if string contains mostly hexadecimal characters
 *
 * Many secrets are hex-encoded (API keys, hashes, etc.)
 *
 * @param {string} str - String to check
 * @returns {boolean} True if string is mostly hex
 */
export function looksLikeHex(str) {
  if (!str || str.length < 16) {
    return false;
  }

  const hexChars = str.match(/[0-9a-fA-F]/g) || [];
  const hexRatio = hexChars.length / str.length;

  // Consider it hex if >90% of characters are hex digits
  return hexRatio > 0.9;
}

/**
 * Score a match based on entropy and pattern characteristics
 *
 * Returns a confidence score (0-1) indicating likelihood that the
 * match is a real secret vs false positive.
 *
 * @param {string} match - Matched string
 * @param {Object} patternSpec - Pattern specification
 * @param {number} [patternSpec.minEntropy] - Minimum entropy threshold
 * @returns {{entropy: number, confidence: number, meetsThreshold: boolean}} Score details
 *
 * @example
 * scoreMatch("xK9mQp7zL2vN", { minEntropy: 3.5 })
 * // { entropy: 3.58, confidence: 0.95, meetsThreshold: true }
 *
 * scoreMatch("password123", { minEntropy: 3.5 })
 * // { entropy: 2.85, confidence: 0.45, meetsThreshold: false }
 */
export function scoreMatch(match, patternSpec = {}) {
  const entropy = shannonEntropy(match);
  const { minEntropy } = patternSpec;

  // Calculate base confidence from entropy
  // Map entropy to 0-1 scale (assuming max entropy ~5.0 for typical secrets)
  let confidence = Math.min(entropy / 5.0, 1.0);

  // Boost confidence for Base64 or hex-like strings
  if (looksLikeBase64(match)) {
    confidence = Math.min(confidence + 0.2, 1.0);
  } else if (looksLikeHex(match)) {
    confidence = Math.min(confidence + 0.15, 1.0);
  }

  // Check if meets minimum entropy threshold (if specified)
  const meetsThreshold = minEntropy === undefined || entropy >= minEntropy;

  // Reduce confidence if doesn't meet threshold
  if (!meetsThreshold) {
    confidence *= 0.3; // Significant penalty for low entropy
  }

  return {
    entropy: parseFloat(entropy.toFixed(2)),
    confidence: parseFloat(confidence.toFixed(2)),
    meetsThreshold,
  };
}

/**
 * Check if string is likely a common false positive
 *
 * Filters out common test values, examples, and placeholders.
 *
 * @param {string} str - String to check
 * @returns {boolean} True if likely a false positive
 */
export function isLikelyFalsePositive(str) {
  if (!str) {
    return true;
  }

  const lowerStr = str.toLowerCase();
  const normalized = lowerStr.replace(/[^a-z0-9]/g, '');

  // Exact placeholder tokens (match only when the entire value reduces to the token)
  const exactPlaceholders = [
    'example',
    'placeholder',
    'yourkeyhere',
    'xxx',
    'yyy',
    'zzz',
    '12345',
    'abcdef',
    'qwerty',
    'changeme',
    'password',
  ];

  for (const placeholder of exactPlaceholders) {
    if (normalized === placeholder) {
      return true;
    }
  }

  // Soft placeholder substrings – only suppress short, low-entropy matches
  const softPlaceholders = [
    'insert',
    'replace',
    'test',
    'sample',
    'demo',
    'fake',
    'dummy',
    'mock',
    'secret',
  ];
  if (normalized.length <= 16) {
    for (const placeholder of softPlaceholders) {
      if (normalized.includes(placeholder)) {
        return true;
      }
    }
  }

  // Repeated characters (e.g., "aaaa", "1111")
  if (/^(.)\1{7,}$/.test(str)) {
    return true;
  }

  // Sequential patterns (e.g., "abcdefgh", "12345678")
  if (/(?:abcd|1234|qwer)/i.test(str)) {
    return true;
  }

  return false;
}

/**
 * Get entropy classification
 *
 * @param {number} entropy - Entropy value
 * @returns {'low'|'medium'|'high'} Classification
 */
export function classifyEntropy(entropy) {
  if (entropy < 3.0) return 'low';
  if (entropy < 4.5) return 'medium';
  return 'high';
}
