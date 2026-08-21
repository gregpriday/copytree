/**
 * A budget set in a profile binds the same as one typed on the command line.
 *
 * `resolveBudgets()` folds command-line, profile and configuration values into
 * one set of effective budgets, and `inspect --view budgets` reports them —
 * but the copy pipeline built its character-budget stage from
 * `request.budgets`, which holds only what was typed. So `--max-chars 200`
 * truncated and a profile setting `charLimit: 200` did nothing at all, while
 * every command that reports budgets agreed it was in effect.
 *
 * A profile that is honoured by the preview and ignored by the run is the
 * failure mode the shared selection engine exists to prevent.
 */

import os from 'os';
import path from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';

jest.unmock('../../../src/utils/fsx.js');

const CLI = path.resolve(process.cwd(), 'bin/copytree.js');

let root;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'copytree-profile-budget-'));
  mkdirSync(path.join(root, '.copytree'));
  writeFileSync(path.join(root, 'data.txt'), 'y'.repeat(3000));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Write a named profile.
 * @param {string} name - Profile name
 * @param {string} options - YAML body for the `options:` block
 * @returns {void}
 */
function writeProfile(name, options) {
  writeFileSync(path.join(root, '.copytree', `${name}.yml`), `name: ${name}\noptions:\n${options}`);
}

/**
 * Run the CLI against the fixture.
 * @param {string[]} args - Arguments after the path
 * @returns {{status: number, stdout: string, stderr: string}} Result
 */
function run(args) {
  const result = spawnSync(process.execPath, [CLI, root, ...args, '-x', '.copytree/**'], {
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('a profile character budget', () => {
  it('truncates content, exactly as --max-chars does', () => {
    writeProfile('capped', '  charLimit: 200\n');

    const viaProfile = run(['-p', 'capped', '--stdout']);
    const viaFlag = run(['--max-chars', '200', '--stdout']);

    expect(viaProfile.status).toBe(0);
    expect(viaProfile.stdout).toContain('truncated');
    // Both are bounded by the same budget. They are not byte-identical — the
    // profile's name appears in the metadata — so the assertion is that the
    // profile run is nowhere near the untruncated size.
    expect(Math.abs(viaProfile.stdout.length - viaFlag.stdout.length)).toBeLessThan(200);
  });

  it('is ignored by neither the run nor the preview', () => {
    writeProfile('capped', '  charLimit: 200\n');

    const uncapped = run(['--stdout']);
    const capped = run(['-p', 'capped', '--stdout']);

    expect(uncapped.stdout.length).toBeGreaterThan(3000);
    expect(capped.stdout.length).toBeLessThan(2000);
  });

  it('refuses a malformed budget rather than silently rounding it', () => {
    writeProfile('bad', '  charLimit: 1.5\n');

    const result = run(['-p', 'bad', '--stdout']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_INVALID_OPTION');
  });
});

describe('plan and copy agree on the character budget', () => {
  it('applies it in the plan, so the preview matches the run', () => {
    writeProfile('capped', '  charLimit: 200\n');

    const plan = spawnSync(
      process.execPath,
      [CLI, 'plan', root, '--profile', 'capped', '-x', '.copytree/**', '--format', 'json'],
      { encoding: 'utf8' },
    );
    const model = JSON.parse(plan.stdout);

    // A plan that reported the budget and did not apply it was describing a
    // selection the copy would not produce.
    expect(model.summary.truncated).toBe(true);
    expect(model.summary.truncatedBy).toBe('charLimit');
    expect(model.exactness.characterBudget).toBe('estimated-from-bytes');
    // Estimated, so the path set is too — saying `exact` about a set decided
    // from byte counts is the overstatement the label exists to avoid.
    expect(model.exactness.pathSelection).toBe('estimated-from-bytes');
  });

  it('does not apply it when the profile format reads no content', () => {
    // `tree` never emits a body, so `copy` loads nothing and its character
    // stage passes every file through. A plan applying a byte-estimated budget
    // would drop files the copy keeps.
    writeProfile('treefmt', '  format: tree\n  charLimit: 200\n');

    const plan = spawnSync(
      process.execPath,
      [CLI, 'plan', root, '--profile', 'treefmt', '-x', '.copytree/**', '--format', 'json'],
      { encoding: 'utf8' },
    );
    const model = JSON.parse(plan.stdout);
    const copied = run(['--profile', 'treefmt', '--stdout']);

    expect(model.exactness.characterBudget).toBe('not-evaluated');
    expect(model.summary.truncated).toBe(false);
    expect(model.summary.selected).toBe(1);
    expect(copied.stdout).toContain('data.txt');
  });

  it('refuses a malformed budget in the plan too, not only in the run', () => {
    writeProfile('bad', '  charLimit: 1.5\n');

    const plan = spawnSync(
      process.execPath,
      [CLI, 'plan', root, '--profile', 'bad', '-x', '.copytree/**'],
      { encoding: 'utf8' },
    );

    expect(plan.status).not.toBe(0);
    expect(plan.stderr).toContain('ERR_INVALID_OPTION');
  });
});

describe('a profile total-size budget', () => {
  it('drops a file larger than the whole budget', () => {
    writeProfile('strict', '  maxTotalSize: 100\n');

    const result = run(['-p', 'strict', '--stdout']);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('data.txt');
  });

  it('keeps it when the profile asks for the overshoot by name', () => {
    writeProfile('retain', '  maxTotalSize: 100\n  retainOversizedFirstFile: true\n');

    const result = run(['-p', 'retain', '--stdout']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('data.txt');
  });
});

describe('a named instructions block that does not exist', () => {
  it('fails the run rather than emitting a document without it', () => {
    // `InstructionsStage` already threw for this, deliberately and with a
    // comment saying why — and `continueOnError` swallowed the throw because
    // the stage was not marked fatal. So `--instructions house-style` on a typo
    // produced a document with no instructions, no warning, and exit 0.
    const result = run(['--instructions', 'definitely-not-a-real-block', '--stdout']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_INSTRUCTIONS');
  });

  it('still falls back silently for the configured default', () => {
    // A missing *default* block costs polish, and the run should continue.
    const result = run(['--stdout']);

    expect(result.status).toBe(0);
  });
});
