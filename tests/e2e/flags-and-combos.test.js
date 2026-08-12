/**
 * E2E Tests: Flags and Combinations
 *
 * Tests various CLI flags and their combinations to ensure
 * stable output across versions.
 */

import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { mkdirSync, cpSync, rmSync, appendFileSync, writeFileSync } from 'fs';
import { runCli, normalize, getGitEnv } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Flags and combinations', () => {
  test('--with-line-numbers (XML)', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--with-line-numbers', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('flags/with-line-numbers.xml.golden');
  }, 30000);

  test('--only-tree (tree structure only)', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--only-tree', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, {
      projectRoot: PROJECT,
      sortTreeLines: true,
    });
    expect(normalized).toMatchGolden('flags/only-tree.xml.golden');
  }, 30000);

  test('--no-metadata (optional metadata stripped)', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--no-metadata', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).not.toContain('modified=');
    expect(stdout).toContain('<ct:format>');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('flags/no-metadata.xml.golden');
  }, 30000);

  test('--with-git-status (git status integration)', async () => {
    // Create a temporary Git repository with the simple-project files
    const tmpDir = path.join(os.tmpdir(), `copytree-git-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      // Copy simple-project to temp directory
      cpSync(PROJECT, tmpDir, { recursive: true });

      const gitEnv = getGitEnv();

      // Initialize Git repo
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name copytree-bot', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email bot@example.com', { cwd: tmpDir, stdio: 'pipe' });

      // Commit baseline
      execSync('git add .', { cwd: tmpDir, stdio: 'pipe', env: { ...process.env, ...gitEnv } });
      execSync('git commit -m "baseline"', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });

      // Create changes: modify one file and add an untracked file
      const readmePath = path.join(tmpDir, 'README.md');
      appendFileSync(readmePath, '\nTemp change for testing.');

      const untrackedPath = path.join(tmpDir, 'UNTRACKED.tmp');
      writeFileSync(untrackedPath, 'untracked content');

      // Run CLI with --with-git-status
      const { code, stdout, stderr } = await runCli([tmpDir, '--with-git-status', '--display']);

      expect(code).toBe(0);
      expect(stderr).toBe('');

      const normalized = normalize(stdout, { projectRoot: tmpDir });
      expect(normalized).toMatchGolden('flags/with-git-status.xml.golden');
    } finally {
      // Cleanup
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('--format json --with-line-numbers', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'json',
      '--with-line-numbers',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('flags/json-with-line-numbers.golden');
  }, 30000);

  test('--format markdown --no-metadata', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'markdown',
      '--no-metadata',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('flags/markdown-no-metadata.golden');
  }, 30000);

  test('--only-tree with XML format', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'xml',
      '--only-tree',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, {
      projectRoot: PROJECT,
      sortTreeLines: true,
    });
    expect(normalized).toMatchGolden('flags/xml-only-tree.golden');
  }, 30000);

  // `--info` and `--show-size` were accepted and read by nothing: they set a
  // value equal to its own default, so no output could ever differ. Removed,
  // with the replacement named.
  test('removed metadata flags name their replacement', async () => {
    for (const flag of ['--info', '--show-size']) {
      const { code, stderr } = await runCli([PROJECT, flag, '--display']);
      expect(code).toBe(2);
      expect(stderr).toContain(`${flag} has been removed`);
      expect(stderr).toContain('--metadata');
    }
  }, 30000);
});
