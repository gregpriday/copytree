/**
 * E2E Tests: Stream Mode
 *
 * Tests streaming output mode for large projects and CI environments.
 */

import path from 'path';
import { spawn } from 'child_process';
import { runCli, normalize } from './_utils.js';

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');
const CLI_PATH = path.resolve(process.cwd(), 'bin/copytree.js');

/**
 * Run CLI and capture streaming behavior by listening to stdout data events
 * @returns {Promise<{chunks: Array<{data: string, timestamp: number}>, exitCode: number}>}
 */
function runCliWithStreamCapture(args) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const startTime = Date.now();

    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    proc.stdout.on('data', (data) => {
      chunks.push({
        data: data.toString(),
        timestamp: Date.now() - startTime,
        size: data.length
      });
    });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ chunks, exitCode: code, stderr });
    });

    proc.on('error', reject);
  });
}

describe('Stream mode', () => {
  describe('Streaming behavior verification', () => {
    test('should emit multiple data chunks during processing', async () => {
      const { chunks, exitCode } = await runCliWithStreamCapture([
        PROJECT,
        '--stream',
        '--format',
        'xml'
      ]);

      expect(exitCode).toBe(0);

      // Verify streaming: should receive multiple chunks, not just one at the end
      expect(chunks.length).toBeGreaterThan(1);

      // Verify chunks are emitted over time (not all at once)
      const timestamps = chunks.map(c => c.timestamp);
      const timeSpread = timestamps[timestamps.length - 1] - timestamps[0];
      expect(timeSpread).toBeGreaterThan(0); // Should take some time

      // Verify we got data before process completed
      expect(chunks[0].timestamp).toBeLessThan(timestamps[timestamps.length - 1]);
    }, 30000);

    test('should start output before all processing completes', async () => {
      const { chunks, exitCode } = await runCliWithStreamCapture([
        PROJECT,
        '--stream',
        '--format',
        'markdown'
      ]);

      expect(exitCode).toBe(0);

      // First chunk should arrive before the last chunk
      // (verifies data is streamed progressively, not buffered until end)
      const firstChunkTime = chunks[0].timestamp;
      const lastChunkTime = chunks[chunks.length - 1].timestamp;

      expect(firstChunkTime).toBeLessThan(lastChunkTime);

      // If there are multiple chunks, they should be spread over time
      if (chunks.length > 2) {
        const middleChunkTime = chunks[Math.floor(chunks.length / 2)].timestamp;
        expect(middleChunkTime).toBeGreaterThan(firstChunkTime);
        expect(middleChunkTime).toBeLessThan(lastChunkTime);
      }
    }, 30000);
  });

  describe('Stream output format correctness', () => {
  test('--stream with tree format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream', '--format', 'tree']);

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
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream', '--format', 'json']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.json.golden');
  }, 30000);

  test('--stream with markdown format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream', '--format', 'markdown']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.md.golden');
  }, 30000);

  test('--stream with NDJSON format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream', '--format', 'ndjson']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.ndjson.golden');
  }, 30000);

  test('--stream with SARIF format', async () => {
    const { code, stdout, stderr } = await runCli([PROJECT, '--stream', '--format', 'sarif']);

    expect(code).toBe(0);
    expect(stderr).toBe('');

    const normalized = normalize(stdout, { projectRoot: PROJECT });
    expect(normalized).toMatchGolden('stream/stream.sarif.golden');
  }, 30000);
  }); // End of 'Stream output format correctness'
}); // End of 'Stream mode'
