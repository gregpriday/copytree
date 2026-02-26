#!/usr/bin/env node
/**
 * Compare the latest profiling report against a baseline.
 *
 * Usage:
 *   node scripts/profile-compare.js
 *   node scripts/profile-compare.js --profile-dir .profiles
 *   node scripts/profile-compare.js --baseline .profiles/baseline/report.json
 *
 * To set a new baseline:
 *   cp .profiles/<timestamp>-report.json .profiles/baseline/report.json
 *
 * Or via npm:
 *   npm run profile:compare
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
let profileDir = path.join(ROOT, '.profiles');
let baselinePath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--profile-dir' && args[i + 1]) {
    profileDir = path.resolve(args[++i]);
  } else if (args[i] === '--baseline' && args[i + 1]) {
    baselinePath = path.resolve(args[++i]);
  }
}

if (!baselinePath) {
  baselinePath = path.join(profileDir, 'baseline', 'report.json');
}

// Find the latest report (highest timestamp in filename)
const reports = (await fs.readdir(profileDir))
  .filter((f) => f.endsWith('-report.json') && !f.startsWith('baseline'))
  .sort()
  .reverse();

if (reports.length === 0) {
  console.error('No profiling reports found in', profileDir);
  console.error('Run: npm run profile  to generate a report first.');
  process.exit(1);
}

const latestPath = path.join(profileDir, reports[0]);
const latest = await fs.readJson(latestPath);

if (!(await fs.pathExists(baselinePath))) {
  console.log('No baseline found at:', baselinePath);
  console.log('Current report:', latestPath);
  console.log(`\nTo set this as baseline:\n  mkdir -p "${path.dirname(baselinePath)}"`);
  console.log(`  cp "${latestPath}" "${baselinePath}"`);
  process.exit(0);
}

const baseline = await fs.readJson(baselinePath);

// Validate required fields before accessing them
function validateReport(report, label) {
  const required = ['timestamp', 'version', 'duration'];
  const missing = required.filter((k) => report[k] == null);
  if (missing.length > 0) {
    console.error(`${label} is missing required fields: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

if (!validateReport(latest, 'Latest report') || !validateReport(baseline, 'Baseline')) {
  process.exit(1);
}

// --- Report comparison ---
const pct = (curr, base) => {
  if (!base || base === 0) return 'N/A';
  const delta = ((curr - base) / base) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
};

const fmt = (ms) => `${ms.toLocaleString()}ms`;
const fmtMem = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

console.log('=== Profile Comparison ===');
console.log(`Baseline : ${baseline.timestamp}  (${baseline.version})`);
console.log(`Current  : ${latest.timestamp}  (${latest.version})\n`);

const durationDelta = pct(latest.duration, baseline.duration);
console.log(`Duration : ${fmt(latest.duration)} vs ${fmt(baseline.duration)}  (${durationDelta})`);

const latestHeap = latest.memory?.heapUsed;
const baselineHeap = baseline.memory?.heapUsed;
const memDelta = latestHeap != null && baselineHeap != null ? pct(latestHeap, baselineHeap) : 'N/A';
console.log(
  `Heap used: ${latestHeap != null ? fmtMem(latestHeap) : 'N/A'} vs ${baselineHeap != null ? fmtMem(baselineHeap) : 'N/A'}  (${memDelta})`,
);

if (latest.files && baseline.files) {
  const filesDelta = pct(latest.files.processed, baseline.files.processed);
  console.log(
    `Files    : ${latest.files.processed} vs ${baseline.files.processed}  (${filesDelta})`,
  );
}

// Stage-level comparison
const baselineStages = Object.fromEntries((baseline.stages || []).map((s) => [s.name, s]));
const latestStages = latest.stages || [];

if (latestStages.length > 0) {
  console.log('\n--- Stage Timings ---');
  for (const stage of latestStages) {
    const base = baselineStages[stage.name];
    const stageDelta = base ? pct(stage.duration, base.duration) : 'new';
    const baseStr = base ? ` vs ${fmt(base.duration)}` : '';
    console.log(`  ${stage.name.padEnd(30)} ${fmt(stage.duration)}${baseStr}  (${stageDelta})`);
  }
}

// Warn on regression
const durationPct = baseline.duration
  ? ((latest.duration - baseline.duration) / baseline.duration) * 100
  : 0;

if (durationPct > 20) {
  console.log(`\n⚠️  REGRESSION DETECTED: ${durationPct.toFixed(1)}% slower than baseline`);
  process.exit(2);
} else if (durationPct > 10) {
  console.log(`\n⚠️  Warning: ${durationPct.toFixed(1)}% slower than baseline`);
} else if (durationPct < -5) {
  console.log(`\n✅  Improvement: ${Math.abs(durationPct).toFixed(1)}% faster than baseline`);
} else {
  console.log('\n✅  Performance is within normal range');
}
