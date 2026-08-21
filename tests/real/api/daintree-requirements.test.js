/**
 * End-to-end behaviour for the requirements that came out of embedding CopyTree
 * in a desktop app (Daintree).
 *
 * Built on the reproduction fixture from that report, so each defect it
 * documented has a test that fails if the fix regresses.
 */

import fs from 'fs-extra';
import path from 'path';
import { copy } from '../../../src/api/copy.js';
import { copyStream } from '../../../src/api/copyStream.js';
import { scan } from '../../../src/api/scan.js';
import { ConfigManager } from '../../../src/config/ConfigManager.js';
import { ERROR_CODES } from '../../../src/utils/errors.js';
import { EXCLUSION_REASONS } from '../../../src/utils/exclusionReport.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('../../../src/utils/fsx.js');

let config;

beforeAll(async () => {
  // Hermetic on three axes, because all three can differ per machine:
  //   - ~/.copytree (userConfig: false)
  //   - the developer's global gitignore, reachable via core.excludesFile in
  //     ~/.gitconfig, which os.homedir() makes awkward to redirect
  //   - .git/info/exclude from any repository above the OS temp directory
  // Those two git sources have their own coverage in
  // tests/real/utils/gitignoreSources.test.js, plus one controlled end-to-end
  // case below. Everything else here depends only on the fixture's own files.
  config = await ConfigManager.create({ userConfig: false });
  config.set('copytree.gitignore.globalExcludesFile', false);
  config.set('copytree.gitignore.infoExclude', false);
});

/**
 * The fixture from the requirements report.
 *
 * fixture/
 *   .gitignore            ignored/, *.secret, sub/rootignored.txt
 *   .copytreeignore       sub/ctignored.txt
 *   root.md
 *   movie.mp4, pic.png, assets/deep.mp4, assets/deep.png
 *   ignored/i.txt
 *   sub/.gitignore        nested.txt
 *   sub/.copytreeignore   ctnested.txt
 *   sub/{keep,rootignored,ctignored,nested,ctnested}.txt, sub/a.secret
 *   sub/deep/d.txt
 */
async function buildFixture(root) {
  await fs.outputFile(path.join(root, '.gitignore'), 'ignored/\n*.secret\nsub/rootignored.txt\n');
  await fs.outputFile(path.join(root, '.copytreeignore'), 'sub/ctignored.txt\n');
  await fs.outputFile(path.join(root, 'root.md'), '# root\n');
  await fs.outputFile(path.join(root, 'movie.mp4'), Buffer.alloc(3_000_000));
  await fs.outputFile(path.join(root, 'pic.png'), Buffer.alloc(200_000));
  await fs.outputFile(path.join(root, 'assets/deep.mp4'), Buffer.alloc(100_000));
  await fs.outputFile(path.join(root, 'assets/deep.png'), Buffer.alloc(100));
  await fs.outputFile(path.join(root, 'ignored/i.txt'), 'i\n');
  await fs.outputFile(path.join(root, 'sub/.gitignore'), 'nested.txt\n');
  await fs.outputFile(path.join(root, 'sub/.copytreeignore'), 'ctnested.txt\n');
  await fs.outputFile(path.join(root, 'sub/keep.txt'), 'keep\n');
  await fs.outputFile(path.join(root, 'sub/rootignored.txt'), 'r\n');
  await fs.outputFile(path.join(root, 'sub/ctignored.txt'), 'c\n');
  await fs.outputFile(path.join(root, 'sub/a.secret'), 's\n');
  await fs.outputFile(path.join(root, 'sub/nested.txt'), 'n\n');
  await fs.outputFile(path.join(root, 'sub/ctnested.txt'), 'cn\n');
  await fs.outputFile(path.join(root, 'sub/deep/d.txt'), 'd\n');
}

/** Run a dry run and return the selected paths. */
async function paths(root, options = {}) {
  const result = await copy(root, { dryRun: true, config, ...options });
  return result.manifest.map((entry) => entry.path).sort();
}

const withFixture = (name, fn) =>
  withTempDir(name, async (root) => {
    await buildFixture(root);
    await fn(root);
  });

