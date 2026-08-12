#!/usr/bin/env node
/**
 * Check that every local Markdown link points at something that exists.
 *
 * A broken link in published documentation is a small failure with an outsized
 * cost: it is the moment a reader learns that the docs are not maintained, and
 * from then on they check everything else against the source instead of
 * trusting it. The audit found sixteen unresolved local references.
 *
 * Only local targets are checked. Network reachability is not this script's
 * business — it would make the gate flaky and slow, and a 404 on someone else's
 * site is not a defect in this repository.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories never worth walking. */
const SKIP = new Set(['node_modules', '.git', 'coverage', 'tests']);

/**
 * Every Markdown file in the repository.
 * @param {string} dir - Directory to walk
 * @param {string[]} [found=[]] - Accumulator
 * @returns {string[]} Absolute paths
 */
function markdownFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (SKIP.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(full, found);
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Whether a link target resolves.
 *
 * A fragment is checked only as far as the file: verifying an anchor means
 * reimplementing GitHub's slug algorithm, and getting that subtly wrong would
 * produce false failures nobody could act on.
 *
 * @param {string} from - File containing the link
 * @param {string} target - Raw link target
 * @returns {boolean} True when the target exists
 */
function resolves(from, target) {
  const [filePart] = target.split('#');
  // A pure fragment points within the same document.
  if (!filePart) return true;

  const base = filePart.startsWith('/')
    ? path.join(repoRoot, filePart.slice(1))
    : path.resolve(path.dirname(from), filePart);

  if (!existsSync(base)) return false;
  // A link to a directory is only meaningful if it has an index.
  if (statSync(base).isDirectory()) {
    return existsSync(path.join(base, 'README.md')) || existsSync(path.join(base, 'index.md'));
  }
  return true;
}

const broken = [];

for (const file of markdownFiles(repoRoot)) {
  const text = readFileSync(file, 'utf8');
  // Strip fenced code so an example path is not mistaken for a link.
  const prose = text.replace(/```[\s\S]*?```/g, '');

  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (!resolves(file, target)) {
      broken.push(`${path.relative(repoRoot, file)} -> ${target}`);
    }
  }
}

if (broken.length > 0) {
  process.stderr.write(`${broken.length} broken local link(s):\n`);
  for (const entry of broken) process.stderr.write(`  ${entry}\n`);
  process.exit(1);
}

process.stdout.write('All local documentation links resolve\n');
