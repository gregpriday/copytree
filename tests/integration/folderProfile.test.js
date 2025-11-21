import copyCommand from '../../src/commands/copy.js';
import FolderProfileLoader from '../../src/config/FolderProfileLoader.js';
import fs from 'fs/promises';
import path from 'path';
import { withTempDir } from '../helpers/tempfs.js';

// Unmock fs-extra for integration tests
jest.unmock('fs-extra');

// Helper to create test project structure
async function createTestProject(tmpDir) {
  const testProjectDir = path.join(tmpDir, 'test-project');
  await fs.mkdir(testProjectDir, { recursive: true });

  // Create test files
  await fs.writeFile(path.join(testProjectDir, 'README.md'), '# Test Project');
  await fs.writeFile(path.join(testProjectDir, 'index.js'), 'console.log("hello");');
  await fs.writeFile(path.join(testProjectDir, 'index.test.js'), 'test("works", () => {});');
  await fs.mkdir(path.join(testProjectDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(testProjectDir, 'src', 'app.js'), 'export default {};');
  await fs.writeFile(path.join(testProjectDir, 'src', 'app.test.js'), 'test("app", () => {});');
  await fs.mkdir(path.join(testProjectDir, 'docs'), { recursive: true });
  await fs.writeFile(path.join(testProjectDir, 'docs', 'guide.md'), '# Guide');

  return testProjectDir;
}

describe('Folder Profile Integration', () => {
  describe('Profile Auto-Discovery', () => {
    it('should use folder profile include patterns', async () => {
      // Create folder profile that only includes .md files
      const profileData = `
include:
  - "**/*.md"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      // Change cwd to test project directory
      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        // Parse the output
        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should only include .md files
        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.js');
        expect(filePaths).not.toContain('src/app.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should use folder profile exclude patterns', async () => {
      // Create folder profile that excludes test files
      const profileData = `
exclude:
  - "**/*.test.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should not include test files
        expect(filePaths).not.toContain('index.test.js');
        expect(filePaths).not.toContain('src/app.test.js');
        // Should include non-test files
        expect(filePaths).toContain('index.js');
        expect(filePaths).toContain('src/app.js');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Named Profile Loading', () => {
    it('should load named profile with -p flag', async () => {
      // Create a named profile for docs only
      const profileData = `
name: docs-only
include:
  - "**/*.md"
  - "docs/**"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree-docs.yml'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          profile: 'docs',
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should only include markdown files
        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).not.toContain('index.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should throw error for non-existent named profile', async () => {
      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        await expect(
          copyCommand('.', {
            profile: 'nonexistent',
            format: 'json',
          }),
        ).rejects.toThrow(/Profile not found/);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('CLI Precedence', () => {
    it('should give CLI filter precedence over profile include', async () => {
      // Profile includes all .js files
      const profileData = `
include:
  - "**/*.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        // CLI filter overrides to only .md files
        const result = await copyCommand('.', {
          asReference: true,
          filter: ['**/*.md'],
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should only include .md files (CLI override)
        expect(filePaths).toContain('README.md');
        expect(filePaths).not.toContain('index.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should merge CLI exclude with profile exclude', async () => {
      // Profile excludes test files
      const profileData = `
exclude:
  - "**/*.test.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        // CLI also excludes .md files
        const result = await copyCommand('.', {
          asReference: true,
          exclude: ['**/*.md'],
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should exclude both test files and md files
        expect(filePaths).not.toContain('index.test.js');
        expect(filePaths).not.toContain('README.md');
        // Should include .js files that aren't tests
        expect(filePaths).toContain('index.js');
        expect(filePaths).toContain('src/app.js');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Multiple Format Support', () => {
    it('should load JSON format profile', async () => {
      const profileData = {
        name: 'json-profile',
        include: ['**/*.md'],
      };
      await fs.writeJson(path.join(testProjectDir, '.copytree.json'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        expect(filePaths).toContain('README.md');
        expect(filePaths).not.toContain('index.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should load INI format profile', async () => {
      const profileData = `
[profile]
name = ini-profile

[include]
**/*.md

[exclude]
**/draft/**
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree'), profileData);

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        expect(filePaths).toContain('README.md');
        expect(filePaths).not.toContain('index.js');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Integration with .copytreeignore', () => {
    it('should combine profile patterns with .copytreeignore', async () => {
      // Create profile that includes all .js files
      const profileData = `
include:
  - "**/*.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      // Create .copytreeignore that excludes src directory
      await fs.writeFile(path.join(testProjectDir, '.copytreeignore'), 'src/\n');

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        // Should include root .js files
        expect(filePaths).toContain('index.js');
        // Should exclude src/ .js files due to .copytreeignore
        expect(filePaths).not.toContain('src/app.js');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('FolderProfileLoader helper methods', () => {
    it('should list all named profiles', async () => {
      await fs.writeFile(path.join(testProjectDir, '.copytree-docs.yml'), 'name: docs');
      await fs.writeFile(path.join(testProjectDir, '.copytree-source.yml'), 'name: source');

      const loader = new FolderProfileLoader({ cwd: testProjectDir });
      const profiles = await loader.listProfiles();

      expect(profiles).toContain('docs');
      expect(profiles).toContain('source');
      expect(profiles).toHaveLength(2);
    });

    it('should check if profile exists', async () => {
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'name: default');

      const loader = new FolderProfileLoader({ cwd: testProjectDir });

      expect(await loader.exists()).toBe(true);
      expect(await loader.exists('custom')).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle documentation project profile', async () => {
      // Create a docs-focused profile
      const profileData = `
name: documentation
include:
  - "**/*.md"
  - "**/*.pdf"
  - "docs/**"
exclude:
  - "**/draft/**"
  - "**/*.backup.*"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      // Add a PDF file
      await fs.writeFile(path.join(testProjectDir, 'docs', 'guide.pdf'), 'fake pdf content');

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          asReference: true,
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        expect(filePaths).toContain('README.md');
        expect(filePaths).toContain('docs/guide.md');
        expect(filePaths).toContain('docs/guide.pdf');
        expect(filePaths).not.toContain('index.js');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle source code only profile', async () => {
      // Create a source-only profile
      const profileData = `
name: source-code
include:
  - "src/**/*.js"
  - "src/**/*.ts"
  - "package.json"
exclude:
  - "**/*.test.js"
  - "**/*.spec.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree-source.yml'), profileData);

      // Add package.json
      await fs.writeJson(path.join(testProjectDir, 'package.json'), { name: 'test' });

      const originalCwd = process.cwd();
      try {
        process.chdir(testProjectDir);

        const result = await copyCommand('.', {
          profile: 'source',
          format: 'json',
        });

        const files = JSON.parse(result.output).files;
        const filePaths = files.map((f) => f.path);

        expect(filePaths).toContain('src/app.js');
        expect(filePaths).toContain('package.json');
        expect(filePaths).not.toContain('src/app.test.js');
        expect(filePaths).not.toContain('README.md');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
