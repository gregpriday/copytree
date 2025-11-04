/**
 * File Discovery Performance Benchmark
 *
 * Compares sequential vs parallel file discovery across different:
 * - File counts (1k, 10k, 50k)
 * - Concurrency levels (1, 5, 10, 20, 50)
 * - Directory depths (flat vs deep)
 *
 * Usage:
 *   node tests/performance/file-discovery.bench.js
 *   node tests/performance/file-discovery.bench.js --out results.json
 *   node tests/performance/file-discovery.bench.js --quick (only 1k files)
 */

import { performance } from 'node:perf_hooks';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { walkWithIgnore } from '../../src/utils/ignoreWalker.js';
import { walkParallel } from '../../src/utils/parallelWalker.js';
import { generateFixture, cleanupFixtures } from '../helpers/fixtureGenerator.js';
import { getMetrics } from '../../src/telemetry/metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Benchmark configuration
 */
const BENCHMARK_CONFIG = {
  fileCounts: [1000, 10000, 50000],
  concurrencyLevels: [1, 5, 10, 20, 50],
  warmupRuns: 1,
  benchmarkRuns: 3,
};

/**
 * Run a single benchmark
 */
async function runBenchmark(walker, fixture, options = {}) {
  const { concurrency = 1, name = 'unnamed' } = options;

  // Reset metrics
  getMetrics().reset();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const memBefore = process.memoryUsage();
  const startTime = performance.now();

  let fileCount = 0;
  const walkOptions = {
    ignoreFileName: '.copytreeignore',
    includeDirectories: false,
    followSymlinks: false,
    concurrency,
  };

  try {
    for await (const _file of walker(fixture.path, walkOptions)) {
      fileCount++;
    }
  } catch (error) {
    console.error(`Benchmark ${name} failed:`, error.message);
    throw error;
  }

  const duration = performance.now() - startTime;
  const memAfter = process.memoryUsage();

  // Calculate memory delta
  const memoryDelta = {
    rss: memAfter.rss - memBefore.rss,
    heapUsed: memAfter.heapUsed - memBefore.heapUsed,
    heapTotal: memAfter.heapTotal - memBefore.heapTotal,
  };

  // Get metrics if enabled
  const metrics = getMetrics().getAll();

  return {
    name,
    duration,
    fileCount,
    filesPerSecond: fileCount / (duration / 1000),
    memoryDelta,
    peakMemory: memAfter.heapUsed,
    metrics: metrics.enabled ? metrics : null,
  };
}

/**
 * Run benchmarks for a specific file count
 */
async function benchmarkFileCount(fileCount, quick = false) {
  console.log(`\n=== Benchmarking ${fileCount} files ===`);

  // Generate fixture
  console.log('Generating fixture...');
  const fixture = await generateFixture({
    fileCount,
    maxDepth: 5,
    avgFilesPerDir: 20,
    name: `bench-${fileCount}`,
  });

  console.log(
    `Generated fixture: ${fixture.fileCount} files, depth ${fixture.depth}, path: ${fixture.path}`,
  );

  const results = {
    fileCount: fixture.fileCount,
    depth: fixture.depth,
    sequential: null,
    parallel: [],
  };

  // Warmup: sequential
  console.log('Warming up (sequential)...');
  await runBenchmark(walkWithIgnore, fixture, {
    name: 'warmup-sequential',
  });

  // Benchmark: sequential
  console.log('Benchmarking sequential...');
  const sequentialRuns = [];
  for (let i = 0; i < BENCHMARK_CONFIG.benchmarkRuns; i++) {
    const result = await runBenchmark(walkWithIgnore, fixture, {
      name: `sequential-run-${i + 1}`,
    });
    sequentialRuns.push(result);
    console.log(
      `  Run ${i + 1}: ${result.duration.toFixed(2)}ms (${result.filesPerSecond.toFixed(0)} files/sec)`,
    );
  }

  // Average sequential results
  results.sequential = {
    duration: average(sequentialRuns.map((r) => r.duration)),
    filesPerSecond: average(sequentialRuns.map((r) => r.filesPerSecond)),
    memoryDelta: averageMemory(sequentialRuns.map((r) => r.memoryDelta)),
    peakMemory: average(sequentialRuns.map((r) => r.peakMemory)),
    runs: sequentialRuns,
  };

  // Benchmark: parallel with different concurrency levels
  const concurrencies = quick ? [5] : BENCHMARK_CONFIG.concurrencyLevels;

  for (const concurrency of concurrencies) {
    console.log(`Benchmarking parallel (concurrency=${concurrency})...`);

    // Warmup
    await runBenchmark(walkParallel, fixture, {
      concurrency,
      name: `warmup-parallel-${concurrency}`,
    });

    // Benchmark runs
    const parallelRuns = [];
    for (let i = 0; i < BENCHMARK_CONFIG.benchmarkRuns; i++) {
      const result = await runBenchmark(walkParallel, fixture, {
        concurrency,
        name: `parallel-${concurrency}-run-${i + 1}`,
      });
      parallelRuns.push(result);
      console.log(
        `  Run ${i + 1}: ${result.duration.toFixed(2)}ms (${result.filesPerSecond.toFixed(0)} files/sec)`,
      );
    }

    // Average parallel results
    results.parallel.push({
      concurrency,
      duration: average(parallelRuns.map((r) => r.duration)),
      filesPerSecond: average(parallelRuns.map((r) => r.filesPerSecond)),
      memoryDelta: averageMemory(parallelRuns.map((r) => r.memoryDelta)),
      peakMemory: average(parallelRuns.map((r) => r.peakMemory)),
      speedup: results.sequential.duration / average(parallelRuns.map((r) => r.duration)),
      runs: parallelRuns,
    });
  }

  return results;
}

