/**
 * `.copytreeignore` validation.
 *
 * The checks here are the difference between "the file parsed" and "the file
 * does what you meant". A rule that matches nothing, a rule already implied by
 * `.gitignore`, a negation whose parent directory was pruned, a broad pattern
 * that quietly took `package.json` with it — each of those is syntactically
 * perfect and semantically wrong, and each is a real way people lose source
 * from a context without noticing.
 */

import path from 'path';
import { createMatcher } from '../utils/ignoreMatcher.js';
import { promises as fsp } from 'node:fs';
import { ERROR_CODES, ValidationError } from '../utils/errors.js';
import { roleHintFor } from './aggregate.js';

/** Extensions treated as source when warning about broad exclusions. */
const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.scala',
  '.ex',
  '.exs',
  '.erl',
  '.clj',
  '.hs',
  '.ml',
  '.zig',
  '.dart',
  '.vue',
  '.svelte',
]);

/** Root files whose exclusion is nearly always accidental. */
const CRITICAL_ROOT_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'cargo.toml',
  'go.mod',
  'pyproject.toml',
  'composer.json',
  'pom.xml',
]);

/**
 * @typedef {Object} IgnoreRule
 * @property {number} line - 1-based line number in the source file
 * @property {string} raw - The line exactly as written
 * @property {string} pattern - The trimmed rule
 * @property {boolean} negation - Whether the rule begins with `!`
 */

/**
 * Read and parse an ignore file.
 *
 * @param {string} filePath - Absolute path to the ignore file
 * @returns {Promise<{exists: boolean, rules: IgnoreRule[], raw: string|null, warnings: Array}>} Parsed file
 */
export async function readIgnoreFile(filePath) {
  let content;
  try {
    content = await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, rules: [], raw: null, warnings: [] };
    throw new ValidationError(
      `Could not read ${path.basename(filePath)}: ${error.message}`,
      'ignore-file',
      filePath,
      {
        code: ERROR_CODES.IGNORE_INVALID,
        path: filePath,
        suggestion: 'Check the file permissions, then run copytree ignore check again',
      },
    );
  }

  const warnings = [];

  // A byte order mark makes the first rule a rule about a filename beginning
  // with an invisible character, which never matches anything.
  let text = content;
  if (text.charCodeAt(0) === 0xfeff) {
    warnings.push({
      line: 1,
      code: 'BOM',
      message: 'file starts with a UTF-8 byte order mark; the first rule will not match',
    });
    text = text.slice(1);
  }

  if (text.includes('\uFFFD')) {
    warnings.push({
      line: null,
      code: 'INVALID_ENCODING',
      message:
        'file is not valid UTF-8; invalid bytes were replaced, so some rules may not match what you wrote',
    });
  }

  if (text.includes('\u0000')) {
    throw new ValidationError(
      'Ignore file contains NUL bytes and is not text',
      'ignore-file',
      filePath,
      {
        code: ERROR_CODES.IGNORE_INVALID,
        path: filePath,
        suggestion: 'Replace the file with a plain UTF-8 text file',
      },
    );
  }

  const rules = [];
  text.split('\n').forEach((raw, index) => {
    const trimmed = raw.replace(/\r$/, '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    rules.push({
      line: index + 1,
      raw,
      pattern: trimmed,
      negation: trimmed.startsWith('!'),
    });
  });

  return { exists: true, rules, raw: text, warnings };
}

/**
 * Whether a rule compiles under the declared Git-ignore parser.
 * @param {string} pattern - The rule
 * @returns {string|null} Error message, or null when valid
 */
function compileError(pattern) {
  try {
    const compiled = createMatcher(pattern);
    compiled.ignores('probe/path.txt');
    return null;
  } catch (error) {
    return error.message;
  }
}

/**
 * Analyse an ignore file against the candidate baseline and the effective run.
 *
 * @param {Object} params - Inputs
 * @param {string} params.root - Project root
 * @param {string} params.ignorePath - Absolute path to the ignore file
 * @param {{rules: IgnoreRule[], warnings: Array}} params.file - Parsed ignore file
 * @param {Object} params.baseline - Baseline plan (without .copytreeignore)
 * @param {Object} params.effective - Effective plan (with everything)
 * @param {string|number} [params.focusRule] - Restrict the analysis to one rule
 * @returns {Object} Analysis result
 */
