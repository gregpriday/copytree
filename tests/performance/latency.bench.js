#!/usr/bin/env node
/**
 * Cold-CLI latency benchmark.
 *
 * `bench.js` measures throughput — how fast the walker gets through 50,000
 * paths. This measures the other thing, and the one a person actually
 * experiences: how long `copytree` takes from shell to prompt, including Node
 * startup, module loading, configuration, and delivery.
 *
 * They need separate harnesses because they have opposite requirements. A
 * throughput benchmark wants the work to dominate, so it runs in-process and
 * amortises startup away. A latency benchmark wants startup *included*, because
 * on a small repository — which is most invocations — startup is the majority
 * of the wall clock. An in-process measurement of a 100-file copy reports the
 * 20 ms of work and hides the 80 ms the user waited.
 *
 * Usage:
 *   node tests/performance/latency.bench.js
 *   node tests/performance/latency.bench.js --samples 20
 *   node tests/performance/latency.bench.js --json results.json
 *   node tests/performance/latency.bench.js --compare before.json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFixture } from './lib/fixtures.js';
import { environment, machineLoad } from './lib/metrics.js';
import BUDGETS from './latency-budgets.json' with { type: 'json' };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(REPO_ROOT, 'bin/copytree.js');

/**
 * The scenarios worth defending, each naming what it is sensitive to.
 *
 * Every one writes to a file rather than the clipboard: a clipboard write
 * shells out to a platform helper whose latency belongs to the OS, not to us,
 * and on a headless CI machine it fails outright.
 */
const SCENARIOS = [
  {
    id: 'version',
    title: 'copytree --version',
    detail: 'Pure process and module-graph cost. Nothing is read, nothing is written.',
    fixture: null,
    args: () => ['--version'],
  },
  {
    id: 'empty',
    title: 'empty directory',
    detail: 'Startup plus configuration, with no traversal to hide behind.',
    fixture: 'empty',
    args: (out) => ['.', '--output', out],
  },
  {
    id: 'tiny-100',
    title: '100 small files',
    detail: 'The common interactive case. Latency-dominated.',
    fixture: 'tiny-100',
    args: (out) => ['.', '--output', out],
  },
  {
    id: 'tiny-100-display',
    title: '100 small files, --display',
    detail: 'Same selection, straight to stdout: isolates delivery cost.',
    fixture: 'tiny-100',
    args: () => ['.', '--display'],
  },
  {
    id: 'tiny-100-tree',
    title: '100 small files, --only-tree',
    detail: 'Selection without loading or formatting any content.',
    fixture: 'tiny-100',
    args: (out) => ['.', '--only-tree', '--output', out],
  },
  {
    id: 'tiny-100-dry',
    title: '100 small files, --dry-run',
    detail: 'Selection only. The floor for any run that has to walk the tree.',
    fixture: 'tiny-100',
    args: () => ['.', '--dry-run'],
  },
];

/**
 * Run the CLI once and return its wall-clock duration.
 *
 * Timed around spawn to exit, so Node's own startup is inside the measurement.
 * That is the point: it is time the user waits.
 *
 * @param {string[]} args - CLI arguments
 * @param {string} cwd - Working directory
 * @returns {Promise<{ms: number, code: number, stderr: string}>} Timing and result
 */
function runOnce(args, cwd) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      // Pinned so a developer's own config or locale cannot move the numbers.
      env: { ...process.env, COPYTREE_LOG_LEVEL: 'error', NO_COLOR: '1', LANG: 'en_US.UTF-8' },
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ ms: Number(process.hrtime.bigint() - started) / 1e6, code, stderr });
    });
  });
}

/**
 * Summarise a sample set.
 *
 * The headline is the median, not the mean: process startup has a long right
 * tail (scheduler, page cache, an antivirus hook) and a single outlier moves a
 * mean enough to invent a regression that is not there. `mad` — median absolute
 * deviation — reports the spread without the same sensitivity, and is the
 * number to check before believing a small delta.
 *
 * @param {number[]} samples - Durations in milliseconds
 * @returns {Object} Summary statistics
 */
function summarise(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const median = at(0.5);
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);

  return {
    min: sorted[0],
    p50: median,
    p90: at(0.9),
    max: sorted[sorted.length - 1],
    mad: deviations[Math.floor(deviations.length / 2)],
    samples: sorted.length,
  };
}

