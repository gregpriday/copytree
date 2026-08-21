/**
 * YAML merge keys, and the schema choice that makes them work.
 *
 * `js-yaml` 5 loads with `CORE_SCHEMA`, which has no `!!merge` tag; 4.x's
 * default schema had one. Moving to 5 therefore stopped `<<: *anchor` from
 * merging and left it in the mapping as a literal `"<<"` key — which the
 * profile validator and the closed configuration schema both reject as an
 * unknown setting. A profile that had loaded for years failed outright, with an
 * error naming a key its author never wrote.
 *
 * Nothing caught it because no fixture anywhere used an anchor. These are the
 * tests that would have.
 *
 * Two things here are less obvious than they look.
 *
 * The scalar block at the end pins the *instrument*, not the behaviour. The
 * cheapest way to restore merge is `YAML11_SCHEMA`, and it passes every other
 * test in this file while silently changing how every profile parses: `yes`
 * becomes `true`, `012` becomes ten, `1e3` becomes a string, and a bare date
 * becomes a `Date`. Each case below is one that actually differs between the
 * two schemas — a case that does not differ would be decoration.
 *
 * And the assertions are written so that *not merging* fails them. It is easy
 * to write a merge test whose expected keys are also present without the
 * merge; the anchors here live under `x-` holders, which nothing else reads,
 * so the only route to the value is through the `<<`.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { loadYaml } from '../../../src/utils/yaml.js';
import FolderProfileLoader from '../../../src/config/FolderProfileLoader.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';

jest.unmock('../../../src/utils/fsx.js');

let root;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'copytree-yaml-merge-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Write `.copytree.yml` into the fixture and load what the loader discovers.
 *
 * @param {string} body - Profile YAML
 * @returns {Promise<Object>} The resolved profile
 */
function discoverProfile(body) {
  writeFileSync(path.join(root, '.copytree.yml'), body);
  return new FolderProfileLoader({ cwd: root }).discover();
}

describe('loadYaml resolves a merge key', () => {
  it('folds the anchor into the mapping', async () => {
    const parsed = await loadYaml(
      ['x-opts: &opts', '  respectGitignore: true', 'output:', '  <<: *opts', '  format: xml'].join(
        '\n',
      ),
    );

    expect(parsed.output).toEqual({ respectGitignore: true, format: 'xml' });
  });

  it('leaves no literal "<<" key behind', async () => {
    // The actual failure: `"<<"` survived as a property, and every validator
    // downstream reported it as a setting the author had misspelt.
    const parsed = await loadYaml(['a: &a', '  x: 1', 'b:', '  <<: *a'].join('\n'));

    expect(Object.keys(parsed.b)).toEqual(['x']);
  });

  it.each([
    ['after the merge key', ['b:', '  <<: *a', '  format: markdown']],
    ['before it', ['b:', '  format: markdown', '  <<: *a']],
  ])('lets the merging mapping win over the anchor, written %s', async (_label, lines) => {
    // Merge-key semantics: `<<` supplies defaults, it does not overwrite, and
    // the order it is written in does not change that.
    //
    // Asserted on the whole object. `b.format` alone is 'markdown' whether or
    // not the merge happened — it is written right there — so that assertion
    // passes against a parser doing nothing at all. `inherited` is the half
    // that can only arrive through the merge.
    const parsed = await loadYaml(
      ['a: &a', '  format: xml', '  inherited: kept', ...lines].join('\n'),
    );

    expect(parsed.b).toEqual({ format: 'markdown', inherited: 'kept' });
  });

  it('merges a sequence of anchors, earliest winning', async () => {
    const parsed = await loadYaml(
      ['a: &a', '  n: 1', 'b: &b', '  n: 2', '  m: 3', 'c:', '  <<: [*a, *b]'].join('\n'),
    );

    expect(parsed.c).toEqual({ n: 1, m: 3 });
  });

  it('rejects a merge from something that is not a mapping', async () => {
    // Without `mergeTag` this parses happily, as an ordinary key called `<<`
    // holding the string `plain`. With it, it is the error it should be.
    // Matched loosely: the exact diagnostic is the parser's to word.
    await expect(loadYaml(['a: &a plain', 'b:', '  <<: *a'].join('\n'))).rejects.toThrow();
  });

  it('rejects an alias that was never defined', async () => {
    await expect(loadYaml('b:\n  <<: *nope\n')).rejects.toThrow();
  });

  it('still treats an empty document as absent', async () => {
    // The other 5.x accommodation in this module, asserted alongside so the
    // schema change cannot quietly undo it.
    expect(await loadYaml('# just a comment\n')).toBeUndefined();
  });
});

