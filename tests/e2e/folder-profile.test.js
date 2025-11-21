import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Folder Profile E2E Tests', () => {
  let tmpDir;
  let testProjectDir;
  const copytreeBin = path.join(process.cwd(), 'bin', 'copytree.js');

  beforeEach(async () => {
    // Create temporary directory for test project
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copytree-e2e-'));
    testProjectDir = path.join(tmpDir, 'test-project');
    await fs.ensureDir(testProjectDir);

    // Create test files
    await fs.writeFile(path.join(testProjectDir, 'README.md'), '# Test');
    await fs.writeFile(path.join(testProjectDir, 'index.js'), 'console.log("main");');
    await fs.writeFile(path.join(testProjectDir, 'index.test.js'), 'test("main", () => {});');

    await fs.ensureDir(path.join(testProjectDir, 'src'));
    await fs.writeFile(path.join(testProjectDir, 'src', 'app.js'), 'export default {};');
    await fs.writeFile(path.join(testProjectDir, 'src', 'app.test.js'), 'test("app", () => {});');

    await fs.ensureDir(path.join(testProjectDir, 'docs'));
    await fs.writeFile(path.join(testProjectDir, 'docs', 'guide.md'), '# Guide');
  });

  afterEach(async () => {
    if (tmpDir && await fs.pathExists(tmpDir)) {
      await fs.remove(tmpDir);
    }
  });

  const runCopytree = (args, options = {}) => {
    try {
      const result = execSync(`node "${copytreeBin}" ${args}`, {
        cwd: testProjectDir,
        encoding: 'utf8',
        ...options,
      });
      return { stdout: result, exitCode: 0 };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
        error: error.message,
      };
    }
  };

  describe('Auto-discovery with -r flag', () => {
    it('should auto-discover and use .copytree.yml', async () => {
      // Create profile that only includes .md files
      const profileData = `
include:
  - "**/*.md"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      // Create output file
      const outputFile = path.join(testProjectDir, 'output.json');

      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      expect(await fs.pathExists(outputFile)).toBe(true);

      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      // Should only include .md files
      expect(filePaths).toContain('README.md');
      expect(filePaths).toContain('docs/guide.md');
      expect(filePaths).not.toContain('index.js');
    });

    it('should work without profile if -r is used but no profile exists', async () => {
      // No profile file created

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      expect(await fs.pathExists(outputFile)).toBe(true);

      const output = await fs.readJson(outputFile);
      // Should include all files (no profile filtering)
      expect(output.files.length).toBeGreaterThan(0);
    });
  });

  describe('Named profiles with -p flag', () => {
    it('should load named profile with -p docs', async () => {
      // Create named profile for documentation
      const profileData = `
name: docs
include:
  - "**/*.md"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree-docs.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-p docs --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      expect(await fs.pathExists(outputFile)).toBe(true);

      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      expect(filePaths).toContain('README.md');
      expect(filePaths).not.toContain('index.js');
    });

    it('should fail with error for non-existent profile', async () => {
      const { exitCode, stderr } = runCopytree('-p nonexistent --format json');

      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/Profile not found/);
    });

    it('should support --profile syntax', async () => {
      const profileData = `
include:
  - "src/**/*.js"
exclude:
  - "**/*.test.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree-source.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`--profile source --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);

      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      expect(filePaths).toContain('src/app.js');
      expect(filePaths).not.toContain('src/app.test.js');
    });
  });

  describe('CLI flag precedence', () => {
    it('should override profile include with CLI --filter', async () => {
      // Profile includes .js files
      const profileData = `
include:
  - "**/*.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      // CLI overrides to .md files
      const { exitCode } = runCopytree(`-r --filter "**/*.md" --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);

      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      // Should only have .md files (CLI override)
      expect(filePaths).toContain('README.md');
      expect(filePaths).not.toContain('index.js');
    });

    it('should merge CLI exclude with profile exclude', async () => {
      // Profile excludes test files
      const profileData = `
exclude:
  - "**/*.test.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      // CLI also excludes docs
      const { exitCode } = runCopytree(`-r --exclude "docs/**" --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);

      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      // Should exclude both test files and docs
      expect(filePaths).not.toContain('index.test.js');
      expect(filePaths).not.toContain('docs/guide.md');
      expect(filePaths).toContain('index.js');
    });
  });

  describe('Multiple format support', () => {
    it('should support YAML format (.yml)', async () => {
      const profileData = `
include:
  - "**/*.md"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readJson(outputFile);
      expect(output.files.some(f => f.path === 'README.md')).toBe(true);
    });

    it('should support JSON format', async () => {
      const profileData = {
        include: ['**/*.js'],
      };
      await fs.writeJson(path.join(testProjectDir, '.copytree.json'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readJson(outputFile);
      expect(output.files.some(f => f.path === 'index.js')).toBe(true);
    });

    it('should support INI format (no extension)', async () => {
      const profileData = `
[include]
**/*.md

[exclude]
**/draft/**
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree'), profileData);

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readJson(outputFile);
      expect(output.files.some(f => f.path === 'README.md')).toBe(true);
    });
  });

  describe('Real-world workflows', () => {
    it('should handle docs-only workflow', async () => {
      const profileData = `
name: documentation
include:
  - "**/*.md"
  - "docs/**"
exclude:
  - "**/draft/**"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'output.xml');
      const { exitCode, stdout } = runCopytree(`-r -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      expect(await fs.pathExists(outputFile)).toBe(true);

      const output = await fs.readFile(outputFile, 'utf8');
      expect(output).toContain('README.md');
      expect(output).toContain('guide.md');
      expect(output).not.toContain('index.js');
    });

    it('should handle source code workflow', async () => {
      const profileData = `
name: source
include:
  - "src/**/*.js"
  - "index.js"
exclude:
  - "**/*.test.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree-source.json'), profileData);

      const outputFile = path.join(testProjectDir, 'output.md');
      const { exitCode } = runCopytree(`-p source --format markdown -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readFile(outputFile, 'utf8');

      expect(output).toContain('index.js');
      expect(output).toContain('app.js');
      expect(output).not.toContain('test.js');
    });

    it('should work with --only-tree flag', async () => {
      const profileData = `
include:
  - "**/*.js"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const outputFile = path.join(testProjectDir, 'tree.txt');
      const { exitCode } = runCopytree(`-r --only-tree -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readFile(outputFile, 'utf8');

      // Should show tree structure
      expect(output).toContain('index.js');
      expect(output).toContain('src');
      // Should not contain file contents
      expect(output).not.toContain('console.log');
    });

    it('should work with --display flag', async () => {
      const profileData = `
include:
  - "README.md"
`;
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), profileData);

      const { exitCode, stdout } = runCopytree('-r --display --format json');

      expect(exitCode).toBe(0);
      expect(stdout).toContain('README.md');
      expect(stdout).toContain('Test'); // File content
    });
  });

  describe('Error handling', () => {
    it('should handle malformed YAML gracefully', async () => {
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'invalid: yaml: syntax:');

      const { exitCode, stderr } = runCopytree('-r --format json');

      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/Failed to load profile/);
    });

    it('should handle malformed JSON gracefully', async () => {
      await fs.writeFile(path.join(testProjectDir, '.copytree.json'), '{ invalid json }');

      const { exitCode, stderr } = runCopytree('-r --format json');

      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/Failed to load profile/);
    });

    it('should handle empty profile file', async () => {
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), '');

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      // Should succeed with empty profile (defaults to all files)
      expect(exitCode).toBe(0);
      const output = await fs.readJson(outputFile);
      expect(output.files.length).toBeGreaterThan(0);
    });
  });

  describe('Profile precedence', () => {
    it('should prioritize .yml over .json', async () => {
      // Create both profiles with different includes
      await fs.writeFile(path.join(testProjectDir, '.copytree.yml'), 'include:\n  - "**/*.md"');
      await fs.writeJson(path.join(testProjectDir, '.copytree.json'), { include: ['**/*.js'] });

      const outputFile = path.join(testProjectDir, 'output.json');
      const { exitCode } = runCopytree(`-r --format json -o "${outputFile}"`);

      expect(exitCode).toBe(0);
      const output = await fs.readJson(outputFile);
      const filePaths = output.files.map(f => f.path);

      // Should use .yml (prioritized)
      expect(filePaths).toContain('README.md');
      expect(filePaths).not.toContain('index.js');
    });
  });
});