describe('config exclusions apply on the programmatic path', () => {
  it('excludes media and junk listed in globalExcludedFiles', async () => {
    // The CLI and the SDK must agree on what gets excluded. Previously the
    // config lists were only consulted on a dead fallback branch, so every
    // context generated through copy() carried the repository's video, image
    // and PDF bytes.
    await withFixture('req-d1', async (root) => {
      expect(await paths(root)).toEqual(['root.md', 'sub/deep/d.txt', 'sub/keep.txt']);
    });
  });

  it('attributes those exclusions to configExclude', async () => {
    await withFixture('req-d1-reason', async (root) => {
      const result = await copy(root, { dryRun: true, config, explain: true });
      expect(result.stats.excluded.byReason[EXCLUSION_REASONS.CONFIG_EXCLUDE]).toBe(4);

      const media = result.stats.excluded.largest.find((e) => e.path === 'movie.mp4');
      expect(media.reason).toBe(EXCLUSION_REASONS.CONFIG_EXCLUDE);
      expect(media.rule).toBe('*.mp4');
    });
  });
});

describe('gitignore fidelity', () => {
  it('honours a nested .gitignore, not just the root one', async () => {
    await withFixture('req-d2', async (root) => {
      const selected = await paths(root);
      expect(selected).not.toContain('sub/nested.txt');
      expect(selected).toContain('sub/keep.txt');
    });
  });

  it('honours nested .copytreeignore alongside nested .gitignore', async () => {
    await withFixture('req-d2-ct', async (root) => {
      expect(await paths(root)).not.toContain('sub/ctnested.txt');
    });
  });

  it('reports which ignore file and line excluded a path', async () => {
    await withFixture('req-d2-explain', async (root) => {
      const result = await copy(root, { dryRun: true, config, explain: true });
      const nested = result.stats.excluded.largest.find((e) => e.path === 'sub/nested.txt');

      expect(nested.reason).toBe(EXCLUSION_REASONS.GITIGNORE);
      expect(nested.rule).toBe('nested.txt');
      expect(nested.ruleSource).toBe(`${path.join(root, 'sub', '.gitignore')}:1`);
    });
  });

  it.each(['!vendor/', '!vendor/**', '!vendor/a.js', '!*.js'])(
    'keeps caller --exclude above a gitignore negation (%s)',
    async (negation) => {
      // Documented precedence: caller excludes outrank every ignore file. Worth
      // asserting directly rather than trusting the layer order, because a
      // negation is the one construct that can re-include something.
      await withTempDir(`req-r2-precedence-${negation.replace(/\W/g, '')}`, async (root) => {
        await fs.outputFile(`${root}/.gitignore`, `${negation}\n`);
        await fs.outputFile(`${root}/vendor/a.js`, 'export {};\n');
        await fs.outputFile(`${root}/top.md`, '# top\n');

        expect(await paths(root, { exclude: ['vendor'] })).toEqual(['top.md']);
      });
    },
  );

  it('does not require the target to be a git repository', async () => {
    await withFixture('req-d2-nogit', async (root) => {
      // No .git anywhere; ignore files are read directly from disk.
      expect(await fs.pathExists(path.join(root, '.git'))).toBe(false);
      expect(await paths(root)).toContain('root.md');
    });
  });

  it('applies .git/info/exclude and the global gitignore end to end', async () => {
    // The one place the suite opts back into the two machine-dependent git
    // sources. Both are pinned to fixture-owned files via the repository's own
    // .git/config, which takes precedence over the developer's ~/.gitconfig —
    // relying on the XDG fallback would make this pass or fail depending on
    // whose machine it runs on. The files live under .git/, which is never
    // scanned, so they cannot show up in the result themselves.
    await withFixture('req-d2-gitsources', async (root) => {
      const globalIgnore = path.join(root, '.git', 'fixture-global-ignore');
      await fs.outputFile(globalIgnore, 'root.md\n');
      await fs.outputFile(
        path.join(root, '.git', 'config'),
        `[core]\n\texcludesFile = ${globalIgnore}\n`,
      );
      await fs.outputFile(path.join(root, '.git', 'info', 'exclude'), 'sub/keep.txt\n');

      const gitAware = await ConfigManager.create({ userConfig: false });
      const selected = (await copy(root, { dryRun: true, config: gitAware })).manifest.map(
        (entry) => entry.path,
      );

      expect(selected).not.toContain('root.md'); // global gitignore
      expect(selected).not.toContain('sub/keep.txt'); // .git/info/exclude
      expect(selected).toContain('sub/deep/d.txt');
    });
  });

  it('reads a linked worktree`s shared info/exclude, not the worktree-local dir', async () => {
    await withFixture('req-d2-worktree', async (root) => {
      // Lay out what `git worktree add` produces: the worktree's `.git` is a
      // file pointing at .git/worktrees/<name>, whose `commondir` points back at
      // the real repository directory that owns info/exclude.
      const commonGitDir = path.join(root, 'main-repo', '.git');
      const worktreeGitDir = path.join(commonGitDir, 'worktrees', 'wt');

      await fs.outputFile(path.join(commonGitDir, 'info', 'exclude'), 'root.md\n');
      await fs.outputFile(path.join(worktreeGitDir, 'commondir'), '../..\n');
      await fs.outputFile(path.join(root, '.git'), `gitdir: ${worktreeGitDir}\n`);

      const gitAware = await ConfigManager.create({ userConfig: false });
      gitAware.set('copytree.gitignore.globalExcludesFile', false);

      const selected = (await copy(root, { dryRun: true, config: gitAware })).manifest.map(
        (entry) => entry.path,
      );

      expect(selected).not.toContain('root.md');
      expect(selected).toContain('sub/keep.txt');
    });
  });
});

