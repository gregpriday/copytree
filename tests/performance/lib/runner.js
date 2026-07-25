/**
 * Benchmark runner.
 *
 * Every scenario supplies a `run(context)` that does the work and returns a
 * correctness fingerprint. The runner handles warm-up, repeated sampling,
 * instrumentation, and the check that matters most: that a candidate produced
 * exactly what the baseline produced. An optimisation that selects, reads, or
 * formats less data is not an optimisation, and a wall-clock number alone cannot
 * tell the difference.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measure, environment } from './metrics.js';
import { summarizeSamples } from './stats.js';
import { ensureFixture } from './fixtures.js';

/** Delimiter the worker wraps its JSON result in. Kept in sync with worker.js. */
const MARKER = '<<<BENCH_RESULT>>>';

/**
 * Hash a fingerprint object into a stable digest.
 *
 * Keys are sorted so a change in property order never reads as a behaviour
 * change.
 *
 * @param {Object} value - Fingerprint fields
 * @returns {string} sha256 digest, prefixed
 */
export function fingerprint(value) {
  const canonical = JSON.stringify(value, Object.keys(value ?? {}).sort());
  return `sha256:${crypto.createHash('sha256').update(canonical ?? '').digest('hex').slice(0, 32)}`;
}

/**
 * Fingerprint a selection of files: which files, in what order, at what sizes.
 * @param {Array<{path: string, size?: number}>} files - Selected files
 * @returns {Object} Correctness fields
 */
export function fingerprintFiles(files) {
  const list = files ?? [];
  const manifest = list.map((file) => `${file.path}:${file.size ?? 0}`).join('\n');
  return {
    selectedFiles: list.length,
    selectedBytes: list.reduce((sum, file) => sum + (file.size ?? 0), 0),
    manifestHash: `sha256:${crypto.createHash('sha256').update(manifest).digest('hex').slice(0, 32)}`,
  };
}

/**
 * Fingerprint formatted output, normalized so a timestamp or a temporary path
 * never reads as a regression.
 * @param {string} output - Formatted output
 * @returns {Object} Correctness fields
 */
export function fingerprintOutput(output) {
  const text = String(output ?? '');
  const normalized = text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<TIMESTAMP>')
    .replace(/copytree-bench-fixtures[^"'<\s]*/g, '<FIXTURE>');
  return {
    outputBytes: Buffer.byteLength(text, 'utf8'),
    normalizedOutputHash: `sha256:${crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 32)}`,
  };
}

/**
 * Run one scenario end to end.
 *
 * @param {Object} scenario - Scenario definition
 * @param {Object} [options] - Run options
 * @param {number} [options.samples] - Override the scenario's sample count
 * @param {(msg: string) => void} [options.log] - Progress sink
 * @returns {Promise<Object>} A result record in the versioned schema
 */
export async function runScenario(scenario, options = {}) {
  const log = options.log ?? (() => {});
  const samples = options.samples ?? scenario.samples ?? 10;
  const warmup = options.warmup ?? scenario.warmup ?? 2;

  const fixture = scenario.fixture ? await ensureFixture(scenario.fixture, { log }) : null;

  const context = { fixture, log };
  if (scenario.setup) {
    Object.assign(context, (await scenario.setup(context)) ?? {});
  }

  const collected = [];
  const fingerprints = new Set();
  let correctness = null;
  let failure = null;

  for (let i = 0; i < warmup + samples; i++) {
    const isWarmup = i < warmup;
    const { sample, value, error } = await measure((mark) => scenario.run({ ...context, mark }), {
      memory: scenario.memory !== false,
      gc: scenario.gc !== false,
    });

    if (error) {
      failure = error;
      break;
    }

    if (value) {
      correctness = value;
      fingerprints.add(fingerprint(value));
    }

    if (!isWarmup) collected.push(sample);
  }

  if (scenario.teardown) await scenario.teardown(context);

  if (failure) {
    return {
      schemaVersion: 'copytree-bench@1',
      id: scenario.id,
      title: scenario.title,
      domain: scenario.domain,
      failed: true,
      error: failure.message,
      stack: failure.stack,
    };
  }

  // A scenario whose own output varies between identical runs cannot detect a
  // regression, so it is reported as unstable rather than quietly averaged.
  const unstable = fingerprints.size > 1;

  const summary = summarizeSamples(collected);

  return {
    schemaVersion: 'copytree-bench@1',
    id: scenario.id,
    title: scenario.title,
    domain: scenario.domain,
    unit: scenario.unit ?? 'wallMs',
    mode: scenario.mode ?? 'warm-process-reused-config',
    fixture: fixture
      ? {
          name: fixture.name,
          seed: fixture.seed,
          fileCount: fixture.fileCount,
          directoryCount: fixture.directoryCount,
          totalBytes: fixture.totalBytes,
          topology: fixture.topology,
          ignoreProfile: fixture.ignoreProfile,
        }
      : null,
    samples: collected,
    summary,
    correctness: { ...correctness, stable: !unstable },
    ...(unstable ? { unstable: true } : {}),
  };
}

/**
 * Run one scenario in a dedicated child process and collect its result.
 *
 * @param {Object} scenario - Scenario definition
 * @param {Object} [options] - Run options
 * @returns {Promise<Object>} Result record
 */
export function runScenarioIsolated(scenario, options = {}) {
  const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url));
  const args = [workerPath, scenario.id];
  if (options.samples) args.push(String(options.samples));

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        ...(options.srcRoot ? { COPYTREE_BENCH_SRC: options.srcRoot } : {}),
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      options.log?.(String(chunk).trimEnd());
    });

    child.on('close', (code) => {
      const start = stdout.indexOf(MARKER);
      const end = stdout.lastIndexOf(MARKER);
      if (start === -1 || end === start) {
        resolve({
          schemaVersion: 'copytree-bench@1',
          id: scenario.id,
          title: scenario.title,
          domain: scenario.domain,
          failed: true,
          error: `worker exited ${code} without a result`,
          stack: stderr.slice(-2000),
        });
        return;
      }
      resolve(JSON.parse(stdout.slice(start + MARKER.length, end)));
    });
  });
}