export function analyseIgnoreFile({
  root,
  ignorePath,
  file,
  baseline,
  attributed,
  effective,
  focusRule,
  onDisk = [],
}) {
  const warnings = [...file.warnings];
  const errors = [];

  const baselinePaths = baseline.selected.map((entry) => ({
    path: entry.path,
    size: entry.size || 0,
  }));
  // Attribution is against the ignore-file-only plan. Falling back to the full
  // effective plan keeps a caller that has not built one working, at the cost
  // of the precision this exists for.
  const attributedPlan = attributed ?? effective;
  const attributedPathSet = new Set(attributedPlan.selected.map((entry) => entry.path));
  const effectivePathSet = new Set(effective.selected.map((entry) => entry.path));

  const removed = baselinePaths.filter((entry) => !attributedPathSet.has(entry.path));
  const kept = baselinePaths.filter((entry) => attributedPathSet.has(entry.path));

  // What the rest of the run removes on top of the ignore file. Reported, but
  // never attributed to a rule.
  const removedByOthers = baselinePaths.filter(
    (entry) => attributedPathSet.has(entry.path) && !effectivePathSet.has(entry.path),
  );

  const rules = focusRule
    ? file.rules.filter(
        (rule) => String(rule.line) === String(focusRule) || rule.pattern === focusRule,
      )
    : file.rules;

  if (focusRule && rules.length === 0) {
    errors.push({
      line: null,
      code: 'RULE_NOT_FOUND',
      message: `no rule matches '${focusRule}'`,
    });
  }

  const seenPatterns = new Map();
  const perRule = [];

  for (const rule of rules) {
    const invalid = compileError(rule.pattern);
    if (invalid) {
      errors.push({ line: rule.line, code: 'INVALID_PATTERN', message: invalid });
      continue;
    }

    if (seenPatterns.has(rule.pattern)) {
      warnings.push({
        line: rule.line,
        code: 'DUPLICATE_RULE',
        message: `"${rule.pattern}" repeats the rule on line ${seenPatterns.get(rule.pattern)}`,
      });
    } else {
      seenPatterns.set(rule.pattern, rule.line);
    }

    // Root escapes are always a mistake: ignore rules are anchored to the file
    // that contains them and cannot reach above it.
    if (rule.pattern.includes('../') || rule.pattern.startsWith('/..')) {
      warnings.push({
        line: rule.line,
        code: 'ROOT_ESCAPE',
        message: `"${rule.pattern}" tries to escape the project root; ignore rules cannot`,
      });
    }

    const matcher = createMatcher(
      rule.pattern.startsWith('!') ? rule.pattern.slice(1) : rule.pattern,
    );
    const matchedInBaseline = baselinePaths.filter((entry) =>
      testPathAndParents(matcher, entry.path),
    );
    const matchedRemoved = removed.filter((entry) => testPathAndParents(matcher, entry.path));

    if (rule.negation) {
      // A negation that re-includes nothing is usually blocked by a pruned
      // ancestor, which is the single most confusing gitignore behaviour there
      // is, so the message names the fix.
      const reIncluded = matchedInBaseline.filter((entry) => attributedPathSet.has(entry.path));
      if (reIncluded.length === 0) {
        const blocker = findPruningAncestor(rule.pattern.slice(1), file.rules, rule.line);
        warnings.push({
          line: rule.line,
          code: blocker ? 'NEGATION_BLOCKED' : 'RULE_MATCHES_NOTHING',
          message: blocker
            ? `"${rule.pattern}" cannot re-include anything: line ${blocker.line} ("${blocker.pattern}") prunes the parent directory. Re-include the parent first, e.g. "!${parentOf(rule.pattern.slice(1))}/"`
            : `"${rule.pattern}" re-includes nothing`,
        });
      }
      perRule.push({
        line: rule.line,
        pattern: rule.pattern,
        removed: 0,
        reIncluded: matchedInBaseline.length,
      });
      continue;
    }

    if (matchedInBaseline.length === 0) {
      // A rule that matches nothing in the candidate set has two very different
      // causes, and the fix differs: a typo, or a path Git and the built-in
      // rules had already removed. Distinguished by looking at the disk.
      const existsOnDisk = onDisk.some((entry) => testPathAndParents(matcher, entry));
      warnings.push(
        existsOnDisk
          ? {
              line: rule.line,
              code: 'RULE_REDUNDANT',
              message: `"${rule.pattern}" matches nothing that was not already excluded by Git or CopyTree's built-in rules`,
            }
          : {
              line: rule.line,
              code: 'RULE_MATCHES_NOTHING',
              message: `"${rule.pattern}" matches no path in this project`,
            },
      );
    } else if (matchedRemoved.length === 0) {
      warnings.push({
        line: rule.line,
        code: 'RULE_REDUNDANT',
        message: `"${rule.pattern}" removes nothing that was not already excluded`,
      });
    }

    const criticalHits = matchedRemoved.filter((entry) =>
      CRITICAL_ROOT_FILES.has(entry.path.toLowerCase()),
    );
    if (criticalHits.length > 0) {
      warnings.push({
        line: rule.line,
        code: 'CRITICAL_FILE_EXCLUDED',
        message: `"${rule.pattern}" excludes ${criticalHits.map((entry) => entry.path).join(', ')}; consider a narrower pattern`,
      });
    }

    const sourceHits = matchedRemoved.filter((entry) =>
      SOURCE_EXTENSIONS.has(extensionOf(entry.path)),
    );
    if (sourceHits.length > 0 && !removesOnlyConventionalNonSource(sourceHits)) {
      warnings.push({
        line: rule.line,
        code: 'SOURCE_EXCLUDED',
        message: `"${rule.pattern}" excludes ${sourceHits.length} source file${sourceHits.length === 1 ? '' : 's'} (e.g. ${sourceHits[0].path})`,
      });
    }

    perRule.push({
      line: rule.line,
      pattern: rule.pattern,
      removed: matchedRemoved.length,
      reIncluded: 0,
    });
  }

  // A later rule that fully contains an earlier one makes the earlier one dead.
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const earlier = rules[i];
      const later = rules[j];
      if (earlier.negation) continue;
      if (earlier.pattern === later.pattern) continue;

      // A later negation of the same shape does not merely cover the earlier
      // rule, it cancels it — the most confusing way for a rule to be dead,
      // because both lines read as if they are doing something.
      const laterBody = later.negation ? later.pattern.slice(1) : later.pattern;
      const laterMatcher = createMatcher(laterBody);
      if (!laterMatcher.ignores(normalizeForProbe(earlier.pattern))) continue;

      warnings.push({
        line: earlier.line,
        code: later.negation ? 'RULE_CANCELLED' : 'RULE_SHADOWED',
        message: later.negation
          ? `"${earlier.pattern}" is cancelled by the negation on line ${later.line} ("${later.pattern}")`
          : `"${earlier.pattern}" is already covered by line ${later.line} ("${later.pattern}")`,
      });
      break;
    }
  }

  if (effective.stats.selected === 0) {
    warnings.push({
      line: null,
      code: 'EMPTY_SELECTION',
      message: 'these rules leave nothing selected',
    });
  }

  if (effective.stats.truncated) {
    warnings.push({
      line: null,
      code: 'BUDGET_STILL_BINDS',
      message: `budgets still drop ${effective.stats.truncatedCount} file${effective.stats.truncatedCount === 1 ? '' : 's'} (${effective.stats.truncatedBy}) after these rules`,
    });
  }

  const forced = effective.selected.filter((entry) => entry.alwaysInclude);
  if (forced.length > 0) {
    warnings.push({
      line: null,
      code: 'FORCE_INCLUDED',
      message: `${forced.length} file${forced.length === 1 ? '' : 's'} force-included by .copytreeinclude or --force-include, overriding these rules`,
    });
  }

  return {
    ignorePath,
    root,
    valid: errors.length === 0,
    errors,
    warnings: warnings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)),
    perRule,
    removed,
    kept,
    removedByOthers,
    removedByArea: groupByTopLevel(removed),
  };
}