describe('budgets actually bind', () => {
  it('applies maxFileCount', async () => {
    await withFixture('req-d3-count', async (root) => {
      const result = await copy(root, { dryRun: true, config, maxFileCount: 1 });
      expect(result.stats.totalFiles).toBe(1);
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.truncatedBy).toBe('maxFileCount');
      expect(result.stats.truncatedCount).toBe(2);
    });
  });

  it('applies maxTotalSize', async () => {
    await withFixture('req-d3-size', async (root) => {
      const result = await copy(root, { dryRun: true, config, maxTotalSize: 10 });
      expect(result.stats.totalFiles).toBeLessThan(3);
      expect(result.stats.truncated).toBe(true);
    });
  });

  it('applies the hard size gate from stat, without opening the file', async () => {
    await withFixture('req-r4-gate', async (root) => {
      await fs.outputFile(path.join(root, 'big.txt'), 'x'.repeat(20_000));

      const gated = await copy(root, { dryRun: true, config, sizeGate: 1000, explain: true });
      expect(gated.manifest.map((e) => e.path)).not.toContain('big.txt');
      expect(gated.stats.excluded.byReason[EXCLUSION_REASONS.SIZE_GATE]).toBe(1);

      const ungated = await copy(root, { dryRun: true, config, sizeGate: false });
      expect(ungated.manifest.map((e) => e.path)).toContain('big.txt');
    });
  });

  it('lets `always` override the size gate, and only `always`', async () => {
    await withFixture('req-r4-always', async (root) => {
      await fs.outputFile(path.join(root, 'big.txt'), 'x'.repeat(20_000));

      const result = await copy(root, {
        dryRun: true,
        config,
        sizeGate: 1000,
        always: ['big.txt'],
      });

      expect(result.manifest.map((e) => e.path)).toContain('big.txt');
    });
  });

  it('never lets `always` override the memory ceiling', async () => {
    // `always` lifts the context-shaped size gate. `maxFileSize` is a different
    // promise: nothing above it is ever read into memory, and force-inclusion
    // must not be a way around that.
    await withFixture('req-r4-ceiling', async (root) => {
      await fs.outputFile(path.join(root, 'huge.txt'), 'x'.repeat(50_000));

      const result = await copy(root, {
        dryRun: true,
        config,
        maxFileSize: 1000,
        sizeGate: false,
        always: ['huge.txt'],
      });

      expect(result.manifest.map((e) => e.path)).not.toContain('huge.txt');
      expect(result.stats.excluded.byReason[EXCLUSION_REASONS.SIZE_GATE]).toBeGreaterThan(0);
    });
  });

  it('honours maxTotalSize even when the only file exceeds it', async () => {
    // A maximum is a maximum. Keeping the file regardless meant a caller who set
    // the budget to protect a context window could be handed five hundred times
    // it, having asked for a limit and been given a suggestion.
    await withTempDir('req-r7-overshoot', async (root) => {
      await fs.outputFile(root + '/only.txt', 'x'.repeat(5000));

      const result = await copy(root, { dryRun: true, config, maxTotalSize: 10 });

      expect(result.stats.totalFiles).toBe(0);
      expect(result.stats.budgetExceeded).toBeUndefined();
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.truncatedBy).toBe('maxTotalSize');
    });
  });

  it('reports the overshoot when asked to keep an oversized first file', async () => {
    await withTempDir('req-r7-retain', async (root) => {
      await fs.outputFile(root + '/only.txt', 'x'.repeat(5000));

      const result = await copy(root, {
        dryRun: true,
        config,
        maxTotalSize: 10,
        retainOversizedFirstFile: true,
      });

      expect(result.stats.totalFiles).toBe(1);
      expect(result.stats.budgetExceeded).toBe(true);
      expect(result.stats.oversizedFirstFileRetained).toBe(true);

      // Not `truncated`. Nothing was dropped, and `truncated` means files were:
      // it travels with `truncatedCount` and `truncatedBy`, neither of which has
      // a meaningful value here. Reporting both said "files were dropped" and
      // "no files were dropped" in the same stats object.
      expect(result.stats.truncated).toBe(false);
      expect(result.stats.truncatedCount).toBeUndefined();
      expect(result.stats.truncatedBy).toBeUndefined();
    });
  });

  it('does not report a force-included file as excluded', async () => {
    await withFixture('req-r5-forced', async (root) => {
      const baseline = await copy(root, { dryRun: true, config });
      const forced = await copy(root, { dryRun: true, config, always: ['sub/nested.txt'] });

      expect(forced.manifest.map((e) => e.path)).toContain('sub/nested.txt');
      // One fewer exclusion than the baseline: the override cancels the record,
      // rather than reporting the file as both included and excluded.
      expect(forced.stats.excluded.total).toBe(baseline.stats.excluded.total - 1);
    });
  });

  it('applies charLimit and reports the truncation', async () => {
    await withFixture('req-d3-chars', async (root) => {
      const result = await copy(root, { config, charLimit: 8 });
      expect(result.stats.truncated).toBe(true);
      expect(result.stats.totalCharacters ?? 0).toBeLessThanOrEqual(8);
    });
  });
});

