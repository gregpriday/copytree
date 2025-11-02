// Unmock fs-extra for integration tests
jest.unmock('fs-extra');

// Static imports for Node.js modules
import fs from 'fs-extra';
import path from 'path';
import { withTempDir, settleFs } from '../helpers/tempfs.js';

// Use dynamic imports for modules under test
let Pipeline, FileDiscoveryStage, AlwaysIncludeStage, ProfileFilterStage;

beforeAll(async () => {
  const pipelineModule = await import('../../src/pipeline/Pipeline.js');
  const fileDiscoveryStageModule = await import('../../src/pipeline/stages/FileDiscoveryStage.js');
  const alwaysIncludeStageModule = await import('../../src/pipeline/stages/AlwaysIncludeStage.js');
  const profileFilterStageModule = await import('../../src/pipeline/stages/ProfileFilterStage.js');

  Pipeline = pipelineModule.default;
  FileDiscoveryStage = fileDiscoveryStageModule.default;
  AlwaysIncludeStage = alwaysIncludeStageModule.default;
  ProfileFilterStage = profileFilterStageModule.default;
});

/**
 * Create test directory structure with standard test files
 * @param {string} tempDir - Path to the temporary directory
 */
async function createTestFiles(tempDir) {
  // Create regular files
  await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("Hello");');
  await fs.writeFile(path.join(tempDir, 'utils.js'), 'export const util = () => {};');

  // Create hidden directory with files
  await fs.ensureDir(path.join(tempDir, '.example'));
  await fs.writeFile(path.join(tempDir, '.example/secret.txt'), 'secret content');
  await fs.writeFile(path.join(tempDir, '.example/config.json'), '{"key": "value"}');

  // Create another hidden file at root
  await fs.writeFile(path.join(tempDir, '.env'), 'API_KEY=test');
}

describe('Force Include Integration Tests', () => {
  describe('.copytreeinclude file', () => {
    it('should discover hidden files listed in .copytreeinclude with explicit glob', async () => {
      await withTempDir('copytreeinclude-explicit-glob', async (tempDir) => {
        await createTestFiles(tempDir);

        // Create .copytreeinclude file
        await fs.writeFile(
          path.join(tempDir, '.copytreeinclude'),
          '.example/**\n.env\n# This is a comment\n',
        );

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false, // Hidden files should still be discovered via forceInclude
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
        expect(paths).toContain('.env');
      });
    });

    it('should discover hidden directories with bare directory pattern', async () => {
      await withTempDir('copytreeinclude-bare-directory', async (tempDir) => {
        await createTestFiles(tempDir);

        // Create .copytreeinclude file with bare directory name (no explicit /**)
        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.example\n.env\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
        expect(paths).toContain('.env');
      });
    });

    it('should respect .copytreeinclude patterns even with .copytreeignore', async () => {
      await withTempDir('copytreeinclude-with-copytreeignore', async (tempDir) => {
        await createTestFiles(tempDir);

        // Create .copytreeignore that excludes everything
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), '**/*\n');

        // Create .copytreeinclude to force-include specific files
        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.example/**\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: true, // Should respect ignore files
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
      });
    });

    it('should handle comments and empty lines in .copytreeinclude', async () => {
      await withTempDir('copytreeinclude-comments-empty-lines', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(
          path.join(tempDir, '.copytreeinclude'),
          '# This is a comment\n\n.example/**\n\n# Another comment\n.env\n',
        );

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.env');
      });
    });
  });

  describe('forceInclude option', () => {
    it('should discover hidden files via forceInclude option', async () => {
      await withTempDir('forcinclude-option', async (tempDir) => {
        await createTestFiles(tempDir);

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
            forceInclude: ['.example/**', '.env'],
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
        expect(paths).toContain('.env');
      });
    });

    it('should merge forceInclude patterns with .copytreeinclude', async () => {
      await withTempDir('forcinclude-merge-with-copytreeinclude', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.example/**\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
            forceInclude: ['.env'], // Add .env via option
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
        expect(paths).toContain('.env');
      });
    });
  });

  describe('AlwaysIncludeStage integration', () => {
    it('should mark force-included files and preserve through profile filters', async () => {
      await withTempDir('alwaysinclude-preserve-through-filters', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.example/**\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
          new AlwaysIncludeStage(['.example/**']), // Mark immediately after discovery
          new ProfileFilterStage({
            exclude: ['**/*'], // Exclude everything
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        // Only force-included files should survive
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
        expect(paths).not.toContain('index.js');
        expect(paths).not.toContain('utils.js');
      });
    });

    it('should preserve force-included files through git filters', async () => {
      await withTempDir('alwaysinclude-preserve-through-git-filters', async (tempDir) => {
        await createTestFiles(tempDir);

        // This test would require setting up a git repository
        // For now, we'll test the basic flow without actual git operations
        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '.example/**\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
          new AlwaysIncludeStage(['.example/**']),
          new ProfileFilterStage({
            filter: ['*.js'], // Only include JS files
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        // Should include .js files AND force-included files
        expect(paths).toContain('index.js');
        expect(paths).toContain('utils.js');
        expect(paths).toContain('.example/secret.txt');
        expect(paths).toContain('.example/config.json');
      });
    });
  });

  describe('deduplication', () => {
    it('should not duplicate files that are both discovered normally and force-included', async () => {
      await withTempDir('deduplication-no-duplicates', async (tempDir) => {
        await createTestFiles(tempDir);

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: true, // Discover all files including hidden
            forceInclude: ['.example/**'], // Also force-include
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path);
        const uniquePaths = [...new Set(paths)];

        // Should have no duplicates
        expect(paths.length).toBe(uniquePaths.length);

        // Should have all files exactly once
        expect(paths.filter((p) => p === '.example/secret.txt')).toHaveLength(1);
        expect(paths.filter((p) => p === '.example/config.json')).toHaveLength(1);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle missing .copytreeinclude file gracefully', async () => {
      await withTempDir('edge-case-missing-copytreeinclude', async (tempDir) => {
        await createTestFiles(tempDir);

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        // Should discover normal files
        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('index.js');
        expect(paths).toContain('utils.js');
      });
    });

    it('should handle empty .copytreeinclude file', async () => {
      await withTempDir('edge-case-empty-copytreeinclude', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), '');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('index.js');
        expect(paths).toContain('utils.js');
      });
    });

    it('should handle .copytreeinclude with only comments', async () => {
      await withTempDir('edge-case-copytreeinclude-comments-only', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(
          path.join(tempDir, '.copytreeinclude'),
          '# Comment 1\n# Comment 2\n\n# Comment 3',
        );

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('index.js');
        expect(paths).toContain('utils.js');
      });
    });

    it('should handle patterns that match no files', async () => {
      await withTempDir('edge-case-no-matching-patterns', async (tempDir) => {
        await createTestFiles(tempDir);

        await fs.writeFile(path.join(tempDir, '.copytreeinclude'), 'nonexistent/**\n');

        const pipeline = new Pipeline();
        pipeline.through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false,
            includeHidden: false,
          }),
        ]);

        const result = await pipeline.process({
          basePath: tempDir,
          profile: {},
          options: {},
        });

        await settleFs();

        // Should not throw errors, just not find any forced files
        const paths = result.files.map((f) => f.path).sort();
        expect(paths).toContain('index.js');
        expect(paths).toContain('utils.js');
      });
    });
  });
});