/** @param {string[]} argv - Raw arguments @returns {Object} Parsed options */
function parseArgs(argv) {
  const options = { samples: 12, warmup: 3, json: null, compare: null, filter: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--samples') options.samples = Number(argv[++i]);
    else if (argv[i] === '--warmup') options.warmup = Number(argv[++i]);
    else if (argv[i] === '--json') options.json = argv[++i];
    else if (argv[i] === '--compare') options.compare = argv[++i];
    else if (argv[i] === '--filter') options.filter = argv[++i];
  }
  return options;
}

/**
 * Run every scenario and report.
 * @returns {Promise<number>} Process exit code
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-latency-'));

  const load = machineLoad();
  if (load && load.busy) {
    console.error(`! machine is busy (${load.reason}); numbers will be noisy\n`);
  }

  const results = [];
  let failures = 0;

  for (const scenario of SCENARIOS) {
    if (options.filter && !scenario.id.includes(options.filter)) continue;

    const cwd = scenario.fixture ? (await ensureFixture(scenario.fixture)).path : REPO_ROOT;
    const out = path.join(outDir, `${scenario.id}.xml`);

    // Warm the page cache and let V8 settle before anything is recorded.
    for (let i = 0; i < options.warmup; i++) await runOnce(scenario.args(out), cwd);

    const samples = [];
    let broke = null;
    for (let i = 0; i < options.samples; i++) {
      const run = await runOnce(scenario.args(out), cwd);
      if (run.code !== 0) {
        broke = run;
        break;
      }
      samples.push(run.ms);
    }

    if (broke) {
      console.error(`✗ ${scenario.id}: exited ${broke.code}\n${broke.stderr.slice(0, 400)}`);
      failures++;
      continue;
    }

    results.push({ id: scenario.id, title: scenario.title, ...summarise(samples) });
  }

  await fs.rm(outDir, { recursive: true, force: true });

  const env = environment();
  console.log(`node ${process.version} · ${env.cpuModel || os.cpus()[0]?.model || 'unknown cpu'}`);
  console.log(`${options.samples} samples after ${options.warmup} warmups, median reported\n`);
  console.log(`${'scenario'.padEnd(26)} ${'p50'.padStart(8)} ${'mad'.padStart(7)} ${'p90'.padStart(8)}  budget`);

  for (const row of results) {
    const budget = BUDGETS.scenarios[row.id];
    const over = budget && row.p50 > budget.p50Ms;
    if (over) failures++;

    const verdict = budget ? (over ? `OVER ${budget.p50Ms}ms` : `ok (${budget.p50Ms}ms)`) : '—';
    console.log(
      `${row.title.padEnd(26)} ${row.p50.toFixed(1).padStart(8)} ${row.mad.toFixed(1).padStart(7)} ` +
        `${row.p90.toFixed(1).padStart(8)}  ${verdict}`,
    );
  }

  if (options.json) {
    await fs.writeFile(
      options.json,
      `${JSON.stringify({ environment: env, node: process.version, results }, null, 2)}\n`,
    );
    console.log(`\nwrote ${options.json}`);
  }

  if (options.compare) {
    const before = JSON.parse(await fs.readFile(options.compare, 'utf8'));
    const previous = new Map(before.results.map((row) => [row.id, row]));
    console.log(`\nvs ${options.compare}:`);

    for (const row of results) {
      const was = previous.get(row.id);
      if (!was) continue;
      const delta = ((row.p50 - was.p50) / was.p50) * 100;
      // Only call it a change when it clears the noise floor of both runs.
      const noise = (row.mad + was.mad) * 1.5;
      const meaningful = Math.abs(row.p50 - was.p50) > noise;
      const sign = delta >= 0 ? '+' : '';
      console.log(
        `  ${row.title.padEnd(26)} ${was.p50.toFixed(1).padStart(7)} → ${row.p50.toFixed(1).padStart(7)} ms ` +
          `${sign}${delta.toFixed(1)}%${meaningful ? '' : ' (within noise)'}`,
      );
      if (meaningful && delta > BUDGETS.regressionThresholdPercent) failures++;
    }
  }

  return failures > 0 ? 1 : 0;
}

process.exitCode = await main();
