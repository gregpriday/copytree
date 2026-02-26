/**
 * E2E Tests: Markdown Formatter Variants
 *
 * Dedicated golden file tests for the Markdown formatter covering
 * all supported modes and flag combinations:
 * - Base output (no flags)
 * - --with-line-numbers
 * - --only-tree
 * - --with-git-status
 * - Combined flags
 * - Fence language detection
 */

import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { mkdirSync, cpSync, rmSync, appendFileSync, writeFileSync } from 'fs';
import { runCli, normalize, getGitEnv } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Markdown formatter variants', () => {
  test('base markdown output (no extra flags)', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'markdown', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('markdown/base.md.golden');
  }, 30000);

  test('markdown with --with-line-numbers', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'markdown',
      '--with-line-numbers',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });

    // Verify line numbers appear in the Markdown-specific format (e.g. "   1: content")
    expect(normalized).toMatch(/^\s+1:\s/m);
    // Verify subsequent line numbers also appear
    expect(normalized).toMatch(/^\s+2:\s/m);

    expect(normalized).toMatchGolden('markdown/with-line-numbers.md.golden');
  }, 30000);

  test('markdown with --only-tree', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'markdown',
      '--only-tree',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });

    // Verify only_tree is true in front matter
    expect(normalized).toMatch(/only_tree:\s*true/);
    // Verify no Files section
    expect(normalized).not.toMatch(/^## Files/m);
    // Verify no file-begin markers
    expect(normalized).not.toContain('copytree:file-begin');

    expect(normalized).toMatchGolden('markdown/only-tree.md.golden');
  }, 30000);

  test('markdown with --with-git-status', async () => {
    const tmpDir = path.join(os.tmpdir(), `copytree-md-git-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      cpSync(PROJECT, tmpDir, { recursive: true });
      const gitEnv = getGitEnv();

      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name copytree-bot', {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      execSync('git config user.email bot@example.com', {
        cwd: tmpDir,
        stdio: 'pipe',
      });

      execSync('git add .', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });
      execSync('git commit -m "baseline"', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });

      // Modify a file and add an untracked file
      appendFileSync(path.join(tmpDir, 'README.md'), '\nTemp change for testing.');
      writeFileSync(path.join(tmpDir, 'UNTRACKED.tmp'), 'untracked content');

      const { code, stdout, stderr } = await runCli([
        tmpDir,
        '--format',
        'markdown',
        '--with-git-status',
        '--display',
      ]);

      expect(code).toBe(0);
      expect(stderr).toBe('');

      const normalized = normalize(stdout, { projectRoot: tmpDir });

      // Verify git status is reflected in front matter
      expect(normalized).toMatch(/include_git_status:\s*true/);

      expect(normalized).toMatchGolden('markdown/with-git-status.md.golden');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('markdown with --with-line-numbers --with-git-status (combined)', async () => {
    const tmpDir = path.join(os.tmpdir(), `copytree-md-combined-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      cpSync(PROJECT, tmpDir, { recursive: true });
      const gitEnv = getGitEnv();

      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name copytree-bot', {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      execSync('git config user.email bot@example.com', {
        cwd: tmpDir,
        stdio: 'pipe',
      });

      execSync('git add .', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });
      execSync('git commit -m "baseline"', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });

      appendFileSync(path.join(tmpDir, 'index.js'), '\n// modified line');

      const { code, stdout, stderr } = await runCli([
        tmpDir,
        '--format',
        'markdown',
        '--with-line-numbers',
        '--with-git-status',
        '--display',
      ]);

      expect(code).toBe(0);
      expect(stderr).toBe('');

      const normalized = normalize(stdout, { projectRoot: tmpDir });

      // Verify both flags reflected in front matter
      expect(normalized).toMatch(/include_git_status:\s*true/);
      expect(normalized).toMatch(/include_line_numbers:\s*true/);

      expect(normalized).toMatchGolden('markdown/line-numbers-git-status.md.golden');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('markdown with --only-tree --with-git-status (combined)', async () => {
    const tmpDir = path.join(os.tmpdir(), `copytree-md-tree-git-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      cpSync(PROJECT, tmpDir, { recursive: true });
      const gitEnv = getGitEnv();

      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name copytree-bot', {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      execSync('git config user.email bot@example.com', {
        cwd: tmpDir,
        stdio: 'pipe',
      });

      execSync('git add .', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });
      execSync('git commit -m "baseline"', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: { ...process.env, ...gitEnv },
      });

      appendFileSync(path.join(tmpDir, 'README.md'), '\nModified for git status.');

      const { code, stdout, stderr } = await runCli([
        tmpDir,
        '--format',
        'markdown',
        '--only-tree',
        '--with-git-status',
        '--display',
      ]);

      expect(code).toBe(0);
      expect(stderr).toBe('');

      const normalized = normalize(stdout, { projectRoot: tmpDir });

      // Both flags active
      expect(normalized).toMatch(/only_tree:\s*true/);
      expect(normalized).toMatch(/include_git_status:\s*true/);
      // No file content sections
      expect(normalized).not.toContain('copytree:file-begin');

      expect(normalized).toMatchGolden('markdown/only-tree-git-status.md.golden');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('fence language detection for various file types', async () => {
    // Create a temp project with multiple file extensions
    const tmpDir = path.join(os.tmpdir(), `copytree-md-lang-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      const files = {
        'app.js': 'const x = 1;',
        'style.css': 'body { margin: 0; }',
        'data.json': '{"key": "value"}',
        'config.yml': 'key: value',
        'script.py': 'print("hello")',
        'main.go': 'package main',
        'lib.rs': 'fn main() {}',
        'run.sh': '#!/bin/bash',
        'notes.txt': 'plain text notes',
        'unknown.xyz': 'unknown extension content',
      };

      for (const [name, content] of Object.entries(files)) {
        writeFileSync(path.join(tmpDir, name), content);
      }

      const { code, stdout, stderr } = await runCli([tmpDir, '--format', 'markdown', '--display']);

      expect(code).toBe(0);
      expect(stderr).toBe('');

      const normalized = normalize(stdout, { projectRoot: tmpDir });

      // Verify fence language tags for known extensions
      expect(normalized).toMatch(/```js\n/);
      expect(normalized).toMatch(/```css\n/);
      expect(normalized).toMatch(/```json\n/);
      expect(normalized).toMatch(/```yaml\n/);
      expect(normalized).toMatch(/```python\n/);
      expect(normalized).toMatch(/```go\n/);
      expect(normalized).toMatch(/```rust\n/);
      expect(normalized).toMatch(/```bash\n/);
      expect(normalized).toMatch(/```text\n/);
      // Unknown extension: no language tag (just ```)
      expect(normalized).toMatch(/```\n(?:unknown extension content)/);

      expect(normalized).toMatchGolden('markdown/language-detection.md.golden');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30000);

  test('begin/end markers are properly placed', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'markdown', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });

    // Count begin and end markers
    const beginMarkers = normalized.match(/<!-- copytree:file-begin /g) || [];
    const endMarkers = normalized.match(/<!-- copytree:file-end /g) || [];

    // Should have exactly 3 file pairs (simple-project has 3 files)
    expect(beginMarkers).toHaveLength(3);
    expect(endMarkers).toHaveLength(3);

    // Every begin marker has a matching end marker with the same path, in order
    const beginPaths = [...normalized.matchAll(/<!-- copytree:file-begin path="(@[^"]+)"/g)].map(
      (m) => m[1],
    );
    const endPaths = [...normalized.matchAll(/<!-- copytree:file-end path="(@[^"]+)"/g)].map(
      (m) => m[1],
    );

    expect(beginPaths).toEqual(endPaths);

    // Verify proper interleaving: each begin must come before its matching end
    for (const filePath of beginPaths) {
      const beginIdx = normalized.indexOf(`<!-- copytree:file-begin path="${filePath}"`);
      const endIdx = normalized.indexOf(`<!-- copytree:file-end path="${filePath}"`);
      expect(beginIdx).toBeGreaterThan(-1);
      expect(endIdx).toBeGreaterThan(beginIdx);
    }

    // Verify instructions markers are paired
    const instrBeginIdx = normalized.indexOf('<!-- copytree:instructions-begin');
    const instrEndIdx = normalized.indexOf('<!-- copytree:instructions-end');
    expect(instrBeginIdx).toBeGreaterThan(-1);
    expect(instrEndIdx).toBeGreaterThan(instrBeginIdx);
  }, 30000);

  test('markdown with --show-size', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--format',
      'markdown',
      '--show-size',
      '--display',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    // --show-size is a no-op for Markdown (tree already includes sizes);
    // golden should match base output
    expect(normalized).toMatchGolden('markdown/with-show-size.md.golden');
  }, 30000);
});