/**
 * Test a path and each of its parent directories against a matcher.
 *
 * A rule like `docs/` matches the directory, not each file inside it, so a
 * file-only test would report the rule as matching nothing.
 *
 * @param {Object} matcher - Compiled ignore matcher
 * @param {string} posixPath - Candidate path
 * @returns {boolean} True when the rule covers the path
 */
function testPathAndParents(matcher, posixPath) {
  if (matcher.ignores(posixPath)) return true;
  const segments = posixPath.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    if (matcher.ignores(`${segments.slice(0, index).join('/')}/`)) return true;
  }
  return false;
}

/**
 * Find an earlier rule that prunes the parent of a negation's target.
 * @param {string} target - The negation's pattern, without the `!`
 * @param {IgnoreRule[]} rules - All rules in the file
 * @param {number} beforeLine - Only consider rules above this line
 * @returns {IgnoreRule|null} The blocking rule
 */
function findPruningAncestor(target, rules, beforeLine) {
  const parent = parentOf(target);
  if (!parent) return null;

  for (const rule of rules) {
    if (rule.line >= beforeLine || rule.negation) continue;
    const matcher = createMatcher(rule.pattern);
    if (matcher.ignores(`${parent}/`)) return rule;
  }
  return null;
}

/**
 * The parent directory of a pattern, as a plain prefix.
 * @param {string} pattern - Rule pattern
 * @returns {string} Parent path, or an empty string
 */
