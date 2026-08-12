/**
 * Wait for the first of several stream events, detaching every listener.
 *
 * The obvious spelling of this is wrong in a way that does not show up until a
 * large export:
 *
 * ```js
 * await new Promise((resolve, reject) => {
 *   stream.once('drain', resolve);
 *   stream.once('error', reject);
 * });
 * ```
 *
 * Whichever event does not fire leaves its listener attached forever. One
 * backpressure cycle is harmless; a few thousand of them — which is an ordinary
 * large repository written to a slow pipe — accumulates thousands of `error`
 * handlers on one stream, trips `MaxListenersExceededWarning`, retains every
 * closure they captured, and makes a later error fire a crowd of callbacks
 * against a promise that settled long ago.
 *
 * `once()` only removes the listener that fired. This removes all of them.
 */

/**
 * Resolve or reject on the first of the named stream events.
 *
 * @param {import('node:events').EventEmitter} stream - Stream to listen on
 * @param {Record<string, 'resolve'|'reject'|((...args: any[]) => Error)>} events -
 *   Event name to disposition. `'resolve'` settles successfully with the event's
 *   first argument, `'reject'` rejects with it, and a function is called with
 *   the event's arguments and must return the `Error` to reject with.
 * @param {Object} [options={}] - Options
 * @param {AbortSignal} [options.signal] - Rejects with the signal's reason
 * @returns {Promise<*>} The resolving event's first argument
 */
export function onceAny(stream, events, options = {}) {
  const { signal } = options;

  return new Promise((resolve, reject) => {
    const names = Object.keys(events);
    const handlers = new Map();
    let onAbort = null;

    const detach = () => {
      for (const [name, handler] of handlers) stream.off(name, handler);
      handlers.clear();
      if (onAbort) signal.removeEventListener('abort', onAbort);
    };

    // Checked before anything is attached, so an already-aborted signal cannot
    // leave listeners behind on a stream nobody is waiting for any more.
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    for (const name of names) {
      const disposition = events[name];
      const handler = (...args) => {
        detach();
        if (disposition === 'resolve') resolve(args[0]);
        else if (disposition === 'reject') reject(args[0]);
        else reject(disposition(...args));
      };
      handlers.set(name, handler);
      stream.on(name, handler);
    }

    if (signal) {
      onAbort = () => {
        detach();
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
