import fs from 'fs-extra';
import path from 'path';
import { resolveScope } from '../../../src/utils/scopeResolver.js';
import { ERROR_CODES } from '../../../src/utils/errors.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

/**
 * Build a small tree, including a directory whose name is full of glob
 * metacharacters. `scope` takes literal paths, so this must Just Work.
 */
async function buildTree(root) {
  await fs.outputFile(path.join(root, 'package.json'), '{}');
  await fs.outputFile(path.join(root, 'src/index.js'), 'export {};');
  await fs.outputFile(path.join(root, 'src/panels/pane.js'), 'export {};');
  await fs.outputFile(path.join(root, 'src/[draft]/note.md'), '# draft');
  await fs.outputFile(path.join(root, 'src/a b {c}/file.txt'), 'spaces');
}

describe('resolveScope', () => {
  it('returns an empty list for empty input', async () => {
    await withTempDir('scope-empty', async (root) => {
      expect(await resolveScope(root, [])).toEqual([]);
      expect(await resolveScope(root, null)).toEqual([]);
      expect(await resolveScope(root, undefined)).toEqual([]);
    });
  });

  it('accepts a bare string as a single entry', async () => {
    await withTempDir('scope-string', async (root) => {
      await buildTree(root);
      const entries = await resolveScope(root, 'src');
      expect(entries).toHaveLength(1);
      expect(entries[0].relativePath).toBe('src');
      expect(entries[0].isDirectory).toBe(true);
    });
  });

  it('resolves both files and directories', async () => {
    await withTempDir('scope-mixed', async (root) => {
      await buildTree(root);
      const entries = await resolveScope(root, ['package.json', 'src/panels']);

      expect(entries.map((e) => e.relativePath)).toEqual(['package.json', 'src/panels']);
      expect(entries.map((e) => e.isDirectory)).toEqual([false, true]);
    });
  });

  it('treats paths literally, not as globs', async () => {
    await withTempDir('scope-literal', async (root) => {
      await buildTree(root);

      // `[draft]` would be a character class to a glob engine, and `{c}` a brace
      // expansion. There is nothing here for the caller to escape.
      const entries = await resolveScope(root, ['src/[draft]', 'src/a b {c}']);

      expect(entries.map((e) => e.relativePath)).toEqual(['src/[draft]', 'src/a b {c}']);
      expect(entries.every((e) => e.isDirectory)).toBe(true);
    });
  });

  it('accepts absolute paths inside the root', async () => {
    await withTempDir('scope-abs', async (root) => {
      await buildTree(root);
      const entries = await resolveScope(root, [path.join(root, 'src')]);
      expect(entries[0].relativePath).toBe('src');
    });
  });

  it('emits POSIX relative paths', async () => {
    await withTempDir('scope-posix', async (root) => {
      await buildTree(root);
      const [entry] = await resolveScope(root, ['src/panels']);
      expect(entry.relativePath).toBe('src/panels');
      expect(entry.relativePath).not.toContain('\\');
    });
  });

  describe('deduplication', () => {
    it('drops duplicates', async () => {
      await withTempDir('scope-dupes', async (root) => {
        await buildTree(root);
        const entries = await resolveScope(root, ['src', 'src', './src']);
        expect(entries).toHaveLength(1);
      });
    });

    it('lets a parent subsume its children', async () => {
      await withTempDir('scope-subsume', async (root) => {
        await buildTree(root);
        const entries = await resolveScope(root, ['src/panels', 'src', 'src/index.js']);
        expect(entries.map((e) => e.relativePath)).toEqual(['src']);
      });
    });

    it('collapses to the root when the root itself is selected', async () => {
      await withTempDir('scope-root', async (root) => {
        await buildTree(root);
        const entries = await resolveScope(root, ['.', 'src', 'package.json']);
        expect(entries).toHaveLength(1);
        expect(entries[0].relativePath).toBe('');
      });
    });

    it('does not subsume a sibling with a shared prefix', async () => {
      await withTempDir('scope-prefix', async (root) => {
        await fs.outputFile(path.join(root, 'src/a.js'), '');
        await fs.outputFile(path.join(root, 'srcs/b.js'), '');

        const entries = await resolveScope(root, ['src', 'srcs']);
        expect(entries.map((e) => e.relativePath)).toEqual(['src', 'srcs']);
      });
    });
  });

  describe('errors', () => {
    it('rejects an entry outside the root with ERR_SCOPE_OUTSIDE_ROOT', async () => {
      await withTempDir('scope-outside', async (root) => {
        await buildTree(root);

        // An empty result would be indistinguishable from "everything there is
        // gitignored", so this is loud on purpose.
        await expect(resolveScope(root, ['../elsewhere'])).rejects.toMatchObject({
          name: 'ScopeError',
          code: ERROR_CODES.SCOPE_OUTSIDE_ROOT,
          scopePath: '../elsewhere',
        });
      });
    });

    it('rejects an absolute path outside the root', async () => {
      await withTempDir('scope-abs-outside', async (root) => {
        await buildTree(root);
        await expect(resolveScope(root, ['/etc'])).rejects.toMatchObject({
          code: ERROR_CODES.SCOPE_OUTSIDE_ROOT,
        });
      });
    });

    it('rejects a missing entry with ERR_PATH_NOT_FOUND', async () => {
      await withTempDir('scope-missing', async (root) => {
        await buildTree(root);
        await expect(resolveScope(root, ['src/nope'])).rejects.toMatchObject({
          name: 'ScopeError',
          code: ERROR_CODES.PATH_NOT_FOUND,
        });
      });
    });

    it('rejects a symlink when symlinks are not being followed', async () => {
      await withTempDir('scope-symlink', async (root) => {
        await buildTree(root);
        const outside = path.join(root, '..', `outside-${path.basename(root)}`);
        await fs.outputFile(path.join(outside, 'private.txt'), 'secret');

        try {
          await fs.symlink(outside, path.join(root, 'link'));
        } catch {
          return; // symlinks unsupported on this platform
        }

        await expect(resolveScope(root, ['link'])).rejects.toMatchObject({
          code: ERROR_CODES.SCOPE_OUTSIDE_ROOT,
        });

        await fs.remove(outside);
      });
    });

    it('rejects a symlink that escapes the root even when following symlinks', async () => {
      await withTempDir('scope-symlink-escape', async (root) => {
        await buildTree(root);
        const outside = path.join(root, '..', `outside-${path.basename(root)}`);
        await fs.outputFile(path.join(outside, 'private.txt'), 'secret');

        try {
          await fs.symlink(outside, path.join(root, 'link'));
        } catch {
          return;
        }

        // Lexically `root/link` is inside the root. It is not, in fact — which
        // is why containment is checked against the resolved location.
        await expect(resolveScope(root, ['link'], { followSymlinks: true })).rejects.toMatchObject({
          code: ERROR_CODES.SCOPE_OUTSIDE_ROOT,
        });

        await fs.remove(outside);
      });
    });

    it('accepts a symlink that stays inside the root when following symlinks', async () => {
      await withTempDir('scope-symlink-inside', async (root) => {
        await buildTree(root);

        try {
          await fs.symlink(path.join(root, 'src', 'panels'), path.join(root, 'alias'));
        } catch {
          return;
        }

        const entries = await resolveScope(root, ['alias'], { followSymlinks: true });
        expect(entries).toHaveLength(1);
        expect(entries[0].isDirectory).toBe(true);
      });
    });

    it('rejects a non-string entry', async () => {
      await withTempDir('scope-bad-type', async (root) => {
        await expect(resolveScope(root, [42])).rejects.toMatchObject({
          code: ERROR_CODES.INVALID_OPTION,
        });
        await expect(resolveScope(root, ['   '])).rejects.toMatchObject({
          code: ERROR_CODES.INVALID_OPTION,
        });
      });
    });
  });
});
