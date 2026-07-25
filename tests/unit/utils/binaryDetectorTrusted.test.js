/**
 * NEVER_BINARY has to survive content sniffing, not just extension lookup.
 *
 * `categorizeByExt` returned null for these extensions, which was correct but
 * only meant "I have no verdict" — the caller then fell through to sniffing,
 * where a single NUL was decisive. A `\0` in a template literal is valid source
 * (a hash separator, a protocol delimiter), and the result was a source file
 * replaced by a binary placeholder.
 */

import { detectFromBuffer, NEVER_BINARY } from '../../../src/utils/BinaryDetector.js';

/**
 * Build a buffer of source-like text carrying embedded NUL bytes.
 * @param {number} lines - Number of lines to generate
 * @returns {Buffer} UTF-8 buffer
 */
function sourceWithNuls(lines = 20) {
  return Buffer.from('const sep = `${a}\0${b}`;\n'.repeat(lines), 'utf8');
}

/**
 * Build a buffer of genuinely binary content.
 * @param {number} size - Byte length
 * @returns {Buffer} Buffer cycling every byte value
 */
function binaryPayload(size = 4096) {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buffer[i] = i % 256;
  return buffer;
}

describe('BinaryDetector with trusted extensions', () => {
  it.each(['.ts', '.tsx', '.svg', '.md', '.sql', '.sh', '.h'])(
    'keeps %s as text despite an embedded NUL',
    (ext) => {
      const result = detectFromBuffer(`file${ext}`, sourceWithNuls());
      expect(result.isBinary).toBe(false);
      expect(result.category).toBe('text');
    },
  );

  it('still calls an untrusted extension binary on a NUL', () => {
    const result = detectFromBuffer('file.txt', sourceWithNuls());
    expect(result.isBinary).toBe(true);
    expect(result.reason).toBe('null-byte');
  });

  it('still catches real binary content carrying a trusted extension', () => {
    const result = detectFromBuffer('file.ts', binaryPayload());
    expect(result.isBinary).toBe(true);
    expect(result.reason).toBe('ratio');
  });

  it('ignores a magic-number match on a trusted extension when the body is text', () => {
    // A PNG signature at the head of an otherwise textual .svg is far more
    // likely to be coincidence than an actual PNG named .svg.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const body = Buffer.from('\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n'.repeat(20));
    const result = detectFromBuffer('icon.svg', Buffer.concat([png, body]));

    expect(result.isBinary).toBe(false);
  });

  it('keeps an untouched trusted source file as text', () => {
    const result = detectFromBuffer('a.ts', Buffer.from('export const a = 1;\n', 'utf8'));
    expect(result.isBinary).toBe(false);
    expect(result.reason).toBe('textual');
  });

  it('covers the extensions the guard claims to cover', () => {
    expect(NEVER_BINARY.has('.ts')).toBe(true);
    expect(NEVER_BINARY.has('.png')).toBe(false);
  });
});
