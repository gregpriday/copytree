// Unmock fs-extra for this test (real filesystem operations)
jest.unmock('fs-extra');

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

let FileDiscoveryStage;

beforeAll(async () => {
  const mod = await import('../../../../src/pipeline/stages/FileDiscoveryStage.js');
  FileDiscoveryStage = mod.default;
});

/**
 * Helper to create a stage with sensible defaults for filter tests.
 */
function makeStage(overrides = {}) {
  return new FileDiscoveryStage({
    patterns: ['**/*'],
    respectGitignore: false,
    ...overrides,
  });
}

/**
 * Helper to run the stage and return file paths sorted alphabetically.
 */
async function discover(stage, basePath) {
  const result = await stage.process({ basePath, options: {} });
  return result.files.map((f) => f.path).sort();
}

describe('FileDiscoveryStage — convenience filter flags', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `copytree-filters-${randomUUID()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  // ─── Extension filter (--ext) ───────────────────────────────────────────────

  describe('extFilter (--ext)', () => {
    beforeEach(async () => {
      await fs.ensureDir(path.join(tempDir, 'src'));
      await fs.writeFile(path.join(tempDir, 'index.js'), 'js');
      await fs.writeFile(path.join(tempDir, 'index.ts'), 'ts');
      await fs.writeFile(path.join(tempDir, 'README.md'), 'md');
      await fs.writeFile(path.join(tempDir, 'src', 'util.js'), 'js');
      await fs.writeFile(path.join(tempDir, 'src', 'types.ts'), 'ts');
    });

    it('should return only files matching a single extension', async () => {
      const stage = makeStage({ basePath: tempDir, extFilter: ['.js'] });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['index.js', 'src/util.js']);
    });

    it('should return files matching multiple extensions', async () => {
      const stage = makeStage({ basePath: tempDir, extFilter: ['.js', '.ts'] });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['index.js', 'index.ts', 'src/types.ts', 'src/util.js']);
    });

    it('should be case-insensitive for extensions', async () => {
      await fs.writeFile(path.join(tempDir, 'image.JS'), 'content');
      const stage = makeStage({ basePath: tempDir, extFilter: ['.js'] });
      const paths = await discover(stage, tempDir);
      // Both .js and .JS files should match
      expect(paths).toContain('index.js');
      expect(paths).toContain('image.JS');
      expect(paths).not.toContain('README.md');
      expect(paths).not.toContain('index.ts');
    });

    it('should return nothing when no files match the extension', async () => {
      const stage = makeStage({ basePath: tempDir, extFilter: ['.py'] });
      const paths = await discover(stage, tempDir);
      expect(paths).toHaveLength(0);
    });

    it('should work in combination with --filter patterns (AND logic)', async () => {
      // --filter limits to src/** only; --ext limits to .ts — both must match
      const stage = makeStage({
        basePath: tempDir,
        patterns: ['src/**'],
        extFilter: ['.ts'],
      });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['src/types.ts']);
    });
  });

  // ─── Max depth (--max-depth) ─────────────────────────────────────────────────

  describe('maxDepth (--max-depth)', () => {
    beforeEach(async () => {
      await fs.ensureDir(path.join(tempDir, 'a'));
      await fs.ensureDir(path.join(tempDir, 'a', 'b'));
      await fs.ensureDir(path.join(tempDir, 'a', 'b', 'c'));
      await fs.writeFile(path.join(tempDir, 'root.txt'), 'root');
      await fs.writeFile(path.join(tempDir, 'a', 'depth1.txt'), 'd1');
      await fs.writeFile(path.join(tempDir, 'a', 'b', 'depth2.txt'), 'd2');
      await fs.writeFile(path.join(tempDir, 'a', 'b', 'c', 'depth3.txt'), 'd3');
    });

    it('should return only root-level files at maxDepth=0', async () => {
      const stage = makeStage({ basePath: tempDir, maxDepth: 0 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['root.txt']);
    });

    it('should include one level deep at maxDepth=1', async () => {
      const stage = makeStage({ basePath: tempDir, maxDepth: 1 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['a/depth1.txt', 'root.txt']);
    });

    it('should include two levels deep at maxDepth=2', async () => {
      const stage = makeStage({ basePath: tempDir, maxDepth: 2 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['a/b/depth2.txt', 'a/depth1.txt', 'root.txt']);
    });

    it('should include all files when maxDepth exceeds actual depth', async () => {
      const stage = makeStage({ basePath: tempDir, maxDepth: 100 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['a/b/c/depth3.txt', 'a/b/depth2.txt', 'a/depth1.txt', 'root.txt']);
    });

    it('should include all files when maxDepth is not set', async () => {
      const stage = makeStage({ basePath: tempDir });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['a/b/c/depth3.txt', 'a/b/depth2.txt', 'a/depth1.txt', 'root.txt']);
    });

    it('should return empty array at maxDepth=0 when root has no files (only subdirs)', async () => {
      // Create a directory with ONLY subdirectories at the root level
      const subdirOnlyDir = path.join(tempDir, 'subdir-only');
      await fs.ensureDir(path.join(subdirOnlyDir, 'sub'));
      await fs.writeFile(path.join(subdirOnlyDir, 'sub', 'nested.txt'), 'nested');
      const stage = makeStage({ basePath: subdirOnlyDir, maxDepth: 0 });
      const paths = await discover(stage, subdirOnlyDir);
      expect(paths).toHaveLength(0);
    });
  });

  // ─── Min/max size filters (--min-size / --max-size) ──────────────────────────

  describe('size filters (--min-size / --max-size)', () => {
    beforeEach(async () => {
      // Create files of known sizes
      await fs.writeFile(path.join(tempDir, 'empty.txt'), ''); // 0 bytes
      await fs.writeFile(path.join(tempDir, 'small.txt'), 'a'.repeat(100)); // 100 bytes
      await fs.writeFile(path.join(tempDir, 'medium.txt'), 'b'.repeat(1000)); // 1000 bytes
      await fs.writeFile(path.join(tempDir, 'large.txt'), 'c'.repeat(10000)); // 10000 bytes
    });

    it('should exclude files smaller than minSizeBytes', async () => {
      const stage = makeStage({ basePath: tempDir, minSizeBytes: 500 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['large.txt', 'medium.txt']);
    });

    it('should exclude files larger than maxSizeBytes', async () => {
      const stage = makeStage({ basePath: tempDir, maxSizeBytes: 500 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['empty.txt', 'small.txt']);
    });

    it('should apply both min and max size filters simultaneously', async () => {
      const stage = makeStage({ basePath: tempDir, minSizeBytes: 50, maxSizeBytes: 5000 });
      const paths = await discover(stage, tempDir);
      expect(paths).toEqual(['medium.txt', 'small.txt']);
    });

    it('should include files exactly at the boundary values', async () => {
      const stage = makeStage({ basePath: tempDir, minSizeBytes: 100, maxSizeBytes: 1000 });
      const paths = await discover(stage, tempDir);
      expect(paths).toContain('small.txt'); // exactly 100 bytes
      expect(paths).toContain('medium.txt'); // exactly 1000 bytes
    });

    it('should return nothing when size range excludes all files', async () => {
      const stage = makeStage({ basePath: tempDir, minSizeBytes: 50000 });
      const paths = await discover(stage, tempDir);
      expect(paths).toHaveLength(0);
    });

    it('should include all files when no size filters are set', async () => {
      const stage = makeStage({ basePath: tempDir });
      const paths = await discover(stage, tempDir);
      expect(paths).toHaveLength(4);
    });
  });

  // ─── Combined filters ────────────────────────────────────────────────────────

  describe('combined filters', () => {
    beforeEach(async () => {
      await fs.ensureDir(path.join(tempDir, 'src'));
      await fs.ensureDir(path.join(tempDir, 'src', 'deep'));
      await fs.writeFile(path.join(tempDir, 'root.js'), 'a'.repeat(200));
      await fs.writeFile(path.join(tempDir, 'root.md'), 'b'.repeat(200));
      await fs.writeFile(path.join(tempDir, 'src', 'lib.js'), 'c'.repeat(5000));
      await fs.writeFile(path.join(tempDir, 'src', 'lib.ts'), 'd'.repeat(50));
      await fs.writeFile(path.join(tempDir, 'src', 'deep', 'nested.js'), 'e'.repeat(300));
    });

    it('should combine ext, maxDepth, and size filters', async () => {
      const stage = makeStage({
        basePath: tempDir,
        extFilter: ['.js'],
        maxDepth: 1,
        minSizeBytes: 100,
        maxSizeBytes: 1000,
      });
      const paths = await discover(stage, tempDir);
      // Only .js files, max 1 level deep, between 100 and 1000 bytes
      // root.js (200B, depth 0) ✓
      // root.md — wrong ext
      // src/lib.js (5000B) — too large
      // src/lib.ts — wrong ext
      // src/deep/nested.js — depth 2, excluded
      expect(paths).toEqual(['root.js']);
    });
  });
});
