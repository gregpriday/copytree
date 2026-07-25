#!/usr/bin/env node
/**
 * Single-scenario benchmark worker.
 *
 * Each scenario runs in its own process. Sharing one process across scenarios
 * looked cheaper and was not: a scenario that holds 50k file objects leaves the
 * heap large and fragmented, and every scenario after it pays for that in GC
 * time. Measured end to end, the same full-copy scenario reported 1.4 s when it
 * ran alone and 7.4 s when it ran last. Process isolation is what makes a
 * scenario's number a property of the scenario.
 *
 * Writes one JSON result to stdout, delimited so setup logging on stderr can
 * never corrupt it.
 */

import { SCENARIOS } from '../scenarios/index.js';
import { runScenario } from './runner.js';

const MARKER = '<<<BENCH_RESULT>>>';

const id = process.argv[2];
const samples = process.argv[3] ? Number(process.argv[3]) : undefined;

const scenario = SCENARIOS.find((entry) => entry.id === id);
if (!scenario) {
  process.stderr.write(`unknown scenario: ${id}\n`);
  process.exit(2);
}

const result = await runScenario(scenario, {
  samples,
  log: (message) => process.stderr.write(`${message}\n`),
});

process.stdout.write(`${MARKER}${JSON.stringify(result)}${MARKER}`);
