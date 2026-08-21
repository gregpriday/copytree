/**
 * The callback and error contract the public API promises.
 *
 * Two promises, both of which the implementation used to keep only sometimes:
 *
 * 1. **A watcher cannot break the thing it is watching.** `onProgress`,
 *    `onSummary` and `onComplete` were each wrapped at their call sites;
 *    `onEvent` was invoked bare, so a listener that threw propagated through the
 *    EventEmitter and failed the scan. Which behaviour a caller got depended on
 *    which callback they passed.
 *
 * 2. **Every rejection carries a `code`.** The documentation tells consumers to
 *    switch on `error.code` and never on the message. `scan()` satisfied that
 *    for the failures it anticipated and wrapped everything else in a bare
 *    `Error` — leaving the unanticipated failures, the ones most worth
 *    branching on, as the only untyped ones.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { scan, copy, copyStream, ERROR_CODES } from '../../../src/index.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';

let root;
let config;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'copytree-callbacks-'));
  fs.writeFileSync(path.join(root, 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'b.js'), 'export const b = 2;\n');
  config = await ConfigManager.create({ userConfig: false });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** A callback that always throws, and records that it ran. */
const exploding = (calls, name) => () => {
  calls.push(name);
  throw new Error(`${name} is broken`);
};

describe('observational callbacks are isolated from the operation', () => {
  it('survives an onEvent listener that throws', async () => {
    const calls = [];
    const files = [];

    for await (const file of scan(root, { config, onEvent: exploding(calls, 'onEvent') })) {
      files.push(file);
    }

    expect(calls.length).toBeGreaterThan(0);
    expect(files).toHaveLength(2);
  });

  it('survives an onSummary callback that throws', async () => {
    const calls = [];
    const files = [];

    for await (const file of scan(root, { config, onSummary: exploding(calls, 'onSummary') })) {
      files.push(file);
    }

    expect(calls).toEqual(['onSummary']);
    expect(files).toHaveLength(2);
  });

  it('survives an onProgress callback that throws', async () => {
    const calls = [];
    const result = await copy(root, { config, onProgress: exploding(calls, 'onProgress') });

    expect(calls.length).toBeGreaterThan(0);
    expect(result.stats.totalFiles).toBe(2);
  });

  it('survives every copy() callback throwing at once', async () => {
    const calls = [];

    const result = await copy(root, {
      config,
      onProgress: exploding(calls, 'onProgress'),
      onSummary: exploding(calls, 'onSummary'),
      onEvent: exploding(calls, 'onEvent'),
    });

    expect(new Set(calls)).toEqual(new Set(['onProgress', 'onSummary', 'onEvent']));
    expect(result.output).toContain('a.js');
  });

  it('survives copyStream() callbacks that throw', async () => {
    const calls = [];
    let chunks = 0;

    for await (const chunk of copyStream(root, {
      config,
      onSummary: exploding(calls, 'onSummary'),
      onComplete: exploding(calls, 'onComplete'),
    })) {
      expect(typeof chunk).toBe('string');
      chunks++;
    }

    expect(chunks).toBeGreaterThan(0);
    expect(new Set(calls)).toEqual(new Set(['onSummary', 'onComplete']));
  });

  it('survives an async callback that rejects', async () => {
    // An `async` callback does not throw; it returns a rejected promise, which
    // a bare try/catch cannot see. Nothing awaits it, so the rejection is
    // unhandled — and Node's default for that is to terminate the process.
    const rejections = [];
    const onUnhandled = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const result = await copy(root, {
        config,
        // eslint-disable-next-line require-await
        onProgress: async () => {
          throw new Error('async onProgress is broken');
        },
      });

      // Give any unhandled rejection a turn of the loop to surface.
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.stats.totalFiles).toBe(2);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('still stops for an AbortSignal, which is how a caller does influence a run', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(copy(root, { config, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('every public rejection is typed and coded', () => {
  it('codes a missing path', async () => {
    const error = await copy(path.join(root, 'nope'), { config }).catch((e) => e);

    expect(error.code).toBe(ERROR_CODES.PATH_NOT_FOUND);
  });

  it('codes an invalid option', async () => {
    const error = await copy(root, { config, format: 'not-a-format' }).catch((e) => e);

    expect(typeof error.code).toBe('string');
    expect(error.code.startsWith('ERR_')).toBe(true);
  });

  it('wraps an unexpected pipeline failure in a typed error, keeping the cause', async () => {
    // A malformed force-include reaches the walker, which throws for a reason
    // `scan()` has no specific code for. It used to arrive as a bare `Error`
    // with a `cause` and nothing to switch on.
    const error = await scanToCompletion({ config, always: {} }).catch((e) => e);

    expect(error.name).toBe('PipelineError');
    expect(error.code).toBe(ERROR_CODES.OPERATION_FAILED);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it.each([
    ['a plain object', {}],
    ['false', false],
    ['a string', 'default'],
    ['a number', 0],
  ])('codes a config of %s instead of throwing a bare TypeError', async (_label, value) => {
    const error = await scanToCompletion({ config: value }).catch((e) => e);

    expect(error.code).toBe(ERROR_CODES.INVALID_OPTION);
  });

  it('codes a sort key the pipeline cannot use', async () => {
    const error = await scanToCompletion({ config, sort: Symbol('not-a-sort-key') }).catch(
      (e) => e,
    );

    expect(typeof error.code).toBe('string');
    expect(error.code.startsWith('ERR_')).toBe(true);
  });

  /**
   * Drain a scan so its rejection surfaces.
   * @param {Object} options - Scan options
   * @returns {Promise<void>} Resolves when the scan completes
   */
  async function scanToCompletion(options) {
    // eslint-disable-next-line no-unused-vars
    for await (const _file of scan(root, options)) {
      // Draining is the point.
    }
  }
});
