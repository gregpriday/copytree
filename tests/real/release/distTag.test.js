/**
 * The dist-tag decision is a release-critical branch that nothing exercised.
 *
 * It used to be `sort -V` in the publish workflow, which is GNU version sort
 * and not SemVer: it ranks `1.0.0-beta.1` above `1.0.0`, so the first stable
 * release would have been published under `hotfix` while a beta kept `latest`.
 * Every case below is one `sort -V` gets wrong or has no opinion about.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compare, distTagFor, parse } from '../../../scripts/dist-tag.js';

const SCRIPT = new URL('../../../scripts/dist-tag.js', import.meta.url);

describe('SemVer precedence', () => {
  it('ranks a prerelease below its release', () => {
    // The case `sort -V` inverts, and the most consequential one.
    expect(compare('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(compare('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0);
  });

  it('compares numerically, not lexically', () => {
    expect(compare('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compare('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compare('10.0.0', '9.0.0')).toBeGreaterThan(0);
  });

  it('follows the prerelease ordering rules', () => {
    expect(compare('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    expect(compare('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0);
    expect(compare('1.0.0-alpha.beta', '1.0.0-beta')).toBeLessThan(0);
    expect(compare('1.0.0-beta', '1.0.0-beta.2')).toBeLessThan(0);
    expect(compare('1.0.0-beta.2', '1.0.0-beta.11')).toBeLessThan(0);
    expect(compare('1.0.0-beta.11', '1.0.0-rc.1')).toBeLessThan(0);
    expect(compare('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
  });

  it('ignores build metadata, per SemVer section 10', () => {
    expect(compare('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
    expect(compare('1.0.0+build.1', '1.0.0')).toBe(0);
    expect(parse('1.0.0+build.1').prerelease).toEqual([]);
  });

  it('refuses a version it cannot parse rather than guessing', () => {
    for (const bad of ['', 'v1.0.0', '1.0', '1.0.0.0', 'latest', '01.0.0']) {
      expect(() => parse(bad)).toThrow(/valid SemVer/);
    }
  });

  it('rejects surrounding whitespace instead of trimming it', () => {
    // Whitespace means the caller passed something other than a version — a
    // stray newline out of `npm view`, a shell variable that picked up a space.
    // Quietly accepting it is how a release decision gets made about a string
    // nobody looked at.
    expect(() => parse(' 1.0.0')).toThrow(/valid SemVer/);
    expect(() => parse('1.0.0\n')).toThrow(/valid SemVer/);
  });

  it('distinguishes numeric components beyond 2^53', () => {
    // `Number` cannot: both of these round to 9007199254740992.
    expect(compare('9007199254740993.0.0', '9007199254740992.0.0')).toBeGreaterThan(0);
    expect(compare('1.0.9007199254740993', '1.0.9007199254740992')).toBeGreaterThan(0);
    expect(compare('1.0.0-9007199254740993', '1.0.0-9007199254740992')).toBeGreaterThan(0);
  });
});

describe('dist-tag selection', () => {
  it('sends every prerelease to next, whatever the identifier', () => {
    // Matching only alpha/beta/rc would promote an unfamiliar identifier
    // straight to `latest`.
    for (const version of ['1.0.0-rc.1', '2.0.0-alpha', '1.2.3-canary.4', '1.0.0-0']) {
      expect(distTagFor(version, '0.17.0')).toBe('next');
    }
  });

  it('gives latest to a stable release above the published one', () => {
    expect(distTagFor('1.0.0', '0.17.0')).toBe('latest');
    expect(distTagFor('0.18.0', '0.17.0')).toBe('latest');
    expect(distTagFor('1.0.0', '1.0.0-rc.3')).toBe('latest');
  });

  it('gives hotfix to a stable release on an older line', () => {
    expect(distTagFor('1.0.1', '2.3.0')).toBe('hotfix');
    expect(distTagFor('1.9.9', '1.10.0')).toBe('hotfix');
  });

  it('does not re-point latest at a version already published there', () => {
    expect(distTagFor('1.0.0', '1.0.0')).toBe('hotfix');
  });

  it('treats an unpublished package as 0.0.0 and takes latest', () => {
    expect(distTagFor('0.0.1', '0.0.0')).toBe('latest');
  });

  it('does not mistake build metadata containing a hyphen for a prerelease', () => {
    // The `case "$VERSION" in *-*)` shell glob this replaced did exactly that,
    // so a stable release carrying build metadata would have gone to `next`.
    // SemVer §10 allows a hyphen in build metadata.
    expect(distTagFor('1.2.3+build-7', '1.0.0')).toBe('latest');
    expect(parse('1.2.3+build-7').prerelease).toEqual([]);
  });
});

describe('the --is-prerelease entry point', () => {
  const run = (args) =>
    spawnSync(process.execPath, [fileURLToPath(SCRIPT), ...args], { encoding: 'utf8' });

  it('exits 0 for a prerelease and 1 for a stable release', () => {
    expect(run(['--is-prerelease', '1.0.0-rc.1']).status).toBe(0);
    expect(run(['--is-prerelease', '1.0.0']).status).toBe(1);
    expect(run(['--is-prerelease', '1.2.3+build-7']).status).toBe(1);
  });

  it('exits 2 on a version it cannot parse, rather than claiming stable', () => {
    expect(run(['--is-prerelease', 'not-a-version']).status).toBe(2);
  });

  it('prints a dist-tag when invoked directly', () => {
    // The entry-point guard used to compare `import.meta.url` against a
    // hand-built `file://` string, which is wrong for any path containing a
    // space or a non-ASCII character — and failed silently, printing nothing
    // and exiting 0, which the workflow would read as an empty dist-tag.
    const result = run(['1.0.0', '0.17.0']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('latest');
  });
});
