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
    const { code, stderr } = await runCli([PROJECT, '--display'], speaking);

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
    expect(fs.readFileSync(target, 'utf8')).toBe('PRESERVE ME');
    expect(stdout).toBe('');
    expect(stderr).toContain('Preview');
    fs.unlinkSync(target);
  }, 30000);

  // The flag's whole purpose is the explanation; it must not also need --verbose.
  test('--dry-run --explain explains without --verbose', async () => {
    const { code, stderr } = await runCli(
      [PROJECT, '--dry-run', '--explain', '--exclude', '*.js'],
      speaking,
    );

    expect(code).toBe(0);
    expect(stderr).toContain('Largest exclusions:');
  }, 30000);

  test('--log-format silent still reports a failure', async () => {
    const { code, stderr } = await runCli(['./definitely-not-here', '--log-format', 'silent']);

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

  test('an empty selection is a valid outcome, not a failure', async () => {
    const { code, stderr } = await runCli(
      [PROJECT, '--filter', 'nothing-matches-this-*', '--display'],
      speaking,
    );

    expect(code).toBe(0);
    expect(stderr).toContain('No files matched');
  }, 30000);
});