/**
 * Run a set of scenarios and assemble a full run record.
 *
 * Scenarios run in separate processes by default so one cannot inherit
 * another's heap state; `inProcess` is available for debugging a single
 * scenario where a shared process is easier to reason about.
 *
 * @param {Object[]} scenarios - Scenario definitions
 * @param {Object} [options] - Run options
 * @param {boolean} [options.inProcess=false] - Run in this process instead
 * @returns {Promise<Object>} Run record
 */
export async function runAll(scenarios, options = {}) {
  const log = options.log ?? (() => {});
  const results = [];

  for (const scenario of scenarios) {
    log(`  ${scenario.id}  ${scenario.title}`);
    results.push(
      options.inProcess
        ? await runScenario(scenario, options)
        : await runScenarioIsolated(scenario, { ...options, log: () => {} }),
    );
  }

  return {
    schemaVersion: 'copytree-bench@1',
    label: options.label ?? 'run',
    gitSha: options.gitSha ?? null,
    timestamp: new Date().toISOString(),
    environment: environment(),
    results,
  };
}

/**
 * Run every scenario against two checkouts, interleaved.
 *
 * Running all of the baseline and then all of the candidate makes the
 * measurement a hostage to whatever else the machine did in between. On a
 * developer workstation that is not a hypothetical: an editor indexing a project
 * mid-suite moves every number after it, in one direction, and the result looks
 * exactly like a regression.
 *
 * Interleaving at the repetition level (A, B, B, A per round, alternating) puts
 * both revisions under the same conditions within seconds of each other, so
 * ambient load raises both sides together and largely cancels in the ratio.
 *
 * @param {Object[]} scenarios - Scenario definitions
 * @param {Object} options - Run options
 * @param {string} options.baselineRoot - Checkout for the baseline side
 * @param {string} options.candidateRoot - Checkout for the candidate side
 * @param {number} [options.rounds=3] - Interleaved repetitions per scenario
 * @returns {Promise<{baseline: Object, candidate: Object}>} Two run records
 */
export async function runAB(scenarios, options) {
  const log = options.log ?? (() => {});
  const rounds = options.rounds ?? 3;

  const baselineResults = [];
  const candidateResults = [];

  for (const scenario of scenarios) {
    log(`  ${scenario.id}  ${scenario.title}`);

    const sides = { baseline: [], candidate: [] };

    for (let round = 0; round < rounds; round++) {
      // Alternate which side goes first so neither systematically inherits a
      // warmer page cache than the other.
      const order =
        round % 2 === 0
          ? [
              ['baseline', options.baselineRoot],
              ['candidate', options.candidateRoot],
            ]
          : [
              ['candidate', options.candidateRoot],
              ['baseline', options.baselineRoot],
            ];

      for (const [side, root] of order) {
        const result = await runScenarioIsolated(scenario, {
          ...options,
          srcRoot: root,
          log: () => {},
        });
        sides[side].push(result);
      }
    }

    baselineResults.push(mergeRounds(scenario, sides.baseline));
    candidateResults.push(mergeRounds(scenario, sides.candidate));
  }

  const shared = {
    schemaVersion: 'copytree-bench@1',
    timestamp: new Date().toISOString(),
    environment: environment(),
  };

  return {
    baseline: { ...shared, label: options.baselineLabel ?? 'baseline', results: baselineResults },
    candidate: { ...shared, label: options.candidateLabel ?? 'candidate', results: candidateResults },
  };
}

/**
 * Fold several rounds of the same scenario into one result record.
 * @param {Object} scenario - Scenario definition
 * @param {Object[]} rounds - Per-round result records
 * @returns {Object} Merged record
 */
function mergeRounds(scenario, rounds) {
  const failed = rounds.find((round) => round.failed);
  if (failed) return failed;

  const samples = rounds.flatMap((round) => round.samples ?? []);
  const first = rounds[0];

  return {
    ...first,
    samples,
    summary: summarizeSamples(samples),
    rounds: rounds.length,
  };
}