describe('scoped copy', () => {
  it('selects the same set a filtered full run would', async () => {
    await withFixture('req-r1-parity', async (root) => {
      const scoped = await paths(root, { scope: ['sub'] });
      const filtered = await paths(root, { filter: ['sub/**'] });
      expect(scoped).toEqual(filtered);
    });
  });

  it('holds that invariant over a tree with negations and nested rules', async () => {
    // This is the correctness test for scoped traversal. The small fixture above
    // could agree by luck; this one deliberately exercises the cases where
    // "start at the selection" could diverge from "walk everything and filter":
    // an ignored ancestor, a negation that re-includes inside an ignored
    // subtree, rules at three different depths, and a scope entry that is a file.
    await withTempDir('req-r1-invariant', async (root) => {
      await fs.outputFile(root + '/.gitignore', 'dist/\n*.log\n!keep.log\n');
      await fs.outputFile(root + '/.copytreeignore', 'scratch/\n');
      await fs.outputFile(root + '/top.md', 'top\n');
      await fs.outputFile(root + '/keep.log', 'kept by negation\n');
      await fs.outputFile(root + '/drop.log', 'dropped\n');
      await fs.outputFile(root + '/dist/bundle.js', 'built\n');
      await fs.outputFile(root + '/scratch/tmp.txt', 'scratch\n');

      await fs.outputFile(root + '/pkg/.gitignore', 'generated/\n*.snap\n');
      await fs.outputFile(root + '/pkg/index.js', 'export {};\n');
      await fs.outputFile(root + '/pkg/thing.snap', 'snapshot\n');
      await fs.outputFile(root + '/pkg/generated/gen.js', 'generated\n');

      await fs.outputFile(root + '/pkg/deep/.copytreeignore', 'notes.md\n');
      await fs.outputFile(root + '/pkg/deep/impl.js', 'export {};\n');
      await fs.outputFile(root + '/pkg/deep/notes.md', 'notes\n');
      await fs.outputFile(root + '/pkg/deep/drop.log', 'dropped\n');

      await fs.outputFile(root + '/other/thing.js', 'other\n');

      const full = await paths(root);

      // Sanity: the fixture actually exercises what it claims to.
      expect(full).toContain('keep.log'); // negation survived
      expect(full).not.toContain('drop.log');
      expect(full).not.toContain('pkg/deep/drop.log'); // root rule reaches depth 2
      expect(full).not.toContain('pkg/thing.snap'); // nested rule
      expect(full).not.toContain('pkg/deep/notes.md'); // nested .copytreeignore
      expect(full).not.toContain('dist/bundle.js');
      expect(full).not.toContain('scratch/tmp.txt');

      for (const entry of ['pkg', 'pkg/deep', 'other', 'dist', 'scratch']) {
        const scoped = await paths(root, { scope: [entry] });
        const expected = full.filter((p) => p === entry || p.startsWith(`${entry}/`));
        expect({ entry, scoped }).toEqual({ entry, scoped: expected });
      }

      // A file entry, and a multi-entry selection
      expect(await paths(root, { scope: ['top.md'] })).toEqual(['top.md']);
      expect(await paths(root, { scope: ['pkg/deep', 'top.md'] })).toEqual(
        full.filter((p) => p === 'top.md' || p.startsWith('pkg/deep/')),
      );
    });
  });

  it('keeps output paths relative to the base path, not the scope', async () => {
    await withFixture('req-r1-paths', async (root) => {
      // A scoped copy that re-roots its paths hands an agent @-references that
      // do not resolve against the repository it is running in.
      expect(await paths(root, { scope: ['sub'] })).toEqual(['sub/deep/d.txt', 'sub/keep.txt']);
    });
  });

  it('applies root ignore rules to a scoped subtree', async () => {
    await withFixture('req-r1-rules', async (root) => {
      const selected = await paths(root, { scope: ['sub'] });
      expect(selected).not.toContain('sub/rootignored.txt'); // root .gitignore
      expect(selected).not.toContain('sub/ctignored.txt'); // root .copytreeignore
      expect(selected).not.toContain('sub/nested.txt'); // nested .gitignore
      expect(selected).not.toContain('sub/a.secret'); // root .gitignore glob
    });
  });

  it('accepts several entries, files as well as directories', async () => {
    await withFixture('req-r1-multi', async (root) => {
      expect(await paths(root, { scope: ['sub', 'root.md'] })).toEqual([
        'root.md',
        'sub/deep/d.txt',
        'sub/keep.txt',
      ]);
    });
  });

  it('takes literal paths, with no glob escaping required', async () => {
    await withFixture('req-r1-literal', async (root) => {
      await fs.outputFile(path.join(root, 'src/[draft]/note.md'), '# draft\n');
      await fs.outputFile(path.join(root, 'src/d/decoy.md'), '# decoy\n');

      // As a glob, `src/[draft]` would match `src/d`. As a path, it does not.
      const selected = await paths(root, { scope: ['src/[draft]'] });
      expect(selected).toEqual(['src/[draft]/note.md']);
    });
  });

  it('composes with filter', async () => {
    await withFixture('req-r1-compose', async (root) => {
      await fs.outputFile(path.join(root, 'sub/app.ts'), 'export {};\n');
      expect(await paths(root, { scope: ['sub'], filter: ['**/*.ts'] })).toEqual(['sub/app.ts']);
    });
  });

  it('excludes a gitignored scope entry by default', async () => {
    await withFixture('req-r1-ignored', async (root) => {
      const result = await copy(root, { dryRun: true, config, scope: ['ignored'] });
      expect(result.stats.totalFiles).toBe(0);
      expect(result.stats.noFilesMatched).toBe(true);
    });
  });

  it('includes a gitignored scope entry when asked explicitly', async () => {
    await withFixture('req-r1-force', async (root) => {
      const selected = await paths(root, {
        scope: ['ignored'],
        scopeIgnoresIgnoreFiles: true,
      });
      expect(selected).toEqual(['ignored/i.txt']);
    });
  });

  it('still excludes config-level junk under scopeIgnoresIgnoreFiles', async () => {
    await withFixture('req-r1-force-safe', async (root) => {
      await fs.outputFile(path.join(root, 'ignored/node_modules/pkg/index.js'), 'x\n');
      await fs.outputFile(path.join(root, 'ignored/clip.mp4'), Buffer.alloc(10));

      const selected = await paths(root, {
        scope: ['ignored'],
        scopeIgnoresIgnoreFiles: true,
      });

      expect(selected).toEqual(['ignored/i.txt']);
    });
  });

  it('errors rather than returning an empty result for a path outside the root', async () => {
    await withFixture('req-r1-outside', async (root) => {
      await expect(
        copy(root, { dryRun: true, config, scope: ['../elsewhere'] }),
      ).rejects.toMatchObject({ code: ERROR_CODES.SCOPE_OUTSIDE_ROOT });
    });
  });

  it('errors rather than returning an empty result for a missing path', async () => {
    await withFixture('req-r1-missing', async (root) => {
      await expect(copy(root, { dryRun: true, config, scope: ['nope'] })).rejects.toMatchObject({
        code: ERROR_CODES.PATH_NOT_FOUND,
      });
    });
  });

  it('reports the resolved scope on the result', async () => {
    await withFixture('req-r1-report', async (root) => {
      const result = await copy(root, { dryRun: true, config, scope: ['sub'] });
      expect(result.stats.scope).toEqual(['sub']);
    });
  });

  it('does not surface rules a full walk would never have read', async () => {
    // The subtle way "start at the selection" can diverge from "walk everything
    // and filter": a full walk prunes `parent/` and never opens its .gitignore,
    // so the `!*` inside it is never seen. Reading the chain unconditionally
    // would let that negation re-include a subtree the repository excluded.
    await withTempDir('req-r1-pruned-ancestor', async (root) => {
      await fs.outputFile(root + '/.gitignore', 'parent/\n');
      await fs.outputFile(root + '/parent/.gitignore', '!*\n');
      await fs.outputFile(root + '/parent/child/a.js', 'export {};\n');
      await fs.outputFile(root + '/top.md', '# top\n');

      expect(await paths(root)).toEqual(['top.md']);
      expect(await paths(root, { scope: ['parent/child'] })).toEqual([]);
      expect(await paths(root, { scope: ['parent'] })).toEqual([]);
    });
  });

  it('keeps unrelated inherited rules under scopeIgnoresIgnoreFiles', async () => {
    // The override exists to get past the one rule standing in the way. It is
    // not a request to drop the repository's other exclusions — losing an
    // unrelated `*.secret` rule on the way into a build directory would leak
    // key material into an agent's context.
    await withTempDir('req-r1-bypass-scoped', async (root) => {
      await fs.outputFile(root + '/.gitignore', 'ignored/\n*.secret\n');
      await fs.outputFile(root + '/ignored/ok.txt', 'fine\n');
      await fs.outputFile(root + '/ignored/key.secret', 'shh\n');

      const selected = await paths(root, {
        scope: ['ignored'],
        scopeIgnoresIgnoreFiles: true,
      });

      expect(selected).toEqual(['ignored/ok.txt']);
      expect(selected).not.toContain('ignored/key.secret');
    });
  });

  it('accepts a directory whose name begins with two dots', async () => {
    await withTempDir('req-r1-dotdot-name', async (root) => {
      await fs.outputFile(root + '/..draft/note.md', '# draft\n');
      expect(await paths(root, { scope: ['..draft'] })).toEqual(['..draft/note.md']);
    });
  });
});

