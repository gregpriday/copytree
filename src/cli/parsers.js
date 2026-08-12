/**
 * Option value parsers, generated against the schema's declared value types.
 *
 * Every parser fails at parse time rather than at use time. An invalid
 * `--max-files banana` should cost nothing and say so immediately; discovering
 * it after a traversal is both slower and a worse error.
 */

import { ERROR_CODES, ValidationError } from '../utils/errors.js';
import { parseSize } from '../utils/helpers.js';

/**
 * Reject an option value, in CopyTree's error vocabulary rather than the
 * parser's.
 *
 * Commander's own `InvalidArgumentError` produces "error: option '--format
 * <type>' argument 'foo' is invalid", which names the parser's data structures
 * before it names the problem. A typed error carries a stable code, the
 * offending value, and one concrete remediation, and is rendered by the same
 * path as every other CopyTree failure.
 *
 * @param {string} flag - Long flag, e.g. `--format`
 * @param {string} value - The rejected value
 * @param {string} message - Problem statement
 * @param {Object} [details={}] - `code` and `suggestion`
 * @returns {never} Always throws
 */
function rejectValue(flag, value, message, details = {}) {
  throw new ValidationError(message, flag.replace(/^--/, ''), value, {
    code: details.code ?? ERROR_CODES.INVALID_OPTION,
    value,
    suggestion: details.suggestion,
    ...(details.accepted ? { accepted: details.accepted } : {}),
  });
}

/**
 * Parse a non-negative or positive integer.
 * @param {string} flag - Flag name for the message, e.g. `--max-files`
 * @param {Object} [options={}] - Constraints
 * @param {number} [options.min=0] - Smallest accepted value
 * @returns {Function} Commander argument parser
 */
export function integerParser(flag, options = {}) {
  const min = options.min ?? 0;
  return (raw) => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) {
      rejectValue(flag, raw, `Invalid ${flag} value '${raw}'`, {
        suggestion: `Use a whole number of ${min} or more`,
      });
    }
    return value;
  };
}

/**
 * Parse a human-readable byte size.
 * @param {string} flag - Flag name for the message
 * @returns {Function} Commander argument parser
 */
export function sizeParser(flag) {
  return (raw) => {
    try {
      return parseSize(raw);
    } catch {
      return rejectValue(flag, raw, `Invalid ${flag} value '${raw}'`, {
        suggestion: 'Use a value such as 256KB, 10MB or 1GB',
      });
    }
  };
}

/**
 * Parse one of a fixed set of values.
 * @param {string} flag - Flag name for the message
 * @param {string[]} values - Accepted values
 * @param {Object} [aliases={}] - Accepted spellings mapped onto canonical values
 * @returns {Function} Commander argument parser
 */
export function enumParser(flag, values, aliases = {}) {
  return (raw) => {
    const lowered = String(raw).toLowerCase();
    const resolved = aliases[lowered] ?? lowered;
    if (!values.includes(resolved)) {
      // `--format` has its own code because an unsupported output format is a
      // distinct thing for a caller to switch on.
      rejectValue(flag, raw, `Invalid ${flag} value '${raw}'`, {
        code: flag === '--format' ? ERROR_CODES.INVALID_FORMAT : ERROR_CODES.INVALID_OPTION,
        suggestion: `Choose one of: ${values.join(', ')}`,
        // The accepted set travels with the error. `--format` means
        // `xml|markdown|…` on copy and `text|json|ndjson` on plan, and a
        // renderer that hardcoded one of them told half the callers to use a
        // value their command rejects.
        accepted: values,
      });
    }
    return resolved;
  };
}

/**
 * Collect one value per occurrence into an array.
 *
 * Repeatable options take exactly one value each, rather than being variadic,
 * so that a reader can always tell where the values stop and the next argument
 * begins.
 *
 * @param {string} value - The value from this occurrence
 * @param {string[]} [previous] - Values collected so far
 * @returns {string[]} Accumulated values
 */
export function collect(value, previous) {
  return [...(previous || []), value];
}

/**
 * Collect an extension, accepting the legacy comma-separated spelling.
 *
 * `--ext ts` and `--ext .ts` mean the same thing, and `--ext js,ts` still works
 * because scripts were written against it.
 *
 * @param {string} value - Raw value
 * @param {string[]} [previous] - Values collected so far
 * @returns {string[]} Normalized extensions, each with a leading dot
 */
export function collectExtension(value, previous) {
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('.') ? part.toLowerCase() : `.${part.toLowerCase()}`));

  if (parts.length === 0) {
    rejectValue('--ext', value, `Invalid --ext value '${value}'`, {
      suggestion: 'Provide an extension, such as ts or .ts',
    });
  }

  return [...(previous || []), ...parts];
}

/**
 * The parser for an option, chosen from its declared value type.
 *
 * @param {import('./schema.js').OptionSpec} option - Option spec
 * @param {string} flag - Long flag, used in error messages
 * @param {Object} [aliases={}] - Enum aliases, when the option accepts any
 * @returns {Function|undefined} Commander argument parser, when one applies
 */
export function parserFor(option, flag, aliases = {}) {
  if (option.id === 'ext') return collectExtension;

  if (option.repeatable) {
    // A repeatable option still validates each occurrence when it has a type.
    if (option.value === 'enum') {
      const inner = enumParser(flag, option.enumValues || [], aliases);
      return (raw, previous) => collect(inner(raw), previous);
    }
    return collect;
  }

  // `--max-depth 0` (root files only), `--max-chars 0` (an empty budget) and a
  // zero-day retention window are all meaningful requests; `--max-files 0` is
  // not, because it can only ever mean "select nothing".
  const zeroIsMeaningful = new Set(['maxDepth', 'maxChars', 'retentionDays', 'depth']);

  switch (option.value) {
    case 'integer':
      return integerParser(flag, { min: zeroIsMeaningful.has(option.id) ? 0 : 1 });
    case 'size':
      return sizeParser(flag);
    case 'enum':
      return enumParser(flag, option.enumValues || [], aliases);
    default:
      return undefined;
  }
}
