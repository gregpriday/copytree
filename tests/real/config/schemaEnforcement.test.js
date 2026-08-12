/**
 * The configuration schema is a closed, deliberate public contract, so it has
 * to be enforced even when enforcing it is inconvenient.
 *
 * Two ways it used to stop enforcing itself:
 *
 *  - a missing or uncompilable `config/schema.json` silently set
 *    `validationEnabled = false`, so a packaging defect that dropped the schema
 *    weakened correctness instead of failing the build;
 *  - `NODE_ENV === 'test'` disabled validation outright, so the one environment
 *    built to prove validation works was the environment without it.
 */

import path from 'path';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import { ERROR_CODES } from '../../../src/utils/errors.js';

jest.unmock('../../../src/utils/fsx.js');

describe('configuration schema enforcement', () => {
  it('validates in the test environment, where it used to be switched off', async () => {
    expect(process.env.NODE_ENV).toBe('test');

    const config = await ConfigManager.create({ userConfig: false });

    // Validation is still skipped when there is nothing untrusted to check —
    // that is a deliberate startup saving, since the merged result would be
    // exactly the packaged defaults. What matters is that the *switch* is on:
    // `NODE_ENV === 'test'` used to force it off regardless.
    expect(config.validationEnabled).toBe(true);

    await config.loadSchema();
    expect(typeof config.validate).toBe('function');
  });

  it('fails under strict when the packaged schema is missing', async () => {
    // `configPath` is where `loadSchema()` looks for `schema.json`. Pointing it
    // at a directory with no schema is the same situation as a package that
    // shipped without one. Previously this set `validationEnabled = false` and
    // carried on, so a packaging defect weakened correctness rather than
    // stopping the release.
    const config = await ConfigManager.create({ userConfig: false, strict: true });
    // `configPath` is where `loadSchema()` reads `schema.json` from; it is
    // derived from the module location rather than accepted as an option, so
    // the packaging defect is simulated by repointing it.
    config.configPath = path.join(process.cwd(), 'tests', 'fixtures');

    await expect(config.loadSchema()).rejects.toMatchObject({
      code: ERROR_CODES.CONFIG_SCHEMA_UNAVAILABLE,
    });
  });

  it('does not silently disable validation when the schema is missing under strict', async () => {
    const config = await ConfigManager.create({ userConfig: false, strict: true });
    config.configPath = path.join(process.cwd(), 'tests', 'fixtures');

    await config.loadSchema().catch(() => {});
    expect(config.validationEnabled).toBe(true);
  });

  it('accepts every packaged default against the shipped schema', async () => {
    // The generated proof the review asked for: whatever `config/*.js` sets is
    // exactly what the closed schema has to allow. This is what caught
    // `binaryPolicy.text: 'load'` — a default naming a policy value that no
    // code path could apply.
    const config = await ConfigManager.create({ userConfig: false, strict: true });

    await config.loadSchema();
    expect(() => config.validateConfig()).not.toThrow();
  });

  it('reports the rejected key without dumping the whole configuration', async () => {
    const config = await ConfigManager.create({ userConfig: false });
    await config.loadSchema();
    config.set('copytree.maxFileSize', 'ten megabytes');

    let error;
    try {
      config.validateConfig();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe(ERROR_CODES.CONFIG_INVALID);

    // `details` used to carry the entire effective configuration, and
    // `toJSON()` publishes `details` — so any consumer that logged a validation
    // failure logged every path and setting the user had configured.
    expect(error.details.config).toBeUndefined();
    expect(JSON.stringify(error.toJSON())).not.toContain('binaryPolicy');

    expect(error.details.validationErrors[0]).toMatchObject({
      instancePath: expect.stringContaining('maxFileSize'),
    });
  });
});
