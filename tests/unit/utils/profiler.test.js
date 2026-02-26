/**
 * Unit tests for src/utils/profiler.js
 *
 * Uses dependency injection (_session option) to test without real V8 profiling.
 */

import { jest } from '@jest/globals';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { Profiler, writeProfilingReport } from '../../../src/utils/profiler.js';

// ─── Mock session factory ─────────────────────────────────────────────────────

function makeMockSession(overrides = {}) {
  const post = jest.fn((method, _params, cb) => {
    if (method === 'Profiler.stop') {
      cb(null, {
        profile: { nodes: [], startTime: 0, endTime: 1000, samples: [], timeDeltas: [] },
      });
    } else if (method === 'HeapProfiler.stopSampling') {
      cb(null, { profile: { head: { callFrame: {} }, samples: [], locations: [] } });
    } else {
      cb(null, {});
    }
  });

  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    post,
    ...overrides,
  };
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'profiler-test-'));
}

// ─── Profiler constructor ─────────────────────────────────────────────────────

describe('Profiler', () => {
  describe('constructor', () => {
    it('uses cpu as default type', () => {
      const p = new Profiler({ profileDir: '/tmp', _session: makeMockSession() });
      expect(p.type).toBe('cpu');
    });

    it('accepts heap type', () => {
      const p = new Profiler({ type: 'heap', profileDir: '/tmp', _session: makeMockSession() });
      expect(p.type).toBe('heap');
    });

    it('accepts all type', () => {
      const p = new Profiler({ type: 'all', profileDir: '/tmp', _session: makeMockSession() });
      expect(p.type).toBe('all');
    });

    it('throws on invalid type', () => {
      expect(() => new Profiler({ type: 'flamegraph', profileDir: '/tmp' })).toThrow(
        /Invalid profile type/,
      );
    });

    it('defaults profileDir to .profiles', () => {
      const p = new Profiler({ _session: makeMockSession() });
      expect(p.profileDir).toBe('.profiles');
    });
  });

  // ─── start() ───────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('connects session and enables CPU profiler for cpu type', async () => {
      const session = makeMockSession();
      const p = new Profiler({ type: 'cpu', profileDir: makeTmpDir(), _session: session });
      await p.start();

      expect(session.connect).toHaveBeenCalledTimes(1);
      const methods = session.post.mock.calls.map((c) => c[0]);
      expect(methods).toContain('Profiler.enable');
      expect(methods).toContain('Profiler.start');
      expect(methods).not.toContain('HeapProfiler.enable');
    });

    it('enables heap profiler for heap type', async () => {
      const session = makeMockSession();
      const p = new Profiler({ type: 'heap', profileDir: makeTmpDir(), _session: session });
      await p.start();

      const methods = session.post.mock.calls.map((c) => c[0]);
      expect(methods).toContain('HeapProfiler.enable');
      expect(methods).toContain('HeapProfiler.startSampling');
      expect(methods).not.toContain('Profiler.enable');
    });

    it('enables both profilers for all type', async () => {
      const session = makeMockSession();
      const p = new Profiler({ type: 'all', profileDir: makeTmpDir(), _session: session });
      await p.start();

      const methods = session.post.mock.calls.map((c) => c[0]);
      expect(methods).toContain('Profiler.enable');
      expect(methods).toContain('HeapProfiler.enable');
    });
  });

  // ─── stop() ────────────────────────────────────────────────────────────────

  // stop() tests use a fixed profileDir string since fs-extra is globally mocked
  // and fs.pathExistsSync/readJsonSync are reset between tests.
  // Instead, we spy on fs.writeJson to verify what would be written.
  const FIXED_DIR = '/tmp/profiler-unit-tests';

  describe('stop()', () => {
    it('stops CPU profiler, returns cpu path, does not return heap path', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: makeMockSession() });
      await p.start();
      const result = await p.stop();

      expect(result.cpu).toMatch(/\.cpuprofile$/);
      expect(result.heap).toBeUndefined();
    });

    it('stops heap profiler, returns heap path, does not return cpu path', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const p = new Profiler({ type: 'heap', profileDir: FIXED_DIR, _session: makeMockSession() });
      await p.start();
      const result = await p.stop();

      expect(result.heap).toMatch(/\.heapprofile$/);
      expect(result.cpu).toBeUndefined();
    });

    it('returns both cpu and heap paths for all type', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const p = new Profiler({ type: 'all', profileDir: FIXED_DIR, _session: makeMockSession() });
      await p.start();
      const result = await p.stop();

      expect(result.cpu).toMatch(/\.cpuprofile$/);
      expect(result.heap).toMatch(/\.heapprofile$/);
    });

    it('calls fs.ensureDir to create profileDir', async () => {
      const ensureSpy = jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: makeMockSession() });
      await p.start();
      await p.stop();

      expect(ensureSpy).toHaveBeenCalledWith(FIXED_DIR);
    });

    it('disconnects session after stop', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const session = makeMockSession();
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: session });
      await p.start();
      await p.stop();
      expect(session.disconnect).toHaveBeenCalledTimes(1);
    });

    it('disconnects session even when ensureDir rejects', async () => {
      jest.spyOn(fs, 'ensureDir').mockRejectedValue(new Error('EACCES: permission denied'));
      const session = makeMockSession();
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: session });
      await p.start();
      await expect(p.stop()).rejects.toThrow('EACCES');
      expect(session.disconnect).toHaveBeenCalledTimes(1);
    });

    it('writes .cpuprofile JSON via fs.writeJson', async () => {
      const writeSpy = jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: makeMockSession() });
      await p.start();
      await p.stop();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const [writtenPath, writtenContent] = writeSpy.mock.calls[0];
      expect(writtenPath).toMatch(/\.cpuprofile$/);
      expect(Array.isArray(writtenContent.nodes)).toBe(true);
    });

    it('uses inspector.post to stop CPU profiler', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const session = makeMockSession();
      const p = new Profiler({ type: 'cpu', profileDir: FIXED_DIR, _session: session });
      await p.start();
      await p.stop();

      const stopCall = session.post.mock.calls.find((c) => c[0] === 'Profiler.stop');
      expect(stopCall).toBeDefined();
    });

    it('uses inspector.post to stop heap profiler', async () => {
      jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
      const session = makeMockSession();
      const p = new Profiler({ type: 'heap', profileDir: FIXED_DIR, _session: session });
      await p.start();
      await p.stop();

      const stopCall = session.post.mock.calls.find((c) => c[0] === 'HeapProfiler.stopSampling');
      expect(stopCall).toBeDefined();
    });
  });
});