describe('a profile that shares settings through an anchor', () => {
  it('loads, with the inherited option actually in effect', async () => {
    // Asserted on the resolved value rather than on "it did not throw": a
    // profile that loads and drops the setting it inherited is the same bug
    // one step later. And asserted with `toEqual`, not `toMatchObject`, so a
    // surviving literal `<<` is a failure rather than an extra key nobody
    // looked at.
    const profile = await discoverProfile(
      [
        'x-shared: &shared',
        '  respectGitignore: true',
        'options:',
        '  <<: *shared',
        '  format: xml',
      ].join('\n'),
    );

    expect(profile.options).toEqual({ respectGitignore: true, format: 'xml' });
  });

  it('resolves a merge inside transformers, which nothing else validates', async () => {
    // The quietest branch. `options` is a closed set, so a literal `<<` there
    // is rejected loudly; `transformers` is carried through unchecked, so an
    // unresolved merge would travel all the way into an embedder's
    // configuration and be discovered there.
    const profile = await discoverProfile(
      [
        'x-tx: &tx',
        '  enabled: true',
        '  ttl: 60',
        'transformers:',
        '  markdown:',
        '    <<: *tx',
        '    enabled: false',
      ].join('\n'),
    );

    expect(profile.transformers).toEqual({ markdown: { enabled: false, ttl: 60 } });
  });

  it('reports a genuinely unknown option, so the check still bites', async () => {
    await expect(discoverProfile('options:\n  notAnOption: true\n')).rejects.toThrow(/notAnOption/);
  });
});

describe('x-, so an anchor has somewhere to live', () => {
  it('accepts a reserved key held only to be merged from', async () => {
    // Without this there is nowhere to define shared settings: every
    // anchorable key already means something, and `x-defaults: &d` was
    // rejected before the merge that reads it could be evaluated.
    const profile = await discoverProfile(
      ['x-shared: &shared', '  format: markdown', 'options:', '  <<: *shared'].join('\n'),
    );

    expect(profile.options).toEqual({ format: 'markdown' });
  });

  it('does not carry the reserved key into the profile', async () => {
    const profile = await discoverProfile('x-notes: anything at all\nname: p\n');

    expect(Object.keys(profile)).not.toContain('x-notes');
  });

  it.each([
    ['a misspelt known key', 'excludes:\n  - "*.log"\n', /excludes/],
    // The hyphen is the boundary. Without it the exemption would swallow any
    // key starting with `x`, and a real setting one day named `xmlMode` would
    // stop being checked.
    ['a key beginning with x but no hyphen', 'xshared: 1\n', /xshared/],
    // Lower case only, so the prefix is one spelling rather than a family.
    ['a capitalised prefix', 'X-shared: 1\n', /X-shared/],
  ])('still rejects %s', async (_label, body, pattern) => {
    await expect(discoverProfile(body)).rejects.toThrow(pattern);
  });

  it('does not extend the exemption to nested options', async () => {
    // `options` is a closed set returned to consumers, and `x-` is for holding
    // an anchor at the top level. A nested one is an unknown option.
    await expect(discoverProfile('options:\n  x-note: hi\n')).rejects.toThrow(/x-note/);
  });
});

