import fs from 'fs-extra';
import path from 'path';
import Pipeline from '../../../src/pipeline/Pipeline.js';
import Stage from '../../../src/pipeline/Stage.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

/**
 * A stage that always throws.
 */
class ExplodingStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.fatal = options.fatal === true;
  }

  async process() {
    throw new Error('stage exploded');
  }
}

/**
 * A stage that records that it ran.
 */
class MarkerStage extends Stage {
  async process(input) {
    return { ...input, reachedMarker: true };
  }
}

describe('fatal versus recoverable stages', () => {
  // `continueOnError: true` is set by every production pipeline. It is the right
  // behaviour for a stage whose absence only costs polish, and the wrong
  // behaviour for one whose absence changes what gets emitted: a skipped
  // secrets guard produces unredacted output with a success exit code.

  test('a non-fatal failure is recovered from under continueOnError', async () => {
    const pipeline = new Pipeline({ continueOnError: true });
    pipeline.through([new ExplodingStage(), new MarkerStage()]);

    const result = await pipeline.process({ files: [] });

    expect(result.reachedMarker).toBe(true);
    expect(pipeline.stats.stagesFailed).toBe(1);
  });

  test('a fatal failure propagates even under continueOnError', async () => {
    const pipeline = new Pipeline({ continueOnError: true });
    pipeline.through([new ExplodingStage({ fatal: true }), new MarkerStage()]);

    await expect(pipeline.process({ files: [] })).rejects.toThrow('stage exploded');
  });

  test('the stages that decide what gets emitted are marked fatal', async () => {
    // Named individually rather than asserted structurally: this list is the
    // policy, and adding a stage to it should be a deliberate edit here too.
    const [
      { default: FileDiscoveryStage },
      { default: FileLoadingStage },
      { default: SecretsGuardStage },
      { default: OutputFormattingStage },
      { default: SortFilesStage },
    ] = await Promise.all([
      import('../../../src/pipeline/stages/FileDiscoveryStage.js'),
      import('../../../src/pipeline/stages/FileLoadingStage.js'),
      import('../../../src/pipeline/stages/SecretsGuardStage.js'),
      import('../../../src/pipeline/stages/OutputFormattingStage.js'),
      import('../../../src/pipeline/stages/SortFilesStage.js'),
    ]);

    expect(new FileDiscoveryStage({ basePath: '/tmp' }).fatal).toBe(true);
    expect(new FileLoadingStage().fatal).toBe(true);
    expect(new SecretsGuardStage().fatal).toBe(true);
    expect(new OutputFormattingStage().fatal).toBe(true);

    // Sorting can degrade to unsorted output without misrepresenting anything.
    expect(new SortFilesStage({ sortBy: 'path' }).fatal).toBe(false);
  });

  test('output formatting does not answer a failure with a different format', async () => {
    const { default: OutputFormattingStage } =
      await import('../../../src/pipeline/stages/OutputFormattingStage.js');

    const stage = new OutputFormattingStage({ format: 'xml' });

    // Returning a JSON blob of raw file objects would be a success-looking
    // response in a format the caller did not ask for.
    await expect(stage.handleError(new Error('formatter blew up'), { files: [] })).rejects.toThrow(
      'formatter blew up',
    );
  });
});

describe('ConfigManager.reload', () => {
  // reload() cleared `config` but left `_initialized` true, so
  // loadConfiguration() returned immediately and the instance was emptied
  // rather than reloaded. Every subsequent `get()` fell through to its default.

  test('picks up a changed user configuration file', async () => {
    await withTempDir('config-reload', async (tmpDir) => {
      const userConfigPath = path.join(tmpDir, '.copytree');
      await fs.ensureDir(userConfigPath);
      await fs.writeJson(path.join(userConfigPath, 'copytree.json'), { maxFileCount: 11 });

      const config = await ConfigManager.create({ userConfigPath });
      expect(config.get('copytree.maxFileCount')).toBe(11);

      await fs.writeJson(path.join(userConfigPath, 'copytree.json'), { maxFileCount: 22 });
      await config.reload();

      expect(config.get('copytree.maxFileCount')).toBe(22);
    });
  });

  test('leaves the package defaults intact after a reload', async () => {
    await withTempDir('config-reload-defaults', async (tmpDir) => {
      const config = await ConfigManager.create({
        userConfigPath: path.join(tmpDir, 'missing'),
      });
      const before = config.get('copytree.globalExcludedDirectories');

      await config.reload();

      expect(config.get('copytree.globalExcludedDirectories')).toEqual(before);
      expect(config.defaultsLoaded).toBe(true);
    });
  });

  test('reports userConfigLoaded false when the directory exists but is empty', async () => {
    // The flag was set as soon as the directory existed, before reading a file,
    // so an empty ~/.copytree reported that user configuration had loaded.
    await withTempDir('config-empty-userdir', async (tmpDir) => {
      const userConfigPath = path.join(tmpDir, '.copytree');
      await fs.ensureDir(userConfigPath);

      const config = await ConfigManager.create({ userConfigPath });

      expect(config.userConfigLoaded).toBe(false);
    });
  });
});
