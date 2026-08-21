/**
 * `copytree doctor` must not report a healthy fresh installation as broken.
 *
 * The writability check asked whether the *immediate parent* of a directory
 * could be written to. For `~/.copytree/cache` on a machine that has never run
 * CopyTree, the parent `~/.copytree` does not exist either — and writing a
 * probe file into a directory that does not exist always fails. So `doctor`
 * reported `fail: cache directory` and exited 3 for everyone who ran it
 * straight after `npm install -g copytree`.
 *
 * It went unnoticed on developer machines, which all have `~/.copytree` from
 * an earlier run, and surfaced on the first CI runner to execute the release
 * gate with a clean HOME. A check whose job is to tell you whether your
 * installation is sound is the last place a false alarm belongs.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';

jest.unmock('../../../src/utils/fsx.js');

const CLI = path.resolve(process.cwd(), 'bin/copytree.js');

/**
 * Run `doctor` with a HOME that has never seen CopyTree.
 *
 * @param {string} home - Directory to use as HOME
 * @returns {{status: number, checks: Array<{name: string, status: string, detail: string}>}} Result
 */
function doctorWithHome(home) {
  const result = spawnSync(process.execPath, [CLI, 'doctor', '--format', 'json'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      NO_COLOR: '1',
      // `os.homedir()` reads the password database and ignores `HOME` on macOS,
      // so setting `HOME` alone left the repository-cache check reporting the
      // developer's own clones — from a test whose whole subject is a machine
      // that has never run CopyTree.
      COPYTREE_REPO_CACHE_PATH: path.join(home, '.copytree', 'repos'),
    },
  });

  return { status: result.status, checks: JSON.parse(result.stdout).checks };
}

describe('doctor on a fresh installation', () => {
  let home;

  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'copytree-fresh-home-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('exits 0 when nothing is wrong but nothing has been created yet', () => {
    const { status, checks } = doctorWithHome(home);

    const failed = checks.filter((check) => check.status === 'fail');
    expect(failed).toEqual([]);
    expect(status).toBe(0);
  });

  it('says the cache directory will be created rather than calling it unwritable', () => {
    const { checks } = doctorWithHome(home);
    const cache = checks.find((check) => check.name === 'cache directory');

    expect(cache.status).toBe('pass');
    expect(cache.detail).toContain('will be created on first use');
  });

  it('still fails when the nearest existing ancestor really is unwritable', () => {
    // The check has to keep its teeth: an unwritable HOME is a genuine problem
    // and must not be smoothed over by walking further up the tree.
    if (process.getuid?.() === 0) return; // root can write anywhere

    const { status, checks } = doctorWithHome(path.join(home, 'nested'));
    expect(checks.some((check) => check.status === 'fail')).toBe(false);

    const readOnly = mkdtempSync(path.join(os.tmpdir(), 'copytree-ro-home-'));
    try {
      spawnSync('chmod', ['500', readOnly]);
      const result = doctorWithHome(readOnly);
      expect(result.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(result.status).toBe(3);
    } finally {
      spawnSync('chmod', ['700', readOnly]);
      rmSync(readOnly, { recursive: true, force: true });
    }

    expect(status).toBe(0);
  });
});
