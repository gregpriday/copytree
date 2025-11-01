/**
 * E2E Tests: Stream Mode
 *
 * Tests streaming output mode for large projects and CI environments.
 */

import path from 'path';
import { runCli, normalize } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Stream mode', () => {
  test('--stream with tree format', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--stream',
      '--format',
      'tree',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, {
      projectRoot: PROJECT,
      sortTreeLines: true,
    });
    expect(normalized).toMatchGolden('stream/stream.tree.golden');
  }, 30000);

  test('--stream with XML format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.xml.golden');
  }, 30000);

  test('--stream with JSON format', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--stream',
      '--format',
      'json',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.json.golden');
  }, 30000);

  test('--stream with markdown format', async () => {
    const { code, stdout, stderr } = await runCli([
      PROJECT,
      '--stream',
      '--format',
      'markdown',
    ]);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.md.golden');
  }, 30000);
});
