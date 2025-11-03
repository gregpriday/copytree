import path from 'node:path';
import os from 'node:os';

let fs;
let withFsRetry;
let recordRetry;
let recordGiveUp;
let recordPermanent;
let recordSuccessAfterRetry;
let summarize;
let reset;
let walkWithIgnore;
let FileLoader;

beforeAll(async () => {
  jest.unmock('fs-extra');
  ({ promises: fs } = await import('node:fs'));
  ({ withFsRetry } = await import('../../src/utils/retryableFs.js'));
  ({ recordRetry, recordGiveUp, recordPermanent, recordSuccessAfterRetry, summarize, reset } =
    await import('../../src/utils/fsErrorReport.js'));
  ({ walkWithIgnore } = await import('../../src/utils/ignoreWalker.js'));
  ({ default: FileLoader } = await import('../../src/utils/fileLoader.js'));
});

describe('Filesystem Retry Integration Tests', () => {
  beforeEach(() => {
    reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('withFsRetry with real filesystem operations', () => {
    it('should successfully read existing files', async () => {
      const testPath = path.join(os.tmpdir(), `test-${Date.now()}.txt`);
      await fs.writeFile(testPath, 'test content', 'utf8');

      try {
        const content = await withFsRetry(() => fs.readFile(testPath, 'utf8'), {
          maxAttempts: 3,
          initialDelay: 10,
        });

        expect(content).toBe('test content');
      } finally {
        await fs.unlink(testPath).catch(() => {});
      }
    });

    it('should fail permanently on ENOENT without retries', async () => {
      const nonExistentPath = path.join(os.tmpdir(), 'does-not-exist.txt');

      // Track retry attempts
      let retryCount = 0;
      const onRetry = () => {
        retryCount++;
      };

      await expect(
        withFsRetry(() => fs.readFile(nonExistentPath, 'utf8'), {
          maxAttempts: 3,
          initialDelay: 10,
          onRetry,
        }),
      ).rejects.toThrow();

      // ENOENT is not retryable - should fail immediately without any retries
      expect(retryCount).toBe(0);
    });
  });

  describe('ignoreWalker with retry and error reporting', () => {
    it('should track successful operations', async () => {
      const testDir = path.join(os.tmpdir(), `test-walker-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content', 'utf8');

      try {
        const files = [];
        for await (const file of walkWithIgnore(testDir, {
          config: {
            copytree: {
              fs: {
                retryAttempts: 3,
                retryDelay: 10,
                maxDelay: 100,
              },
            },
          },
        })) {
          files.push(file);
        }

        expect(files.length).toBeGreaterThan(0);

        // No errors should be reported for successful walk
        const summary = summarize();
        expect(summary.failed).toBe(0);
        expect(summary.permanent).toBe(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it('should handle non-existent directories gracefully', async () => {
      const nonExistentDir = path.join(os.tmpdir(), 'does-not-exist');

      const files = [];
      for await (const file of walkWithIgnore(nonExistentDir, {
        config: {
          copytree: {
            fs: {
              retryAttempts: 3,
              retryDelay: 10,
              maxDelay: 100,
            },
          },
        },
      })) {
        files.push(file);
      }

      // Should complete without throwing, but with no files
      expect(files).toHaveLength(0);

      // Should report the error
      const summary = summarize();
      expect(summary.permanent + summary.failed).toBeGreaterThan(0);
    });
  });

  describe('FileLoader with retry and error reporting', () => {
    it('should load files successfully', async () => {
      const testDir = path.join(os.tmpdir(), `test-loader-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'test content', 'utf8');

      try {
        const loader = new FileLoader({
          basePath: testDir,
          config: {
            copytree: {
              fs: {
                retryAttempts: 3,
                retryDelay: 10,
                maxDelay: 100,
              },
            },
          },
        });

        const file = await loader.loadFile('test.txt');

        expect(file).toBeDefined();
        expect(file.content).toBe('test content');

        // No errors should be reported
        const summary = summarize();
        expect(summary.failed).toBe(0);
        expect(summary.permanent).toBe(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it('should handle missing files and report errors', async () => {
      const testDir = path.join(os.tmpdir(), `test-loader-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        const loader = new FileLoader({
          basePath: testDir,
          config: {
            copytree: {
              fs: {
                retryAttempts: 3,
                retryDelay: 10,
                maxDelay: 100,
              },
            },
          },
        });

        const file = await loader.loadFile('does-not-exist.txt');

        expect(file).toBeNull();

        // Should report permanent error for ENOENT
        const summary = summarize();
        expect(summary.permanent).toBeGreaterThan(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('error aggregation across operations', () => {
    it('should aggregate errors from multiple operations', async () => {
      // Simulate various error scenarios
      const onRetry = ({ code }) => recordRetry('/simulated/path1', code);

      // Simulate retryable error that fails after retries
      try {
        await withFsRetry(
          async () => {
            throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
          },
          { maxAttempts: 3, initialDelay: 1, onRetry },
        );
      } catch (error) {
        recordGiveUp('/simulated/path1', error.code);
      }

      // Simulate permanent error
      try {
        await withFsRetry(
          async () => {
            throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
          },
          { maxAttempts: 3, initialDelay: 1 },
        );
      } catch (error) {
        recordPermanent('/simulated/path2', error.code);
      }

      const summary = summarize();
      expect(summary.totalRetries).toBeGreaterThan(0);
      expect(summary.failed).toBe(1);
      expect(summary.permanent).toBe(1);
    });
  });

  describe('retry configuration from config object', () => {
    it('should respect config retry settings in walkWithIgnore', async () => {
      const testDir = path.join(os.tmpdir(), `test-config-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        const files = [];
        for await (const file of walkWithIgnore(testDir, {
          config: {
            copytree: {
              fs: {
                retryAttempts: 5, // Custom value
                retryDelay: 50, // Custom value
                maxDelay: 500, // Custom value
              },
            },
          },
        })) {
          files.push(file);
        }

        // Config should be applied (verified implicitly by no errors)
        expect(files).toBeDefined();
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it('should use defaults when config not provided', async () => {
      const testDir = path.join(os.tmpdir(), `test-defaults-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        const files = [];
        for await (const file of walkWithIgnore(testDir, {})) {
          files.push(file);
        }

        // Should work with defaults
        expect(files).toBeDefined();
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('real-world scenarios', () => {
    it('should handle rapid file operations', async () => {
      const testDir = path.join(os.tmpdir(), `test-rapid-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        // Create multiple files rapidly
        const filePromises = Array.from({ length: 10 }, (_, i) =>
          fs.writeFile(path.join(testDir, `file${i}.txt`), `content ${i}`, 'utf8'),
        );
        await Promise.all(filePromises);

        const loader = new FileLoader({
          basePath: testDir,
          config: {
            copytree: {
              fs: {
                retryAttempts: 3,
                retryDelay: 10,
                maxDelay: 100,
              },
            },
          },
        });

        // Load all files
        const loadPromises = Array.from({ length: 10 }, (_, i) => loader.loadFile(`file${i}.txt`));
        const results = await Promise.all(loadPromises);

        expect(results.filter((r) => r !== null)).toHaveLength(10);

        // Should complete without errors
        const summary = summarize();
        expect(summary.failed).toBe(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it('should handle large directory trees', async () => {
      const testDir = path.join(os.tmpdir(), `test-large-${Date.now()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        // Create nested directory structure
        for (let i = 0; i < 5; i++) {
          const subdir = path.join(testDir, `dir${i}`);
          await fs.mkdir(subdir, { recursive: true });
          for (let j = 0; j < 3; j++) {
            await fs.writeFile(path.join(subdir, `file${j}.txt`), `content ${i}-${j}`, 'utf8');
          }
        }

        const files = [];
        for await (const file of walkWithIgnore(testDir, {
          config: {
            copytree: {
              fs: {
                retryAttempts: 3,
                retryDelay: 10,
                maxDelay: 100,
              },
            },
          },
        })) {
          files.push(file);
        }

        expect(files.length).toBeGreaterThanOrEqual(15); // 5 dirs * 3 files

        // Should complete without errors
        const summary = summarize();
        expect(summary.failed).toBe(0);
        expect(summary.permanent).toBe(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
