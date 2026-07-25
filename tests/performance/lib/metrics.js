/**
 * Measurement primitives for the benchmark harness.
 *
 * Deliberately separate from the production stage metrics in `Pipeline`: those
 * use `Date.now()` and a before/after memory delta, which is the right thing for
 * a progress display and the wrong thing for a benchmark. A delta can come out
 * negative if a collection lands mid-stage, so peak memory here is sampled
 * rather than differenced.
 */

import { performance, PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';

/** @returns {number} Monotonic high-resolution time in milliseconds */
export function now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

/**
 * Samples process memory on an interval so peak RSS and peak heap are real
 * maxima rather than endpoint readings.
 */
export class MemorySampler {
  /**
   * @param {number} [intervalMs=10] - Sampling period
   */
  constructor(intervalMs = 10) {
    this.intervalMs = intervalMs;
    this.timer = null;
    this.peakRss = 0;
    this.peakHeap = 0;
  }

  /** Begin sampling, recording the current usage immediately. */
  start() {
    this.peakRss = 0;
    this.peakHeap = 0;
    const usage = process.memoryUsage();
    this.startRss = usage.rss;
    this.startHeap = usage.heapUsed;
    this._sample();
    this.timer = setInterval(() => this._sample(), this.intervalMs);
    // The sampler must never be the reason the process stays alive.
    this.timer.unref?.();
  }

  /**
   * RSS is a process high-water mark that never falls back, so the absolute
   * peak of a late scenario is really the peak of everything that ran before
   * it. Growth above the reading taken at scenario start is the number that
   * describes this scenario; the absolute peak is kept as a ceiling check.
   *
   * @returns {{maxRssBytes: number, rssGrowthBytes: number, peakHeapBytes: number, heapGrowthBytes: number}} Observed memory
   */
  stop() {
    this._sample();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return {
      maxRssBytes: this.peakRss,
      rssGrowthBytes: Math.max(0, this.peakRss - this.startRss),
      peakHeapBytes: this.peakHeap,
      heapGrowthBytes: Math.max(0, this.peakHeap - this.startHeap),
    };
  }

  /** @private */
  _sample() {
    const usage = process.memoryUsage();
    if (usage.rss > this.peakRss) this.peakRss = usage.rss;
    if (usage.heapUsed > this.peakHeap) this.peakHeap = usage.heapUsed;
  }
}

/**
 * Counts garbage collections and total pause time across a measured region.
 *
 * Allocation-driven slowdowns look identical to algorithmic ones in a wall-clock
 * number; GC pause time is what separates them.
 */
export class GcRecorder {
  constructor() {
    this.count = 0;
    this.pauseMs = 0;
    this.observer = null;
  }

  /** Start observing GC entries. */
  start() {
    this.count = 0;
    this.pauseMs = 0;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.count++;
          this.pauseMs += entry.duration;
        }
      });
      this.observer.observe({ entryTypes: ['gc'] });
    } catch {
      // GC observation is a diagnostic; its absence must not fail a run.
      this.observer = null;
    }
  }

  /** @returns {{gcCount: number, gcPauseMs: number}} Observed collections */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    return { gcCount: this.count, gcPauseMs: Number(this.pauseMs.toFixed(3)) };
  }
}

/**
 * Tracks event-loop delay, which is how a synchronous hot loop inside an
 * otherwise async pipeline announces itself.
 */
export class LoopDelayRecorder {
  constructor() {
    this.histogram = null;
  }

  /** Start recording. */
  start() {
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 10 });
      this.histogram.enable();
    } catch {
      this.histogram = null;
    }
  }

  /** @returns {{loopDelayP99Ms: number}} 99th percentile delay */
  stop() {
    if (!this.histogram) return { loopDelayP99Ms: 0 };
    this.histogram.disable();
    const p99 = this.histogram.percentile(99) / 1e6;
    this.histogram = null;
    return { loopDelayP99Ms: Number(p99.toFixed(3)) };
  }
}

/**
 * Run a function under full instrumentation.
 *
 * The measured function may report intermediate marks (time to first file, time
 * to first byte) by calling the `mark` callback it is handed; those are recorded
 * against the same clock as the total.
 *
 * @param {(mark: (name: string) => void) => Promise<any>} fn - Work to measure
 * @param {Object} [options] - Measurement options
 * @param {boolean} [options.memory=true] - Sample process memory
 * @param {boolean} [options.gc=true] - Record GC activity
 * @returns {Promise<{sample: Object, value: any}>} Sample metrics and the return value
 */
export async function measure(fn, options = {}) {
  const wantMemory = options.memory !== false;
  const wantGc = options.gc !== false;

  const sampler = wantMemory ? new MemorySampler() : null;
  const gc = wantGc ? new GcRecorder() : null;
  const loop = new LoopDelayRecorder();

  const marks = {};
  const mark = (name) => {
    if (marks[name] === undefined) marks[name] = now() - startedAt;
  };

  gc?.start();
  loop.start();
  sampler?.start();

  const cpuBefore = process.cpuUsage();
  const startedAt = now();

  let value;
  let error = null;
  try {
    value = await fn(mark);
  } catch (err) {
    error = err;
  }

  const wallMs = now() - startedAt;
  const cpu = process.cpuUsage(cpuBefore);
  const memory = sampler?.stop() ?? {};
  const gcStats = gc?.stop() ?? {};
  const loopStats = loop.stop();

  const sample = {
    wallMs: Number(wallMs.toFixed(3)),
    userCpuMs: Number((cpu.user / 1000).toFixed(3)),
    systemCpuMs: Number((cpu.system / 1000).toFixed(3)),
    ...memory,
    ...gcStats,
    ...loopStats,
    ...Object.fromEntries(
      Object.entries(marks).map(([key, val]) => [key, Number(val.toFixed(3))]),
    ),
  };

  if (error) sample.error = error.message;

  return { sample, value, error };
}

/**
 * Describe the machine a run happened on, so results from different hosts are
 * never silently compared.
 * @returns {Object} Environment descriptor
 */
export function environment() {
  const cpus = os.cpus();
  return {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    kernel: os.release(),
    cpu: cpus[0]?.model ?? 'unknown',
    logicalCpuCount: cpus.length,
    memoryBytes: os.totalmem(),
  };
}

/**
 * Check whether the machine is quiet enough to measure on.
 *
 * A benchmark cannot detect a 10% regression on a host whose load average is
 * higher than its core count: the noise floor swamps the signal. Measured on a
 * 16-core machine, the same discovery scenario reported 605 ms at idle and
 * 4.76 s under a concurrent Xcode build. That is not a slower CopyTree, and
 * publishing it as one would be worse than publishing nothing.
 *
 * @param {number} [tolerance=0.7] - Allowed load as a fraction of core count
 * @returns {{quiet: boolean, load1: number, cores: number, ratio: number}} Verdict
 */
export function machineLoad(tolerance = 0.7) {
  const [load1] = os.loadavg();
  const cores = os.cpus().length || 1;
  const ratio = load1 / cores;
  return { quiet: ratio <= tolerance, load1: Number(load1.toFixed(2)), cores, ratio };
}

export { performance };
