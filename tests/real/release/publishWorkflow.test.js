/**
 * The publish workflow is the least testable and most consequential code in
 * the repository: it runs once per release, only on a tag, and a mistake in it
 * is discovered by a failed release.
 *
 * These assertions cover the parts that are checkable without running it — the
 * ones where a plausible-looking string does something other than what it
 * reads like.
 */

import { readFileSync } from 'fs';
import path from 'path';

jest.unmock('../../../src/utils/fsx.js');

const WORKFLOW = readFileSync(path.join(process.cwd(), '.github/workflows/publish.yml'), 'utf8');

describe('the publish workflow', () => {
  it('hands npm publish an unambiguous file path', () => {
    // `npm publish <spec>` runs its argument through npm-package-arg, which
    // reads a bare `a/b` as the GitHub shorthand `owner/repo`. So
    // `npm publish dist/copytree-1.0.0-rc.1.tgz` resolved to
    // `github:dist/copytree-1.0.0-rc.1.tgz`, went off to `git ls-remote`, and
    // failed on a public key — having never looked at the tarball beside it.
    //
    // Only `./` or `/` makes it a file spec, and nothing else in the job would
    // have caught it: the tarball existed, the version matched, the gate had
    // already passed.
    const recorded = WORKFLOW.match(/FILE="([^"]+)"/);
    expect(recorded).not.toBeNull();
    expect(recorded[1]).toMatch(/^(\.\/|\/)/);
  });

  it('publishes the artifact it verified, rather than repacking', () => {
    // Packing again after the consumer tests would produce a different file
    // that nothing had exercised. "Probably identical" is not the claim this
    // job exists to make.
    expect(WORKFLOW).toContain('node scripts/verify-package.js --out dist');
    expect(WORKFLOW).toMatch(/npm publish "\$\{\{ steps\.pack\.outputs\.file \}\}"/);
  });

  it('decides the dist-tag with the tested SemVer implementation', () => {
    // `sort -V` is GNU version sort, not SemVer: it ranks `1.0.0-beta.1` above
    // `1.0.0`, and a bare `case *-*` glob calls `1.2.3+build-7` a prerelease.
    // Matched as a command, not as a substring: the comment above the
    // replacement explains what `sort -V` got wrong, and a naive
    // `not.toContain` would fail on the explanation.
    const commands = WORKFLOW.split('\n').filter((line) => !line.trim().startsWith('#'));
    expect(commands.join('\n')).not.toMatch(/\bsort -V\b/);
    expect(WORKFLOW).toContain('node scripts/dist-tag.js --is-prerelease');
    expect(WORKFLOW).toContain('node scripts/dist-tag.js "$VERSION" "$LATEST"');
  });

  it('creates the GitHub release only after the registry is confirmed', () => {
    // A release announcing a version that is not on the registry sends people
    // to an install that fails. Ordering is the whole safety property here.
    const publish = WORKFLOW.indexOf('Publish to npm');
    const confirm = WORKFLOW.indexOf('Confirm the registry has the bytes we tested');
    const release = WORKFLOW.indexOf('Create the GitHub release');

    expect(publish).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(publish);
    expect(release).toBeGreaterThan(confirm);
  });

  it('pins the npm used to publish', () => {
    // Floating the tool that performs the most consequential action in the
    // repository makes every release depend on whatever shipped that morning.
    expect(WORKFLOW).not.toMatch(/npm install -g npm@latest/);
    expect(WORKFLOW).toMatch(/npm install -g npm@\d+\.\d+\.\d+/);
  });

  it('refuses to guess a dist-tag when the registry cannot be read', () => {
    // A network blip must not read as "nothing is published" and move `latest`
    // backwards. Only a genuine 404 means the package is new.
    expect(WORKFLOW).toContain('E404');
    expect(WORKFLOW).toContain('refusing to guess a dist-tag');
  });
});
