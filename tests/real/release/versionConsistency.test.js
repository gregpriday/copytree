import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

jest.unmock('../../../src/utils/fsx.js');

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Read a repository file as text.
 * @param {string} relative - Path relative to the repository root
 * @returns {string} File contents
 */
function readRepoFile(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('version consistency', () => {
  // Versions live in several places and drift silently between them. This has
  // already happened: package.json said 0.14.2 while the app config fell back
  // to 0.13.1 and the type definitions claimed 0.14.0. Nothing failed, because
  // nothing checked.
  const packageVersion = fs.readJsonSync(path.join(REPO_ROOT, 'package.json')).version;

  test('package.json carries a valid semver version', () => {
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  test('the type definitions carry no version of their own', () => {
    // Stronger than checking that a hand-maintained `@version` matches: there
    // is no second copy to drift. The declarations describe a shape, and the
    // shape does not have a version — the package does.
    expect(readRepoFile('types/index.d.ts')).not.toMatch(/@version\s+\d+\.\d+\.\d+/);
    expect(readRepoFile('types/experimental.d.ts')).not.toMatch(/@version\s+\d+\.\d+\.\d+/);
  });

  test('the CLI reports the same version', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(REPO_ROOT, 'bin/copytree.js'), '--version'],
      { cwd: REPO_ROOT },
    );
    expect(stdout.trim()).toBe(packageVersion);
  });

  test('the CLI reports CopyTree version regardless of working directory', async () => {
    // The app config used to resolve package.json from process.cwd(), so
    // running CopyTree inside any other Node project reported that project's
    // version as CopyTree's.
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(REPO_ROOT, 'bin/copytree.js'), '--version'],
      { cwd: path.dirname(REPO_ROOT) },
    );
    expect(stdout.trim()).toBe(packageVersion);
  });

  test('the version module resolves the real version, not a hard-coded fallback', async () => {
    // Read from `src/version.js` rather than from `config/app.js`. The version
    // is not configuration — nothing read `app.version`, and a public key that
    // nothing reads is a promise the closed schema does not keep — so it is no
    // longer a config key at all.
    const { VERSION } = await import('../../../src/version.js');
    expect(VERSION).toBe(packageVersion);
  });

  test('the security support table matches the line being released', () => {
    // `SECURITY.md` deliberately describes the *published* line, which during
    // the release candidates is still `0.x`. It has to move to `1.x` in the
    // same commit that sets the version to `1.0.0` — a stable tag whose
    // security policy still points at `0.x` tells people to upgrade to a line
    // they are already past, and one that points at `1.x` before that release
    // exists sends them looking for something that does not.
    //
    // Neither is a mistake anyone would catch by reading, which is why it is
    // asserted here rather than left to the release checklist.
    const security = readRepoFile('SECURITY.md');
    const major = packageVersion.split('.')[0];
    const isPrerelease = packageVersion.includes('-');

    // The table is parsed, not scanned for a token. Matching `Latest N.x`
    // anywhere would pass a file listing two supported majors, a `Latest 9.x`
    // in a sentence, or a `Latest 1.x` row explicitly marked *unsupported* —
    // the support column was never read.
    const rows = [...security.matchAll(/^\|\s*(?!-+)([^|]+?)\s*\|\s*(:[a-z_]+:)\s*\|/gm)]
      .map(([, version, mark]) => ({ version, supported: mark === ':white_check_mark:' }))
      .filter(({ version }) => /\d/.test(version));

    expect(rows.length).toBeGreaterThan(1);

    const supported = rows.filter((row) => row.supported);

    // "Security updates are provided for the latest release only" — one row.
    expect(supported).toHaveLength(1);

    if (isPrerelease) {
      // A prerelease may keep describing the currently published stable line.
      expect(supported[0].version).toMatch(/^Latest \d+\.x$/);
      return;
    }

    expect(supported[0].version).toBe(`Latest ${major}.x`);
  });

  test('the changelog documents the current version', () => {
    const changelog = readRepoFile('CHANGELOG.md');
    expect(changelog).toContain(packageVersion);
  });
});