/**
 * Calculate average of numbers
 */
function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Calculate average memory usage
 */
function averageMemory(memoryDeltas) {
  return {
    rss: average(memoryDeltas.map((m) => m.rss)),
    heapUsed: average(memoryDeltas.map((m) => m.heapUsed)),
    heapTotal: average(memoryDeltas.map((m) => m.heapTotal)),
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Print results table
 */
function printResults(allResults) {
  console.log('\n\n=== BENCHMARK RESULTS ===\n');

  for (const results of allResults) {
    console.log(`File Count: ${results.fileCount} (depth: ${results.depth})`);
    console.log('─'.repeat(80));
    console.log(
      `Sequential:        ${results.sequential.duration.toFixed(0)}ms  ` +
        `(${results.sequential.filesPerSecond.toFixed(0)} files/sec)  ` +
        `Peak: ${formatBytes(results.sequential.peakMemory)}`,
    );

    for (const parallel of results.parallel) {
      const speedup = parallel.speedup.toFixed(2);
      const speedupIndicator = parallel.speedup > 1 ? '↑' : parallel.speedup < 1 ? '↓' : '=';
      console.log(
        `Parallel (c=${parallel.concurrency.toString().padStart(2)}):   ${parallel.duration.toFixed(0).padStart(6)}ms  ` +
          `(${parallel.filesPerSecond.toFixed(0).padStart(5)} files/sec)  ` +
          `Peak: ${formatBytes(parallel.peakMemory).padStart(8)}  ` +
          `Speedup: ${speedupIndicator}${speedup}x`,
      );
    }
    console.log('');
  }

  // Find best configuration
  const best = allResults.flatMap((r) => r.parallel).sort((a, b) => b.speedup - a.speedup)[0];
  if (best) {
    console.log(
      `\n✨ Best configuration: concurrency=${best.concurrency} (${best.speedup.toFixed(2)}x speedup)`,
    );
  }

  // Check if we meet performance targets
  const largestTest = allResults[allResults.length - 1];
  const target10k = largestTest.fileCount >= 10000;
  if (target10k) {
    const bestParallel = largestTest.parallel.sort((a, b) => a.duration - b.duration)[0];
    const meetsTarget = bestParallel.duration < 30000; // <30s for 10k files
    const memoryOk = bestParallel.peakMemory < 500 * 1024 * 1024; // <500MB

    console.log('\n=== Performance Targets ===');
    console.log(
      `10k files in <30s: ${meetsTarget ? '✓ PASS' : '✗ FAIL'} (${bestParallel.duration.toFixed(0)}ms)`,
    );
    console.log(
      `Memory <500MB: ${memoryOk ? '✓ PASS' : '✗ FAIL'} (${formatBytes(bestParallel.peakMemory)})`,
    );
  }
}

/**
 * Save results to JSON file
 */
async function saveResults(allResults, outputPath) {
  const output = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    cpuCount: require('os').cpus().length,
    results: allResults,
  };

  await fs.writeJson(outputPath, output, { spaces: 2 });
  console.log(`\n✓ Results saved to ${outputPath}`);
}

/**
 * Main benchmark runner
 */
async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const outputPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

  console.log('=== File Discovery Performance Benchmark ===');
  console.log(`Platform: ${process.platform}`);
  console.log(`Node: ${process.version}`);
  console.log(`CPUs: ${require('os').cpus().length}`);
  console.log(`Quick mode: ${quick ? 'yes' : 'no'}`);

  const fileCounts = quick ? [1000] : BENCHMARK_CONFIG.fileCounts;
  const allResults = [];

  try {
    for (const fileCount of fileCounts) {
      const results = await benchmarkFileCount(fileCount, quick);
      allResults.push(results);
    }

    printResults(allResults);

    if (outputPath) {
      await saveResults(allResults, outputPath);
    }
  } finally {
    // Cleanup fixtures
    console.log('\nCleaning up fixtures...');
    await cleanupFixtures();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
  });
}

export { runBenchmark, benchmarkFileCount };