// ─── writeProfilingReport ─────────────────────────────────────────────────────
// These tests use jest.spyOn to capture the written JSON, because fs-extra is
// globally mocked (it doesn't perform real I/O in the unit test environment).

describe('writeProfilingReport()', () => {
  const PROFILE_DIR = '/tmp/test-profiles';
  const TIMESTAMP = '2024-01-15T10-30-45';

  it('writes a valid JSON report file with correct fields', async () => {
    const writeSpy = jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);

    const reportPath = await writeProfilingReport({
      profileDir: PROFILE_DIR,
      timestamp: TIMESTAMP,
      duration: 1500,
      version: '1.0.0',
      command: 'copytree . --profile cpu',
      files: { total: 100, processed: 95, excluded: 5 },
      memory: { heapUsed: 50_000_000, heapTotal: 100_000_000, rss: 80_000_000, external: 1000 },
      perStageTimings: { FileDiscoveryStage: 500, TransformStage: 800 },
      perStageMetrics: {
        FileDiscoveryStage: { memoryUsage: { delta: { heapUsed: 10_000_000 } } },
        TransformStage: { memoryUsage: { delta: { heapUsed: 20_000_000 } } },
      },
      profileFiles: { cpu: `${PROFILE_DIR}/${TIMESTAMP}-cpu.cpuprofile` },
    });

    expect(reportPath).toMatch(/-report\.json$/);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    const writtenReport = writeSpy.mock.calls[0][1];
    expect(writtenReport.duration).toBe(1500);
    expect(writtenReport.version).toBe('1.0.0');
    expect(writtenReport.files.total).toBe(100);
    expect(writtenReport.files.excluded).toBe(5);
    expect(writtenReport.stages).toHaveLength(2);
    expect(writtenReport.stages[0]).toMatchObject({
      name: 'FileDiscoveryStage',
      duration: 500,
      memoryDelta: 10_000_000,
    });
    expect(writtenReport.profileFiles.cpu).toBeDefined();
  });

  it('calls fs.ensureDir to create profileDir', async () => {
    jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
    const ensureSpy = jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);

    await writeProfilingReport({
      profileDir: PROFILE_DIR,
      timestamp: TIMESTAMP,
      duration: 100,
      version: '1.0.0',
      command: 'copytree . --profile cpu',
      files: { total: 0, processed: 0, excluded: 0 },
      memory: {},
    });

    expect(ensureSpy).toHaveBeenCalledWith(PROFILE_DIR);
  });

  it('handles missing perStageTimings gracefully (empty stages array)', async () => {
    const writeSpy = jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);

    await writeProfilingReport({
      profileDir: PROFILE_DIR,
      timestamp: TIMESTAMP,
      duration: 50,
      version: '1.0.0',
      command: 'copytree .',
      files: { total: 5, processed: 5, excluded: 0 },
      memory: {},
    });

    const writtenReport = writeSpy.mock.calls[0][1];
    expect(writtenReport.stages).toEqual([]);
  });

  it('includes profileFiles in report when both cpu and heap are provided', async () => {
    const writeSpy = jest.spyOn(fs, 'writeJson').mockResolvedValue(undefined);
    const ts = '2024-06-01T12-00-00';

    await writeProfilingReport({
      profileDir: PROFILE_DIR,
      timestamp: ts,
      duration: 200,
      version: '0.13.1',
      command: 'copytree . --profile all',
      files: { total: 10, processed: 10, excluded: 0 },
      memory: { heapUsed: 1000 },
      profileFiles: {
        cpu: `.profiles/${ts}-cpu.cpuprofile`,
        heap: `.profiles/${ts}-heap.heapprofile`,
      },
    });

    const writtenReport = writeSpy.mock.calls[0][1];
    expect(writtenReport.profileFiles.cpu).toContain('.cpuprofile');
    expect(writtenReport.profileFiles.heap).toContain('.heapprofile');
    expect(typeof writtenReport.timestamp).toBe('string');
  });
});
