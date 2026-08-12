/**
 * Security configuration must not be accepted and then ignored.
 *
 * `secretsGuard.gitleaks.binaryPath`, `configPath`, `extraArgs` and `logLevel`
 * are all declared in `config/schema.json`, so a user who sets them gets a
 * clean `copytree config validate` and every reason to believe a custom
 * scanner or ruleset is in force. None of them reached the adapter: the stage
 * constructed `GitleaksAdapter` from `options.gitleaks` alone, which the
 * pipeline never populates.
 */

import { ConfigManager } from '../../../src/config/ConfigManager.js';
import SecretsGuardStage from '../../../src/pipeline/stages/SecretsGuardStage.js';

jest.unmock('../../../src/utils/fsx.js');

/**
 * A stage initialized against a configuration, the way the pipeline does it.
 * @param {Object} overrides - `secretsGuard` values to set
 * @param {Object} [stageOptions={}] - Stage constructor options
 * @returns {Promise<SecretsGuardStage>} Initialized stage
 */
async function stageWith(overrides, stageOptions = {}) {
  const config = await ConfigManager.create({ userConfig: false });
  for (const [key, value] of Object.entries(overrides)) {
    config.set(`secretsGuard.${key}`, value);
  }

  const stage = new SecretsGuardStage(stageOptions);
  await stage.onInit({ config, options: {}, stats: {}, pipeline: null, quiet: true });
  return stage;
}

describe('secrets guard configuration reaches the scanner', () => {
  it('builds the Gitleaks adapter from the operation configuration', async () => {
    const stage = await stageWith({
      gitleaks: {
        binaryPath: '/opt/custom/gitleaks',
        configPath: '/etc/rules.toml',
        extraArgs: ['--redact'],
        logLevel: 'debug',
      },
    });

    expect(stage.gitleaks.binaryPath).toBe('/opt/custom/gitleaks');
    expect(stage.gitleaks.configPath).toBe('/etc/rules.toml');
    expect(stage.gitleaks.extraArgs).toEqual(['--redact']);
    expect(stage.gitleaks.logLevel).toBe('debug');
  });

  it('lets an explicit stage option outrank the configuration', async () => {
    const stage = await stageWith(
      { gitleaks: { binaryPath: '/from/config' } },
      { gitleaks: { binaryPath: '/from/options' } },
    );

    expect(stage.gitleaks.binaryPath).toBe('/from/options');
  });

  it('honours a zero scan ceiling instead of substituting the default', async () => {
    // `||` turned `maxFileBytes: 0` — "treat every file as unscannable" — into
    // the 5MB default, which is the opposite policy. The schema permits 0.
    const stage = await stageWith({ maxFileBytes: 0 });

    expect(stage.maxFileBytes).toBe(0);
  });

  it('records a scanner downgrade in the general degradation list', async () => {
    // The downgrade was recorded only at `stats.secretsGuard.degraded`, which
    // `--strict` does not read. "The credential scanner you asked for failed
    // and a weaker one finished the run" is the single degradation most worth
    // refusing a run over, and it was the one the flag could not see.
    const stage = await stageWith({});
    stage._degradation = { from: 'gitleaks', to: 'builtin', reason: 'spawn ENOENT' };

    const result = await stage.process({
      files: [{ path: 'a.js', content: 'const x = 1;\n', size: 13 }],
      stats: {},
    });

    expect(result.stats.secretsGuard.degraded).toBeDefined();
    expect(result.stats.degradations).toEqual([
      expect.objectContaining({
        stage: 'SecretsGuardStage',
        code: 'SECRET_SCANNER_DEGRADED',
        message: expect.stringContaining('gitleaks'),
      }),
    ]);
  });

  it('leaves the degradation list untouched when the preferred scanner held', async () => {
    const stage = await stageWith({});

    const result = await stage.process({
      files: [{ path: 'a.js', content: 'const x = 1;\n', size: 13 }],
      stats: {},
    });

    expect(result.stats.secretsGuard.degraded).toBeUndefined();
    expect(result.stats.degradations).toBeUndefined();
  });

  it('accepts every oversize policy the implementation branches on', async () => {
    // The schema used to allow `exclude | include | warn` while the stage
    // implemented `exclude | scan | fail` and SECURITY.md documented the
    // latter — so following the security guide produced a config the validator
    // rejected.
    const config = await ConfigManager.create({ userConfig: false });
    await config.loadSchema();

    for (const policy of ['exclude', 'scan', 'fail']) {
      config.set('secretsGuard.oversizePolicy', policy);
      expect(() => config.validateConfig()).not.toThrow();
    }

    config.set('secretsGuard.oversizePolicy', 'include');
    expect(() => config.validateConfig()).toThrow(/oversizePolicy/);
  });
});
