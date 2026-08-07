/**
 * The six object operations the configuration system needs.
 *
 * These were `lodash`'s, and importing lodash for them cost **~7 ms on every
 * invocation** — including `copytree --version`, which reads no configuration at
 * all. Lodash is a single ~550 KB module graph with no tree-shaking available to
 * an ESM consumer: `import _ from 'lodash'` evaluates all of it to reach
 * `cloneDeep`. Deep imports (`lodash/cloneDeep.js`) are worse, not better —
 * measured at ~13 ms, because each entry point drags in its own chain of
 * internal helpers with a separate module resolution each.
 *
 * What is actually needed is small, and it is bounded by what configuration
 * *is*: a tree of plain objects, arrays and primitives, parsed from `.js` and
 * `.json` files. These implementations handle that tree, and pass anything else
 * through by reference rather than pretending to understand it.
 *
 * Deliberately **not** general-purpose lodash replacements. `cloneDeep` here
 * does not preserve `Map`, `Set`, class instances or cycles, because
 * configuration contains none of those and a version that did would cost more
 * than it saves. Do not reach for this module from outside `config/`.
 */

/**
 * Whether a value is a plain object worth recursing into.
 *
 * Anything with a prototype other than `Object.prototype` (or none) is treated
 * as opaque: a class instance is cloned by reference rather than shallowly
 * reconstructed into something that no longer behaves like itself.
 *
 * @param {*} value - Value to test
 * @returns {boolean} True for plain objects
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-clone a configuration tree.
 *
 * Objects and arrays are rebuilt; everything else — primitives, functions,
 * dates, class instances — is carried across by reference. That is the correct
 * behaviour for the one job this has: the ES module cache hands every
 * `ConfigManager` the *same* exported object, so without a clone, `set()` on one
 * instance mutates the defaults every other instance goes on to read.
 *
 * @param {*} value - Value to clone
 * @returns {*} A copy that shares no mutable object with the original
 */
export function cloneDeep(value) {
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = cloneDeep(value[i]);
    return out;
  }

  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = cloneDeep(value[key]);
    return out;
  }

  return value;
}

/**
 * Deep-merge sources into a target, last source winning.
 *
 * Matches the lodash semantics this replaced on the cases configuration uses:
 * plain objects merge recursively, everything else — including arrays —
 * replaces wholesale. Array replacement is the behaviour that matters most
 * here: a user config listing three exclusions means *those three*, not those
 * three grafted onto whichever defaults happened to occupy the same indices.
 *
 * `undefined` in a source is skipped rather than assigned, so an absent key
 * cannot erase a default.
 *
 * @param {Object} target - Object mutated and returned
 * @param {...Object} sources - Sources applied in order
 * @returns {Object} The target
 */
export function merge(target, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    for (const key of Object.keys(source)) {
      const incoming = source[key];
      if (incoming === undefined) continue;

      if (isPlainObject(incoming)) {
        const existing = target[key];
        target[key] = merge(isPlainObject(existing) ? existing : {}, incoming);
      } else {
        target[key] = cloneDeep(incoming);
      }
    }
  }

  return target;
}

/**
 * Split a config path into segments.
 *
 * Supports the dotted form and lodash's bracket form (`a.b[0].c`,
 * `a["b.c"]`), because `ConfigManager` documents the full accessor grammar and
 * callers outside this repository may rely on it. Array paths pass through.
 *
 * @param {string|Array<string|number>} path - Config path
 * @returns {Array<string|number>} Path segments
 */
function toSegments(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== 'string') return [path];
  if (!path.includes('[')) return path.split('.');

  const segments = [];
  // Either a bracketed index/quoted key, or a run of anything up to the next
  // delimiter. Quotes inside brackets are stripped by the capture groups.
  const token = /\[(?:"([^"]*)"|'([^']*)'|([^\]]*))\]|([^.[\]]+)/g;
  let match;
  while ((match = token.exec(path)) !== null) {
    const key = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (key === undefined) continue;
    segments.push(/^\d+$/.test(key) ? Number(key) : key);
  }
  return segments;
}

/**
 * Read a value at a config path.
 *
 * @param {Object} object - Object to read from
 * @param {string|Array<string|number>} path - Config path
 * @param {*} [defaultValue] - Returned when the path is absent
 * @returns {*} The value, or `defaultValue`
 */
export function get(object, path, defaultValue) {
  const segments = toSegments(path);
  let current = object;

  for (const segment of segments) {
    if (current === null || current === undefined) return defaultValue;
    current = current[segment];
  }

  return current === undefined ? defaultValue : current;
}

/**
 * Whether a config path exists.
 *
 * Distinguishes "absent" from "present and undefined", which `get()` cannot.
 *
 * @param {Object} object - Object to test
 * @param {string|Array<string|number>} path - Config path
 * @returns {boolean} True when every segment resolves
 */
export function has(object, path) {
  const segments = toSegments(path);
  let current = object;

  for (const segment of segments) {
    if (current === null || current === undefined) return false;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = current[segment];
  }

  return true;
}

/**
 * Write a value at a config path, creating intermediate containers.
 *
 * A numeric segment creates an array, matching lodash: `set(o, 'a[0].b', 1)`
 * produces `{a: [{b: 1}]}` rather than `{a: {0: {b: 1}}}`.
 *
 * @param {Object} object - Object mutated in place
 * @param {string|Array<string|number>} path - Config path
 * @param {*} value - Value to write
 * @returns {Object} The object
 */
export function set(object, path, value) {
  const segments = toSegments(path);
  if (segments.length === 0) return object;

  let current = object;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const existing = current[segment];

    if (existing === null || typeof existing !== 'object') {
      current[segment] = typeof segments[i + 1] === 'number' ? [] : {};
    }
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
  return object;
}

/**
 * Structural equality for configuration values.
 *
 * Used only by the provenance inspector, to answer "did the user's config
 * actually supply this value?". Scoped to the same shapes as `cloneDeep`:
 * primitives compare with `Object.is` (so `NaN` equals itself), arrays and plain
 * objects compare element- and key-wise, and anything else compares by identity.
 *
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True when structurally equal
 */
export function isEqual(a, b) {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && isEqual(a[key], b[key]),
    );
  }

  return false;
}