describe('exclusion accounting', () => {
  it('counts every exclusion by a stable reason key', async () => {
    await withFixture('req-r5', async (root) => {
      const { stats } = await copy(root, { dryRun: true, config });

      expect(stats.excluded.total).toBeGreaterThan(0);
      for (const reason of Object.keys(stats.excluded.byReason)) {
        expect(Object.values(EXCLUSION_REASONS)).toContain(reason);
      }
    });
  });

  it('omits the detail list unless explain is requested', async () => {
    await withFixture('req-r5-noexplain', async (root) => {
      const { stats } = await copy(root, { dryRun: true, config });
      expect(stats.excluded.largest).toBeUndefined();
      expect(stats.excluded.total).toBeGreaterThan(0);
    });
  });
});

describe('preview parity', () => {
  it('a dry run selects the same files as the real run', async () => {
    await withFixture('req-r6-parity', async (root) => {
      const dry = await copy(root, { dryRun: true, config });
      const real = await copy(root, { config });

      expect(dry.manifest.map((e) => e.path)).toEqual(real.manifest.map((e) => e.path));
    });
  });

  it('the same budget drops the same files in both modes', async () => {
    await withFixture('req-r6-budget', async (root) => {
      const options = { config, maxFileCount: 2 };
      const dry = await copy(root, { ...options, dryRun: true });
      const real = await copy(root, options);

      expect(dry.manifest.map((e) => e.path)).toEqual(real.manifest.map((e) => e.path));
      expect(dry.stats.truncatedCount).toBe(real.stats.truncatedCount);
    });
  });

  it('estimates output characters and tokens on a dry run', async () => {
    await withFixture('req-r12', async (root) => {
      const { stats } = await copy(root, { dryRun: true, config });

      expect(stats.estimatedOutputChars).toBeGreaterThan(0);
      expect(stats.estimatedTokens).toBe(Math.ceil(stats.estimatedOutputChars / 4));
    });
  });

  it('reports measured characters on a real run', async () => {
    await withFixture('req-r12-real', async (root) => {
      const result = await copy(root, { config });
      expect(result.stats.estimatedOutputChars).toBe(result.output.length);
    });
  });
});