function parentOf(pattern) {
  const cleaned = pattern.replace(/^\//, '').replace(/\/$/, '');
  const index = cleaned.lastIndexOf('/');
  return index === -1 ? '' : cleaned.slice(0, index);
}

/**
 * A probe path that a shadowing rule would have to match.
 * @param {string} pattern - Rule pattern
 * @returns {string} Probe path
 */
function normalizeForProbe(pattern) {
  const cleaned = pattern.replace(/^\//, '');
  return cleaned.endsWith('/') ? cleaned : `${cleaned}`;
}

/**
 * Whether every source file a rule removed sits in an area people exclude on
 * purpose.
 *
 * Excluding `tests/` removes `.ts` files, and saying so on every run would
 * train the reader to ignore the warning that matters — the one where `src/`
 * or a stray `*.js` took the actual source with it. Judged by the role hint
 * rather than by how broad the pattern looks, because breadth is not the
 * question: `src/` is as broad as `tests/` and only one of them is a mistake.
 *
 * @param {Array<{path: string}>} entries - Removed source files
 * @returns {boolean} True when the removal looks deliberate
 */
function removesOnlyConventionalNonSource(entries) {
  const deliberate = new Set([
    'tests',
    'fixtures',
    'examples',
    'benchmarks',
    'generated',
    'vendored',
  ]);
  return entries.every((entry) => deliberate.has(roleHintFor(entry.path)));
}

/**
 * Group removed entries by their top-level area.
 * @param {Array<{path: string, size: number}>} entries - Removed entries
 * @returns {Array<{area: string, files: number, bytes: number}>} Grouped totals
 */
function groupByTopLevel(entries) {
  const areas = new Map();
  for (const entry of entries) {
    const segments = entry.path.split('/');
    const area = segments.length > 1 ? `${segments[0]}/` : entry.path;
    const bucket = areas.get(area) ?? { area, files: 0, bytes: 0 };
    bucket.files += 1;
    bucket.bytes += entry.size;
    areas.set(area, bucket);
  }
  return [...areas.values()].sort((a, b) => b.bytes - a.bytes || a.area.localeCompare(b.area));
}

/**
 * Lowercase extension including the dot.
 * @param {string} posixPath - Path
 * @returns {string} Extension
 */
function extensionOf(posixPath) {
  const base = posixPath.split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}
