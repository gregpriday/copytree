/**
 * Every script referenced from `package.json` must still work.
 *
 * `scripts/profile.js` invoked `--profile <type>`, `--profile-dir` and
 * `--stream` for months after profiling moved under `copytree debug profile`.
 * It kept working, because the deprecation shims kept it working, so nothing
 * failed and nobody noticed — it just printed three warnings and taught
 * obsolete usage to anyone who read it.
 *
 * A script nothing exercises is a script that is wrong and does not know it.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

/**
 * Run a node script, returning its combined output.
 * @param {string[]} args - Node arguments
 * @param {Object} [options={}] - Spawn options
 * @returns {{ok: boolean, output: string}} Outcome
 */
function run(args, options = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(process.execPath, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
        ...options,
      }),
    };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}` };
  }
}

describe('scripts referenced from package.json', () => {
  it('all exist on disk', () => {
    const missing = [];

    for (const command of Object.values(pkg.scripts)) {
      for (const match of command.matchAll(/(?:node\s+)(scripts\/[\w.-]+\.js)/g)) {
        if (!fs.existsSync(path.join(repoRoot, match[1]))) missing.push(match[1]);
      }
    }

    expect(missing).toEqual([]);
  });

  it('generate-cli-docs reports drift rather than silently passing', () => {
    const result = run([path.join(repoRoot, 'scripts/generate-cli-docs.js'), '--check']);

    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/up to date/);
  });

  it('check-docs-links resolves every local link', () => {
    const result = run([path.join(repoRoot, 'scripts/check-docs-links.js')]);

    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/All local documentation links resolve/);
  });

  it('profile.js drives the current CLI without deprecation warnings', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-profile-'));

    try {
      const result = run([
        path.join(repoRoot, 'scripts/profile.js'),
        '--type',
        'cpu',
        '--output-dir',
        outputDir,
      ]);

      expect(result.ok).toBe(true);
      // The point of the test: a wrapper that only works through the
      // deprecation shims is a wrapper that breaks when they are removed.
      expect(result.output).not.toMatch(/deprecated/i);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }, 120_000);
});
