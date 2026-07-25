#!/usr/bin/env node
/**
 * CopyTree benchmark runner.
 *
 * Usage:
 *   node tests/performance/bench.js                          # scorecard
 *   node tests/performance/bench.js --all                    # every scenario
 *   node tests/performance/bench.js --filter DISC            # id prefix match
 *   node tests/performance/bench.js --out results/base.json  # write results
 *   node tests/performance/bench.js --compare a.json b.json  # compare two runs
 *   node tests/performance/bench.js --fixtures               # generate only
 *   node tests/performance/bench.js --clean                  # drop fixtures
 *
 * Profiling is deliberately not wired in here. A CPU profile perturbs the run it
 * is measuring, so the ordinary benchmark establishes where something changed
 * and `npm run profile:cpu` is used afterwards to explain why.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { SCENARIOS, SCORECARD } from './scenarios/index.js';
import { runAll, runAB } from './lib/runner.js';
import { renderRun, compareRuns, renderComparison } from './lib/report.js';
import { machineLoad } from './lib/metrics.js';
import { ensureFixture, cleanFixtures, FIXTURE_SPECS } from './lib/fixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Parse argv into an options object.
 * @param {string[]} argv - Raw arguments
 * @returns {Object} Parsed options
 */
function parseArgs(argv) {
  const options = { filter: null, out: null, compare: null, all: false, samples: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--fixtures') options.fixturesOnly = true;
    else if (arg === '--clean') options.clean = true;
    else if (arg === '--in-process') options.inProcess = true;
    else if (arg === '--ignore-load') options.ignoreLoad = true;
    else if (arg === '--filter') options.filter = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--label') options.label = argv[++i];
    else if (arg === '--samples') options.samples = Number(argv[++i]);
    else if (arg === '--compare') options.compare = [argv[++i], argv[++i]];
    else if (arg === '--ab') options.ab = argv[++i];
    else if (arg === '--rounds') options.rounds = Number(argv[++i]);
  }

  return options;
}

/** @returns {string|null} Current commit sha, when in a repository */
function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Entry point.
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const log = (message) => process.stderr.write(`${message}\n`);

  if (options.clean) {
    await cleanFixtures();
    log('fixtures removed');
    return;
  }

  if (options.compare) {
    const [baselinePath, candidatePath] = options.compare;
    const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
    const candidate = JSON.parse(await fs.readFile(candidatePath, 'utf8'));
    const comparison = compareRuns(baseline, candidate);
    process.stdout.write(`${renderComparison(comparison)}\n`);
    if (options.out) {
      await writeJson(options.out, comparison);
      log(`comparison written to ${options.out}`);
    }
    return;
  }

  if (options.fixturesOnly) {
    for (const name of Object.keys(FIXTURE_SPECS)) {
      const fixture = await ensureFixture(name, { log });
      log(`${name}: ${fixture.fileCount} files at ${fixture.path}`);
    }
    return;
  }

  let scenarios = options.all ? SCENARIOS : SCENARIOS.filter((s) => SCORECARD.includes(s.id));
  if (options.filter) {
    const needle = options.filter.toUpperCase();
    scenarios = SCENARIOS.filter(
      (s) => s.id.toUpperCase().includes(needle) || s.domain.toUpperCase().includes(needle),
    );
  }

  if (scenarios.length === 0) {
    log('no scenarios matched');
    process.exitCode = 1;
    return;
  }

  // Interleaved A/B is robust to ambient load by construction, so it runs
  // regardless of what else the machine is doing.
  if (options.ab) {
    const load = machineLoad();
    log(`interleaved A/B, ${scenarios.length} scenario(s), load ${load.load1}/${load.cores} cores`);

    const { baseline, candidate } = await runAB(scenarios, {
      log,
      scenarios,
      baselineRoot: path.resolve(options.ab),
      candidateRoot: path.resolve(REPO_ROOT),
      rounds: options.rounds ?? 3,
      samples: options.samples ?? undefined,
      baselineLabel: 'baseline',
      candidateLabel: options.label ?? gitSha() ?? 'candidate',
    });

    process.stdout.write(`\n${renderComparison(compareRuns(baseline, candidate))}\n`);

    if (options.out) {
      const target = path.resolve(options.out);
      await writeJson(target.replace(/\.json$/, '.baseline.json'), baseline);
      await writeJson(target.replace(/\.json$/, '.candidate.json'), candidate);
      await writeJson(target, compareRuns(baseline, candidate));
      log(`\nresults written alongside ${options.out}`);
    }
    return;
  }

  // A busy host cannot resolve the differences this suite exists to find, so
  // say so loudly rather than emitting numbers that look authoritative.
  const load = machineLoad();
  if (!load.quiet && !options.ignoreLoad) {
    log(
      `refusing to run: load average ${load.load1} on ${load.cores} cores ` +
        `(${(load.ratio * 100).toFixed(0)}% of capacity).`,
    );
    log('Wait for the machine to settle, or pass --ignore-load to measure anyway.');
    process.exitCode = 2;
    return;
  }

  log(`running ${scenarios.length} scenario(s) (load ${load.load1} on ${load.cores} cores)`);
  const run = await runAll(scenarios, {
    log,
    inProcess: options.inProcess === true,
    samples: options.samples ?? undefined,
    label: options.label ?? gitSha() ?? 'run',
    gitSha: gitSha(),
  });

  process.stdout.write(`\n${renderRun(run)}\n`);

  const unstable = run.results.filter((result) => result.unstable);
  if (unstable.length > 0) {
    log('');
    log('unstable scenarios (output varied between identical runs):');
    for (const result of unstable) log(`  ${result.id} ${result.title}`);
  }

  const failed = run.results.filter((result) => result.failed);
  if (failed.length > 0) {
    log('');
    for (const result of failed) log(`FAILED ${result.id}: ${result.error}`);
    process.exitCode = 1;
  }

  if (options.out) {
    await writeJson(options.out, run);
    log(`\nresults written to ${options.out}`);
  }
}

/**
 * Write JSON, creating the parent directory.
 * @param {string} target - Output path
 * @param {any} value - Serializable value
 * @returns {Promise<void>}
 */
async function writeJson(target, value) {
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
