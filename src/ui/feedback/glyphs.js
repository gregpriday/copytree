/**
 * The one status vocabulary.
 *
 * Every persistent line CopyTree writes starts with exactly one of these, and
 * the glyph always means *outcome* — never destination. A saved file can still
 * be a failure, a clipboard write can still fall back, and a terminal is not an
 * outcome at all, so `💾`, `📎` and `🖥️` have no place in a leading position.
 * Where the output went belongs in the words after the glyph.
 *
 * Each entry carries an ASCII fallback because a missing emoji font must not be
 * the difference between a visible status and a blank cell, and a colour because
 * colour reinforces the meaning but is never the only carrier of it.
 *
 * @readonly
 */
export const GLYPHS = Object.freeze({
  success: { unicode: '✓', ascii: '[ok]', color: 'green' },
  warning: { unicode: '⚠', ascii: '[warn]', color: 'yellow' },
  error: { unicode: '✗', ascii: '[error]', color: 'red' },
  neutral: { unicode: '○', ascii: '-', color: 'dim' },
  detail: { unicode: '→', ascii: '->', color: 'dim' },
  bullet: { unicode: '•', ascii: '-', color: 'dim' },
});

/**
 * Destination glyphs, used *only* on a successful line.
 *
 * A success line has nothing to warn about, so its leading position is free to
 * say something more useful than "it worked" — namely where the output went,
 * which is the next thing the reader wants to know. The moment anything goes
 * wrong the outcome glyph takes the position back: `⚠` and `✗` are never
 * competing with a paperclip for attention.
 *
 * They degrade to the plain `[ok]` wherever Unicode is not safe, so a redirected
 * stream or a golden file never sees them.
 */
export const DESTINATION_GLYPHS = Object.freeze({
  reference: '📎',
  clipboard: '📋',
  file: '💾',
  display: '🖥️',
  stream: '📡',
});

/** Spinner frames, and the static stand-in for terminals that cannot animate. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const SPINNER_ASCII = '...';

const DEFAULT_WIDTH = 80;
const MIN_WIDTH = 20;

/**
 * Decide whether a stream can render the Unicode vocabulary.
 *
 * Unicode is the default on a TTY; the cases that break it are specific and
 * detectable. `TERM=dumb` has no capability negotiation at all, and a Windows
 * console outside Windows Terminal renders box-drawing glyphs at the wrong
 * width. Redirected output gets ASCII because whatever consumes the file has
 * not told us it can do better.
 *
 * @param {NodeJS.WriteStream} stream - Stream being written to
 * @param {Object} [env=process.env] - Environment to read
 * @returns {boolean} True when the Unicode glyphs are safe to use
 */
export function supportsUnicode(stream, env = process.env) {
  if (env.COPYTREE_ASCII === '1') return false;
  if (!stream?.isTTY) return false;
  if (env.TERM === 'dumb') return false;
  if (process.platform === 'win32') {
    // Windows Terminal, VS Code's terminal and modern ConEmu all announce
    // themselves; the legacy conhost does not.
    return Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuTask);
  }
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
  return locale === '' || /UTF-?8/i.test(locale);
}

/**
 * Decide whether ANSI colour should be emitted.
 *
 * `NO_COLOR` and `FORCE_COLOR` are honoured because they are the conventions
 * users already have set (see no-color.org); an explicit `mode` from `--no-color`
 * outranks both.
 *
 * @param {NodeJS.WriteStream} stream - Stream being written to
 * @param {'auto'|'always'|'never'} [mode='auto'] - Requested colour mode
 * @param {Object} [env=process.env] - Environment to read
 * @returns {boolean} True when ANSI colour is safe to use
 */
export function supportsColor(stream, mode = 'auto', env = process.env) {
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
  if (env.TERM === 'dumb') return false;
  return stream?.isTTY === true;
}

/**
 * Describe what a stream can render.
 *
 * @param {NodeJS.WriteStream} stream - Stream being written to
 * @param {Object} [options] - Overrides
 * @param {'auto'|'always'|'never'} [options.color='auto'] - Colour mode
 * @param {Object} [options.env=process.env] - Environment to read
 * @returns {{isTTY: boolean, unicode: boolean, color: boolean, width: number}} Capabilities
 */
export function detectCapabilities(stream, { color = 'auto', env = process.env } = {}) {
  const isTTY = stream?.isTTY === true;
  return {
    isTTY,
    unicode: supportsUnicode(stream, env),
    color: supportsColor(stream, color, env),
    // Only a terminal has a width to respect. A redirected stream has no
    // columns to overflow, and eliding a message that is about to be read by
    // grep or a human scrolling a log file loses information for no gain.
    width: isTTY ? Math.max(MIN_WIDTH, stream.columns || DEFAULT_WIDTH) : Infinity,
  };
}

/**
 * Render one status glyph for the given capabilities.
 *
 * @param {keyof GLYPHS} name - Glyph name
 * @param {{unicode?: boolean}} [capabilities] - Terminal capabilities
 * @returns {string} The glyph, Unicode or ASCII
 */
export function glyph(name, capabilities = {}) {
  const entry = GLYPHS[name] ?? GLYPHS.bullet;
  return capabilities.unicode === false ? entry.ascii : entry.unicode;
}

/**
 * The leading glyph for a completion line.
 *
 * Success gets the destination glyph; everything else gets its outcome glyph.
 *
 * @param {string} status - Model status
 * @param {string} [destination] - Where the output went
 * @param {{unicode?: boolean}} [capabilities] - Terminal capabilities
 * @returns {string} The glyph to lead with
 */
export function statusGlyph(status, destination, capabilities = {}) {
  if (status === 'success' && capabilities.unicode !== false && DESTINATION_GLYPHS[destination]) {
    return DESTINATION_GLYPHS[destination];
  }
  return glyph(status, capabilities);
}

/**
 * The colour name associated with a status glyph.
 * @param {keyof GLYPHS} name - Glyph name
 * @returns {string} A chalk colour name, or 'dim'
 */
export function glyphColor(name) {
  return (GLYPHS[name] ?? GLYPHS.bullet).color;
}

export default GLYPHS;
