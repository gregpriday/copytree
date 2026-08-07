/**
 * The ANSI styles the logger applies, as plain string wrappers.
 *
 * This was Chalk, and Chalk cost **~4.7 ms to load on every invocation** —
 * almost all of it in its colour-support detection, walking the environment,
 * `TERM`, CI variables and Windows build numbers to decide what the terminal can
 * render.
 *
 * The logger never used that decision. It builds a styled string, and then
 * `_shouldColorize()` — its own policy, reading `logging.colorize`, `--no-color`
 * and the destination stream — decides whether to write the styled form or strip
 * it. So Chalk's detection ran on every startup to produce an answer that was
 * immediately overridden.
 *
 * Worse, the two disagreed in one direction that mattered: with
 * `colorize: 'always'` writing to a pipe, Chalk's own detection returned the
 * text *unstyled*, while `_shouldColorize()` returned true and wrote that
 * unstyled string as though it were coloured. Asking for colour explicitly
 * produced none. These wrappers always emit the escape codes and leave the
 * decision where it already lived.
 *
 * Basic 16-colour SGR only, which is the whole set the logger uses. Colour
 * *policy* — `NO_COLOR`, `FORCE_COLOR`, TTY detection — belongs to
 * `ui/feedback/glyphs.js` for the reporter and `_shouldColorize()` for the
 * logger, not here.
 */

const RESET = '\x1b[0m';

/**
 * Build a style function for an SGR code pair.
 *
 * Nested styles are handled the way Chalk handles them: the inner reset is
 * replaced with the outer style's opening code, so `bold(red(x))` does not lose
 * its boldness partway through.
 *
 * @param {number} open - SGR parameter to open with
 * @param {number} close - SGR parameter to close with
 * @returns {(text: string) => string} Style function
 */
function style(open, close) {
  const start = `\x1b[${open}m`;
  const end = `\x1b[${close}m`;

  return (text) => {
    const value = typeof text === 'string' ? text : String(text ?? '');
    // Re-open after any nested reset, so an inner style does not end this one.
    return start + (value.includes(end) ? value.split(end).join(start) : value) + end;
  };
}

export const bold = style(1, 22);
export const dim = style(2, 22);
export const italic = style(3, 23);
export const underline = style(4, 24);
export const inverse = style(7, 27);
export const strikethrough = style(9, 29);

export const red = style(31, 39);
export const green = style(32, 39);
export const yellow = style(33, 39);
export const blue = style(34, 39);
export const white = style(37, 39);

/**
 * Bright black, which is what Chalk's `gray` emits.
 *
 * Kept under the same name so the call sites read identically.
 */
export const gray = style(90, 39);

export { RESET };

export default {
  bold,
  dim,
  italic,
  underline,
  inverse,
  strikethrough,
  red,
  green,
  yellow,
  blue,
  white,
  gray,
};
