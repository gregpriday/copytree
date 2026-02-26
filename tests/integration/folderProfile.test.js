import copy from '../../src/api/copy.js';
import FolderProfileLoader from '../../src/config/FolderProfileLoader.js';
import fs from 'fs-extra';
import path from 'path';
import { withTempDir } from '../helpers/tempfs.js';

// This suite uses real filesystem behavior.
jest.unmock('fs-extra');

async function createTestProject(tmpDir) {
  const testProjectDir = path.join(tmpDir, 'test-project');
  await fs.ensureDir(testProjectDir);

  await fs.writeFile(path.join(testProjectDir, 'README.md'), '# Test Project');
  await fs.writeFile(path.join(testProjectDir, 'index.js'), 'console.log("hello");');
  await fs.writeFile(path.join(testProjectDir, 'index.test.js'), 'test("works", () => {});');
  await fs.ensureDir(path.join(testProjectDir, 'src'));
  await fs.writeFile(path.join(testProjectDir, 'src', 'app.js'), 'export default {};');
  await fs.writeFile(path.join(testProjectDir, 'src', 'app.test.js'), 'test("app", () => {});');
  await fs.ensureDir(path.join(testProjectDir, 'docs'));
  await fs.writeFile(path.join(testProjectDir, 'docs', 'guide.md'), '# Guide');

  return testProjectDir;
}

async function copyWithFolderProfile(testProjectDir, options = {}) {
  const loader = new FolderProfileLoader({ cwd: testProjectDir });
  const folderProfile = options.profile
    ? await loader.loadNamed(options.profile)
    : await loader.discover();

  const cliFilter = options.filter || null;
  const cliExclude = options.exclude || [];

  const result = await copy(testProjectDir, {
    format: 'json',
    filter: cliFilter || folderProfile?.include || ['**/*'],
    exclude: [...cliExclude, ...(folderProfile?.exclude || [])],
    includeHidden: true,
  });

  return result.files.map((f) => f.path).sort();
}

describe('Folder Profile Integration', () => {
  describe('Profile discovery and precedence', () => {
    it('applies include patterns from discovered profile', async () => {
      await withTempDir('folder-profile-include', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.md"\n');

        const filePaths = await copyWithFolderProfile(testProjectDir);

        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.js');
      });
    });

    it('applies exclude patterns from discovered profile', async () => {
      await withTempDir('folder-profile-exclude', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(
          path.join(testProjectDir, '.copytree.yml'),
          'exclude:\n  - "**/*.test.js"\n',
        );

        const filePaths = await copyWithFolderProfile(testProjectDir);

        expect(filePaths).toContain('index.js');
        expect(filePaths).toContain('src/app.js');
        expect(filePaths).not.toContain('index.test.js');
        expect(filePaths).not.toContain('src/app.test.js');
      });
    });

    it('gives CLI filter precedence over profile include', async () => {
      await withTempDir('folder-profile-filter-precedence', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.js"\n');

        const filePaths = await copyWithFolderProfile(testProjectDir, { filter: ['**/*.md'] });

        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.js');
      });
    });

    it('merges CLI exclude with profile exclude', async () => {
      await withTempDir('folder-profile-exclude-merge', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(
          path.join(testProjectDir, '.copytree.yml'),
          'exclude:\n  - "**/*.test.js"\n',
        );

        const filePaths = await copyWithFolderProfile(testProjectDir, {
          exclude: ['**/*.md'],
        });

        expect(filePaths).toContain('index.js');
        expect(filePaths).toContain('src/app.js');
        expect(filePaths).not.toContain('README.md');
        expect(filePaths).not.toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.test.js');
      });
    });
  });

  describe('Named profiles and format support', () => {
    it('loads named profile via loader and applies it', async () => {
      await withTempDir('folder-profile-named', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(
          path.join(testProjectDir, '.copytree-docs.yml'),
          'name: docs\ninclude:\n  - "**/*.md"\n',
        );

        const filePaths = await copyWithFolderProfile(testProjectDir, { profile: 'docs' });

        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.js');
      });
    });

    it('supports JSON profile discovery', async () => {
      await withTempDir('folder-profile-json', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeJson(path.join(testProjectDir, '.copytree.json'), {
          include: ['**/*.md'],
        });

        const filePaths = await copyWithFolderProfile(testProjectDir);
        expect(filePaths).toContain('README.md');
        expect(filePaths).not.toContain('index.js');
      });
    });

    it('supports INI profile discovery', async () => {
      await withTempDir('folder-profile-ini', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(path.join(testProjectDir, '.copytree'), '[include]\n**/*.md\n');

        const filePaths = await copyWithFolderProfile(testProjectDir);
        expect(filePaths).toContain('README.md');
        expect(filePaths).not.toContain('index.js');
      });
    });
  });

  describe('Ignore interaction and helper methods', () => {
    it('combines profile include with .copytreeignore filtering', async () => {
      await withTempDir('folder-profile-copytreeignore', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.js"\n');
        await fs.writeFile(path.join(testProjectDir, '.copytreeignore'), 'src/\n');

        const filePaths = await copyWithFolderProfile(testProjectDir);

        expect(filePaths).toContain('index.js');
        expect(filePaths).not.toContain('src/app.js');
      });
    });

    it('lists named profiles and checks existence', async () => {
      await withTempDir('folder-profile-loader-helpers', async (tmpDir) => {
        const testProjectDir = await createTestProject(tmpDir);
        await fs.writeFile(path.join(testProjectDir, '.copytree-docs.yml'), 'name: docs');
        await fs.writeFile(path.join(testProjectDir, '.copytree-source.yml'), 'name: source');
        await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'name: default');

        const loader = new FolderProfileLoader({ cwd: testProjectDir });
        const profiles = await loader.listProfiles();

        expect(profiles).toEqual(['docs', 'source']);
        expect(await loader.exists()).toBe(true);
        expect(await loader.exists('docs')).toBe(true);
        expect(await loader.exists('missing')).toBe(false);
      });
    });
  });
});
