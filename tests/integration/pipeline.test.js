const Pipeline = require('../../src/pipeline/Pipeline');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('Pipeline Integration Tests', () => {
  let tempDir;
  let pipeline;

  beforeEach(async () => {
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
    
    pipeline = new Pipeline();
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('basic pipeline execution', () => {
    it('should discover and process files', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*.js', '**/*.md'],
          exclude: ['node_modules/**', '*.spec.js']
        }
      });

      expect(result.files).toHaveLength(4); // index.js, utils.js, app.js, README.md
      expect(result.files.map(f => f.path).sort()).toEqual([
        'README.md',
        'index.js',
        'src/app.js',
        'utils.js'
      ]);
    });

    it('should load file contents', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['index.js']
        }
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('console.log("Hello");');
    });

    it('should generate XML output', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*.js'],
          exclude: ['*.spec.js']
        },
        format: 'xml'
      });

      expect(result.output).toContain('<copytree>');
      expect(result.output).toContain('<file path="index.js">');
      expect(result.output).toContain('console.log("Hello");');
      expect(result.output).toContain('</copytree>');
    });

    it('should generate JSON output', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*.md']
        },
        format: 'json'
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

      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*']
        },
        respectGitignore: true
      });

      const filePaths = result.files.map(f => f.path);
      expect(filePaths).not.toContain('debug.log');
      expect(filePaths).not.toContain('node_modules/package.js');
      expect(filePaths).toContain('index.js'); // Should include non-ignored files
    });
  });

  describe('transformers', () => {
    beforeEach(async () => {
      // Add a markdown file with content for transformation
      await fs.writeFile(
        path.join(tempDir, 'docs.md'),
        '# Documentation\n\nThis is a [link](https://example.com).'
      );
    });

    it('should apply transformers based on patterns', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*.md'],
          transformers: [
            {
              pattern: '**/*.md',
              transformer: 'markdown-link-stripper'
            }
          ]
        }
      });

      const mdFile = result.files.find(f => f.path === 'docs.md');
      expect(mdFile.content).toContain('This is a link.');
      expect(mdFile.content).not.toContain('[link]');
      expect(mdFile.content).not.toContain('https://example.com');
    });
  });

  describe('file limits', () => {
    it('should respect head limit', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*']
        },
        head: 2
      });

      expect(result.files).toHaveLength(2);
    });

    it('should handle character limits', async () => {
      // Create a large file
      await fs.writeFile(
        path.join(tempDir, 'large.txt'),
        'x'.repeat(1000)
      );

      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['large.txt']
        },
        charLimit: 100
      });

      expect(result.output.length).toBeLessThan(200); // Account for XML wrapper
      expect(result.output).toContain('[Content truncated]');
    });
  });

  describe('dry run mode', () => {
    it('should not load file contents in dry run', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['**/*.js']
        },
        dryRun: true
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
      await fs.utimes(path.join(tempDir, 'small.txt'), now - 3000, now - 3000);
      await fs.utimes(path.join(tempDir, 'medium.txt'), now - 2000, now - 2000);
      await fs.utimes(path.join(tempDir, 'large.txt'), now - 1000, now - 1000);
    });

    it('should sort by size', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['*.txt']
        },
        sort: 'size'
      });

      expect(result.files[0].path).toBe('small.txt');
      expect(result.files[1].path).toBe('medium.txt');
      expect(result.files[2].path).toBe('large.txt');
    });

    it('should sort by modified time', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['*.txt']
        },
        sort: 'modified'
      });

      expect(result.files[0].path).toBe('large.txt'); // Most recent
      expect(result.files[2].path).toBe('small.txt'); // Oldest
    });
  });

  describe('error handling', () => {
    it('should handle non-existent directory', async () => {
      await expect(
        pipeline.execute({
          basePath: '/non/existent/path',
          profile: { patterns: ['**/*'] }
        })
      ).rejects.toThrow();
    });

    it('should handle invalid patterns gracefully', async () => {
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['[invalid-pattern']
        }
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

      const start = Date.now();
      const result = await pipeline.execute({
        basePath: tempDir,
        profile: {
          patterns: ['*.txt']
        }
      });
      const duration = Date.now() - start;

      expect(result.files).toHaveLength(fileCount);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});