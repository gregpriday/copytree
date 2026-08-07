#!/usr/bin/env node
/**
 * Paired A/B latency comparison between two CopyTree checkouts.
 *
 * `latency.bench.js` measures one checkout and compares its medians against a
 * saved run. That is the right tool on an idle machine and the wrong one on a
 * busy machine, because the two runs happen at different times under different
 * load — and a background build can move a median by 60%, which is larger than
 * anything a performance change is likely to produce.
 *
 * This harness removes that confound by never comparing across time. Each
 * sample is a *pair*: one invocation of A and one of B, back to back, in an
 * order that alternates between pairs so neither side systematically gets the
 * warmer cache. The reported figure is the median of the per-pair differences,
 * which is unaffected by load that both sides experienced equally.
 *
 * It reports the sign test alongside: how many pairs B won. With no real
 * difference that lands near half, whatever the medians say — so it separates
 * "faster" from "noisier".
 *
 * Usage:
 *   node tests/performance/latency-ab.bench.js --baseline <dir> [--samples 25]
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFixture } from './lib/fixtures.js';
import { environment } from './lib/metrics.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The same scenarios `latency.bench.js` defends, so the two stay comparable. */
const SCENARIOS = [
  { id: 'version', title: 'copytree --version', fixture: null, args: () => ['--version'] },
  { id: 'empty', title: 'empty directory', fixture: 'empty', args: (out) => ['.', '-o', out] },
  {
    id: 'tiny-100',
    title: '100 small files',
    fixture: 'tiny-100',
    args: (out) => ['.', '-o', out],
  },
  {
    id: 'tiny-100-display',
    title: '100 small files, --display',
    fixture: 'tiny-100',
    args: () => ['.', '--display'],
  },
  {
    id: 'tiny-100-tree',
    title: '100 small files, --only-tree',
    fixture: 'tiny-100',
    args: (out) => ['.', '--only-tree', '-o', out],
  },
  {
    id: 'tiny-100-dry',
    title: '100 small files, --dry-run',
    fixture: 'tiny-100',
    args: () => ['.', '--dry-run'],
  },
  { id: 'self', title: 'this repository', fixture: null, args: (out) => ['.', '-o', out] },
];

/**
 * Run one CLI invocation and return its wall-clock duration.
 *
 * @param {string} cliPath - Path to the CLI entry point
 * @param {string[]} args - CLI arguments
 * @param {string} cwd - Working directory
 * @returns {Promise<{ms: number, code: number, stderr: string}>} Timing and result
 */
function runOnce(cliPath, args, cwd) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
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
 * Median of a numeric array.
 * @param {number[]} values - Samples
 * @returns {number} Median
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation.
 * @param {number[]} values - Samples
 * @returns {number} MAD
 */
function mad(values) {
  const centre = median(values);
  return median(values.map((value) => Math.abs(value - centre)));
}

/** @param {string[]} argv - Raw arguments @returns {Object} Parsed options */
function parseArgs(argv) {
  const options = { baseline: null, samples: 25, warmup: 3, filter: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--baseline') options.baseline = argv[++i];
    else if (argv[i] === '--samples') options.samples = Number(argv[++i]);
    else if (argv[i] === '--warmup') options.warmup = Number(argv[++i]);
    else if (argv[i] === '--filter') options.filter = argv[++i];
    else if (argv[i] === '--json') options.json = argv[++i];
  }
  return options;
}

/**
 * Run every scenario as a paired comparison and report.
 * @returns {Promise<number>} Process exit code
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.baseline) {
    console.error('usage: latency-ab.bench.js --baseline <checkout-dir> [--samples N]');
    return 2;
  }

  const baselineCli = path.join(path.resolve(options.baseline), 'bin/copytree.js');
  const candidateCli = path.join(REPO_ROOT, 'bin/copytree.js');
  await fs.access(baselineCli);

  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-ab-'));
  const results = [];

  for (const scenario of SCENARIOS) {
    if (options.filter && !scenario.id.includes(options.filter)) continue;

    const cwd = scenario.fixture ? (await ensureFixture(scenario.fixture)).path : REPO_ROOT;
    const out = path.join(outDir, `${scenario.id}.xml`);
    const args = scenario.args(out);

    for (let i = 0; i < options.warmup; i++) {
      await runOnce(baselineCli, args, cwd);
      await runOnce(candidateCli, args, cwd);
    }

    const before = [];
    const after = [];
    let broke = null;

    for (let i = 0; i < options.samples && !broke; i++) {
      // Alternate which side goes first. Whichever runs second in a pair
      // benefits slightly from the other having just warmed the page cache;
      // swapping every pair splits that advantage evenly instead of handing it
      // to one side for the whole run.
      const order = i % 2 === 0 ? [baselineCli, candidateCli] : [candidateCli, baselineCli];
      const timings = new Map();

      for (const cli of order) {
        const run = await runOnce(cli, args, cwd);
        if (run.code !== 0) {
          broke = { cli, ...run };
          break;
        }
        timings.set(cli, run.ms);
      }

      if (broke) break;
      before.push(timings.get(baselineCli));
      after.push(timings.get(candidateCli));
    }

    if (broke) {
      console.error(`✗ ${scenario.id}: ${broke.cli} exited ${broke.code}`);
      console.error(broke.stderr.slice(0, 400));
      continue;
    }

    // Per-pair differences, which is what makes this robust: load that hit both
    // members of a pair cancels out of their difference.
    const deltas = before.map((value, i) => after[i] - value);
    const wins = deltas.filter((delta) => delta < 0).length;

    results.push({
      id: scenario.id,
      title: scenario.title,
      before: median(before),
      after: median(after),
      beforeMad: mad(before),
      afterMad: mad(after),
      deltaMs: median(deltas),
      deltaPct: (median(deltas) / median(before)) * 100,
      wins,
      pairs: deltas.length,
    });
  }

  await fs.rm(outDir, { recursive: true, force: true });

  const env = environment();
  console.log(`node ${process.version} · ${env.cpuModel || os.cpus()[0]?.model || 'unknown cpu'}`);
  console.log(`${options.samples} interleaved pairs after ${options.warmup} warmup pairs`);
  console.log(
    `load average ${os
      .loadavg()
      .map((n) => n.toFixed(1))
      .join(' ')}\n`,
  );

  const head = `${'scenario'.padEnd(28)} ${'before'.padStart(8)} ${'after'.padStart(8)} ${'change'.padStart(9)} ${'B wins'.padStart(8)}`;
  console.log(head);
  console.log('-'.repeat(head.length));

  for (const row of results) {
    const sign = row.deltaPct >= 0 ? '+' : '';
    console.log(
      `${row.title.padEnd(28)} ${row.before.toFixed(1).padStart(8)} ${row.after.toFixed(1).padStart(8)} ` +
        `${(sign + row.deltaPct.toFixed(1) + '%').padStart(9)} ${`${row.wins}/${row.pairs}`.padStart(8)}`,
    );
  }

  console.log(
    '\nbefore/after are medians in ms. change is the median of per-pair differences,\n' +
      'which is what cancels shared load. "B wins" counts pairs where the candidate was\n' +
      'faster — near half means no real difference, whatever the medians suggest.',
  );

  if (options.json) {
    await fs.writeFile(
      options.json,
      `${JSON.stringify({ environment: env, node: process.version, results }, null, 2)}\n`,
    );
    console.log(`\nwrote ${options.json}`);
  }

  return 0;
}

process.exitCode = await main();
