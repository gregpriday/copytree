/**
 * E2E Tests: Output Formats
 *
 * Tests all output formats (XML, JSON, Markdown, NDJSON, SARIF, tree) for stability
 * and regression protection using golden files.
 */

import path from 'path';
import { runCli, normalize } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('Output formats', () => {
  test('XML (default format)', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('default/simple.xml.golden');
  }, 30000);

  test('JSON format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'json', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('default/simple.json.golden');
  }, 30000);

  test('Markdown format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'markdown', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('default/simple.md.golden');
  }, 30000);

  test('Tree format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'tree', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, {
      projectRoot: PROJECT,
      sortTreeLines: true,
    });
    expect(normalized).toMatchGolden('default/simple.tree.golden');
  }, 30000);

  test('NDJSON format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'ndjson', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('default/simple.ndjson.golden');
  }, 30000);

  test('SARIF format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--format', 'sarif', '--display']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('default/simple.sarif.golden');
  }, 30000);
});
