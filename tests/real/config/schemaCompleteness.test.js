/**
 * The configuration schema is closed, so it has to be complete.
 *
 * Closing the schema was the point — an unknown key is almost always a typo,
 * and accepting it silently discards what the user asked for. But a closed
 * schema turns every *omission* into a regression: a key the runtime reads and
 * the schema does not declare becomes impossible to set, and the user is told
 * their spelling is wrong when it was not.
 *
 * That is not hypothetical. Closing the schema initially omitted
 * `secretsGuard` — an entire functional section, absent from the packaged
 * defaults and therefore invisible — along with `copytree.respectGitignore`,
 * `copytree.maxBase64Size`, and two `discovery` keys that only exist as
 * `undefined` in the defaults and so never appear in a serialized dump.
 *
 * This test derives the answer from the source rather than from a list someone
 * remembered to update.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Every dotted key the schema declares.
 *
 * A section whose `additionalProperties` is a schema rather than `false` is a
 * map — `binaryPolicy`, keyed by category — so it is recorded as accepting any
 * child.
 *
 * @param {Object} node - Schema node
 * @param {string} prefix - Dotted prefix
 * @param {Set<string>} into - Accumulator
 * @returns {Set<string>} Declared keys
 */
function declaredKeys(node, prefix, into) {
  if (!node || typeof node !== 'object' || node.$ref) return into;

  for (const [name, child] of Object.entries(node.properties ?? {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    into.add(key);
    declaredKeys(child, key, into);
  }

  if (prefix && node.additionalProperties && typeof node.additionalProperties === 'object') {
    into.add(`${prefix}.*`);
  }

  return into;
}

/**
 * Every dotted key the runtime reads through `config.get(...)`.
 * @returns {Set<string>} Keys
 */
function runtimeKeys() {
  const keys = new Set();

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.js')) continue;

      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(/config\.get\(\s*['"`]([a-zA-Z][\w.]*)['"`]/g)) {
        keys.add(match[1]);
      }
    }
  };

  walk(path.join(repoRoot, 'src'));
  return keys;
}

/**
 * Whether a key is accepted, directly or through a map-typed ancestor.
 * @param {string} key - Dotted key
 * @param {Set<string>} declared - Declared keys
 * @returns {boolean} True when the schema accepts it
 */
function accepts(key, declared) {
  if (declared.has(key)) return true;

  const parts = key.split('.');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    if (declared.has(`${parts.slice(0, i).join('.')}.*`)) return true;
  }
  return false;
}

describe('the closed configuration schema', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/schema.json'), 'utf8'));
  const declared = declaredKeys(schema, '', new Set());

  it('declares every key the runtime reads', () => {
    const missing = [...runtimeKeys()].filter((key) => !accepts(key, declared)).sort();

    // Each of these would be rejected as "additional properties" for anyone who
    // set it — a setting the code honours, that the schema forbids.
    expect(missing).toEqual([]);
  });

  it('declares every key the packaged defaults set', async () => {
    const sections = ['app', 'cache', 'copytree', 'logging'];
    const missing = [];

    for (const section of sections) {
      const loaded = await import(`../../../config/${section}.js`);
      const values = loaded.default ?? loaded;

      // `Object.keys`, not a JSON round-trip: several defaults are `undefined`,
      // which `JSON.stringify` drops and AJV still sees as a present property.
      const visit = (object, prefix) => {
        for (const [name, value] of Object.entries(object)) {
          const key = `${prefix}.${name}`;
          if (!accepts(key, declared)) missing.push(key);
          else if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!declared.has(`${key}.*`)) visit(value, key);
          }
        }
      };

      visit(values, section);
    }

    expect(missing.sort()).toEqual([]);
  });

  it('is closed at every level it defines', () => {
    const open = [];

    const visit = (node, prefix) => {
      if (!node || typeof node !== 'object' || node.$ref) return;
      if (node.properties) {
        // `additionalProperties: false`, or an explicit map schema. `true` or
        // absent means the level accepts anything, which is the state this
        // whole exercise removed.
        if (node.additionalProperties !== false && typeof node.additionalProperties !== 'object') {
          open.push(prefix || '(root)');
        }
        for (const [name, child] of Object.entries(node.properties)) {
          visit(child, prefix ? `${prefix}.${name}` : name);
        }
      }
    };

    visit(schema, '');
    expect(open).toEqual([]);
  });
});
