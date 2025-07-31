// Unmock fs-extra for integration tests
jest.unmock('fs-extra');

const Pipeline = require('../../src/pipeline/Pipeline');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const FileDiscoveryStage = require('../../src/pipeline/stages/FileDiscoveryStage');
const ProfileFilterStage = require('../../src/pipeline/stages/ProfileFilterStage');
const FileLoadingStage = require('../../src/pipeline/stages/FileLoadingStage');
const OutputFormattingStage = require('../../src/pipeline/stages/OutputFormattingStage');
const LimitStage = require('../../src/pipeline/stages/LimitStage');
const CharLimitStage = require('../../src/pipeline/stages/CharLimitStage');

describe('Pipeline Integration Tests', () => {
  let tempDir;
  let pipeline;

  beforeEach(async () => {
    // Set up test environment
    process.env.GEMINI_API_KEY = 'test-api-key-for-integration-tests';
    process.env.COPYTREE_CACHE_ENABLED = 'false';
    
    // Create temporary test directory
    tempDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Create test files
    await fs.writeFile(path.join(tempDir, 'index.js'), 'console.log("Hello");');
    await fs.writeFile(path.join(tempDir, 'utils.js'), 'export const util = () => {};');
    await fs.writeFile(path.join(tempDir, 'test.spec.js'), 'describe("test", () => {});');
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Project');
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n*.log');
    
    // Create subdirectory with files
    await fs.ensureDir(path.join(tempDir, 'src'));
    await fs.writeFile(path.join(tempDir, 'src/app.js'), 'const app = express();');
    
    // Verify files were created
    const files = await fs.readdir(tempDir);
    
    pipeline = new Pipeline();
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('basic pipeline execution', () => {
    it('should discover and process files', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*.js', '**/*.md'],
            respectGitignore: false
          }),
          new ProfileFilterStage({
            exclude: ['node_modules/**', '*.spec.js']
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });


      expect(result.files).toHaveLength(4); // index.js, utils.js, app.js, README.md
      const paths = result.files.map(f => f.path).sort();
      expect(paths).toEqual([
        'README.md',
        'index.js',
        'src/app.js',
        'utils.js'
      ]);
    });

    it('should load file contents', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['index.js'],
            respectGitignore: false
          }),
          new FileLoadingStage({
            encoding: 'utf8'
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('console.log("Hello");');
    });

    it('should generate XML output', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*.js'],
            respectGitignore: false
          }),
          new ProfileFilterStage({
            exclude: ['*.spec.js']
          }),
          new FileLoadingStage({
            encoding: 'utf8'
          }),
          new OutputFormattingStage({
            format: 'xml',
            prettyPrint: true
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      expect(result.output).toContain('<ct:directory');
      expect(result.output).toContain('<ct:file path="@index.js"');
      expect(result.output).toContain('console.log("Hello");');
      expect(result.output).toContain('</ct:directory>');
    });

    it('should generate JSON output', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*.md'],
            respectGitignore: false
          }),
          new FileLoadingStage({
            encoding: 'utf8'
          }),
          new OutputFormattingStage({
            format: 'json',
            prettyPrint: true
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      const parsed = JSON.parse(result.output);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0].path).toBe('README.md');
      expect(parsed.files[0].content).toBe('# Test Project');
    });
  });

  describe('gitignore support', () => {
    it('should respect gitignore patterns', async () => {
      // Create files that should be ignored
      await fs.writeFile(path.join(tempDir, 'debug.log'), 'log content');
      await fs.ensureDir(path.join(tempDir, 'node_modules'));
      await fs.writeFile(path.join(tempDir, 'node_modules/package.js'), 'module');

      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: true
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      const filePaths = result.files.map(f => f.path);
      expect(filePaths).not.toContain('debug.log');
      expect(filePaths).not.toContain('node_modules/package.js');
      expect(filePaths).toContain('index.js'); // Should include non-ignored files
    });
  });

  // Skip transformer tests - they require external modules that aren't Jest-compatible
  // These are better tested at the unit test level

  describe('file limits', () => {
    it('should respect head limit', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*'],
            respectGitignore: false
          }),
          new LimitStage({
            limit: 2
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      expect(result.files).toHaveLength(2);
    });

    it('should handle character limits', async () => {
      // Create a large file
      await fs.writeFile(
        path.join(tempDir, 'large.txt'),
        'x'.repeat(1000)
      );

      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['large.txt'],
            respectGitignore: false
          }),
          new FileLoadingStage({
            encoding: 'utf8'
          }),
          new CharLimitStage({
            limit: 100
          }),
          new OutputFormattingStage({
            format: 'xml',
            prettyPrint: false
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      expect(result.output.length).toBeLessThan(1600); // Account for XML wrapper and instructions
      expect(result.output).toContain('truncated due to character limit');
    });
  });

  describe('dry run mode', () => {
    it('should not load file contents in dry run', async () => {
      // In dry run mode, we only discover files, don't load content
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['**/*.js'],
            respectGitignore: false
          })
          // No FileLoadingStage in dry run
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: { dryRun: true }
      });

      expect(result.files.length).toBeGreaterThan(0);
      result.files.forEach(file => {
        expect(file.content).toBeUndefined();
      });
    });
  });

  describe('sorting', () => {
    beforeEach(async () => {
      // Create files with different sizes and times
      await fs.writeFile(path.join(tempDir, 'small.txt'), 'a');
      await fs.writeFile(path.join(tempDir, 'medium.txt'), 'a'.repeat(100));
      await fs.writeFile(path.join(tempDir, 'large.txt'), 'a'.repeat(1000));
      
      // Ensure different modification times
      const now = Date.now();
      // Use fs.utimes with promisify
      const { promisify } = require('util');
      const utimes = promisify(require('fs').utimes);
      
      try {
        await utimes(path.join(tempDir, 'small.txt'), new Date(now - 3000), new Date(now - 3000));
        await utimes(path.join(tempDir, 'medium.txt'), new Date(now - 2000), new Date(now - 2000));
        await utimes(path.join(tempDir, 'large.txt'), new Date(now - 1000), new Date(now - 1000));
      } catch (err) {
        console.error('Error setting file times:', err);
      }
    });

    it('should sort by size', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['*.txt'],
            respectGitignore: false,
            sort: 'size'
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      // FileDiscoveryStage sorts by size in descending order by default
      expect(result.files[0].path).toBe('large.txt');
      expect(result.files[1].path).toBe('medium.txt');
      expect(result.files[2].path).toBe('small.txt');
    });

    it('should sort by modified time', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['*.txt'],
            respectGitignore: false,
            sort: 'modified'
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      expect(result.files[0].path).toBe('large.txt'); // Most recent
      expect(result.files[2].path).toBe('small.txt'); // Oldest
    });
  });

  describe('error handling', () => {
    it('should handle non-existent directory', async () => {
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: '/non/existent/path',
            patterns: ['**/*'],
            respectGitignore: false
          })
        ]);

      const result = await pipeline.process({
        basePath: '/non/existent/path',
        profile: {},
        options: {}
      });
      
      // Should complete but find no files
      expect(result.files).toHaveLength(0);
    });

    it('should handle invalid patterns gracefully', async () => {
      // Fast-glob handles invalid patterns by returning empty results
      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['[invalid-pattern'],
            respectGitignore: false
          })
        ]);

      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });

      // Should complete but find no files
      expect(result.files).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should handle many files efficiently', async () => {
      // Create many files
      const fileCount = 100;
      for (let i = 0; i < fileCount; i++) {
        await fs.writeFile(
          path.join(tempDir, `file${i}.txt`),
          `content ${i}`
        );
      }

      pipeline
        .through([
          new FileDiscoveryStage({
            basePath: tempDir,
            patterns: ['*.txt'],
            respectGitignore: false
          })
        ]);

      const start = Date.now();
      const result = await pipeline.process({
        basePath: tempDir,
        profile: {},
        options: {}
      });
      const duration = Date.now() - start;

      expect(result.files).toHaveLength(fileCount);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});