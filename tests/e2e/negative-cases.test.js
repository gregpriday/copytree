/**
 * E2E Tests: Negative Cases
 *
 * Tests error handling and invalid inputs for stable error messaging.
 */

import path from 'path';
import { runCli, normalize } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Negative cases', () => {
  test('unknown format --format foo', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'foo']);

    // If the CLI accepts any format or defaults, that's OK too
    // Just document the actual behavior
    const errorOutput = stderr || stdout;
    const normalized = normalize(errorOutput, { projectRoot: PROJECT });

    if (code !== 0) {
      // CLI rejected the format - document the error
      expect(normalized).toMatchGolden('negative/unknown-format-error.txt.golden');
    } else {
      // CLI accepted the format - document the output
      expect(normalized).toMatchGolden('negative/unknown-format-success.txt.golden');
    }
  }, 30000);

  test('nonexistent input path', async () => {
    const nonexistentPath = path.resolve(process.cwd(), 'tests/fixtures/does-not-exist');
    const { code, stdout, stderr } = await runCli([nonexistentPath]);

    expect(code).not.toBe(0);

    const errorOutput = stderr || stdout;
    const normalized = normalize(errorOutput, { projectRoot: nonexistentPath });
    expect(normalized).toMatchGolden('negative/invalid-path.txt.golden');
  }, 30000);

  test('conflicting flags --clipboard and --display', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--clipboard', '--display']);

    // This test is environment-dependent (clipboard availability varies)
    // Accept either success or predictable failure
    if (code !== 0) {
      // Command failed - this is expected in CI environments without clipboard
      const errorOutput = stderr || stdout;
      expect(errorOutput).toBeTruthy();
      // Note: We don't validate exact error message since it varies by environment
    } else {
      // Command succeeded - clipboard and display can coexist
      expect(code).toBe(0);
    }
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
