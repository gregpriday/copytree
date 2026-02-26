#!/usr/bin/env node
/**
 * Development profiling script.
 * Runs copytree on the test fixtures and saves profiling output to .profiles/
 *
 * Usage:
 *   node scripts/profile.js
 *   node scripts/profile.js --type cpu
 *   node scripts/profile.js --type heap
 *   node scripts/profile.js --type all
 *   node scripts/profile.js --type cpu --profile-dir ./debug/profiles
 *
 * Or via npm:
 *   npm run profile
 *   npm run profile:cpu
 *   npm run profile:heap
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'copytree.js');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'simple-project');

// Parse CLI args
const args = process.argv.slice(2);
let type = 'all';
let profileDir = path.join(ROOT, '.profiles');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' && args[i + 1]) {
    type = args[++i];
  } else if (args[i] === '--profile-dir' && args[i + 1]) {
    profileDir = path.resolve(args[++i]);
  }
}

// Fall back to project root if fixtures not present
let targetPath;
if (await fs.pathExists(FIXTURES)) {
  targetPath = FIXTURES;
} else {
  console.warn(`⚠️  Fixtures not found at: ${FIXTURES}`);
  console.warn('    Falling back to project root (this will profile the entire repo and may be slow).');
  targetPath = ROOT;
}

console.log(`Running ${type} profile on: ${targetPath}`);
console.log(`Output directory: ${profileDir}\n`);

const cmd = [
  `node "${CLI}"`,
  `"${targetPath}"`,
  `--profile ${type}`,
  `--profile-dir "${profileDir}"`,
  '--stream',
  '--format json',
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });
} catch (err) {
  process.exit(err.status ?? 1);
}
