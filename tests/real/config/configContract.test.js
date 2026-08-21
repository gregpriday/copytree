/**
 * The configuration schema is a public contract, and this checks it is kept.
 *
 * `config/schema.json` describes itself as closed and complete: `copytree
 * config validate` rejects an unknown key, so *accepting* a key is the
 * deliberate act of making it public. That promise only holds if every accepted
 * key does something. Seventeen did not — `app.defaultCommand`,
 * `app.interactiveMode`, `app.chunkSize`, `app.defaultOutput`,
 * `app.outputEncoding`, `app.exitOnError`, six `app.*` metadata keys,
 * `copytree.maxOutputSize`, `copytree.maxCharacterLimit`,
 * `copytree.preserveEmptyDirs`, `copytree.treeIndent`, and `schemaVersion`,
 * which could not even be written because the loader merged a root-level scalar
 * into an object and produced `{}`.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import { shippedCode } from '../../helpers/sourceScan.js';
import { spawnSync } from 'child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/schema.json'), 'utf8'));

/** Every leaf key the schema accepts, in dotted form. */
function leafKeys(node, prefix = '') {
  const keys = [];
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    const dotted = prefix ? `${prefix}.${name}` : name;
    if (child.properties) keys.push(...leafKeys(child, dotted));
    else keys.push(dotted);
  }
  return keys;
}

// `config/` holds the packaged defaults, where every key is *declared*. A
// declaration is not a consumer, and including it meant the leaf-name half of
// `isConsumed()` matched every key in the schema by construction.
const source = shippedCode(repoRoot, [
  path.join(repoRoot, 'config/app.js'),
  path.join(repoRoot, 'config/cache.js'),
  path.join(repoRoot, 'config/copytree.js'),
  path.join(repoRoot, 'config/logging.js'),
  path.join(repoRoot, 'config/secretsGuard.js'),
]);

/**
 * Whether the runtime reads a key, directly or through its section.
 *
 * Direct is `config.get('copytree.sizeGate')`. Sectioned is
 * `config.get('copytree', {})` followed by `copytree.sizeGate` — several
 * subsystems read a whole section once and destructure it, which is a
 * performance decision rather than a different contract.
 *
 * @param {string} key - Dotted config key
 * @returns {boolean} True when something reads it
 */
function isConsumed(key) {
  if (source.includes(`'${key}'`)) return true;

  const parts = key.split('.');
  const leaf = parts[parts.length - 1];

  for (let i = 1; i < parts.length; i++) {
    const section = parts.slice(0, i).join('.');
    if (source.includes(`get('${section}'`) && new RegExp(`\\b${leaf}\\b`).test(source)) {
      return true;
    }
  }

  return false;
}

