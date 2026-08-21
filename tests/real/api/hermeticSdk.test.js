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
import BaseTransformer from '../../../src/transforms/BaseTransformer.js';

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
  it('passes the supplied instance to a registered transformer', async () => {
    const config = await ConfigManager.create({ userConfig: false });
    const registry = await TransformerRegistry.createDefault({ config });

    // Storing the config on the registry is not enough: a transformer
    // constructed with no arguments falls through to the process-wide
    // singleton, so an operation's binary policy and transformation cache would
    // come from a different instance than its selection and formatting did.
    //
    // There are no default transformers any more — nothing in this release
    // converts content — so the guarantee is checked where third-party
    // transformers actually arrive.
    const transformer = new BaseTransformer();
    registry.register('third-party', transformer, { extensions: ['.xyz'] });

    expect(transformer.config).toBe(config);
  });

  it('keeps two registries with different configurations apart', async () => {
    const a = await ConfigManager.create({ userConfig: false });
    const b = await ConfigManager.create({ userConfig: false });

    const registryA = await TransformerRegistry.createDefault({ config: a });
    const registryB = await TransformerRegistry.createDefault({ config: b });

    const first = new BaseTransformer();
    const second = new BaseTransformer();
    registryA.register('t', first);
    registryB.register('t', second);

    expect(first.config).toBe(a);
    expect(second.config).toBe(b);
    expect(first.config).not.toBe(second.config);
  });

  it('leaves a transformer that brought its own configuration alone', async () => {
    const mine = await ConfigManager.create({ userConfig: false });
    const registryConfig = await ConfigManager.create({ userConfig: false });
    const registry = await TransformerRegistry.createDefault({ config: registryConfig });

    const transformer = new BaseTransformer({ config: mine });
    registry.register('explicit', transformer);

    // An explicit choice outranks the registry's. Overwriting it would make a
    // transformer's own configuration depend on which registry it was handed
    // to, which is the opposite of what passing one means.
    expect(transformer.config).toBe(mine);
  });

  it('re-derives what the constructor read from the old configuration', async () => {
    const registryConfig = await ConfigManager.create({ userConfig: false });
    registryConfig.set('cache.transformations.enabled', true);
    registryConfig.set('cache.transformations.ttl', 4242);

    const registry = await TransformerRegistry.createDefault({ config: registryConfig });
    const transformer = new BaseTransformer();

    // Settled at construction from whatever configuration was in scope then.
    expect(transformer.cacheTTL).not.toBe(4242);

    registry.register('adopting', transformer);

    // Reassigning `config` alone would leave the transformer reading its
    // settings from the new instance and its cache policy from the old.
    expect(transformer.config).toBe(registryConfig);
    expect(transformer.cacheEnabled).toBe(true);
    expect(transformer.cacheTTL).toBe(4242);
  });

  it('does not adopt over an explicit cache option', async () => {
    const registryConfig = await ConfigManager.create({ userConfig: false });
    registryConfig.set('cache.transformations.enabled', true);

    const registry = await TransformerRegistry.createDefault({ config: registryConfig });
    const transformer = new BaseTransformer({ noCache: true });
    registry.register('no-cache', transformer);

    expect(transformer.cacheEnabled).toBe(false);
  });

  it('runs a registry the caller built, which is the whole extension point', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { copy } = await import('../../../src/index.js');
    const { default: BaseTransformer } = await import('../../../src/transforms/BaseTransformer.js');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-registry-'));
    fs.writeFileSync(path.join(root, 'doc.rst'), 'title\n');

    try {
      const config = await ConfigManager.create({ userConfig: false });
      const registry = new TransformerRegistry();

      class Upper extends BaseTransformer {
        async doTransform(file) {
          return { ...file, content: file.content.toUpperCase(), transformed: true };
        }
      }

      registry.register('upper', new Upper(), { extensions: ['.rst'] });

      // Without an injection point the option documented as "a transformer you
      // registered through `copytree/experimental`" described a route that was
      // not connected to anything: `scan()` always built its own registry, and
      // that registry is deliberately empty.
      const result = await copy(root, {
        config,
        transform: true,
        registry,
        transformers: { upper: { enabled: true } },
      });

      expect(result.output).toContain('TITLE');
      expect(result.stats.degradations).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('tolerates a transformer that is not a BaseTransformer', async () => {
    const registryConfig = await ConfigManager.create({ userConfig: false });
    const registry = await TransformerRegistry.createDefault({ config: registryConfig });

    // A plain object with a `transform` method is a legitimate transformer.
    // Assigning onto it blindly would have thrown for a getter-only `config`.
    const plain = { transform: (file) => file };

    expect(() => registry.register('plain', plain)).not.toThrow();
  });
});
