import FolderProfileLoader from '../../../src/config/FolderProfileLoader.js';
import fs from 'fs/promises';
import path from 'path';
import { ConfigurationError } from '../../../src/utils/errors.js';
import { withTempDir } from '../../helpers/tempfs.js';

// Unmock fs-extra for these tests since we're using real filesystem operations
jest.unmock('fs-extra');

describe('FolderProfileLoader', () => {
  describe('discover()', () => {
    it('should discover .copytree.yml file', async () => {
      await withTempDir('discover-yml', async (tmpDir) => {
        const profileData = `
name: test-profile
include:
  - "**/*.js"
  - "**/*.ts"
exclude:
  - "**/*.test.js"
`;
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile).toEqual({
          name: 'test-profile',
          include: ['**/*.js', '**/*.ts'],
          exclude: ['**/*.test.js'],
        });
      });
    });

    it('should discover .copytree.yaml file', async () => {
      await withTempDir('discover-yaml', async (tmpDir) => {
        const profileData = `
name: yaml-profile
include:
  - "*.md"
`;
        await fs.writeFile(path.join(tmpDir, '.copytree.yaml'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile).toEqual({
          name: 'yaml-profile',
          include: ['*.md'],
          exclude: [],
        });
      });
    });

    it('should discover .copytree.json file', async () => {
      await withTempDir('discover-json', async (tmpDir) => {
        const profileData = {
          name: 'json-profile',
          include: ['src/**/*.js'],
          exclude: ['node_modules/**'],
        };
        await fs.writeFile(path.join(tmpDir, '.copytree.json'), JSON.stringify(profileData));

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile).toEqual({
          name: 'json-profile',
          include: ['src/**/*.js'],
          exclude: ['node_modules/**'],
        });
      });
    });

    it('should discover .copytree (INI-style) file', async () => {
      await withTempDir('discover-ini', async (tmpDir) => {
        const profileData = `
[profile]
name = ini-profile

[include]
**/*.md
**/*.txt

[exclude]
**/draft/**
`;
        await fs.writeFile(path.join(tmpDir, '.copytree'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile).toEqual({
          name: 'ini-profile',
          include: ['**/*.md', '**/*.txt'],
          exclude: ['**/draft/**'],
        });
      });
    });

    it('should return null if no profile found', async () => {
      await withTempDir('no-profile', async (tmpDir) => {
        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();
        expect(profile).toBeNull();
      });
    });

    it('should prioritize .yml over .yaml', async () => {
      await withTempDir('priority-yml', async (tmpDir) => {
        await fs.writeFile(
          path.join(tmpDir, '.copytree.yml'),
          'name: yml-profile\ninclude: ["*.js"]',
        );
        await fs.writeFile(
          path.join(tmpDir, '.copytree.yaml'),
          'name: yaml-profile\ninclude: ["*.ts"]',
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();
        expect(profile.name).toBe('yml-profile');
      });
    });

    it('should prioritize .yaml over .json', async () => {
      await withTempDir('priority-yaml', async (tmpDir) => {
        await fs.writeFile(
          path.join(tmpDir, '.copytree.yaml'),
          'name: yaml-profile\ninclude: ["*.js"]',
        );
        await fs.writeFile(
          path.join(tmpDir, '.copytree.json'),
          JSON.stringify({ name: 'json-profile', include: ['*.ts'] }),
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();
        expect(profile.name).toBe('yaml-profile');
      });
    });

    it('should prioritize .json over no extension', async () => {
      await withTempDir('priority-json', async (tmpDir) => {
        await fs.writeFile(
          path.join(tmpDir, '.copytree.json'),
          JSON.stringify({ name: 'json-profile', include: ['*.js'] }),
        );
        await fs.writeFile(path.join(tmpDir, '.copytree'), '[profile]\nname = ini-profile');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();
        expect(profile.name).toBe('json-profile');
      });
    });
  });

  describe('loadNamed()', () => {
    it('should load named profile with .yml extension', async () => {
      await withTempDir('named-yml', async (tmpDir) => {
        const profileData = `
name: api-docs
include:
  - "**/*.md"
  - "**/*.pdf"
`;
        await fs.writeFile(path.join(tmpDir, '.copytree-api-docs.yml'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.loadNamed('api-docs');

        expect(profile).toEqual({
          name: 'api-docs',
          include: ['**/*.md', '**/*.pdf'],
          exclude: [],
        });
      });
    });

    it('should load named profile with .json extension', async () => {
      await withTempDir('named-json', async (tmpDir) => {
        const profileData = {
          name: 'source-only',
          include: ['src/**/*.js'],
        };
        await fs.writeFile(
          path.join(tmpDir, '.copytree-source-only.json'),
          JSON.stringify(profileData),
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.loadNamed('source-only');

        expect(profile.name).toBe('source-only');
      });
    });

    it('should throw ConfigurationError if named profile not found', async () => {
      await withTempDir('no-named', async (tmpDir) => {
        const loader = new FolderProfileLoader({ cwd: tmpDir });
        await expect(loader.loadNamed('nonexistent')).rejects.toThrow(ConfigurationError);
        await expect(loader.loadNamed('nonexistent')).rejects.toThrow(/Profile not found/);
      });
    });

    it('should prioritize extensions for named profiles', async () => {
      await withTempDir('named-priority', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree-test.yml'), 'name: yml\ninclude: ["*.js"]');
        await fs.writeFile(
          path.join(tmpDir, '.copytree-test.json'),
          JSON.stringify({ name: 'json', include: ['*.ts'] }),
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.loadNamed('test');
        expect(profile.name).toBe('yml');
      });
    });
  });

  describe('validate()', () => {
    const loader = new FolderProfileLoader({ cwd: '/tmp' });

    it('should normalize include patterns from array', () => {
      const data = {
        name: 'test',
        include: ['*.js', '*.ts'],
      };

      const profile = loader.validate(data, 'test.yml');

      expect(profile.include).toEqual(['*.js', '*.ts']);
    });

    it('should normalize include patterns from string', () => {
      const data = {
        include: '*.js',
      };

      const profile = loader.validate(data, 'test.yml');

      expect(profile.include).toEqual(['*.js']);
    });

    it('should filter out empty strings from include patterns', () => {
      const data = {
        include: ['*.js', '', '*.ts', ' '],
      };

      const profile = loader.validate(data, 'test.yml');

      expect(profile.include).toEqual(['*.js', '*.ts']);
    });

    it('should normalize exclude patterns', () => {
      const data = {
        exclude: ['node_modules/**', 'dist/**'],
      };

      const profile = loader.validate(data, 'test.yml');

      expect(profile.exclude).toEqual(['node_modules/**', 'dist/**']);
    });

    it('should handle missing include/exclude as empty arrays', () => {
      const data = { name: 'minimal' };

      const profile = loader.validate(data, 'test.yml');

      expect(profile.include).toEqual([]);
      expect(profile.exclude).toEqual([]);
    });

    it('should use filename as name if name not provided', () => {
      const data = { include: ['*.js'] };

      const profile = loader.validate(data, '.copytree.yml');

      expect(profile.name).toBe('.copytree');
    });

    it('should throw ConfigurationError if data is not an object', () => {
      expect(() => loader.validate(null, 'test.yml')).toThrow(ConfigurationError);
      expect(() => loader.validate('string', 'test.yml')).toThrow(ConfigurationError);
      expect(() => loader.validate([], 'test.yml')).toThrow(ConfigurationError);
    });
  });

  describe('parseINI()', () => {
    const loader = new FolderProfileLoader({ cwd: '/tmp' });

    it('should parse basic INI format', () => {
      const content = `
[include]
*.js
*.ts

[exclude]
*.test.js
`;

      const profile = loader.parseINI(content);

      expect(profile.include).toEqual(['*.js', '*.ts']);
      expect(profile.exclude).toEqual(['*.test.js']);
    });

    it('should parse profile section with name', () => {
      const content = `
[profile]
name = my-profile

[include]
*.md
`;

      const profile = loader.parseINI(content);

      expect(profile.name).toBe('my-profile');
      expect(profile.include).toEqual(['*.md']);
    });

    it('should ignore comments starting with #', () => {
      const content = `
# This is a comment
[include]
*.js
# Another comment
*.ts
`;

      const profile = loader.parseINI(content);

      expect(profile.include).toEqual(['*.js', '*.ts']);
    });

    it('should ignore comments starting with ;', () => {
      const content = `
; Semicolon comment
[include]
*.js
`;

      const profile = loader.parseINI(content);

      expect(profile.include).toEqual(['*.js']);
    });

    it('should ignore empty lines', () => {
      const content = `
[include]

*.js

*.ts

`;

      const profile = loader.parseINI(content);

      expect(profile.include).toEqual(['*.js', '*.ts']);
    });

    it('should handle multiple sections', () => {
      const content = `
[profile]
name = full-profile

[include]
src/**/*.js

[exclude]
**/*.test.js
node_modules/**
`;

      const profile = loader.parseINI(content);

      expect(profile.name).toBe('full-profile');
      expect(profile.include).toEqual(['src/**/*.js']);
      expect(profile.exclude).toEqual(['**/*.test.js', 'node_modules/**']);
    });
  });

  describe('listProfiles()', () => {
    it('should list all named profiles', async () => {
      await withTempDir('list-profiles', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree-docs.yml'), 'name: docs');
        await fs.writeFile(
          path.join(tmpDir, '.copytree-source.json'),
          JSON.stringify({ name: 'source' }),
        );
        await fs.writeFile(path.join(tmpDir, '.copytree-tests'), '[profile]\nname=tests');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profiles = await loader.listProfiles();

        expect(profiles).toEqual(['docs', 'source', 'tests']);
      });
    });

    it('should not list auto-discoverable profile', async () => {
      await withTempDir('list-auto', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), 'name: default');
        await fs.writeFile(path.join(tmpDir, '.copytree-custom.yml'), 'name: custom');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profiles = await loader.listProfiles();

        expect(profiles).toEqual(['custom']);
        expect(profiles).not.toContain('default');
      });
    });

    it('should return empty array if no named profiles exist', async () => {
      await withTempDir('list-empty', async (tmpDir) => {
        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profiles = await loader.listProfiles();
        expect(profiles).toEqual([]);
      });
    });

    it('should deduplicate profiles with different extensions', async () => {
      await withTempDir('list-dedup', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree-test.yml'), 'name: test');
        await fs.writeFile(
          path.join(tmpDir, '.copytree-test.json'),
          JSON.stringify({ name: 'test' }),
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profiles = await loader.listProfiles();

        expect(profiles).toEqual(['test']);
      });
    });

    it('should sort profiles alphabetically', async () => {
      await withTempDir('list-sort', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree-zebra.yml'), 'name: zebra');
        await fs.writeFile(path.join(tmpDir, '.copytree-alpha.yml'), 'name: alpha');
        await fs.writeFile(path.join(tmpDir, '.copytree-beta.yml'), 'name: beta');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profiles = await loader.listProfiles();

        expect(profiles).toEqual(['alpha', 'beta', 'zebra']);
      });
    });
  });

  describe('exists()', () => {
    it('should return true if auto-discoverable profile exists', async () => {
      await withTempDir('exists-auto', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), 'name: default');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const exists = await loader.exists();
        expect(exists).toBe(true);
      });
    });

    it('should return false if no auto-discoverable profile exists', async () => {
      await withTempDir('no-exists-auto', async (tmpDir) => {
        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const exists = await loader.exists();
        expect(exists).toBe(false);
      });
    });

    it('should return true if named profile exists', async () => {
      await withTempDir('exists-named', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree-custom.yml'), 'name: custom');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const exists = await loader.exists('custom');
        expect(exists).toBe(true);
      });
    });

    it('should return false if named profile does not exist', async () => {
      await withTempDir('no-exists-named', async (tmpDir) => {
        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const exists = await loader.exists('nonexistent');
        expect(exists).toBe(false);
      });
    });

    it('should check all extensions for named profiles', async () => {
      await withTempDir('exists-extensions', async (tmpDir) => {
        await fs.writeFile(
          path.join(tmpDir, '.copytree-test.json'),
          JSON.stringify({ name: 'test' }),
        );

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const exists = await loader.exists('test');
        expect(exists).toBe(true);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle profile with only include patterns', async () => {
      await withTempDir('scenario-include', async (tmpDir) => {
        const profileData = `
include:
  - "docs/**/*.md"
  - "README.md"
`;
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile.include).toEqual(['docs/**/*.md', 'README.md']);
        expect(profile.exclude).toEqual([]);
      });
    });

    it('should handle profile with only exclude patterns', async () => {
      await withTempDir('scenario-exclude', async (tmpDir) => {
        const profileData = `
exclude:
  - "node_modules/**"
  - "**/*.test.js"
`;
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), profileData);

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile.include).toEqual([]);
        expect(profile.exclude).toEqual(['node_modules/**', '**/*.test.js']);
      });
    });

    it('should handle empty profile file', async () => {
      await withTempDir('scenario-empty', async (tmpDir) => {
        await fs.writeFile(path.join(tmpDir, '.copytree.yml'), '');

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile.include).toEqual([]);
        expect(profile.exclude).toEqual([]);
      });
    });

    it('should handle profile with complex glob patterns', async () => {
      await withTempDir('scenario-complex', async (tmpDir) => {
        const profileData = {
          include: ['src/**/*.{js,ts}', '**/*.md', '!**/*.draft.md'],
          exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
        };
        await fs.writeFile(path.join(tmpDir, '.copytree.json'), JSON.stringify(profileData));

        const loader = new FolderProfileLoader({ cwd: tmpDir });
        const profile = await loader.discover();

        expect(profile.include).toContain('src/**/*.{js,ts}');
        expect(profile.exclude).toContain('**/node_modules/**');
      });
    });
  });
});
