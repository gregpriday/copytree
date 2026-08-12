/**
 * `onceAny` exists because the obvious spelling leaks listeners.
 *
 * ```js
 * await new Promise((resolve, reject) => {
 *   stream.once('drain', resolve);
 *   stream.once('error', reject);
 * });
 * ```
 *
 * `once()` removes only the listener that fired, so whichever event lost the
 * race stays attached. Once per backpressure cycle is invisible; a few thousand
 * cycles — an ordinary large export written to a slow pipe — trips
 * `MaxListenersExceededWarning`, retains every closure the handlers captured,
 * and fires a crowd of stale callbacks at a promise that settled long ago.
 */

import { EventEmitter } from 'node:events';
import { onceAny } from '../../../src/utils/streamEvents.js';

jest.unmock('../../../src/utils/fsx.js');

describe('onceAny', () => {
  it('resolves on the winning event and detaches the losers', async () => {
    const emitter = new EventEmitter();
    const waiter = onceAny(emitter, { drain: 'resolve', error: 'reject', close: 'reject' });

    emitter.emit('drain');
    await expect(waiter).resolves.toBeUndefined();

    expect(emitter.listenerCount('drain')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
    expect(emitter.listenerCount('close')).toBe(0);
  });

  it('rejects with the error and detaches everything', async () => {
    const emitter = new EventEmitter();
    const waiter = onceAny(emitter, { drain: 'resolve', error: 'reject' });
    const boom = new Error('boom');

    emitter.emit('error', boom);
    await expect(waiter).rejects.toBe(boom);

    expect(emitter.listenerCount('drain')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
  });

  it('builds an error for events that carry none', async () => {
    const emitter = new EventEmitter();
    const waiter = onceAny(emitter, {
      drain: 'resolve',
      close: () => new Error('closed while writing'),
    });

    emitter.emit('close');
    await expect(waiter).rejects.toThrow('closed while writing');
  });

  it('returns listener counts to baseline over many cycles', async () => {
    const emitter = new EventEmitter();
    // Well past Node's default limit of 10; the old shape would have warned
    // long before here and left 2000 dead handlers attached.
    emitter.setMaxListeners(12);

    for (let i = 0; i < 1000; i++) {
      const waiter = onceAny(emitter, { drain: 'resolve', error: 'reject', close: 'reject' });
      emitter.emit('drain');
      await waiter;
    }

    expect(emitter.listenerCount('drain')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
    expect(emitter.listenerCount('close')).toBe(0);
  });

  it('rejects on abort and leaves nothing attached', async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const waiter = onceAny(
      emitter,
      { drain: 'resolve', error: 'reject' },
      { signal: controller.signal },
    );

    controller.abort(new Error('cancelled'));
    await expect(waiter).rejects.toThrow('cancelled');

    expect(emitter.listenerCount('drain')).toBe(0);
    expect(emitter.listenerCount('error')).toBe(0);
  });

  it('attaches nothing at all when the signal has already fired', async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));

    await expect(
      onceAny(emitter, { drain: 'resolve' }, { signal: controller.signal }),
    ).rejects.toThrow('already cancelled');

    expect(emitter.listenerCount('drain')).toBe(0);
  });
});