describe('every accepted configuration key does something', () => {
  it('has a runtime consumer for each schema key', () => {
    const keys = leafKeys(schema).filter((key) => key !== 'schemaVersion');
    expect(keys.length).toBeGreaterThan(40);

    // `schemaVersion` is excluded above because it is consumed by name in the
    // compatibility check rather than by a `config.get`; its own tests are
    // below.
    expect(keys.filter((key) => !isConsumed(key))).toEqual([]);
  });

  it('documents every schema key in the configuration reference', () => {
    const page = fs.readFileSync(path.join(repoRoot, 'docs/reference/configuration.md'), 'utf8');

    const undocumented = leafKeys(schema)
      // Documented under its section heading, so the leaf name is what appears
      // in the table. Sibling keys with identical meaning share a row — the
      // four `treeConnectors`, the three `fs` retry settings — written either
      // as `parent.*` or slash-joined, so both forms count.
      .filter((key) => {
        const withoutSection = key.split('.').slice(1).join('.');
        const leaf = key.split('.').pop();
        const parent = withoutSection.split('.').slice(0, -1).join('.');

        return ![
          `\`${key}\``,
          `\`${withoutSection}\``,
          `\`${parent}.*\``,
          `\`.${leaf}\``,
          `/ \`${leaf}\``,
        ].some((form) => page.includes(form));
      });

    expect(undocumented).toEqual([]);
  });

  it('documents no key the schema has removed', () => {
    const page = fs.readFileSync(path.join(repoRoot, 'docs/reference/configuration.md'), 'utf8');

    // A reference that advertises a key CopyTree now rejects sends someone to
    // write a configuration file that will not load.
    for (const removed of [
      'maxOutputSize',
      'maxCharacterLimit',
      'preserveEmptyDirs',
      'treeIndent',
      'defaultOutput',
      'chunkSize',
      'defaultCommand',
      'interactiveMode',
      'outputEncoding',
      'exitOnError',
    ]) {
      expect({ removed, documented: page.includes(`\`${removed}\``) }).toEqual({
        removed,
        documented: false,
      });
    }
  });

  it('has a packaged default for every schema key', async () => {
    const config = await ConfigManager.create({ userConfig: false });

    // `config show --sources` is documented as the fastest way to see every
    // effective value and where it came from. It cannot be, for a key whose
    // only value is a `config.get(path, fallback)` fallback buried in a stage:
    // the key is simply absent from the output, and the reader concludes the
    // setting does not exist.
    const missing = leafKeys(schema)
      .filter((key) => key !== 'schemaVersion')
      .filter((key) => config.get(key) === undefined);

    expect(missing).toEqual([]);
  });
});

describe('schemaVersion', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-schemaversion-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Load a configuration declaring a schema version.
   * @param {string} version - The version to declare
   * @returns {Promise<ConfigManager>} The loaded configuration
   */
  const load = (version) => {
    fs.writeFileSync(
      path.join(dir, 'config.yaml'),
      `schemaVersion: '${version}'\ncopytree:\n  includeHidden: true\n`,
    );
    return ConfigManager.create({ dataConfigPath: dir, userConfig: true });
  };

  it('survives loading as a string', async () => {
    // The loader merged every root-level key as if it were a section, and
    // `merge({}, {}, '1.0.0')` is `{}` — so the only scalar the schema declares
    // at the root could never be set, and always failed as "must be string".
    const config = await load('1.0.0');

    expect(config.get('schemaVersion')).toBe('1.0.0');
  });

  it.each(['1.0.0', '0.9.0', '1.99.99'])('accepts %s', async (version) => {
    await expect(load(version)).resolves.toBeDefined();
  });

  it.each(['2.0.0', '10.3.1'])('refuses the newer major %s', async (version) => {
    // A future major is exactly the release that may have changed what an
    // existing key means. Reading it anyway and guessing is how a budget or an
    // exclusion list quietly comes to mean something else.
    await expect(load(version)).rejects.toMatchObject({ code: 'ERR_CONFIG_INVALID' });
  });

  it('names the version it cannot read and the major it can', async () => {
    const error = await load('3.1.0').catch((e) => e);

    expect(error.message).toContain('3.1.0');
    expect(error.message).toContain('schema major 1');
  });

  it('does not advise relabelling the file, which would defeat the guard', async () => {
    const error = await load('3.1.0').catch((e) => e);

    expect(error.suggestion ?? error.details?.suggestion ?? '').not.toContain('set schemaVersion');
  });

  it.each([{ noValidate: true }, { userConfig: true }])(
    'refuses a newer major even with %p, because this is not a validation preference',
    async (options) => {
      fs.writeFileSync(
        path.join(dir, 'config.yaml'),
        `schemaVersion: '4.0.0'
`,
      );

      await expect(
        ConfigManager.create({ dataConfigPath: dir, userConfig: true, ...options }),
      ).rejects.toMatchObject({ code: 'ERR_CONFIG_INVALID' });
    },
  );

  it('is not defeated by a major too long to convert to a number', async () => {
    // `Number('9'.repeat(320))` is `Infinity`, `Number.isInteger(Infinity)` is
    // false, and the guard returned — while the schema's `^\d+\.\d+\.\d+$`
    // pattern accepted the string quite happily.
    await expect(load(`${'9'.repeat(320)}.0.0`)).rejects.toMatchObject({
      code: 'ERR_CONFIG_INVALID',
    });
  });
});