describe('result contract', () => {
  it('carries an outcome on every manifest entry', async () => {
    await withFixture('req-r11-outcome', async (root) => {
      await fs.outputFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}');

      const { manifest } = await copy(root, { config });
      const lock = manifest.find((e) => e.path === 'package-lock.json');

      expect(lock.outcome).toBe('structure-only');
      expect(manifest.find((e) => e.path === 'root.md').outcome).toBe('included');
    });
  });

  it('versions the output format', async () => {
    await withFixture('req-r11-version', async (root) => {
      const xml = await copy(root, { config });
      expect(xml.outputFormatVersion).toBe('copytree-xml@1');
      expect(xml.output).toContain('<ct:format>copytree-xml@1</ct:format>');

      const md = await copy(root, { config, format: 'markdown' });
      expect(md.outputFormatVersion).toBe('copytree-md@1');
    });
  });

  it('treats "no files matched" as an outcome, not an error', async () => {
    await withFixture('req-r11-empty', async (root) => {
      const result = await copy(root, { config, filter: ['**/*.nomatch'] });

      expect(result.stats.noFilesMatched).toBe(true);
      expect(result.manifest).toEqual([]);
      expect(typeof result.output).toBe('string');
    });
  });

  it('raises typed errors with stable codes', async () => {
    await withFixture('req-r11-errors', async (root) => {
      await expect(copy(path.join(root, 'missing'), { config })).rejects.toMatchObject({
        code: ERROR_CODES.PATH_NOT_FOUND,
      });
      await expect(copy(root, { config, format: 'nonsense' })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_FORMAT,
      });
    });
  });
});

