import fs from 'fs-extra';
import path from 'path';
import { walkWithIgnore } from '../../../src/utils/ignoreWalker.js';
import { walkParallel } from '../../../src/utils/parallelWalker.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

/**
 * Collect every path a walker yields, relative to the root, POSIX-style.
 * @param {AsyncIterable} walker - Walker to drain
 * @param {string} root - Traversal root
 * @returns {Promise<string[]>} Sorted relative paths
 */
async function collect(walker, root) {
  const out = [];
  for await (const entry of walker) {
    out.push(path.relative(root, entry.path).split(path.sep).join('/'));
  }
  return out.sort();
}

/**
 * Run both walkers over the same tree with the same options.
 * @param {string} root - Traversal root
 * @param {Object} options - Walk options
 * @returns {Promise<{sequential: string[], parallel: string[]}>} Both results
 */
async function walkBoth(root, options) {
  return {
    sequential: await collect(walkWithIgnore(root, options), root),
    parallel: await collect(walkParallel(root, options), root),
  };
}

const FOLLOW = { followSymlinks: true, ignoreFileNames: ['.gitignore'] };

describe('symlink sandbox', () => {
  // Following symlinks means the set of files CopyTree can read is no longer
  // bounded by the directory the user chose. A link committed to a repository
  // is untrusted input, and `ln -s ~/.ssh keys` is a one-line exfiltration of a
  // private key into an AI context unless containment is enforced.
  describe('containment', () => {
    test('does not follow a symlink to a file outside the root', async () => {
      await withTempDir('symlink-escape-file', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        const outside = path.join(tmpDir, 'outside');
        await fs.ensureDir(root);
        await fs.ensureDir(outside);
        await fs.writeFile(path.join(root, 'own.txt'), 'mine');
        await fs.writeFile(path.join(outside, 'secret.txt'), 'PRIVATE KEY MATERIAL');
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'leak.txt'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toEqual(['own.txt']);
        expect(parallel).toEqual(['own.txt']);
      });
    });

    test('does not follow a symlink to a directory outside the root', async () => {
      await withTempDir('symlink-escape-dir', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        const outside = path.join(tmpDir, 'outside');
        await fs.ensureDir(root);
        await fs.ensureDir(path.join(outside, 'nested'));
        await fs.writeFile(path.join(root, 'own.txt'), 'mine');
        await fs.writeFile(path.join(outside, 'nested', 'secret.txt'), 'PRIVATE');
        await fs.symlink(outside, path.join(root, 'escape'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toEqual(['own.txt']);
        expect(parallel).toEqual(['own.txt']);
      });
    });

    test('still follows links that stay inside the root', async () => {
      await withTempDir('symlink-internal', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        await fs.ensureDir(path.join(root, 'real'));
        await fs.writeFile(path.join(root, 'real', 'a.txt'), 'a');
        await fs.symlink(path.join(root, 'real'), path.join(root, 'alias'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toContain('real/a.txt');
        expect(sequential).toContain('alias/a.txt');
        expect(parallel).toContain('real/a.txt');
        expect(parallel).toContain('alias/a.txt');
      });
    });

    test('works when the root itself is reached through a symlink', async () => {
      // Containment compares against the *real* root. Comparing against the
      // path as given would reject every file in a repository opened through
      // a symlinked path, which is a normal way to arrive at one.
      await withTempDir('symlink-root', async (tmpDir) => {
        const realRoot = path.join(tmpDir, 'actual');
        const linkedRoot = path.join(tmpDir, 'linked');
        await fs.ensureDir(path.join(realRoot, 'src'));
        await fs.writeFile(path.join(realRoot, 'src', 'a.txt'), 'a');
        await fs.symlink(path.join(realRoot, 'src'), path.join(realRoot, 'alias'));
        await fs.symlink(realRoot, linkedRoot);

        const { sequential, parallel } = await walkBoth(linkedRoot, FOLLOW);

        expect(sequential).toContain('alias/a.txt');
        expect(parallel).toContain('alias/a.txt');
      });
    });

    test('skips a broken symlink without failing the walk', async () => {
      await withTempDir('symlink-broken', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        await fs.ensureDir(root);
        await fs.writeFile(path.join(root, 'ok.txt'), 'ok');
        await fs.symlink(path.join(root, 'does-not-exist'), path.join(root, 'dangling'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toEqual(['ok.txt']);
        expect(parallel).toEqual(['ok.txt']);
      });
    });
  });

  describe('cycles', () => {
    // Each of these recurses without bound if identity is not tracked. The
    // assertion that matters is that the walk terminates at all.
    test('terminates on a symlink pointing at its own parent', async () => {
      await withTempDir('symlink-parent-cycle', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        await fs.ensureDir(path.join(root, 'child'));
        await fs.writeFile(path.join(root, 'child', 'a.txt'), 'a');
        await fs.symlink(root, path.join(root, 'child', 'up'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toContain('child/a.txt');
        expect(parallel).toContain('child/a.txt');
      });
    });

    test('terminates on a two-directory cycle', async () => {
      await withTempDir('symlink-two-cycle', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        await fs.ensureDir(path.join(root, 'a'));
        await fs.ensureDir(path.join(root, 'b'));
        await fs.writeFile(path.join(root, 'a', 'a.txt'), 'a');
        await fs.writeFile(path.join(root, 'b', 'b.txt'), 'b');
        await fs.symlink(path.join(root, 'b'), path.join(root, 'a', 'to-b'));
        await fs.symlink(path.join(root, 'a'), path.join(root, 'b', 'to-a'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toContain('a/a.txt');
        expect(sequential).toContain('b/b.txt');
        expect(parallel).toContain('a/a.txt');
        expect(parallel).toContain('b/b.txt');
      });
    });

    test('terminates on a self-referential symlink', async () => {
      await withTempDir('symlink-self', async (tmpDir) => {
        const root = path.join(tmpDir, 'repo');
        await fs.ensureDir(root);
        await fs.writeFile(path.join(root, 'ok.txt'), 'ok');
        await fs.symlink(path.join(root, 'loop'), path.join(root, 'loop'));

        const { sequential, parallel } = await walkBoth(root, FOLLOW);

        expect(sequential).toEqual(['ok.txt']);
        expect(parallel).toEqual(['ok.txt']);
      });
    });
  });

  // `always` overrides ignore rules and the size gate. It does not override the
  // root boundary, which is a security limit rather than a convenience filter.
  // Force include reaches the filesystem through fast-glob, which follows
  // symlinks by default, so it was the one path into the tree that ignored the
  // traversal setting entirely.
  describe('force include', () => {
    /**
     * Build a repository with a link pointing at a file outside it.
     * @param {string} tmpDir - Containing directory
     * @returns {Promise<string>} The repository root
     */
    async function repoWithEscapingLink(tmpDir) {
      const root = path.join(tmpDir, 'repo');
      const outside = path.join(tmpDir, 'outside');
      await fs.ensureDir(root);
      await fs.ensureDir(outside);
      await fs.writeFile(path.join(root, 'own.txt'), 'mine');
      await fs.writeFile(path.join(outside, 'secret.txt'), 'PRIVATE KEY MATERIAL');
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'leak.txt'));
      return root;
    }

    test('does not pull an external file in through a symlink by default', async () => {
      await withTempDir('force-include-default', async (tmpDir) => {
        const root = await repoWithEscapingLink(tmpDir);
        const { default: FileDiscoveryStage } =
          await import('../../../src/pipeline/stages/FileDiscoveryStage.js');

        const stage = new FileDiscoveryStage({ basePath: root, forceInclude: ['**/*.txt'] });
        const result = await stage.process({ options: {} });

        expect(result.files.map((f) => f.path).sort()).toEqual(['own.txt']);
      });
    });

    test('still refuses an escaping link when following is enabled', async () => {
      await withTempDir('force-include-following', async (tmpDir) => {
        const root = await repoWithEscapingLink(tmpDir);
        const { default: FileDiscoveryStage } =
          await import('../../../src/pipeline/stages/FileDiscoveryStage.js');

        const stage = new FileDiscoveryStage({
          basePath: root,
          forceInclude: ['**/*.txt'],
          followSymlinks: true,
        });
        const result = await stage.process({ options: {} });

        expect(result.files.map((f) => f.path)).not.toContain('leak.txt');
      });
    });
  });

  test('skips symlinks entirely when following is off, which is the default', async () => {
    await withTempDir('symlink-default-off', async (tmpDir) => {
      const root = path.join(tmpDir, 'repo');
      const outside = path.join(tmpDir, 'outside');
      await fs.ensureDir(root);
      await fs.ensureDir(outside);
      await fs.writeFile(path.join(root, 'own.txt'), 'mine');
      await fs.writeFile(path.join(outside, 'secret.txt'), 'PRIVATE');
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'leak.txt'));

      const options = { ignoreFileNames: ['.gitignore'] };
      const { sequential, parallel } = await walkBoth(root, options);

      expect(sequential).toEqual(['own.txt']);
      expect(parallel).toEqual(['own.txt']);
    });
  });
});
