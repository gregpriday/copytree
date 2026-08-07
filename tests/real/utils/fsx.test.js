import fse from 'fs-extra';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fsx from '../../../src/utils/fsx.js';

/**
 * `fsx.js` replaced `fs-extra` across the source, so its contract is "same
 * behaviour as fs-extra" for the calls CopyTree makes. Assertions compare
 * against `fs-extra` directly — it is still installed as a dev dependency
 * precisely so this comparison can exist.
 *
 * The cases here are the ones where a naive reimplementation diverges: broken
 * symlinks (does `pathExists` follow the link?), the JSON helpers' trailing
 * newline, and the idempotence of `ensureDir`/`remove` that callers rely on.
 */
describe('fsx', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-fsx-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('pathExists', () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(dir, 'real.txt'), 'x');
      fs.mkdirSync(path.join(dir, 'subdir'));
      fs.symlinkSync(path.join(dir, 'real.txt'), path.join(dir, 'good-link'));
      fs.symlinkSync(path.join(dir, 'nothing-here'), path.join(dir, 'broken-link'));
    });

    it.each(['real.txt', 'subdir', 'good-link', 'broken-link', 'missing'])(
      'agrees with fs-extra for %s',
      async (name) => {
        const target = path.join(dir, name);
        expect(await fsx.pathExists(target)).toBe(await fse.pathExists(target));
      },
    );

    it('reports a broken symlink as absent, following the link like fs-extra', async () => {
      // Stated explicitly because the alternative — `lstat` — would call a
      // dangling link "present" and hand a later read an ENOENT instead.
      expect(await fsx.pathExists(path.join(dir, 'broken-link'))).toBe(false);
    });
  });

  describe('JSON helpers', () => {
    it.each([[{ spaces: 2 }], [{}], [undefined]])(
      'writes byte-identical output to fs-extra with %p',
      async (options) => {
        const value = { a: 1, b: ['x', null], c: { d: true } };
        const mine = path.join(dir, 'mine.json');
        const theirs = path.join(dir, 'theirs.json');

        await fsx.writeJson(mine, value, options);
        await fse.writeJson(theirs, value, options);

        expect(fs.readFileSync(mine, 'utf8')).toBe(fs.readFileSync(theirs, 'utf8'));
      },
    );

    it('round-trips through readJson and readJsonSync', async () => {
      const value = { nested: { list: [1, 2, 3] } };
      const target = path.join(dir, 'round.json');

      await fsx.writeJson(target, value, { spaces: 2 });

      expect(await fsx.readJson(target)).toEqual(value);
      expect(fsx.readJsonSync(target)).toEqual(value);
    });
  });

  describe('ensureDir and remove', () => {
    it('creates missing parents', async () => {
      const deep = path.join(dir, 'a', 'b', 'c');
      await fsx.ensureDir(deep);
      expect(fs.statSync(deep).isDirectory()).toBe(true);
    });

    it('is idempotent, like fs-extra', async () => {
      const target = path.join(dir, 'twice');
      await fsx.ensureDir(target);
      await expect(fsx.ensureDir(target)).resolves.not.toThrow();
      fsx.ensureDirSync(target);
    });

    it('removes a tree, and succeeds when it is already gone', async () => {
      const tree = path.join(dir, 'tree', 'deep');
      await fsx.ensureDir(tree);
      fs.writeFileSync(path.join(tree, 'f.txt'), 'x');

      await fsx.remove(path.join(dir, 'tree'));
      expect(fs.existsSync(path.join(dir, 'tree'))).toBe(false);

      // The property callers depend on: deleting nothing is not an error.
      await expect(fsx.remove(path.join(dir, 'tree'))).resolves.not.toThrow();
      expect(() => fsx.removeSync(path.join(dir, 'tree'))).not.toThrow();
    });
  });

  describe('descriptor API', () => {
    it('resolves a numeric descriptor, as fs-extra does, not a FileHandle', async () => {
      // `node:fs/promises` open() resolves a FileHandle. Callers here pass the
      // result straight to read() and close(), so the numeric form is the
      // contract.
      const target = path.join(dir, 'bytes.bin');
      fs.writeFileSync(target, Buffer.from([1, 2, 3, 4]));

      const fd = await fsx.open(target, 'r');
      expect(typeof fd).toBe('number');

      const buffer = Buffer.alloc(4);
      const { bytesRead } = await fsx.read(fd, buffer, 0, 4, 0);
      await fsx.close(fd);

      expect(bytesRead).toBe(4);
      expect([...buffer]).toEqual([1, 2, 3, 4]);
    });
  });

  describe('surface', () => {
    it('exports every member the source uses', () => {
      // A missing member fails at the call site, at runtime, on whichever code
      // path happened to reach it — which may be a rare one.
      for (const name of [
        'close',
        'createReadStream',
        'createWriteStream',
        'ensureDir',
        'ensureDirSync',
        'existsSync',
        'lstat',
        'open',
        'pathExists',
        'read',
        'readdir',
        'readdirSync',
        'readFile',
        'readJson',
        'readJsonSync',
        'realpath',
        'realpathSync',
        'remove',
        'removeSync',
        'rmSync',
        'stat',
        'statSync',
        'writeFile',
        'writeJson',
      ]) {
        expect(typeof fsx[name]).toBe('function');
      }
      expect(typeof fsx.Stats).toBe('function');
      expect(typeof fsx.Dirent).toBe('function');
    });
  });
});
