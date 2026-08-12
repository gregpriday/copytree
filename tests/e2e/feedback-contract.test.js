/**
 * E2E: the stdout/stderr contract, and what a run says about itself.
 *
 * stdout carries the requested document and nothing else; stderr carries every
 * word addressed to a person. That split is what makes
 * `copytree --display --format json | jq` valid while a run can still report
 * progress, and it is the one property no amount of message polish can replace.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { runCli } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

// The shared runner pins COPYTREE_LOG_LEVEL=error, which suppresses feedback by
// design. These tests are about the feedback, so they opt back in.
const speaking = { env: { COPYTREE_LOG_LEVEL: 'info' } };

describe('feedback contract', () => {
  test('stdout carries only the document, feedback goes to stderr', async () => {
    const { code, stdout, stderr } = await runCli(
      [PROJECT, '--display', '--format', 'json'],
      speaking,
    );

    expect(code).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
    expect(stdout).not.toMatch(/Displayed|files ·|tokens/);
    expect(stderr).toContain('Displayed 3 files');
    expect(stderr).toContain('tokens');
  }, 30000);

  test('every successful run ends with one line naming the result', async () => {
    // Canonical spelling, so the only line is the completion line. A
    // deprecated spelling adds exactly one warning above it, which is the
    // deprecation contract rather than an exception to this one.
    const { code, stderr } = await runCli([PROJECT, '--stdout'], speaking);

    expect(code).toBe(0);
    const lines = stderr.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[ok] /);
  }, 30000);

  // Token count is the number that decides whether the output can be pasted.
  test('the completion line reports estimated tokens', async () => {
    const { stderr } = await runCli([PROJECT, '--display'], speaking);
    expect(stderr).toMatch(/~\d+k? tokens/);
  }, 30000);

  // Default output must never leak a class name; that is what verbose and
  // debug are for, in that order.
  test('default output names no pipeline stage', async () => {
    const { stdout, stderr } = await runCli([PROJECT, '--display'], speaking);
    expect(stdout + stderr).not.toMatch(/Stage\b/);
  }, 30000);

  test('--quiet suppresses success but not failure', async () => {
    const quiet = await runCli([PROJECT, '--display', '--quiet'], speaking);
    expect(quiet.code).toBe(0);
    expect(quiet.stderr).toBe('');
    expect(quiet.stdout.length).toBeGreaterThan(0);

    const failed = await runCli(['./definitely-not-here', '--quiet'], speaking);
    expect(failed.code).not.toBe(0);
    expect(failed.stderr).toContain('Path not found');
  }, 30000);

  test('--verbose adds run detail without a per-file flood', async () => {
    const { stderr } = await runCli([PROJECT, '--display', '--verbose'], speaking);

    expect(stderr).toContain('Selected 3 files');
    expect(stderr).toMatch(/\[ok] Displayed 3 files/);
    // A checkmark per file is what taught people to ignore checkmarks.
    expect(stderr).not.toMatch(/\[ok].*index\.js/);
  }, 30000);

  test('feedback in JSON mode is NDJSON with no ANSI or emoji', async () => {
    const { code, stderr } = await runCli([PROJECT, '--display', '--log-format', 'json'], speaking);

    expect(code).toBe(0);
    const events = stderr
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    expect(events.some((e) => e.event === 'run.start')).toBe(true);
    const complete = events.find((e) => e.event === 'run.complete');
    expect(complete.status).toBe('success');
    expect(complete.stats.files).toBe(3);
    // eslint-disable-next-line no-control-regex
    expect(stderr).not.toMatch(/\x1b/);
  }, 30000);

  // Skipping only *delivery* was not enough: with --stream the output stage
  // wrote the whole document, and --dry-run --stream -o existing.xml truncated
  // that file while reporting "no output was written".
  test('--dry-run writes nothing, even with --stream --output', async () => {
    const target = path.join(os.tmpdir(), `copytree-dry-${process.pid}.xml`);
    fs.writeFileSync(target, 'PRESERVE ME');

    const { code, stdout, stderr } = await runCli(
      [PROJECT, '--dry-run', '--stream', '--output', target],
      speaking,
    );

    expect(code).toBe(0);
    // `--output` named where the export would have gone. A preview does not
    // write it, and the plan report must not repurpose it either.
    expect(fs.readFileSync(target, 'utf8')).toBe('PRESERVE ME');
    // The plan is the requested payload, so it belongs on stdout.
    expect(stdout).toContain('Plan for');
    expect(stdout).toContain('No file contents were read');
    expect(stderr).toContain("--dry-run is deprecated; use 'copytree plan'");
    fs.unlinkSync(target);
  }, 30000);

  // The flag's whole purpose is the explanation; it must not also need --verbose.
  test('--dry-run --explain explains without --verbose', async () => {
    const { code, stdout } = await runCli(
      [PROJECT, '--dry-run', '--explain', '--exclude', '*.js'],
      speaking,
    );

    expect(code).toBe(0);
    expect(stdout).toContain('Excluded entries:');
    expect(stdout).toContain('optionExclude');
  }, 30000);

  // `silent` was never a format, it was a severity. Silence is --quiet, and the
  // removed value is rejected rather than quietly accepted.
  test('--log-format silent is rejected, and --quiet still reports a failure', async () => {
    const removed = await runCli(['./definitely-not-here', '--log-format', 'silent']);
    expect(removed.code).toBe(2);
    expect(removed.stderr).toContain("Invalid --log-format value 'silent'");

    const { code, stderr } = await runCli(['./definitely-not-here', '--quiet']);
    expect(code).not.toBe(0);
    expect(stderr).toContain('Path not found');
  }, 30000);

  // Streaming has no clipboard to write to, and precedence used to resolve the
  // pair in favour of the stream without saying so.
  test('--stream --clipboard is rejected rather than silently ignored', async () => {
    const { code, stderr } = await runCli([PROJECT, '--stream', '--clipboard'], speaking);

    expect(code).not.toBe(0);
    expect(stderr).toContain('--stream cannot be combined with --clipboard');
  }, 30000);

  // The streaming stage is fatal, so its typed error survives instead of being
  // recovered past and replaced downstream by "No output generated".
  test('an unknown streamed format reports the format, not a generic failure', async () => {
    const { code, stderr } = await runCli([PROJECT, '--stream', '--format', 'foo'], speaking);

    expect(code).not.toBe(0);
    expect(stderr).toContain('Unknown format: foo');
  }, 30000);

  // A stage that fails and carries on answers a different question than the one
  // asked. In CI this was a whole-repository context where a diff was expected,
  // with a zero exit and nothing to notice it by.
  // A narrowing request that cannot be applied fails the run. Carrying on
  // would hand back the whole project — in CI, a full-repository context where
  // a diff was expected, at a size nothing about the run distinguishes from
  // success.
  test('a Git selector that cannot be applied fails rather than exporting everything', async () => {
    const { code, stdout, stderr } = await runCli(
      [PROJECT, '--changed', 'definitely-not-a-ref', '--display'],
      speaking,
    );

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Git selection failed');
    expect(stderr).toContain('[GIT_ERROR]');
  }, 30000);

  // Attaching status is polish: its absence changes no selection, so it
  // degrades and says so.
  test('an annotation that cannot be applied degrades and is reported', async () => {
    const outsideRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-no-git-'));
    fs.writeFileSync(path.join(outsideRepo, 'a.txt'), 'a\n');

    try {
      const { code, stderr } = await runCli([outsideRepo, '--git-status', '--display'], speaking);

      expect(code).toBe(0);
      expect(stderr).toContain('Displayed');
    } finally {
      fs.rmSync(outsideRepo, { recursive: true, force: true });
    }
  }, 30000);

  test('a destination that cannot be written names the file and the operation', async () => {
    const { code, stderr } = await runCli(
      [PROJECT, '--stream', '--output', '/definitely-not-writable/out.xml'],
      speaking,
    );

    expect(code).not.toBe(0);
    expect(stderr).toContain('Could not write the output file');
    expect(stderr).toContain('/definitely-not-writable/out.xml');
  }, 30000);

  // Opening the destination during stage assembly truncated an existing file
  // before discovery had even run.
  test('a failure before writing leaves an existing --output file untouched', async () => {
    const target = path.join(os.tmpdir(), `copytree-untouched-${process.pid}.xml`);
    fs.writeFileSync(target, 'PRESERVE ME');

    const { code } = await runCli(
      [PROJECT, '--stream', '--format', 'foo', '--output', target],
      speaking,
    );

    expect(code).not.toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe('PRESERVE ME');
    fs.unlinkSync(target);
  }, 30000);

  // A streamed document with no version is indistinguishable from an
  // unversioned one, so a consumer checking for a schema change sees nothing.
  test.each([
    ['xml', '<ct:format>copytree-xml@1</ct:format>'],
    ['json', '"format": "copytree-json@1"'],
    ['ndjson', '"format":"copytree-ndjson@1"'],
    ['markdown', 'format: copytree-md@1'],
  ])(
    'streamed %s carries its format version',
    async (format, marker) => {
      const { code, stdout } = await runCli([PROJECT, '--stream', '--format', format], speaking);

      expect(code).toBe(0);
      expect(stdout).toContain(marker);
    },
    30000,
  );

  test('an empty selection is a valid outcome, not a failure', async () => {
    const { code, stderr } = await runCli(
      [PROJECT, '--filter', 'nothing-matches-this-*', '--display'],
      speaking,
    );

    expect(code).toBe(0);
    expect(stderr).toContain('No files matched');
  }, 30000);
});
