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
    expect(readRepoFile('types/advanced.d.ts')).not.toMatch(/@version\s+\d+\.\d+\.\d+/);
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

  test('the changelog documents the current version', () => {
    const changelog = readRepoFile('CHANGELOG.md');
    expect(changelog).toContain(packageVersion);
  });
});
