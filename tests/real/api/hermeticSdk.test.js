/**
 * The SDK's configuration isolation contract.
 *
 * An embedded CopyTree must produce the same context from the same inputs on
 * every machine it is installed on. Reading a user's home directory by default
 * breaks that — silently, and differently for each user — and the legacy
 * `~/.copytree/*.js` form breaks it by executing arbitrary code inside the host
 * application's process.
 */

import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { resolveOperationConfig } from '../../../src/api/operationConfig.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import TransformerRegistry from '../../../src/transforms/TransformerRegistry.js';

describe('SDK configuration is hermetic by default', () => {
  it('enables only the packaged defaults', async () => {
    const config = await resolveOperationConfig({});

    expect(config.enabledSources).toEqual(['defaults']);
    expect(config.userConfigLoaded).toBe(false);
  });

  it('loads strictly, so a broken source cannot pass as an empty one', async () => {
    // An empty configuration means no exclusion lists at all: a run that copies
    // `node_modules` and reports success.
    const config = await resolveOperationConfig({});

    expect(config.strict).toBe(true);
  });

  it('reads nothing from the home directory', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'copytree-home-'));
    const original = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

    try {
      await mkdir(path.join(home, '.copytree'), { recursive: true });
      await writeFile(
        path.join(home, '.copytree', 'config.json'),
        JSON.stringify({ copytree: { maxFileSize: 1 } }),
      );
      process.env.HOME = home;
      process.env.USERPROFILE = home;

      const config = await resolveOperationConfig({});

      expect(config.get('copytree.maxFileSize')).not.toBe(1);
    } finally {
      if (original.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = original.HOME;
      if (original.USERPROFILE === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = original.USERPROFILE;
      await rm(home, { recursive: true, force: true });
    }
  });

  it('honours a configuration the caller supplies', async () => {
    // The opt-in: an embedder that genuinely wants user configuration builds
    // one and passes it.
    const supplied = await ConfigManager.create({ userConfig: false });

    expect(await resolveOperationConfig({ config: supplied })).toBe(supplied);
  });
});

describe('the operation configuration reaches the transformers', () => {
  it('passes the supplied instance to every default transformer', async () => {
    const config = await ConfigManager.create({ userConfig: false });
    const registry = await TransformerRegistry.createDefault({ config });

    // Storing the config on the registry was not enough: the transformers were
    // constructed with no arguments and fell through to the process-wide
    // singleton, so an operation's binary policy and transformation cache came
    // from a different instance than its selection and formatting did.
    const transformers = [...registry.transformers.values()].map((entry) =>
      entry.transformer ? entry.transformer : entry,
    );

    expect(transformers.length).toBeGreaterThan(0);
    for (const transformer of transformers) {
      expect(transformer.config).toBe(config);
    }
  });

  it('keeps two registries with different configurations apart', async () => {
    const a = await ConfigManager.create({ userConfig: false });
    const b = await ConfigManager.create({ userConfig: false });

    const registryA = await TransformerRegistry.createDefault({ config: a });
    const registryB = await TransformerRegistry.createDefault({ config: b });

    const first = [...registryA.transformers.values()][0];
    const second = [...registryB.transformers.values()][0];

    expect((first.transformer ?? first).config).toBe(a);
    expect((second.transformer ?? second).config).toBe(b);
    expect((first.transformer ?? first).config).not.toBe((second.transformer ?? second).config);
  });
});
