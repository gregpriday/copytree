/**
 * Span fidelity between the scanner and the redactor.
 *
 * `scanContent` reports 1-based line/column with an INCLUSIVE end column, and
 * `SecretRedactor._findingToIndices` reconstructs absolute offsets from that.
 * The two have to agree exactly: an off-by-one leaves a character of the
 * credential in the output, or eats a character of surrounding code.
 *
 * Rather than assert columns (which pins the encoding rather than the property),
 * these round-trip through the redactor and check that exactly the credential
 * was replaced.
 */

import { scanContent } from '../../../src/utils/secretPatterns.js';
import SecretRedactor from '../../../src/utils/SecretRedactor.js';

// Synthetic, never-issued credential shaped like a Stripe secret key.
// Assembled at runtime so it never appears as one contiguous literal in this
// file — secret scanners (including GitHub push protection) match on the raw
// file text, not the evaluated JS value.
const KEY = ['sk', 'live', '4eC39HqLyjWDarjtT1zdp7dc'].join('_');
const MARKER = '***REDACTED:PROVIDER_TOKEN***';

/**
 * Redact with the built-in scanner.
 * @param {string} source - Content to scan and redact
 * @returns {{content: string, count: number}} Redaction result
 */
function roundTrip(source) {
  return SecretRedactor.redact(source, scanContent(source, 'a.ts'), 'typed');
}

describe('secret span fidelity', () => {
  it('replaces exactly the credential when it starts at offset 0', () => {
    const { content, count } = roundTrip(`${KEY} trailing`);
    expect(count).toBe(1);
    expect(content).toBe(`${MARKER} trailing`);
  });

  it('replaces exactly the credential at end of file with no newline', () => {
    const { content } = roundTrip(`const a = "${KEY}"`);
    expect(content).toBe(`const a = "${MARKER}"`);
  });

  it('replaces exactly the credential at end of file with a trailing newline', () => {
    const { content } = roundTrip(`const a = "${KEY}"\n`);
    expect(content).toBe(`const a = "${MARKER}"\n`);
  });

  it('handles a credential on the last of several lines', () => {
    const source = ['line one', 'line two', `const a = "${KEY}";`].join('\n');
    const { content } = roundTrip(source);
    expect(content).toBe(['line one', 'line two', `const a = "${MARKER}";`].join('\n'));
  });

  it('handles a credential on the first of several lines', () => {
    const source = [`const a = "${KEY}";`, 'line two', 'line three'].join('\n');
    const { content } = roundTrip(source);
    expect(content).toBe([`const a = "${MARKER}";`, 'line two', 'line three'].join('\n'));
  });

  it('handles several credentials on one line', () => {
    const source = `a("${KEY}"); b("${KEY}");`;
    const { content, count } = roundTrip(source);
    expect(count).toBe(2);
    expect(content).toBe(`a("${MARKER}"); b("${MARKER}");`);
  });

  it('handles CRLF line endings', () => {
    const source = `line one\r\nconst a = "${KEY}";\r\nline three`;
    const { content } = roundTrip(source);
    expect(content).toBe(`line one\r\nconst a = "${MARKER}";\r\nline three`);
  });

  it('keeps byte-exact surroundings for a credential among multi-byte text', () => {
    // Columns are character offsets, not byte offsets. Emoji outside the BMP
    // occupy two UTF-16 code units, which is where a byte-based index would
    // drift.
    const source = `// 🔐 note\nconst a = "${KEY}"; // ✅\n`;
    const { content } = roundTrip(source);
    expect(content).toBe(`// 🔐 note\nconst a = "${MARKER}"; // ✅\n`);
  });

  it('replaces a multi-line private key header exactly', () => {
    const source = 'before\n-----BEGIN RSA PRIVATE KEY-----\nafter\n';
    const { content, count } = roundTrip(source);
    expect(count).toBe(1);
    expect(content).toBe('before\n***REDACTED:PRIVATE_KEY***\nafter\n');
  });

  it('never leaves any fragment of the credential behind', () => {
    const sources = [`${KEY}`, `x=${KEY}`, `const a = "${KEY}";\n`, `\n\n  apiKey: "${KEY}",\n\n`];

    for (const source of sources) {
      const { content } = roundTrip(source);
      expect(content).not.toContain('sk_live_');
      expect(content).not.toContain('4eC39');
    }
  });
});
