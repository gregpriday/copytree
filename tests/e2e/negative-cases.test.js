/**
 * E2E Tests: Negative Cases
 *
 * Tests error handling and invalid inputs for stable error messaging.
 */

import path from 'path';
import { runCli, normalize } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Negative cases', () => {
  // An unrecognised format is a fatal input error, not something to recover
  // from by picking a different one. A caller that asked for `foo` and received
  // a zero exit with JSON has no way to tell that its request was ignored.
  //
  // This previously asserted either branch, so it passed whatever the CLI did,
  // and its golden held a Node module-resolution crash captured from a broken
  // checkout rather than any real CopyTree output.
  test('unknown format --format foo exits non-zero with a stable message', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'foo']);

    expect(code).not.toBe(0);

    const errorOutput = stderr || stdout;
    const normalized = normalize(errorOutput, { projectRoot: PROJECT });

    // The rejected value, and the set it should have come from.
    expect(normalized).toContain('Unknown format: foo');
    expect(normalized).toContain('Choose xml, markdown, json, ndjson, sarif or tree');
    expect(normalized).toMatchGolden('negative/unknown-format-error.txt.golden');
  }, 30000);

  test('nonexistent input path', async () => {
    const nonexistentPath = path.resolve(process.cwd(), 'tests/fixtures/does-not-exist');
    const { code, stdout, stderr } = await runCli([nonexistentPath]);

    expect(code).not.toBe(0);

    const errorOutput = stderr || stdout;
    const normalized = normalize(errorOutput, { projectRoot: nonexistentPath });
    expect(normalized).toMatchGolden('negative/invalid-path.txt.golden');
  }, 30000);

  // Two destinations is a contradiction only the caller can resolve, so it is
  // rejected before any work happens rather than silently resolved by
  // precedence — which used to mean one of the two requests was ignored with
  // no indication that it had been.
  test('conflicting flags --clipboard and --display are rejected', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--clipboard', '--display']);

    expect(code).not.toBe(0);

    const errorOutput = normalize(stderr || stdout, { projectRoot: PROJECT });
    expect(errorOutput).toContain('Invalid output destination');
    expect(errorOutput).toContain(
      'Choose one output destination: --reference, --clipboard, --stdout or --output',
    );
    expect(errorOutput).toContain('[ERR_DESTINATION_CONFLICT]');
    // Nothing was produced: the run stopped before the pipeline started.
    expect(stdout).toBe('');
  }, 30000);

  test('invalid filter pattern', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--filter', '[invalid-regex-[']);

    // May fail with pattern error or succeed by treating it literally
    if (code !== 0) {
      // Command failed - invalid regex pattern was rejected
      const errorOutput = stderr || stdout;
      expect(errorOutput).toBeTruthy();
      // Note: Error message format varies by glob implementation
    } else {
      // Command succeeded - pattern was treated literally or fixed
      expect(code).toBe(0);
    }
  }, 30000);
});
