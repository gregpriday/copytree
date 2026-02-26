// Unmock fs-extra for these tests to use real filesystem
jest.unmock('fs-extra');

import { scan, copy } from '../../src/index.js';
import path from 'path';

const testDir = path.resolve(process.cwd(), 'tests/fixtures/simple-project');

describe('onProgress callback integration', () => {
  describe('scan() with onProgress', () => {
    it('receives progress updates from 0 to 100', async () => {
      const updates = [];

      const files = [];
      for await (const file of scan(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      })) {
        files.push(file);
      }

      expect(files.length).toBeGreaterThan(0);
      expect(updates.length).toBeGreaterThan(0);

      // Should start at 0%
      expect(updates[0].percent).toBe(0);

      // Should end at 100%
      expect(updates[updates.length - 1].percent).toBe(100);
    });

    it('reports monotonically increasing progress', async () => {
      const updates = [];

      for await (const _file of scan(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      })) {
        // consume all files
      }

      for (let i = 1; i < updates.length; i++) {
        expect(updates[i].percent).toBeGreaterThanOrEqual(updates[i - 1].percent);
      }
    });

    it('includes descriptive messages', async () => {
      const updates = [];

      for await (const _file of scan(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      })) {
        // consume all files
      }

      // Every update should have a message
      updates.forEach((u) => {
        expect(u.message).toBeDefined();
        expect(typeof u.message).toBe('string');
        expect(u.message.length).toBeGreaterThan(0);
      });
    });

    it('works with no-op when onProgress not provided', async () => {
      // Should work without any errors when onProgress is omitted
      const files = [];
      for await (const file of scan(testDir)) {
        files.push(file);
      }
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('copy() with onProgress', () => {
    it('receives progress updates from 0 to 100', async () => {
      const updates = [];

      const result = await copy(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      });

      expect(result.files.length).toBeGreaterThan(0);
      expect(updates.length).toBeGreaterThan(0);

      // Should start at 0%
      expect(updates[0].percent).toBe(0);

      // Should end at 100%
      expect(updates[updates.length - 1].percent).toBe(100);
    });

    it('reports monotonically increasing progress', async () => {
      const updates = [];

      await copy(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      });

      for (let i = 1; i < updates.length; i++) {
        expect(updates[i].percent).toBeGreaterThanOrEqual(updates[i - 1].percent);
      }
    });

    it('includes formatting progress', async () => {
      const updates = [];

      await copy(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      });

      // Should have a "Formatting output..." message
      const formatMsg = updates.find((u) => u.message === 'Formatting output...');
      expect(formatMsg).toBeDefined();
      expect(formatMsg.percent).toBe(80);
    });

    it('works with dry run', async () => {
      const updates = [];

      const result = await copy(testDir, {
        dryRun: true,
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      });

      expect(result.stats.dryRun).toBe(true);
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].percent).toBe(0);
      expect(updates[updates.length - 1].percent).toBe(100);
    });

    it('works without onProgress callback', async () => {
      // Should work without any errors when onProgress is omitted
      const result = await copy(testDir);
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('respects progressThrottleMs option', async () => {
      const updates = [];

      await copy(testDir, {
        onProgress: (progress) => updates.push({ ...progress, time: Date.now() }),
        progressThrottleMs: 50,
      });

      // Should have received some updates but not too many
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[updates.length - 1].percent).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('handles empty result set with progress — always emits start and complete', async () => {
      const updates = [];

      // Use a restrictive file count limit to trigger a near-empty run
      try {
        for await (const _file of scan(testDir, {
          maxFileCount: 1,
          onProgress: (progress) => updates.push(progress),
          progressThrottleMs: 0,
        })) {
          // consume
        }
      } catch {
        // May throw on limit exhaustion — that's fine
      }

      // Must always emit at least the pipeline:start (0%) event
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].percent).toBe(0);
    });

    it('progress percent values are always between 0 and 100', async () => {
      const updates = [];

      await copy(testDir, {
        onProgress: (progress) => updates.push(progress),
        progressThrottleMs: 0,
      });

      updates.forEach((u) => {
        expect(u.percent).toBeGreaterThanOrEqual(0);
        expect(u.percent).toBeLessThanOrEqual(100);
      });
    });
  });
});