describe('config migrate', () => {
  let legacy;
  let target;

  beforeEach(() => {
    legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-legacy-'));
    target = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-target-'));
  });

  afterEach(() => {
    fs.rmSync(legacy, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  });

  /**
   * Run the migration against the fixtures.
   * @param {string[]} [args=[]] - Extra arguments
   * @returns {{status: number, stdout: string, stderr: string}} Result
   */
  const migrate = (args = []) =>
    spawnSync(
      process.execPath,
      [path.join(repoRoot, 'bin/copytree.js'), 'config', 'migrate', ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          COPYTREE_LEGACY_CONFIG_PATH: legacy,
          COPYTREE_DATA_CONFIG_PATH: target,
        },
      },
    );

  it('leaves out keys the schema no longer accepts, and says which', () => {
    // Copying a legacy file across verbatim produced a `config.yaml` that the
    // very next run rejected — from a command whose whole job is to leave the
    // user with a working configuration.
    fs.writeFileSync(
      path.join(legacy, 'app.js'),
      'export default { chunkSize: 4096, maxConcurrency: 8 };\n',
    );

    const result = migrate();

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain('app.chunkSize');
    expect(result.stdout).toContain('maxConcurrency: 8');
    expect(result.stdout).not.toContain('chunkSize: 4096');
  });

  it('writes a file that then loads cleanly', () => {
    fs.writeFileSync(
      path.join(legacy, 'copytree.js'),
      'export default { treeIndent: "  ", includeHidden: true };\n',
    );

    expect(migrate(['--write']).status).toBe(0);

    const validate = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'bin/copytree.js'), 'config', 'validate'],
      { encoding: 'utf8', env: { ...process.env, COPYTREE_DATA_CONFIG_PATH: target } },
    );

    expect(validate.status).toBe(0);
  });

  it('refuses a value pruning cannot fix, and names it', () => {
    // Pruning removes keys the schema does not know. It cannot fix a value of
    // the wrong type, and a migration whose output the next run rejects has not
    // migrated anything.
    fs.writeFileSync(path.join(legacy, 'app.js'), "export default { maxConcurrency: 'lots' };\n");

    const result = migrate();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('maxConcurrency');
    expect(result.stderr).not.toContain('Reinstall CopyTree');
  });

  it('does not treat an inherited property name as a known key', () => {
    // `properties['constructor']` finds `Object.prototype.constructor`.
    fs.writeFileSync(path.join(legacy, 'app.js'), 'export default { constructor: 1 };\n');

    const result = migrate();

    expect(result.stdout + result.stderr).toContain('app.constructor');
  });
});

describe('removed keys are actually rejected', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-removed-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['app', 'defaultCommand', 'copy'],
    ['app', 'chunkSize', 4096],
    ['copytree', 'maxOutputSize', 1000],
    ['copytree', 'treeIndent', '    '],
  ])('rejects %s.%s, which no longer does anything', async (section, key, value) => {
    fs.writeFileSync(
      path.join(dir, 'config.yaml'),
      `${section}:\n  ${key}: ${JSON.stringify(value)}\n`,
    );

    // Rejected by name, rather than accepted and ignored. Someone who set it
    // has a wrong belief about what CopyTree will do, and the error is the only
    // thing that corrects it.
    const error = await ConfigManager.create({ dataConfigPath: dir, userConfig: true }).catch(
      (e) => e,
    );

    expect(error.code).toBe('ERR_CONFIG_INVALID');
    expect(error.message).toContain(key);
  });
});
