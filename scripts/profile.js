#!/usr/bin/env node
/**
 * Development profiling script.
 *
 * A thin wrapper over `copytree debug profile`, kept because typing the fixture
 * path and the output directory every time is tedious. It deliberately owns no
 * profiling logic of its own.
 *
 * It used to invoke `--profile <type>`, `--profile-dir` and `--stream`, all of
 * which were superseded when profiling moved under `debug profile`. It kept
 * working — the deprecation shims saw to that — while printing three warnings
 * and demonstrating obsolete usage to anyone who read it.
 *
 * Usage:
 *   node scripts/profile.js
 *   node scripts/profile.js --type cpu
 *   node scripts/profile.js --type heap
 *   node scripts/profile.js --type all
 *   node scripts/profile.js --type cpu --output-dir ./debug/profiles
 *
 * Or via npm:
 *   npm run profile
 *   npm run profile:cpu
 *   npm run profile:heap
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'copytree.js');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'simple-project');

const args = process.argv.slice(2);
let type = 'all';
let outputDir = path.join(ROOT, '.profiles');

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--type' && args[i + 1]) {
    type = args[++i];
  } else if ((args[i] === '--output-dir' || args[i] === '--profile-dir') && args[i + 1]) {
    if (args[i] === '--profile-dir') {
      console.warn('--profile-dir is deprecated here too; use --output-dir');
    }
    outputDir = path.resolve(args[++i]);
  }
}

const targetPath = existsSync(FIXTURES) ? FIXTURES : ROOT;
if (targetPath === ROOT) {
  console.warn(
    'Fixture project not found; profiling the repository root instead (this will be slow).',
  );
}

console.log(`Running ${type} profile on: ${targetPath}`);
console.log(`Output directory: ${outputDir}\n`);

try {
  // `execFileSync` with an argument array rather than a shell command string:
  // both paths come from the filesystem and may contain spaces.
  execFileSync(
    process.execPath,
    [CLI, 'debug', 'profile', targetPath, '--type', type, '--output-dir', outputDir],
    { stdio: 'inherit', cwd: ROOT },
  );
} catch (error) {
  process.exit(error.status ?? 1);
}
