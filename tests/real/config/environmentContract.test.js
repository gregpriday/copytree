/**
 * The environment-variable allowlist is the whole interface, and stays true.
 *
 * Two contradictory impressions used to exist at once. `config/app.js` and
 * `config/cache.js` were written as `env('COPYTREE_…', default)` for two dozen
 * keys, which reads as an environment interface and was not — `env()` returned
 * its default and ignored its key. Meanwhile a handful of subsystems really did
 * read `process.env` directly, listed nowhere, and the reference page had
 * drifted from both: it documented `COPYTREE_DEBUG` and omitted
 * `COPYTREE_CLIPBOARD_TIMEOUT_MS`.
 *
 * So the list, the code and the documentation are checked against each other.
 */

import fs from 'fs';
import path from 'path';
import { shippedCode } from '../../helpers/sourceScan.js';
import { fileURLToPath } from 'url';
import {
  ENVIRONMENT_VARIABLES,
  ENVIRONMENT_VARIABLE_NAMES,
  PLATFORM_PROBES,
  describeEnvironment,
} from '../../../src/config/environment.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every environment variable the shipped code actually reads. */
function variablesReadByCode() {
  // The allowlist itself is excluded. Every name appears in it as a string
  // literal, so scanning it alongside the rest would let the phantom check
  // answer its own question.
  const source = shippedCode(repoRoot, [path.join(repoRoot, 'src/config/environment.js')]);
  const names = new Set();

  // `process.env.NAME` and `process.env['NAME']`.
  for (const match of source.matchAll(/process\.env\.([A-Za-z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/process\.env\[['"]([A-Za-z][A-Za-z0-9_]*)['"]\]/g)) {
    names.add(match[1]);
  }

  // `env.NAME`, where `env` is the injectable alias several modules take so
  // they can be tested against a synthetic environment. Missing these is how
  // `COPYTREE_ASCII`, `FORCE_COLOR` and six locale and terminal probes stayed
  // off a list that claimed to be exhaustive: every one of them is read through
  // an `env` parameter rather than through `process.env` directly.
  for (const match of source.matchAll(/\benv\.([A-Z][A-Za-z0-9_]*)/g)) {
    if (/^[A-Z0-9_]+$/.test(match[1]) || KNOWN_MIXED_CASE.has(match[1])) names.add(match[1]);
  }

  // Names read indirectly, through a helper that takes the variable name as an
  // argument: `positiveIntFromEnv('COPYTREE_DISCOVERY_CONCURRENCY')` is a read,
  // and `process.env[name]` inside that helper says nothing about which.
  for (const match of source.matchAll(/['"](COPYTREE_[A-Z0-9_]+)['"]/g)) names.add(match[1]);

  return names;
}

/**
 * Environment variables whose real names are not screaming snake case.
 *
 * Listing them is the price of a heuristic that would otherwise treat every
 * capitalised property on an `env` object as a variable.
 */
const KNOWN_MIXED_CASE = new Set(['ConEmuTask']);

describe('the environment allowlist', () => {
  it('lists every variable the code reads, as a setting or as a probe', () => {
    // `DB_PASSWORD` and `TOKEN` appear only inside comments in
    // `secretPatterns.js`, describing the shape of a reference the scanner must
    // not mistake for a credential. They are prose, not reads.
    const prose = new Set(['DB_PASSWORD', 'TOKEN']);
    const known = new Set([...ENVIRONMENT_VARIABLE_NAMES, ...PLATFORM_PROBES.map((p) => p.name)]);

    const undocumented = [...variablesReadByCode()]
      .filter((name) => !prose.has(name) && !known.has(name))
      .sort();

    // A variable the code honours and the list omits is a setting nobody can
    // find, and `doctor` cannot report.
    expect(undocumented).toEqual([]);
  });

  it('lists no variable the code ignores', () => {
    const read = variablesReadByCode();
    const declared = [...ENVIRONMENT_VARIABLE_NAMES, ...PLATFORM_PROBES.map((p) => p.name)];
    const phantom = declared.filter((name) => !read.has(name));

    // The failure the `env()` helper made for years: names that looked
    // configurable and were not.
    //
    // The detection deliberately does not count a name appearing as a string
    // literal, because every name appears as one in `environment.js` itself —
    // which would make this assertion answer its own question.
    expect(phantom).toEqual([]);
  });

  it('documents every setting on the reference page', () => {
    const page = fs.readFileSync(path.join(repoRoot, 'docs/reference/environment.md'), 'utf8');
    const missing = ENVIRONMENT_VARIABLE_NAMES.filter((name) => !page.includes(`\`${name}\``));

    expect(missing).toEqual([]);
  });

  it('gives every entry a description', () => {
    for (const entry of ENVIRONMENT_VARIABLES) {
      expect({ name: entry.name, described: entry.description.length > 10 }).toEqual({
        name: entry.name,
        described: true,
      });
    }
  });

  it('holds nothing that changes what a run selects or emits', () => {
    // The line that makes an export reproducible from the command that produced
    // it. A budget or a format set through the environment is invisible in the
    // command, so a colleague running the same line gets a different document.
    const semantic = /MAX_|BUDGET|FORMAT$|PROFILE|EXCLUDE|INCLUDE|SECRET|REDACT/;
    const offenders = ENVIRONMENT_VARIABLE_NAMES.filter(
      (name) => semantic.test(name) && name !== 'COPYTREE_LOG_FORMAT',
    );

    expect(offenders).toEqual([]);
  });
});

describe('describeEnvironment', () => {
  it('reports a row for every variable and probe, set or not', () => {
    // Probes included: `doctor` presents this as the environment CopyTree sees,
    // and the probes answer exactly the questions people bring to it — why the
    // glyphs are ASCII, why the clipboard chose that helper.
    expect(describeEnvironment({})).toHaveLength(
      ENVIRONMENT_VARIABLES.length + PLATFORM_PROBES.length,
    );
  });

  it('marks which rows are settings and which are observations', () => {
    const rows = describeEnvironment({});

    expect(rows.find((r) => r.name === 'COPYTREE_LOG_LEVEL').kind).toBe('setting');
    expect(rows.find((r) => r.name === 'TERM').kind).toBe('probe');
  });

  it('reports the effective value, so a surprise is diagnosable', () => {
    const rows = describeEnvironment({ COPYTREE_LOG_LEVEL: 'error' });
    const row = rows.find((entry) => entry.name === 'COPYTREE_LOG_LEVEL');

    expect(row.value).toBe('error');
  });

  it('reports null rather than undefined for an unset variable', () => {
    const rows = describeEnvironment({});

    expect(rows.every((entry) => entry.value === null)).toBe(true);
  });
});
