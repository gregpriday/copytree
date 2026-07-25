import fs from 'fs-extra';
import path from 'path';
import {
  findGitDir,
  parseExcludesFile,
  resolveGlobalExcludesFile,
  collectGitIgnoreSources,
} from '../../../src/utils/gitignoreSources.js';
import { withTempDir } from '../../helpers/tempfs.js';

jest.unmock('fs-extra');

describe('parseExcludesFile', () => {
  it('reads core.excludesFile', () => {
    expect(parseExcludesFile('[core]\n\texcludesFile = ~/.gitignore_global\n')).toBe(
      '~/.gitignore_global',
    );
  });

  it('is case-insensitive on the key, as git is', () => {
    expect(parseExcludesFile('[core]\nexcludesfile = /a/b\n')).toBe('/a/b');
    expect(parseExcludesFile('[CORE]\nEXCLUDESFILE = /a/b\n')).toBe('/a/b');
  });

  it('ignores the key outside the [core] section', () => {
    expect(parseExcludesFile('[user]\nexcludesFile = /a/b\n')).toBeNull();
  });

  it('handles quoted values', () => {
    expect(parseExcludesFile('[core]\n\texcludesFile = "/path with spaces/ignore"\n')).toBe(
      '/path with spaces/ignore',
    );
  });

  it('strips an inline comment from an unquoted value', () => {
    expect(parseExcludesFile('[core]\nexcludesFile = /a/b # the global one\n')).toBe('/a/b');
  });

  it('skips comments and blank lines', () => {
    expect(parseExcludesFile('# comment\n; other\n\n[core]\nexcludesFile = /a/b\n')).toBe('/a/b');
  });

  it('takes the last definition when repeated', () => {
    expect(parseExcludesFile('[core]\nexcludesFile = /first\nexcludesFile = /second\n')).toBe(
      '/second',
    );
  });

  it('returns null for empty or unrelated input', () => {
    expect(parseExcludesFile('')).toBeNull();
    expect(parseExcludesFile(null)).toBeNull();
    expect(parseExcludesFile('[core]\nautocrlf = true\n')).toBeNull();
  });
});

describe('findGitDir', () => {
  it('finds a .git directory at the root', async () => {
    await withTempDir('git-dir', async (root) => {
      await fs.ensureDir(path.join(root, '.git'));
      await fs.ensureDir(path.join(root, 'src/deep'));

      expect(await findGitDir(path.join(root, 'src/deep'))).toBe(path.join(root, '.git'));
    });
  });

  it('follows a gitdir: pointer file, as used by worktrees', async () => {
    await withTempDir('git-worktree', async (root) => {
      const realGitDir = path.join(root, 'store/worktrees/wt');
      await fs.ensureDir(realGitDir);
      await fs.ensureDir(path.join(root, 'wt'));
      await fs.outputFile(path.join(root, 'wt/.git'), `gitdir: ${realGitDir}\n`);

      expect(await findGitDir(path.join(root, 'wt'))).toBe(realGitDir);
    });
  });

  it('resolves a relative gitdir: pointer', async () => {
    await withTempDir('git-relative', async (root) => {
      await fs.ensureDir(path.join(root, 'store/wt'));
      await fs.ensureDir(path.join(root, 'wt'));
      await fs.outputFile(path.join(root, 'wt/.git'), 'gitdir: ../store/wt\n');

      expect(await findGitDir(path.join(root, 'wt'))).toBe(path.join(root, 'store/wt'));
    });
  });
});

describe('collectGitIgnoreSources', () => {
  const originalXdg = process.env.XDG_CONFIG_HOME;

  afterEach(() => {
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
  });

  it('returns nothing for a directory that is not a repository', async () => {
    await withTempDir('git-none', async (root) => {
      // Point XDG at an empty directory so the user's real global gitignore
      // cannot leak into the assertion.
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      await fs.ensureDir(process.env.XDG_CONFIG_HOME);

      const sources = await collectGitIgnoreSources(path.join(root, 'project'), {
        globalExcludesFile: true,
        infoExclude: true,
      });
      expect(sources).toEqual([]);
    });
  });

  it('reads .git/info/exclude', async () => {
    await withTempDir('git-info-exclude', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      await fs.ensureDir(process.env.XDG_CONFIG_HOME);
      await fs.outputFile(path.join(root, '.git/info/exclude'), 'scratch/\n*.tmp\n');

      const sources = await collectGitIgnoreSources(root);

      expect(sources).toHaveLength(1);
      expect(sources[0].kind).toBe('git-info-exclude');
      expect(sources[0].rules).toContain('scratch/');
    });
  });

  it('reads the global gitignore named by core.excludesFile', async () => {
    await withTempDir('git-global', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      const globalIgnore = path.join(root, 'my-global-ignore');
      await fs.outputFile(globalIgnore, '.DS_Store\n');
      await fs.outputFile(
        path.join(root, '.git/config'),
        `[core]\n\texcludesFile = ${globalIgnore}\n`,
      );

      const sources = await collectGitIgnoreSources(root);

      const global = sources.find((s) => s.kind === 'global-gitignore');
      expect(global).toBeDefined();
      expect(global.rules).toContain('.DS_Store');
    });
  });

  it('orders global gitignore before .git/info/exclude', async () => {
    await withTempDir('git-order', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      const globalIgnore = path.join(root, 'global-ignore');
      await fs.outputFile(globalIgnore, '*.log\n');
      await fs.outputFile(
        path.join(root, '.git/config'),
        `[core]\n\texcludesFile = ${globalIgnore}\n`,
      );
      await fs.outputFile(path.join(root, '.git/info/exclude'), '!keep.log\n');

      const sources = await collectGitIgnoreSources(root);

      // Later layers win, so .git/info/exclude must come second to be able to
      // re-include something the global file excluded.
      expect(sources.map((s) => s.kind)).toEqual(['global-gitignore', 'git-info-exclude']);
    });
  });

  it('honours the toggles', async () => {
    await withTempDir('git-toggles', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      await fs.ensureDir(process.env.XDG_CONFIG_HOME);
      await fs.outputFile(path.join(root, '.git/info/exclude'), 'scratch/\n');

      expect(await collectGitIgnoreSources(root, { infoExclude: false })).toEqual([]);
      expect(
        await collectGitIgnoreSources(root, { infoExclude: false, globalExcludesFile: false }),
      ).toEqual([]);
    });
  });

  it('falls back to the XDG default ignore file', async () => {
    await withTempDir('git-xdg', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      await fs.outputFile(path.join(root, 'xdg/git/ignore'), '*.bak\n');
      await fs.ensureDir(path.join(root, '.git'));

      const sources = await collectGitIgnoreSources(root);

      expect(sources.map((s) => s.kind)).toContain('global-gitignore');
    });
  });

  it('treats an unreadable configured excludesFile as absent', async () => {
    await withTempDir('git-broken-global', async (root) => {
      process.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
      // A default exists, but core.excludesFile explicitly points elsewhere:
      // falling through would silently apply rules the user replaced.
      await fs.outputFile(path.join(root, 'xdg/git/ignore'), '*.bak\n');
      await fs.outputFile(
        path.join(root, '.git/config'),
        `[core]\n\texcludesFile = ${path.join(root, 'does-not-exist')}\n`,
      );

      expect(await resolveGlobalExcludesFile(path.join(root, '.git'))).toBeNull();
    });
  });
});
