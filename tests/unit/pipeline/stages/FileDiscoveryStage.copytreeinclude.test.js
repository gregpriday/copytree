// Unmock fs-extra for this test
jest.unmock('fs-extra');

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

let FileDiscoveryStage;

beforeAll(async () => {
  const fileDiscoveryStageModule = await import(
    '../../../../src/pipeline/stages/FileDiscoveryStage.js'
  );
  FileDiscoveryStage = fileDiscoveryStageModule.default;
});

describe('FileDiscoveryStage - .copytreeinclude Pattern Transformation', () => {
  let tempDir;
  let stage;

  beforeEach(async () => {
    // Create temporary test directory
    tempDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Create test directory structure with hidden directories
    await fs.ensureDir(path.join(tempDir, '.claude'));
    await fs.ensureDir(path.join(tempDir, '.claude/skills'));
    await fs.writeFile(path.join(tempDir, '.claude/config.json'), '{"test": true}');
    await fs.writeFile(path.join(tempDir, '.claude/skills/skill1.js'), 'skill content');
    await fs.writeFile(path.join(tempDir, '.claude/skills/skill2.js'), 'skill content 2');

    // Create other files
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');
    await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("test");');
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('bare directory pattern transformation', () => {
    it('should transform bare directory name to recursive pattern', async () => {
      // Create .copytreeinclude with bare directory name
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false, // Hidden files should be discovered via forceInclude
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include all files in .claude directory
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');
      expect(paths).toContain('.claude/skills/skill2.js');
    });

    it('should handle directory pattern with trailing slash', async () => {
      // Create .copytreeinclude with trailing slash
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude/');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include all files in .claude directory
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');
      expect(paths).toContain('.claude/skills/skill2.js');
    });

    it('should not transform patterns that already have glob characters', async () => {
      // Create .copytreeinclude with explicit glob pattern
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude/**');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include all files in .claude directory
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');
      expect(paths).toContain('.claude/skills/skill2.js');
    });

    it('should handle multiple directory patterns', async () => {
      // Create another hidden directory
      await fs.ensureDir(path.join(tempDir, '.vscode'));
      await fs.writeFile(path.join(tempDir, '.vscode/settings.json'), '{}');

      // Create .copytreeinclude with multiple patterns
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude\n.vscode');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include files from both directories
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.vscode/settings.json');
    });

    it('should handle comments and empty lines', async () => {
      await fs.writeFile(
        path.join(tempDir, '.copytreeinclude'),
        '# Include Claude config\n\n.claude\n\n# End of file',
      );

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');
    });
  });

  describe('pattern transformation with leading slash', () => {
    it('should remove leading slash and make pattern relative', async () => {
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '/.claude');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should match .claude directory at root
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');
    });
  });

  describe('gitignore-style matching', () => {
    it('should match anywhere when no leading slash', async () => {
      // Create nested structure
      await fs.ensureDir(path.join(tempDir, 'src/.claude'));
      await fs.writeFile(path.join(tempDir, 'src/.claude/nested.json'), '{}');

      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should match .claude directories at any level
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('src/.claude/nested.json');
    });
  });

  describe('file patterns (non-directory)', () => {
    it('should handle specific file patterns', async () => {
      await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=value');

      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.env');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include the .env file
      expect(paths).toContain('.env');
    });

    it('should handle wildcard patterns', async () => {
      await fs.writeFile(path.join(tempDir, '.env.local'), 'LOCAL=1');
      await fs.writeFile(path.join(tempDir, '.env.test'), 'TEST=1');

      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.env.*');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Wildcard patterns should not be transformed
      expect(paths).toContain('.env.local');
      expect(paths).toContain('.env.test');
    });
  });

  describe('interaction with .copytreeignore', () => {
    it('should force-include files even if they are in .copytreeignore', async () => {
      // Create .copytreeignore that excludes everything
      await fs.writeFile(path.join(tempDir, '.copytreeignore'), '**/*');

      // Create .copytreeinclude to force-include .claude
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: true,
        includeHidden: false,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path).sort();

      // Should include .claude files despite .copytreeignore
      expect(paths).toContain('.claude/config.json');
      expect(paths).toContain('.claude/skills/skill1.js');

      // Should NOT include other files
      expect(paths).not.toContain('README.md');
      expect(paths).not.toContain('index.js');
    });
  });

  describe('edge cases', () => {
    it('should handle missing .copytreeinclude gracefully', async () => {
      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: true,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      // Should not throw and should discover files normally
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should handle empty .copytreeinclude', async () => {
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: true,
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      // Should discover files normally
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should deduplicate files found in both normal discovery and force-include', async () => {
      await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.claude');

      stage = new FileDiscoveryStage({
        basePath: tempDir,
        patterns: ['**/*'],
        respectGitignore: false,
        includeHidden: true, // Discover hidden files normally AND via forceInclude
      });

      const result = await stage.process({
        basePath: tempDir,
        profile: {},
        options: {},
      });

      const paths = result.files.map((f) => f.path);
      const uniquePaths = [...new Set(paths)];

      // Should have no duplicates
      expect(paths.length).toBe(uniquePaths.length);

      // Each .claude file should appear exactly once
      const claudeConfigCount = paths.filter((p) => p === '.claude/config.json').length;
      expect(claudeConfigCount).toBe(1);
    });
  });
});
