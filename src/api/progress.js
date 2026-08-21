/**
 * One progress model for `copy()` and `copyStream()`.
 *
 * The two used to disagree in a way that mattered. `copy()` scaled the scan
 * into the first 80% and kept the rest for formatting and delivery.
 * `copyStream()` handed the caller's callback straight to `scan()` — which
 * reports its own work as 0–100% — and then to `formatStream()`, which ignored
 * it. So a streaming consumer saw 100% before a single byte had been rendered,
 * received nothing during the phase they were actually waiting on, and had no
 * signal at all for the end of the stream.
 *
 * Worse, "100%" meant different things. For a generator, completion has to mean
 * the generator reached its natural end — not that some phase inside it
 * finished. A consumer that breaks out of the loop early, or cancels, has not
 * completed anything, and telling them they have is how a UI ends up rendering
 * "47 files copied" over a half-written stream.
 *
 * The bands are deliberately coarse. Selection is the only phase whose
 * denominator is known while it runs; formatting drains its input before the
 * first chunk, so a per-chunk percentage would be invented. Coarse and true
 * beats granular and made up.
 */

import { PIPELINE_STAGES } from '../utils/ProgressTracker.js';
import { notify } from './callbacks.js';

/**
 * Where each phase of an operation sits on the 0–100 scale.
 *
 * Selection gets the bulk because it is the part that takes real time and the
 * only part that can report a denominator.
 */
export const PROGRESS_BANDS = Object.freeze({
  /** Discovery, loading, transformation, secrets, budgets */
  SELECT: Object.freeze({ from: 0, to: 80 }),
  /** Serialization into the requested format */
  RENDER: Object.freeze({ from: 80, to: 95 }),
  /** Writing, clipboard, reference files */
  FINALIZE: Object.freeze({ from: 95, to: 100 }),
});

/**
 * Build the progress coordinator for one operation.
 *
 * Returns `null` when the caller passed no callback, so every call site can
 * guard with a single truthiness check rather than paying for a no-op on every
 * update.
 *
 * @param {Function} [onProgress] - The caller's callback
 * @returns {{start: Function, scan: Function, rendering: Function, finalizing: Function, complete: Function}|null} Coordinator
 */
export function createProgressCoordinator(onProgress) {
  if (typeof onProgress !== 'function') return null;

  let last = -1;
  let completed = false;

  /**
   * Emit one update, never going backwards.
   * @param {number} percent - Target percentage
   * @param {string} message - Human-readable status
   * @param {Object} [source={}] - Underlying progress object to carry through
   * @returns {void}
   */
  const emit = (percent, message, source = {}) => {
    // Monotonic. Phases overlap in wall-clock time — a stage can report late —
    // and a progress bar that goes backwards reads as a bug in the caller's
    // application rather than in ours.
    const clamped = Math.max(Math.min(percent, 100), last);
    last = clamped;
    // Every field the underlying progress carried is passed through. Rebuilding
    // the object from `percent` and `message` alone dropped `stage`, so the
    // stable stage id that `PIPELINE_STAGES` exists to publish was invisible to
    // exactly the callers most likely to render it.
    notify('onProgress', onProgress, { ...source, percent: clamped, message });
  };

  return {
    /**
     * Announce the start of the operation.
     * @returns {void}
     */
    start() {
      emit(PROGRESS_BANDS.SELECT.from, 'Starting...', { stage: PIPELINE_STAGES.UNKNOWN });
    },

    /**
     * Scale one scan-phase update into the selection band.
     * @param {{percent: number, message: string}} progress - Scan progress
     * @returns {void}
     */
    scan(progress) {
      const { from, to } = PROGRESS_BANDS.SELECT;
      // The scan's own tracker signs off with "Complete", which is true of the
      // scan and false of the operation. Relayed verbatim it reached the caller
      // as "Complete" at 80%, followed later by "Complete" at 100% — two
      // completions, the first of them wrong.
      const message = progress.percent >= 100 ? 'Selection complete' : progress.message;
      emit(from + Math.round((progress.percent / 100) * (to - from)), message, progress);
    },

    /**
     * Announce that serialization has begun.
     * @returns {void}
     */
    rendering() {
      emit(PROGRESS_BANDS.RENDER.from, 'Formatting output...', { stage: PIPELINE_STAGES.FORMAT });
    },

    /**
     * Announce that the output is being delivered.
     * @returns {void}
     */
    finalizing() {
      emit(PROGRESS_BANDS.FINALIZE.from, 'Finalizing...', { stage: PIPELINE_STAGES.FORMAT });
    },

    /**
     * Announce successful completion, once.
     *
     * Only the natural end of the operation calls this. A consumer who breaks
     * out of a stream, or cancels, never reaches it — which is the point.
     *
     * @returns {void}
     */
    complete() {
      if (completed) return;
      completed = true;
      emit(100, 'Complete', { stage: PIPELINE_STAGES.UNKNOWN });
    },
  };
}

export default createProgressCoordinator;
