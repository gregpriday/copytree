import fs from 'fs-extra';
import path from 'path';
import FileDiscoveryStage from '../../../../src/pipeline/stages/FileDiscoveryStage.js';
import { withTempDir } from '../../../helpers/tempfs.js';
import { EXCLUSION_REASONS } from '../../../../src/utils/exclusionReport.js';

/**
 * Run discovery with the given force-includes.
 * @param {string} root - Project root
 * @param {Object} options - Stage options
 * @returns {Promise<Object>} The stage output
 */
async function discover(root, options) {
  const stage = new FileDiscoveryStage({ basePath: root, ...options });
  return stage.process({ options: {} });
}

/** Every force-included file here sits in a directory the ignore rules prune. */
async function ignoreDirectory(root, name) {
  await fs.outputFile(path.join(root, '.copytreeignore'), `${name}/\n`);
}

// Force-includes reach the filesystem through their own glob rather than the
// walkers, so each of these is a place where that glob and the walkers could
// disagree.
describe('FileDiscoveryStage force-include globbing (real)', () => {
  test('expands a numeric brace range, keeping its zero padding', async () => {
    await withTempDir('force-include-range', async (root) => {
      await ignoreDirectory(root, 'logs');
      for (const n of ['01', '02', '03', '04']) {
        await fs.outputFile(path.join(root, 'logs', `run${n}.txt`), n);
      }

      const result = await discover(root, { forceInclude: ['logs/run{01..03}.txt'] });

      expect(result.files.map((f) => f.path).sort()).toEqual([
        'logs/run01.txt',
        'logs/run02.txt',
        'logs/run03.txt',
      ]);
    });
  });

  test('expands a range wider than one digit', async () => {
    await withTempDir('force-include-wide-range', async (root) => {
      await ignoreDirectory(root, 'logs');
      for (const n of [1, 2, 10, 20, 21]) {
        await fs.outputFile(path.join(root, 'logs', `run${n}.txt`), String(n));
      }

      const result = await discover(root, { forceInclude: ['logs/run{1..20}.txt'] });

      expect(result.files.map((f) => f.path).sort()).toEqual([
        'logs/run1.txt',
        'logs/run10.txt',
        'logs/run2.txt',
        'logs/run20.txt',
      ]);
    });
  });

  test('expands a range that follows a literal brace group', async () => {
    await withTempDir('force-include-literal-group', async (root) => {
      await ignoreDirectory(root, 'logs');
      for (const n of [1, 2, 3, 4]) {
        await fs.outputFile(path.join(root, 'logs', '{foo}', `run${n}.txt`), String(n));
      }

      const result = await discover(root, { forceInclude: ['logs/{foo}/run{1..3}.txt'] });

      expect(result.files.map((f) => f.path).sort()).toEqual([
        'logs/{foo}/run1.txt',
        'logs/{foo}/run2.txt',
        'logs/{foo}/run3.txt',
      ]);
    });
  });

  test('leaves escaped braces literal', async () => {
    await withTempDir('force-include-escaped', async (root) => {
      await ignoreDirectory(root, 'logs');
      for (const name of ['run{1,2}.txt', 'run.txt', 'runn.txt', 'run1.txt']) {
        await fs.outputFile(path.join(root, 'logs', name), name);
      }

      const result = await discover(root, { forceInclude: ['logs/run\\{1,2\\}.txt'] });

      expect(result.files.map((f) => f.path)).toEqual(['logs/run{1,2}.txt']);
    });
  });

  test('refuses a range too large to spell out', async () => {
    await withTempDir('force-include-huge-range', async (root) => {
      await fs.outputFile(path.join(root, 'a.txt'), 'a');

      await expect(discover(root, { forceInclude: ['run{1..100000}.txt'] })).rejects.toThrow(
        /has 100000 values; the limit is 1000/,
      );
    });
  });

  test('does not read through a directory link the glob starts from', async () => {
    await withTempDir('force-include-link-base', async (tmpDir) => {
      const root = path.join(tmpDir, 'repo');
      await fs.outputFile(path.join(root, 'own.txt'), 'mine');
      await fs.outputFile(path.join(tmpDir, 'outside', 'secret.txt'), 'PRIVATE KEY MATERIAL');
      await fs.symlink(path.join(tmpDir, 'outside'), path.join(root, 'keys'), 'dir');

      const result = await discover(root, { forceInclude: ['keys/*.txt', 'keys/secret.txt'] });

      expect(result.files.map((f) => f.path)).toEqual(['own.txt']);
    });
  });

  test('does not follow a linked directory the pattern names, unless asked to', async () => {
    await withTempDir('force-include-linked-dir', async (tmpDir) => {
      const root = path.join(tmpDir, 'repo');
      await fs.outputFile(path.join(root, 'real', 'a.txt'), 'a');
      await fs.symlink(path.join(root, 'real'), path.join(root, 'linked'), 'dir');

      const notFollowing = await discover(root, { forceInclude: ['linked/**'] });
      const following = await discover(root, {
        forceInclude: ['linked/**'],
        followSymlinks: true,
      });

      expect(notFollowing.files.map((f) => f.path)).toEqual(['real/a.txt']);
      expect(following.files.map((f) => f.path)).toContain('linked/a.txt');
    });
  });

  const canRevokeRead = process.platform !== 'win32' && process.getuid?.() !== 0;

  (canRevokeRead ? test : test.skip)(
    'reports a directory it cannot read, and still completes',
    async () => {
      await withTempDir('force-include-unreadable', async (root) => {
        await ignoreDirectory(root, 'locked');
        await fs.outputFile(path.join(root, 'locked', 'a.txt'), 'a');
        await fs.outputFile(path.join(root, 'open.txt'), 'b');
        await fs.chmod(path.join(root, 'locked'), 0o000);

        try {
          const result = await discover(root, { forceInclude: ['locked/*.txt'] });

          expect(result.files.map((f) => f.path)).toEqual(['open.txt']);
          expect(result.exclusionReport.byReason[EXCLUSION_REASONS.UNREADABLE]).toBe(1);
        } finally {
          await fs.chmod(path.join(root, 'locked'), 0o755);
        }
      });
    },
  );
});
