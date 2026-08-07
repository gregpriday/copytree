import ansi, { bold, gray, green, red } from '../../../src/utils/ansi.js';

/**
 * `ansi.js` replaced Chalk in the logger, so its contract is the exact bytes
 * Chalk emitted at colour level 1. Those are written out here rather than
 * compared against Chalk at runtime, because Chalk is remapped to a stub by
 * `moduleNameMapper` in every Jest project and the stub returns its input
 * unchanged — every assertion would pass for the wrong reason.
 *
 * The equivalence was verified directly against `new Chalk({level: 1})` when
 * this module was written, including the nesting cases below. These literals
 * are that result, pinned.
 */
const CASES = [
  ['bold', '\x1b[1m', '\x1b[22m'],
  ['dim', '\x1b[2m', '\x1b[22m'],
  ['italic', '\x1b[3m', '\x1b[23m'],
  ['underline', '\x1b[4m', '\x1b[24m'],
  ['inverse', '\x1b[7m', '\x1b[27m'],
  ['strikethrough', '\x1b[9m', '\x1b[29m'],
  ['red', '\x1b[31m', '\x1b[39m'],
  ['green', '\x1b[32m', '\x1b[39m'],
  ['yellow', '\x1b[33m', '\x1b[39m'],
  ['blue', '\x1b[34m', '\x1b[39m'],
  ['white', '\x1b[37m', '\x1b[39m'],
  // Chalk's `gray` is bright black, not 30.
  ['gray', '\x1b[90m', '\x1b[39m'],
];

describe('ansi', () => {
  it.each(CASES)('wraps %s in its SGR pair', (name, open, close) => {
    expect(ansi[name]('hello')).toBe(`${open}hello${close}`);
  });

  it.each(CASES)('wraps an empty string in %s the same way', (name, open, close) => {
    expect(ansi[name]('')).toBe(`${open}${close}`);
  });

  it('keeps the outer style alive past a nested reset', () => {
    // The failure this guards: with a naive implementation the inner style's
    // reset ends the outer one too, so everything after `mid` renders unstyled.
    expect(red(`before${bold('mid')}after`)).toBe('\x1b[31mbefore\x1b[1mmid\x1b[22mafter\x1b[39m');
  });

  it('re-opens after every nested reset of the same code', () => {
    expect(green(`${green('a')}b${green('c')}`)).toBe(
      '\x1b[32m\x1b[32ma\x1b[32mb\x1b[32mc\x1b[32m\x1b[39m',
    );
  });

  it('nests distinct styles without interference', () => {
    expect(bold(red('x'))).toBe('\x1b[1m\x1b[31mx\x1b[39m\x1b[22m');
    expect(gray(gray('deep'))).toBe('\x1b[90m\x1b[90mdeep\x1b[90m\x1b[39m');
  });

  it('coerces non-strings, and treats null and undefined as empty', () => {
    expect(ansi.red(42)).toBe('\x1b[31m42\x1b[39m');
    expect(ansi.red(null)).toBe('\x1b[31m\x1b[39m');
    expect(ansi.red(undefined)).toBe('\x1b[31m\x1b[39m');
  });

  it('always emits codes, leaving the decision to the caller', () => {
    // Chalk decided for itself whether the terminal supported colour, which is
    // why `colorize: 'always'` into a pipe used to produce no colour at all.
    // These wrappers have no opinion; the logger's `_shouldColorize()` does.
    expect(red('x')).toContain('\x1b[31m');
  });
});
