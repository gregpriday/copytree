/**
 * Progress reporting is the same shape from both entry points.
 *
 * `copy()` scaled the scan into the first 80% and kept the rest for formatting
 * and delivery. `copyStream()` passed the caller's callback straight into
 * `scan()` — which reports its own work as 0–100% — and then into
 * `formatStream()`, which accepted an `onProgress` and never called it. So a
 * streaming consumer was told the run was finished before the first chunk
 * existed, heard nothing during the phase they were waiting on, and got no
 * signal for the end of the stream.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { copy, copyStream } from '../../../src/index.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import { PROGRESS_BANDS } from '../../../src/api/progress.js';

let root;
let config;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-progress-'));
  for (let i = 0; i < 6; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `export const x${i} = ${i};\n`);
  }
  config = await ConfigManager.create({ userConfig: false });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Collect every progress update a streaming run emits.
 * @param {Object} [options={}] - Extra copyStream options
 * @returns {Promise<Object[]>} Updates in order
 */
async function streamUpdates(options = {}) {
  const updates = [];
  for await (const chunk of copyStream(root, {
    config,
    onProgress: (p) => updates.push(p),
    ...options,
  })) {
    expect(typeof chunk).toBe('string');
  }
  return updates;
}

/**
 * Collect every progress update a buffered run emits.
 * @returns {Promise<Object[]>} Updates in order
 */
async function copyUpdates() {
  const updates = [];
  await copy(root, { config, onProgress: (p) => updates.push(p) });
  return updates;
}

describe('progress bands', () => {
  it('never goes backwards, from either entry point', async () => {
    for (const updates of [await copyUpdates(), await streamUpdates()]) {
      const percents = updates.map((u) => u.percent);
      expect(percents).toEqual([...percents].sort((a, b) => a - b));
    }
  });

  it('stays within 0-100', async () => {
    for (const updates of [await copyUpdates(), await streamUpdates()]) {
      for (const { percent } of updates) {
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('reaches 100 exactly once, and last', async () => {
    for (const updates of [await copyUpdates(), await streamUpdates()]) {
      const hundreds = updates.filter((u) => u.percent === 100);

      expect(hundreds).toHaveLength(1);
      expect(updates[updates.length - 1].percent).toBe(100);
    }
  });

  it('keeps the scan inside the selection band', async () => {
    // The streaming path used to let the scan report 100%, so a consumer saw
    // the run finish before the first chunk was rendered.
    const updates = await streamUpdates();
    const beforeFormatting = updates.slice(
      0,
      updates.findIndex((u) => u.message === 'Formatting output...'),
    );

    expect(beforeFormatting.length).toBeGreaterThan(0);
    for (const { percent } of beforeFormatting) {
      expect(percent).toBeLessThanOrEqual(PROGRESS_BANDS.SELECT.to);
    }
  });

  it('reports the same phase sequence from both entry points', async () => {
    const phasesOf = (updates) =>
      updates
        .map((u) => u.message)
        .filter((m, i, all) => m !== all[i - 1])
        // `copy()` has a delivery phase that a generator does not.
        .filter((m) => m !== 'Finalizing...');

    expect(phasesOf(await streamUpdates())).toEqual(phasesOf(await copyUpdates()));
  });

  it('carries the stable stage id through, not just a percentage', async () => {
    const updates = await copyUpdates();

    expect(updates.some((u) => typeof u.stage === 'string' && u.stage.length > 0)).toBe(true);
  });

  it('does not report completion when the consumer breaks out early', async () => {
    const updates = [];

    for await (const chunk of copyStream(root, {
      config,
      onProgress: (p) => updates.push(p),
    })) {
      expect(typeof chunk).toBe('string');
      break;
    }

    // Abandoning the stream is not completing it.
    expect(updates.some((u) => u.percent === 100)).toBe(false);
  });

  it('does not report completion when cancelled mid-render', async () => {
    // Cancellation used to be observed only inside the scan, so a run abandoned
    // while it was formatting or being delivered carried on to the end and
    // reported 100%.
    const controller = new AbortController();
    const updates = [];

    await expect(
      copy(root, {
        config,
        signal: controller.signal,
        onProgress: (p) => {
          updates.push(p);
          // Abort the moment selection finishes and rendering begins.
          if (p.message === 'Formatting output...') controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(updates.some((u) => u.percent === 100)).toBe(false);
  });

  it('does not write an output file for a run cancelled mid-render', async () => {
    const controller = new AbortController();
    const target = path.join(root, 'cancelled-output.xml');

    await expect(
      copy(root, {
        config,
        output: target,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.message === 'Formatting output...') controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // The side effect is the whole reason to cancel.
    expect(fs.existsSync(target)).toBe(false);
  });

  it('stops a stream cancelled mid-render without reporting completion', async () => {
    const controller = new AbortController();
    const updates = [];
    let completed = false;

    const consume = async () => {
      for await (const chunk of copyStream(root, {
        config,
        signal: controller.signal,
        onProgress: (p) => {
          updates.push(p);
          if (p.message === 'Formatting output...') controller.abort();
        },
        onComplete: () => {
          completed = true;
        },
      })) {
        expect(typeof chunk).toBe('string');
      }
    };

    await expect(consume()).rejects.toMatchObject({ name: 'AbortError' });

    expect(completed).toBe(false);
    expect(updates.some((u) => u.percent === 100)).toBe(false);
  });

  it('does not report completion when the run is cancelled', async () => {
    const controller = new AbortController();
    const updates = [];

    controller.abort();

    await expect(
      copy(root, { config, signal: controller.signal, onProgress: (p) => updates.push(p) }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(updates.some((u) => u.percent === 100)).toBe(false);
  });
});
