/**
 * Performance Budget Tests
 *
 * Enforces documented performance targets from CLAUDE.md:
 *   - Process 10,000 files in < 30 seconds
 *   - Memory usage < 500MB for large projects
 *
 * These tests use the real filesystem and real walkers — they MUST NOT
 * run under jest.config.js's "mocked" project because fs-extra is mocked
 * there. Use jest.performance.config.js instead.
 *
 * Run with:
 *   npm run test:performance
 */

import { performance } from 'node:perf_hooks';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { walkWithIgnore } from '../../src/utils/ignoreWalker.js';
import { generateFixture, cleanupFixtures } from '../helpers/fixtureGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGETS_PATH = path.join(__dirname, 'budgets.json');
const RESULTS_DIR = path.join(__dirname, 'results');

// Load budgets synchronously — top-level await is not supported by babel-jest
const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));

/**
 * Measure file discovery performance for a given fixture.
 *
 * Returns duration, file count, and the DELTA RSS (how much RSS grew during
 * the walk). Using delta rather than absolute RSS avoids false failures due
 * to the Node.js/Jest process baseline (typically 150–200 MB).
 *
 * @param {string} fixturePath - Path to the synthetic project
 * @returns {Promise<{duration: number, fileCount: number, deltaRssMb: number, baselineRssMb: number}>}
 */
async function measureDiscovery(fixturePath) {
  // Optionally trigger GC before measurement if --expose-gc is set
  if (typeof global.gc === 'function') {
    global.gc();
  }

  const memBefore = process.memoryUsage();
  const baselineRss = memBefore.rss;
  const startTime = performance.now();
  let fileCount = 0;
  let peakRss = baselineRss;

  for await (const _file of walkWithIgnore(fixturePath, {
    ignoreFileName: '.copytreeignore',
    includeDirectories: false,
    followSymlinks: false,
  })) {
    fileCount++;
    // Sample memory every 100 files to minimise overhead
    if (fileCount % 100 === 0) {
      const current = process.memoryUsage().rss;
      if (current > peakRss) peakRss = current;
    }
  }

  const duration = performance.now() - startTime;
  // Final sample
  const rssAfter = process.memoryUsage().rss;
  if (rssAfter > peakRss) peakRss = rssAfter;

  return {
    duration,
    fileCount,
    deltaRssMb: (peakRss - baselineRss) / (1024 * 1024),
    baselineRssMb: baselineRss / (1024 * 1024),
  };
}

/**
 * Save results to the results directory as a JSON artifact.
 */
async function saveResults(label, metrics) {
  await fs.ensureDir(RESULTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `budget-${label}-${timestamp}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  const payload = {
    label,
    timestamp: new Date().toISOString(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    metrics,
    budgets: budgets.fileDiscovery[label],
  };
  await fs.writeJson(filepath, payload, { spaces: 2 });
}

// Shared fixture paths — generated once per test size, cleaned up after all
const fixtures = {};

beforeAll(async () => {
  // Small fixture is fast to generate; medium takes a few seconds; large up to ~20s.
  // We generate them all upfront so individual tests aren't penalised.
  //
  // withIgnoreFiles: false avoids random .copytreeignore files that can make the
  // generator stop early — improving consistency of the generated file count.
  const [small, medium, large] = await Promise.all([
    generateFixture({ fileCount: 100, name: 'budget-small', withIgnoreFiles: false }),
    generateFixture({ fileCount: 1000, name: 'budget-medium', withIgnoreFiles: false }),
    generateFixture({ fileCount: 10000, name: 'budget-large', withIgnoreFiles: false }),
  ]);
  fixtures.small = small;
  fixtures.medium = medium;
  fixtures.large = large;
}, 120_000); // Allow up to 2 minutes for fixture generation

afterAll(async () => {
  await cleanupFixtures();
});

describe('Performance Budgets — File Discovery', () => {
  test('small project (100 files) completes within budget', async () => {
    const budget = budgets.fileDiscovery.small;
    const metrics = await measureDiscovery(fixtures.small.path);

    await saveResults('small', metrics);

    // At least 50% of generated files must be discovered (guards against degenerate fixture)
    expect(metrics.fileCount).toBeGreaterThan(fixtures.small.fileCount * 0.5);
    expect(metrics.duration).toBeLessThan(budget.maxDurationMs);
    expect(metrics.deltaRssMb).toBeLessThan(budget.maxMemoryDeltaMb);
  }, 30_000);

  test('medium project (1k files) completes within budget', async () => {
    const budget = budgets.fileDiscovery.medium;
    const metrics = await measureDiscovery(fixtures.medium.path);

    await saveResults('medium', metrics);

    expect(metrics.fileCount).toBeGreaterThan(fixtures.medium.fileCount * 0.5);
    expect(metrics.duration).toBeLessThan(budget.maxDurationMs);
    expect(metrics.deltaRssMb).toBeLessThan(budget.maxMemoryDeltaMb);
  }, 30_000);

  test('large project (10k files) completes within budget', async () => {
    const budget = budgets.fileDiscovery.large;
    const metrics = await measureDiscovery(fixtures.large.path);

    await saveResults('large', metrics);

    // Use process.stdout.write directly — setup-env.js replaces console.log with
    // jest.fn() which swallows output, but we want CI metric lines to surface.
    process.stdout.write(
      `[perf] large discovery: ${metrics.duration.toFixed(0)}ms | ` +
        `${metrics.fileCount} files (of ${fixtures.large.fileCount} generated) | ` +
        `+${metrics.deltaRssMb.toFixed(1)} MB RSS delta\n`,
    );

    expect(metrics.fileCount).toBeGreaterThan(fixtures.large.fileCount * 0.5);
    expect(metrics.duration).toBeLessThan(budget.maxDurationMs);
    expect(metrics.deltaRssMb).toBeLessThan(budget.maxMemoryDeltaMb);
  }, 60_000);
});
