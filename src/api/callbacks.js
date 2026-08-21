/**
 * One policy for every observational callback the SDK offers.
 *
 * `onProgress`, `onSummary`, `onComplete` and `onEvent` all exist so a caller
 * can watch a run. None of them exist to influence it. They did not behave that
 * way: progress, summary and completion callbacks were individually wrapped in
 * `try {} catch {}` at each call site, while `onEvent` was invoked bare — so a
 * listener that threw on one event type killed the operation, and a listener
 * that threw on another was ignored. Which one a caller got depended on which
 * callback they had passed, which is not a contract anybody can reason about.
 *
 * The policy is: **a watcher cannot break the thing it is watching.** A
 * callback that throws is the caller's bug in the caller's code, and the run it
 * was observing carries on. The failure is not swallowed silently — it goes to
 * the debug log, named — but it does not become CopyTree's failure to report.
 *
 * Callbacks that are meant to participate in control flow — cancellation — go
 * through `AbortSignal`, which is explicit, standard, and cannot be triggered by
 * accident from a logging statement.
 */

import { logger } from '../utils/logger.js';

/**
 * Invoke an observational callback, isolating the operation from its failure.
 *
 * @param {string} name - Callback name, for the diagnostic
 * @param {Function|undefined} callback - The caller's function, if they passed one
 * @param {*} payload - The single argument to hand it
 * @returns {void}
 */
export function notify(name, callback, payload) {
  if (typeof callback !== 'function') return;

  try {
    const returned = callback(payload);

    // An `async` callback does not throw — it returns a rejected promise, which
    // the `catch` above cannot see. Nothing awaits it, so the rejection is
    // unhandled, and Node's default for that is to terminate the process. A
    // consumer whose `onProgress` is `async (p) => { await log(p); }` would
    // therefore kill the host application from inside a logging statement.
    // TypeScript permits it: an async function satisfies a `void`-returning
    // signature. It is not awaited here either — an observer must not be able
    // to slow the run down, only to watch it.
    if (returned && typeof returned.then === 'function') {
      returned.then(undefined, (error) => report(name, error));
    }
  } catch (error) {
    report(name, error);
  }
}

/**
 * Record a callback failure without letting the recording become one.
 *
 * @param {string} name - Callback name
 * @param {*} error - What the callback threw or rejected with
 * @returns {void}
 */
function report(name, error) {
  try {
    // Debug, not warn. This is a defect in the consumer's code, and they are
    // the only ones who can act on it; raising it to the terminal would put
    // CopyTree's name on someone else's stack trace in the middle of a run
    // that succeeded.
    logger.debug(`${name} callback threw and was ignored`, {
      callback: name,
      error: error?.message,
    });
  } catch {
    // A logger that throws while reporting that a callback threw must not be
    // the thing that finally breaks the run.
  }
}

export default { notify };
