/**
 * The CLI has two execution paths: the Ink UI (default) and a direct path used
 * for `-S/--stream` and `--profile`. They must select the same files and honour
 * the same flags.
 *
 * They used not to. The UI built its own pipeline that pushed bare stage classes
 * with no options, read `options.alwaysInclude` where the CLI sets
 * `options.always`, and ordered stages differently — so `--max-files`,
 * `--always`, `--sort` and the budgets were silently dropped unless you happened
 * to pass `-S`. Both paths now share one profile builder and one stage list.
 */

import path from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { runCli } from './_utils.js';

let PROJECT;

beforeAll(() => {
  PROJECT = mkdtempSync(path.join(tmpdir(), 'copytree-parity-'));

  mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  mkdirSync(path.join(PROJECT, 'docs'), { recursive: true });

  writeFileSync(path.join(PROJECT, '.gitignore'), 'secret.txt\n');
  writeFileSync(path.join(PROJECT, 'a-small.md'), '# a\n');
  writeFileSync(path.join(PROJECT, 'b-medium.js'), `// b\n${'x'.repeat(400)}\n`);
  writeFileSync(path.join(PROJECT, 'src/c-large.js'), `// c\n${'y'.repeat(4000)}\n`);
  writeFileSync(path.join(PROJECT, 'docs/d.md'), '# d\n');
  writeFileSync(path.join(PROJECT, 'secret.txt'), 'shh\n');
});

afterAll(() => {
  if (PROJECT) rmSync(PROJECT, { recursive: true, force: true });
});

/**
 * Extract the set of file paths from tree output, so the comparison is about
 * selection rather than incidental formatting.
 */
function selectedPaths(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.match(/[├└]── (.+?)(?: \([\d.]+ [A-Z]*B\))?$/))
    .filter(Boolean)
    .map((match) => match[1].trim())
    .filter((name) => !name.endsWith('/'))
    .sort();
}

/** Run the same arguments through both CLI paths. */
async function bothPaths(args) {
  const ui = await runCli([PROJECT, '--format', 'tree', '--display', ...args]);
  const direct = await runCli([PROJECT, '--format', 'tree', '--stream', ...args]);

  expect(ui.code).toBe(0);
  expect(direct.code).toBe(0);

  return { ui: selectedPaths(ui.stdout), direct: selectedPaths(direct.stdout) };
}

describe('CLI path parity', () => {
  test.each([
    ['no flags', []],
    ['--filter', ['--filter', '**/*.md']],
    ['--exclude', ['--exclude', 'src/**']],
    ['--always over gitignore', ['--always', 'secret.txt']],
    ['--max-files', ['--max-files', '2']],
    ['--max-files with --sort size', ['--max-files', '2', '--sort', 'size']],
    ['--max-total-size', ['--max-total-size', '500B']],
    ['--size-gate', ['--size-gate', '500B']],
    ['--no-size-gate', ['--no-size-gate']],
    ['--scope', ['--scope', 'src']],
    ['--scope with a file', ['--scope', 'src', 'a-small.md']],
    ['--head', ['--head', '1']],
  ])('the UI path and the direct path agree: %s', async (_label, args) => {
    const { ui, direct } = await bothPaths(args);
    expect(ui).toEqual(direct);
  });

  test('--max-files actually binds on both paths', async () => {
    // The regression that motivated this file: --max-files was a no-op on the
    // UI path, so this assertion is the load-bearing one.
    const { ui, direct } = await bothPaths(['--max-files', '2']);
    expect(ui).toHaveLength(2);
    expect(direct).toHaveLength(2);
  });

  test('--always re-includes a gitignored file on both paths', async () => {
    const { ui, direct } = await bothPaths(['--always', 'secret.txt']);
    expect(ui).toContain('secret.txt');
    expect(direct).toContain('secret.txt');
  });

  test('--size-gate drops the large file on both paths', async () => {
    const { ui, direct } = await bothPaths(['--size-gate', '500B']);
    expect(ui).not.toContain('c-large.js');
    expect(direct).not.toContain('c-large.js');
    expect(ui).toContain('a-small.md');
  });

  test('--only-tree omits content without changing the format', async () => {
    // `--only-tree` is a content switch; `--format tree` is the format switch.
    // These used to be conflated on the streaming path only.
    const ui = await runCli([PROJECT, '--only-tree', '--display']);
    const direct = await runCli([PROJECT, '--only-tree', '--stream']);

    expect(ui.stdout).toContain('<?xml');
    expect(direct.stdout).toContain('<?xml');
    // File elements are present but empty
    expect(ui.stdout).toMatch(/<ct:file path="@a-small\.md"[^>]*><\/ct:file>/);
  });
});