describe('streaming parity', () => {
  it('delivers the same stats and manifest as copy()', async () => {
    await withFixture('req-r8-parity', async (root) => {
      const buffered = await copy(root, { config });

      let streamed;
      let output = '';
      for await (const chunk of copyStream(root, {
        config,
        onComplete: (result) => (streamed = result),
      })) {
        output += chunk;
      }

      expect(streamed.manifest.map((e) => e.path)).toEqual(buffered.manifest.map((e) => e.path));
      expect(streamed.stats.totalFiles).toBe(buffered.stats.totalFiles);
      expect(streamed.outputFormatVersion).toBe('copytree-xml@1');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  it('accepts scope and budgets like copy()', async () => {
    await withFixture('req-r8-options', async (root) => {
      let streamed;
      for await (const chunk of copyStream(root, {
        config,
        scope: ['sub'],
        maxFileCount: 1,
        onComplete: (result) => (streamed = result),
      })) {
        expect(typeof chunk).toBe('string');
      }

      expect(streamed.stats.totalFiles).toBe(1);
      expect(streamed.manifest[0].path.startsWith('sub/')).toBe(true);
    });
  });

  it('never splits a surrogate pair across chunks', async () => {
    await withFixture('req-r8-surrogates', async (root) => {
      await fs.outputFile(path.join(root, 'emoji.md'), `${'😀'.repeat(500)}\n`);

      for await (const chunk of copyStream(root, { config })) {
        if (chunk.length === 0) continue;
        const last = chunk.charCodeAt(chunk.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
      }
    });
  });

  it('emits the same format version the buffered formatter does', async () => {
    // `outputFormatVersion` claimed `copytree-xml@1` while the streamed document
    // omitted the element entirely, so the two formatters disagreed about what
    // they were producing.
    await withFixture('req-r11-stream-version', async (root) => {
      for (const [format, needle] of [
        ['xml', '<ct:format>copytree-xml@1</ct:format>'],
        ['markdown', 'format: copytree-md@1'],
        ['json', '"format": "copytree-json@1"'],
      ]) {
        let output = '';
        for await (const chunk of copyStream(root, { config, format })) output += chunk;
        expect(output).toContain(needle);
      }
    });
  });

  it('does not fire onComplete when the consumer stops early', async () => {
    await withFixture('req-r8-early-break', async (root) => {
      let fired = false;
      for await (const _chunk of copyStream(root, {
        config,
        onComplete: () => {
          fired = true;
        },
      })) {
        break;
      }
      expect(fired).toBe(false);
    });
  });

  it('supports a dry run that emits no chunks but still reports', async () => {
    await withFixture('req-r8-dry', async (root) => {
      let streamed;
      let chunks = 0;
      for await (const _chunk of copyStream(root, {
        config,
        dryRun: true,
        onComplete: (result) => (streamed = result),
      })) {
        chunks++;
      }

      expect(chunks).toBe(0);
      expect(streamed.stats.dryRun).toBe(true);
      expect(streamed.stats.totalFiles).toBe(3);
    });
  });
});

describe('scan summary', () => {
  it('delivers counts and accounting before the first file is yielded', async () => {
    await withFixture('req-summary', async (root) => {
      let summary = null;
      let firstFileSeen = false;

      for await (const _file of scan(root, {
        config,
        onSummary: (value) => {
          expect(firstFileSeen).toBe(false);
          summary = value;
        },
      })) {
        firstFileSeen = true;
      }

      expect(summary.totalFiles).toBe(3);
      expect(summary.noFilesMatched).toBe(false);
      expect(summary.excluded.total).toBeGreaterThan(0);
    });
  });

  it('survives a throwing summary callback', async () => {
    await withFixture('req-summary-throws', async (root) => {
      const files = [];
      for await (const file of scan(root, {
        config,
        onSummary: () => {
          throw new Error('consumer bug');
        },
      })) {
        files.push(file);
      }
      expect(files).toHaveLength(3);
    });
  });
});

describe('cancellation', () => {
  it('rejects with an AbortError carrying ERR_ABORTED', async () => {
    await withFixture('req-r10-abort', async (root) => {
      const controller = new AbortController();
      controller.abort();

      await expect(copy(root, { config, signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
        code: ERROR_CODES.ABORTED,
      });
    });
  });

  it('rejects rather than crashing when aborted mid-run', async () => {
    // Cancellation used to be signalled by emitting 'error' on the pipeline's
    // EventEmitter. With no listener attached that is not a rejected promise,
    // it is an uncaught exception that takes the host process down — the worst
    // possible outcome for an embedder whose user just clicked Cancel.
    await withTempDir('req-r10-abort-midrun', async (root) => {
      await Promise.all(
        Array.from({ length: 400 }, (_, i) =>
          fs.outputFile(`${root}/dir${i % 20}/file${i}.js`, `// ${'x'.repeat(200)}\n`),
        ),
      );

      for (const delay of [0, 1, 5]) {
        const controller = new AbortController();
        if (delay === 0) controller.abort();
        else setTimeout(() => controller.abort(), delay);

        await expect(copy(root, { config, signal: controller.signal })).rejects.toMatchObject({
          name: 'AbortError',
        });
      }
    });
  }, 30000);

  it('never resolves a cancelled run into a partial success', async () => {
    await withFixture('req-r10-no-partial', async (root) => {
      const controller = new AbortController();
      controller.abort();

      // Not `{ files: [...] }` with a subset — an aborted run has no result.
      await expect(copy(root, { config, signal: controller.signal })).rejects.toBeDefined();
    });
  });
});

describe('hermetic configuration', () => {
  it('skips ~/.copytree when userConfig is false', async () => {
    const hermetic = await ConfigManager.create({ userConfig: false });
    expect(hermetic.isDefaultsLoaded).toBe(true);
    expect(hermetic.userConfigLoaded).toBe(false);
    expect(hermetic.getLoadErrors()).toEqual([]);
  });

  it('supports an explicit source list', async () => {
    const hermetic = await ConfigManager.create({ configSources: ['defaults'] });
    expect(hermetic.get('copytree.globalExcludedFiles')).toEqual(expect.arrayContaining(['*.mp4']));
  });

  it('is safe to reuse across concurrent operations', async () => {
    await withFixture('req-r9-concurrent', async (root) => {
      const results = await Promise.all([
        copy(root, { dryRun: true, config }),
        copy(root, { dryRun: true, config, scope: ['sub'] }),
        copy(root, { dryRun: true, config, maxFileCount: 1 }),
      ]);

      expect(results[0].stats.totalFiles).toBe(3);
      expect(results[1].stats.totalFiles).toBe(2);
      expect(results[2].stats.totalFiles).toBe(1);
    });
  });
});
