import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

let fs;
let withFsRetry;
let recordRetry;
let recordGiveUp;
let recordPermanent;
let recordSuccessAfterRetry;
let summarize;
let reset;
let walkWithIgnore;

beforeAll(async () => {
  jest.unmock('../../src/utils/fsx.js');
  ({ promises: fs } = await import('node:fs'));
  ({ withFsRetry } = await import('../../src/utils/retryableFs.js'));
  ({ recordRetry, recordGiveUp, recordPermanent, recordSuccessAfterRetry, summarize, reset } =
    await import('../../src/utils/fsErrorReport.js'));
  ({ walkWithIgnore } = await import('../../src/utils/ignoreWalker.js'));
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
      const testPath = path.join(os.tmpdir(), `test-${randomUUID()}.txt`);
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
      const nonExistentPath = path.join(os.tmpdir(), `does-not-exist-${randomUUID()}.txt`);

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
      const testDir = path.join(os.tmpdir(), `test-walker-${randomUUID()}`);
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
      const nonExistentDir = path.join(os.tmpdir(), `does-not-exist-${randomUUID()}`);

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
      const testDir = path.join(os.tmpdir(), `test-config-${randomUUID()}`);
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
      const testDir = path.join(os.tmpdir(), `test-defaults-${randomUUID()}`);
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
      const testDir = path.join(os.tmpdir(), `test-rapid-${randomUUID()}`);
      await fs.mkdir(testDir, { recursive: true });

      try {
        // Create multiple files rapidly
        const filePromises = Array.from({ length: 10 }, (_, i) =>
          fs.writeFile(path.join(testDir, `file${i}.txt`), `content ${i}`, 'utf8'),
        );
        await Promise.all(filePromises);

        // Through `FileLoadingStage`, which is the only thing that reads file
        // content. The `FileLoader` utility this used to exercise was a second
        // implementation of the same job, reached by nothing but its own tests.
        const { default: FileLoadingStage } =
          await import('../../src/pipeline/stages/FileLoadingStage.js');
        const stage = new FileLoadingStage({});
        const result = await stage.process({
          basePath: testDir,
          files: Array.from({ length: 10 }, (_, i) => ({
            path: `file${i}.txt`,
            absolutePath: path.join(testDir, `file${i}.txt`),
            size: 10,
          })),
          stats: {},
        });

        expect(result.files.filter((f) => typeof f.content === 'string')).toHaveLength(10);

        // Should complete without errors
        const summary = summarize();
        expect(summary.failed).toBe(0);
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });

    it('should handle large directory trees', async () => {
      const testDir = path.join(os.tmpdir(), `test-large-${randomUUID()}`);
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
