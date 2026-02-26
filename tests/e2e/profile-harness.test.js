/**
 * E2E tests for the built-in profiling harness (issue #34).
 *
 * Tests that `--profile cpu|heap|all` generates valid profile files
 * and a JSON report, without relying on golden files (reports contain
 * non-deterministic timestamps and memory values).
 */

import path from 'path';
import os from 'os';
import { runCli } from './_utils.js';

// Bypass the global fs-extra mock so tests can use real filesystem I/O
const fs = jest.requireActual('fs-extra');

const PROJECT = path.resolve(process.cwd(), 'tests/fixtures/simple-project');
const CLI_TIMEOUT = 60_000; // 60 s — profiling adds overhead

// Use a fresh temp dir per test
let profileDir;
beforeEach(async () => {
  profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-profile-'));
});
afterEach(async () => {
  await fs.remove(profileDir);
});

describe('--profile cpu', () => {
  it(
    'generates a .cpuprofile file and exits 0',
    async () => {
      const { code, stderr } = await runCli(
        [PROJECT, '--profile', 'cpu', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      expect(code).toBe(0);

      const files = await fs.readdir(profileDir);
      const cpuFiles = files.filter((f) => f.endsWith('.cpuprofile'));
      expect(cpuFiles).toHaveLength(1);
      expect(files.filter((f) => f.endsWith('.heapprofile'))).toHaveLength(0);
      expect(stderr).not.toMatch(/Error/i);
    },
    CLI_TIMEOUT,
  );

  it(
    'writes a valid JSON .cpuprofile',
    async () => {
      await runCli(
        [PROJECT, '--profile', 'cpu', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      const files = await fs.readdir(profileDir);
      const cpuFile = files.find((f) => f.endsWith('.cpuprofile'));
      const content = await fs.readJson(path.join(profileDir, cpuFile));
      // V8 CPU profile always has nodes array
      expect(Array.isArray(content.nodes)).toBe(true);
    },
    CLI_TIMEOUT,
  );
});

describe('--profile heap', () => {
  it(
    'generates a .heapprofile file and exits 0',
    async () => {
      const { code, stderr } = await runCli(
        [PROJECT, '--profile', 'heap', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      expect(code).toBe(0);

      const files = await fs.readdir(profileDir);
      expect(files.filter((f) => f.endsWith('.heapprofile'))).toHaveLength(1);
      expect(files.filter((f) => f.endsWith('.cpuprofile'))).toHaveLength(0);
      expect(stderr).not.toMatch(/Error/i);
    },
    CLI_TIMEOUT,
  );

  it(
    'writes a valid JSON .heapprofile',
    async () => {
      await runCli(
        [PROJECT, '--profile', 'heap', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      const files = await fs.readdir(profileDir);
      const heapFile = files.find((f) => f.endsWith('.heapprofile'));
      const content = await fs.readJson(path.join(profileDir, heapFile));
      // V8 heap sampling profile always has a head node and samples array
      expect(content).toHaveProperty('head');
      expect(Array.isArray(content.samples)).toBe(true);
    },
    CLI_TIMEOUT,
  );
});

describe('--profile all', () => {
  it(
    'generates both .cpuprofile and .heapprofile',
    async () => {
      const { code } = await runCli(
        [PROJECT, '--profile', 'all', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      expect(code).toBe(0);

      const files = await fs.readdir(profileDir);
      expect(files.filter((f) => f.endsWith('.cpuprofile'))).toHaveLength(1);
      expect(files.filter((f) => f.endsWith('.heapprofile'))).toHaveLength(1);
    },
    CLI_TIMEOUT,
  );
});

describe('JSON report', () => {
  it(
    'writes a *-report.json with required fields',
    async () => {
      await runCli(
        [PROJECT, '--profile', 'cpu', '--profile-dir', profileDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      const files = await fs.readdir(profileDir);
      const reportFile = files.find((f) => f.endsWith('-report.json'));
      expect(reportFile).toBeDefined();

      const report = await fs.readJson(path.join(profileDir, reportFile));

      expect(typeof report.timestamp).toBe('string');
      expect(typeof report.version).toBe('string');
      expect(typeof report.duration).toBe('number');
      expect(report.duration).toBeGreaterThan(0);
      expect(report.files).toHaveProperty('total');
      expect(report.files).toHaveProperty('processed');
      expect(report.files).toHaveProperty('excluded');
      expect(report.memory).toHaveProperty('heapUsed');
      expect(Array.isArray(report.stages)).toBe(true);
      expect(report.profileFiles).toHaveProperty('cpu');
    },
    CLI_TIMEOUT,
  );
});

describe('--profile-dir', () => {
  it(
    'creates the output directory automatically',
    async () => {
      const nestedDir = path.join(profileDir, 'nested', 'profiles');
      expect(await fs.pathExists(nestedDir)).toBe(false);

      await runCli(
        [PROJECT, '--profile', 'cpu', '--profile-dir', nestedDir, '--stream', '--format', 'json'],
        { env: { NO_COLOR: '1' } },
      );

      expect(await fs.pathExists(nestedDir)).toBe(true);
    },
    CLI_TIMEOUT,
  );
});

describe('invalid --profile type', () => {
  it(
    'exits non-zero for invalid profile type',
    async () => {
      const { code } = await runCli(
        [PROJECT, '--profile', 'flamegraph', '--profile-dir', profileDir, '--stream'],
        { env: { NO_COLOR: '1' } },
      );

      expect(code).not.toBe(0);
    },
    CLI_TIMEOUT,
  );
});

describe('--folder-profile compatibility', () => {
  it(
    '--folder-profile still works for named folder profiles (-p alias)',
    async () => {
      // Create a minimal folder profile in the project dir
      const tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-fp-'));
      try {
        await fs.writeFile(path.join(tmpProject, 'README.md'), '# Test');
        await fs.writeFile(path.join(tmpProject, 'index.js'), 'console.log(1)');
        await fs.writeFile(
          path.join(tmpProject, '.copytree-docs.yml'),
          'include:\n  - "**/*.md"\n',
        );

        const output = path.join(tmpProject, 'out.json');
        const { code } = await runCli(
          ['--folder-profile', 'docs', '--format', 'json', '--stream', '-o', output, tmpProject],
          { env: { NO_COLOR: '1' }, cwd: tmpProject },
        );

        expect(code).toBe(0);
        const result = await fs.readJson(output);
        const paths = result.files.map((f) => f.path);
        expect(paths).toContain('README.md');
        expect(paths).not.toContain('index.js');
      } finally {
        await fs.remove(tmpProject);
      }
    },
    CLI_TIMEOUT,
  );
});
