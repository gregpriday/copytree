/**
 * Reading the source as evidence, for the contract tests.
 *
 * Several suites check a declaration against the code that is supposed to
 * honour it — schema keys against their consumers, declared options against the
 * modules that read them, the environment allowlist against actual reads. All
 * of them need the same two things: the shipped JavaScript, and it without its
 * prose.
 *
 * The prose matters because a comment naming a thing is not a use of it.
 * `secretPatterns.js` discusses `process.env.DB_PASSWORD` at length and reads
 * nothing; `copy.js` documented `secretsReport` in JSDoc for a feature it never
 * implemented, which is precisely how that phantom option survived review.
 */

import fs from 'fs';
import path from 'path';

/**
 * Every `.js` file CopyTree ships, as absolute paths.
 *
 * @param {string} repoRoot - Repository root
 * @param {string[]} [exclude=[]] - Absolute paths to leave out
 * @returns {string[]} File paths
 */
export function shippedSourceFiles(repoRoot, exclude = []) {
  const files = [];
  const skip = new Set(exclude);

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && !skip.has(full)) files.push(full);
    }
  };

  walk(path.join(repoRoot, 'src'));
  walk(path.join(repoRoot, 'config'));

  const bin = path.join(repoRoot, 'bin/copytree.js');
  if (!skip.has(bin)) files.push(bin);

  return files;
}

/**
 * Remove comment lines, leaving the code intact.
 *
 * Line-based on purpose. The obvious implementation — replacing
 * `/\/\*[\s\S]*?\*\//g` — is wrong for this codebase and quietly so: a glob
 * pattern like `'**` + `/*.js'` contains a comment terminator, and an ignore
 * list contains dozens of them. Stripping by regex deleted whole runs of real
 * code between one string literal and the next, and the tests that depended on
 * it reported keys as unread that are read on the very lines that vanished.
 *
 * Only lines that *begin* a comment are dropped, which is where the prose is. A
 * trailing `// note` after a statement survives; it is short, and nothing is
 * asserted about it.
 *
 * @param {string} text - Source text
 * @returns {string} Source without comment lines
 */
export function stripCommentLines(text) {
  const kept = [];
  let inBlock = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (inBlock) {
      if (trimmed.endsWith('*/')) inBlock = false;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.endsWith('*/')) inBlock = true;
      continue;
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    kept.push(line);
  }

  return kept.join('\n');
}

/**
 * The shipped source as one string, with its prose removed.
 *
 * @param {string} repoRoot - Repository root
 * @param {string[]} [exclude=[]] - Absolute paths to leave out
 * @returns {string} Concatenated code
 */
export function shippedCode(repoRoot, exclude = []) {
  return shippedSourceFiles(repoRoot, exclude)
    .map((file) => stripCommentLines(fs.readFileSync(file, 'utf8')))
    .join('\n');
}

export default { shippedSourceFiles, stripCommentLines, shippedCode };
