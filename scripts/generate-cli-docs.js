#!/usr/bin/env node

/**
 * Write (or verify) the generated CLI reference.
 *
 * Usage: node scripts/generate-cli-docs.js [--check]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'node:fs';
import { renderReference } from '../src/cli/docs.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(moduleDir, '../docs/cli/copytree-reference.md');

const rendered = renderReference();

if (process.argv.includes('--check')) {
  const current = await fs.readFile(OUTPUT, 'utf8').catch(() => null);
  if (current !== rendered) {
    process.stderr.write(`${OUTPUT} is out of date. Run: node scripts/generate-cli-docs.js\n`);
    process.exit(1);
  }
  process.stdout.write('CLI reference is up to date\n');
} else {
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, rendered, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT}\n`);
}
