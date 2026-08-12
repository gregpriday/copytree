#!/usr/bin/env node
/**
 * Decide which npm dist-tag a version should be published under.
 *
 * This was three lines of shell built on `sort -V`. GNU version sort is not
 * SemVer and does not claim to be: it has no concept of a prerelease ranking
 * below its release, so it puts `1.0.0-beta.1` *above* `1.0.0`. On the release
 * that matters most — the first stable one — that is exactly backwards, and the
 * consequence is `latest` pointing at a prerelease for every installer in the
 * world until someone notices.
 *
 * `sort -V` also has no opinion about build metadata, and orders identifiers
 * that mix digits and letters by rules of its own.
 *
 * Usage:
 *   node scripts/dist-tag.js <version> [latest-published]
 *
 * Prints `latest`, `next` or `hotfix` on stdout. Exits non-zero on a version it
 * cannot parse, because guessing is the failure mode this file exists to
 * remove.
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Matches SemVer 2.0.0. Groups: major, minor, patch, prerelease, build. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Parse a SemVer string.
 *
 * @param {string} version - Version to parse
 * @returns {{major: number, minor: number, patch: number, prerelease: string[]}} Parsed version
 * @throws {Error} If the version is not valid SemVer
 */
export function parse(version) {
  // No `.trim()`. Surrounding whitespace means the caller passed something
  // other than a version — a stray newline out of `npm view`, a shell variable
  // that picked up a space — and quietly accepting it is how a release decision
  // gets made about a string nobody looked at.
  const match = SEMVER.exec(String(version));
  if (!match) throw new Error(`Not a valid SemVer version: ${version}`);

  return {
    // `BigInt`, not `Number`. SemVer places no upper bound on the numeric
    // components, and above 2^53 `Number` stops being able to tell two of them
    // apart: `9007199254740993.0.0` and `9007199254740992.0.0` compare equal.
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    // Build metadata is deliberately dropped: SemVer §10 says it is ignored
    // when determining precedence.
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/**
 * Compare two BigInts as a sort result.
 *
 * `Number(a - b)` would defeat the point of using BigInt in the first place for
 * differences beyond 2^53.
 *
 * @param {bigint} a - First value
 * @param {bigint} b - Second value
 * @returns {number} -1, 0 or 1
 */
function compareBigInt(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Compare two prerelease identifier lists, per SemVer §11.
 *
 * @param {string[]} a - First identifier list
 * @param {string[]} b - Second identifier list
 * @returns {number} Negative, zero or positive
 */
function comparePrerelease(a, b) {
  // "A pre-release version has lower precedence than a normal version."
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    // "A larger set of pre-release fields has a higher precedence than a
    // smaller set, if all of the preceding identifiers are equal."
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] === b[i]) continue;

    const numericA = /^\d+$/.test(a[i]);
    const numericB = /^\d+$/.test(b[i]);

    // "Numeric identifiers always have lower precedence than alphanumeric."
    if (numericA && numericB) return compareBigInt(BigInt(a[i]), BigInt(b[i]));
    if (numericA) return -1;
    if (numericB) return 1;
    return a[i] < b[i] ? -1 : 1;
  }

  return 0;
}

/**
 * Compare two SemVer versions.
 *
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} Negative when `a` precedes `b`, zero when equal, positive otherwise
 */
export function compare(a, b) {
  const left = parse(a);
  const right = parse(b);

  if (left.major !== right.major) return compareBigInt(left.major, right.major);
  if (left.minor !== right.minor) return compareBigInt(left.minor, right.minor);
  if (left.patch !== right.patch) return compareBigInt(left.patch, right.patch);
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * The dist-tag a version should be published under.
 *
 * @param {string} version - Version being published
 * @param {string} publishedLatest - The version currently on the `latest` tag
 * @returns {'latest'|'next'|'hotfix'} The dist-tag
 */
export function distTagFor(version, publishedLatest) {
  // Every prerelease goes to `next`, whatever its identifier. Matching only
  // `alpha`/`beta`/`rc` would silently promote `1.0.0-canary.1` to `latest`.
  if (parse(version).prerelease.length > 0) return 'next';

  // A stable release that does not exceed the published latest is either a
  // deliberate fix to an older line or a mistake. Neither should move `latest`
  // backwards for everyone installing the package.
  return compare(version, publishedLatest) > 0 ? 'latest' : 'hotfix';
}

/**
 * Whether this module is the entry point.
 *
 * Comparing `import.meta.url` against a hand-built `file://` string is wrong
 * for any path containing a space or a non-ASCII character, because
 * `import.meta.url` is percent-encoded — and the failure is silent: the script
 * runs, prints nothing, and exits 0, which the workflow reads as an empty
 * dist-tag. `realpathSync` additionally makes the comparison hold when the
 * script is reached through a symlink.
 *
 * @returns {boolean} True when run directly
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const args = process.argv.slice(2);

  // `--is-prerelease` exits 0 for a prerelease and 1 otherwise, so the workflow
  // can branch without a second SemVer implementation in shell. The `case
  // "$VERSION" in *-*)` glob it replaces called `1.2.3+build-7` a prerelease,
  // because build metadata may legally contain a hyphen.
  if (args[0] === '--is-prerelease') {
    try {
      process.exit(parse(args[1]).prerelease.length > 0 ? 0 : 1);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
  }

  const [version, publishedLatest = '0.0.0'] = args;

  if (!version) {
    process.stderr.write('usage: dist-tag.js [--is-prerelease] <version> [latest-published]\n');
    process.exit(2);
  }

  try {
    process.stdout.write(`${distTagFor(version, publishedLatest)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