describe('a data configuration that shares settings through an anchor', () => {
  let noValidate;

  beforeEach(() => {
    // A developer with this set would otherwise run these tests with schema
    // validation switched off — which is most of what they assert.
    noValidate = process.env.COPYTREE_NO_VALIDATE;
    delete process.env.COPYTREE_NO_VALIDATE;
  });

  afterEach(() => {
    if (noValidate === undefined) delete process.env.COPYTREE_NO_VALIDATE;
    else process.env.COPYTREE_NO_VALIDATE = noValidate;
  });

  /**
   * Load a `config.yaml` written into the fixture, and nothing else.
   *
   * `userConfigPath` is pinned at a directory that does not exist. It defaults
   * to `~/.copytree`, whose `*.js` files are *executed*, so without this a
   * developer's own legacy configuration would be run and merged in — making
   * the result depend on the machine. `userConfig: false` would be the wrong
   * instrument: it disables the data configuration this test is about.
   *
   * `strict` turns a source that fails to load into a throw. Without it a
   * parse failure is recorded as a warning and the packaged defaults are
   * returned, so a test asserting a default value would pass having loaded
   * nothing at all.
   *
   * @param {string} body - `config.yaml` contents
   * @returns {Promise<ConfigManager>} The loaded configuration
   */
  function loadConfig(body) {
    mkdirSync(path.join(root, 'cfg'));
    writeFileSync(path.join(root, 'cfg', 'config.yaml'), body);

    return ConfigManager.create({
      dataConfigPath: path.join(root, 'cfg'),
      userConfigPath: path.join(root, 'no-such-legacy-dir'),
      strict: true,
    });
  }

  it('resolves the merge and passes schema validation', async () => {
    // `config.yaml` goes through the same `loadYaml`, and its schema is closed
    // — so before the fix a merge key failed validation naming `<<`.
    //
    // Both assertions are on values that default to `true`, so `false` can
    // only have come from this file, and `cache.enabled` can only have reached
    // it through the merge.
    const config = await loadConfig(
      ['cache:', '  transformations: &disabled', '    enabled: false', '  <<: *disabled'].join(
        '\n',
      ),
    );

    expect(config.get('cache.enabled')).toBe(false);
    expect(config.get('cache.transformations.enabled')).toBe(false);
    expect(config.getLoadErrors()).toEqual([]);
  });

  it('accepts an x- section held only to be merged from', async () => {
    // The same convention as profiles. Without it there is nowhere to put an
    // anchor: every section name means something and the root schema is
    // closed, so the holder itself would fail validation.
    const config = await loadConfig(
      ['x-off: &off', '  enabled: false', 'cache:', '  <<: *off'].join('\n'),
    );

    expect(config.get('cache.enabled')).toBe(false);
    expect(config.get('x-off')).toBeUndefined();
    expect(config.getLoadErrors()).toEqual([]);
  });
});

describe('scalars keep YAML 1.2 meanings', () => {
  // These pin the *instrument*. `YAML11_SCHEMA` restores merge too, and would
  // pass every test above while changing the meaning of documents containing
  // no anchor at all. Every case below is one the two schemas disagree on.

  it.each([
    ['yes', 'yes'],
    ['no', 'no'],
    ['on', 'on'],
    ['off', 'off'],
    ['y', 'y'],
  ])('reads %s as a string, not a boolean', async (literal, expected) => {
    // `include: [yes]` is a directory called `yes`. Under YAML 1.1 it is `true`.
    expect((await loadYaml(`value: ${literal}\n`)).value).toBe(expected);
  });

  it('reads a leading zero as decimal, not octal', async () => {
    // An ordering key or a mode written `012` means twelve here, ten there.
    expect((await loadYaml('value: 012\n')).value).toBe(12);
  });

  it('reads exponent notation as a number', async () => {
    // YAML 1.1 requires a decimal point, so `1e3` is the string '1e3' there.
    // A byte budget written that way would silently stop being a budget.
    expect((await loadYaml('value: 1e3\n')).value).toBe(1000);
  });

  it('reads a bare date as a string, not a Date', async () => {
    expect((await loadYaml('value: 2001-12-14\n')).value).toBe('2001-12-14');
  });

  it('still reads true and false as booleans', async () => {
    // Not a YAML 1.1 discriminator — both schemas agree. It guards the other
    // direction: dropping the Core boolean tag while assembling the schema.
    expect(await loadYaml('a: true\nb: false\n')).toEqual({ a: true, b: false });
  });
});
