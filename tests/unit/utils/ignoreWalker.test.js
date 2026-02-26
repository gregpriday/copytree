import path from 'path';
import { promises as fs } from 'fs';
import { withTempDir, settleFs } from '../../helpers/tempfs.js';
import { getAllFiles, clearRuleCache, testPath } from '../../../src/utils/ignoreWalker.js';

describe('ignoreWalker', () => {
  const createProject = async (tempDir, files) => {
    const allPaths = [];
    for (const [file, content] of Object.entries(files)) {
      const filePath = path.join(tempDir, file);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
      if (!file.includes('.copytreeignore') && !file.includes('.gitignore')) {
        allPaths.push(filePath);
      }
    }
    return allPaths;
  };

  const getIgnored = async (tempDir, allFiles, options) => {
    const keptFiles = await getAllFiles(tempDir, options);
    const keptPaths = new Set(keptFiles.map((f) => f.path));
    return allFiles.filter((f) => !keptPaths.has(f));
  };

  it('should ignore a file specified in .copytreeignore', async () => {
    await withTempDir('ignore-basic-file', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.copytreeignore': 'a.txt',
        'a.txt': 'a',
        'b.txt': 'b',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      expect(ignored).toEqual([path.join(tempDir, 'a.txt')]);
    });
  });

  it('should handle nested .copytreeignore files', async () => {
    await withTempDir('ignore-nested-files', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.copytreeignore': 'a.txt',
        'nested/a.txt': 'a',
        'nested/.copytreeignore': 'b.txt',
        'nested/b.txt': 'b',
        'nested/c.txt': 'c',
        'b.txt': 'b-root',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      const expected = [
        path.join(tempDir, 'nested/a.txt'),
        path.join(tempDir, 'nested/b.txt'),
      ].sort();

      const ignoredPaths = ignored.map((p) => path.join(p));
      expect(ignoredPaths.sort()).toEqual(expected);
    });
  });

  it('should handle negations in ignore files', async () => {
    await withTempDir('ignore-negations', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.copytreeignore': `*.log
!important.log`,
        'a.log': 'a',
        'important.log': 'important',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      expect(ignored).toEqual([path.join(tempDir, 'a.log')]);
    });
  });

  it('should use .gitignore when specified', async () => {
    await withTempDir('ignore-gitignore-file', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.gitignore': 'a.txt',
        'a.txt': 'a',
        'b.txt': 'b',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles, { ignoreFileName: '.gitignore' });
      expect(ignored).toEqual([path.join(tempDir, 'a.txt')]);
    });
  });

  it('should prefer .copytreeignore over .gitignore if both exist and .copytreeignore is default', async () => {
    await withTempDir('ignore-preference-copytreeignore', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.gitignore': 'a.txt',
        '.copytreeignore': 'b.txt',
        'a.txt': 'a',
        'b.txt': 'b',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      expect(ignored).toEqual([path.join(tempDir, 'b.txt')]);
    });
  });

  it('should ignore entire directories', async () => {
    await withTempDir('ignore-entire-directories', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.copytreeignore': 'node_modules/',
        'node_modules/a.js': 'a',
        'src/index.js': 'index',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      expect(ignored).toEqual([path.join(tempDir, 'node_modules/a.js')]);
    });
  });

  it('should handle complex nested rules and negations', async () => {
    await withTempDir('ignore-complex-nested-rules', async (tempDir) => {
      const allFiles = await createProject(tempDir, {
        '.copytreeignore': `logs/
!logs/important.log`,
        'logs/a.log': 'a',
        'logs/important.log': 'important',
        'src/index.js': 'index',
        'src/feature/.copytreeignore': `*.js
!feature.js`,
        'src/feature/feature.js': 'feature',
        'src/feature/utils.js': 'utils',
      });

      await settleFs(50);
      const ignored = await getIgnored(tempDir, allFiles);
      const expected = [
        path.join(tempDir, 'logs/a.log'),
        path.join(tempDir, 'logs/important.log'),
        path.join(tempDir, 'src/feature/utils.js'),
      ].sort();

      expect(ignored.sort()).toEqual(expected);
    });
  });

  describe('cache behavior', () => {
    afterEach(() => {
      clearRuleCache();
    });

    it('returns fresh rules after .copytreeignore is modified on disk (no cache)', async () => {
      await withTempDir('cache-freshness', async (tempDir) => {
        // Initial ignore file excludes a.txt
        await createProject(tempDir, {
          '.copytreeignore': 'a.txt',
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        const firstResult = await getAllFiles(tempDir);
        const firstPaths = firstResult.map((f) => path.basename(f.path)).sort();
        expect(firstPaths).toEqual(['b.txt']);

        // Modify ignore file to exclude b.txt instead
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'b.txt');
        await settleFs(50);

        const secondResult = await getAllFiles(tempDir);
        const secondPaths = secondResult.map((f) => path.basename(f.path)).sort();
        expect(secondPaths).toEqual(['a.txt']);
      });
    });

    it('returns stale rules when cache is enabled without clearing', async () => {
      await withTempDir('cache-stale', async (tempDir) => {
        await createProject(tempDir, {
          '.copytreeignore': 'a.txt',
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        const firstResult = await getAllFiles(tempDir, { cache: true });
        const firstPaths = firstResult.map((f) => path.basename(f.path)).sort();
        expect(firstPaths).toEqual(['b.txt']);

        // Modify ignore file — cached result should still exclude a.txt
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'b.txt');
        await settleFs(50);

        const secondResult = await getAllFiles(tempDir, { cache: true });
        const secondPaths = secondResult.map((f) => path.basename(f.path)).sort();
        // Still returns stale result because cache was not cleared
        expect(secondPaths).toEqual(['b.txt']);
      });
    });

    it('returns fresh rules after clearRuleCache() when cache is enabled', async () => {
      await withTempDir('cache-clear', async (tempDir) => {
        await createProject(tempDir, {
          '.copytreeignore': 'a.txt',
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        const firstResult = await getAllFiles(tempDir, { cache: true });
        const firstPaths = firstResult.map((f) => path.basename(f.path)).sort();
        expect(firstPaths).toEqual(['b.txt']);

        // Modify ignore file and clear cache
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'b.txt');
        await settleFs(50);
        clearRuleCache();

        const secondResult = await getAllFiles(tempDir, { cache: true });
        const secondPaths = secondResult.map((f) => path.basename(f.path)).sort();
        // After clearing, returns fresh result
        expect(secondPaths).toEqual(['a.txt']);
      });
    });

    it('picks up newly created ignore files without cache', async () => {
      await withTempDir('cache-new-file', async (tempDir) => {
        // Start with no ignore file
        await createProject(tempDir, {
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        const firstResult = await getAllFiles(tempDir);
        const firstPaths = firstResult.map((f) => path.basename(f.path)).sort();
        expect(firstPaths).toEqual(['a.txt', 'b.txt']);

        // Create an ignore file that excludes a.txt
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'a.txt');
        await settleFs(50);

        const secondResult = await getAllFiles(tempDir);
        const secondPaths = secondResult.map((f) => path.basename(f.path)).sort();
        expect(secondPaths).toEqual(['b.txt']);
      });
    });

    it('with cache enabled, does not pick up newly created ignore file until cache is cleared', async () => {
      await withTempDir('cache-new-file-stale', async (tempDir) => {
        await createProject(tempDir, {
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        // First walk: no ignore file — caches [] (ENOENT) for the missing .copytreeignore
        const firstResult = await getAllFiles(tempDir, { cache: true });
        const firstPaths = firstResult.map((f) => path.basename(f.path)).sort();
        expect(firstPaths).toEqual(['a.txt', 'b.txt']);

        // Create an ignore file — but the cache still holds [] for that path
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'a.txt');
        await settleFs(50);

        const secondResult = await getAllFiles(tempDir, { cache: true });
        const secondPaths = secondResult.map((f) => path.basename(f.path)).sort();
        // Stale cache: a.txt is still returned
        expect(secondPaths).toEqual(['a.txt', 'b.txt']);

        // After clearing, the new ignore file is picked up
        clearRuleCache();
        const thirdResult = await getAllFiles(tempDir, { cache: true });
        const thirdPaths = thirdResult.map((f) => path.basename(f.path)).sort();
        expect(thirdPaths).toEqual(['b.txt']);
      });
    });

    it('testPath respects cache option for freshness', async () => {
      await withTempDir('cache-testpath', async (tempDir) => {
        await createProject(tempDir, {
          '.copytreeignore': 'a.txt',
          'a.txt': 'a',
          'b.txt': 'b',
        });
        await settleFs(50);

        // First call caches rules with cache:true
        const firstDecision = await testPath('a.txt', tempDir, { cache: true });
        expect(firstDecision.ignored).toBe(true);

        // Modify ignore file to no longer ignore a.txt
        await fs.writeFile(path.join(tempDir, '.copytreeignore'), 'b.txt');
        await settleFs(50);

        // Without clearing cache, still returns stale result
        const staleDecision = await testPath('a.txt', tempDir, { cache: true });
        expect(staleDecision.ignored).toBe(true);

        // After clearing cache, returns fresh result
        clearRuleCache();
        const freshDecision = await testPath('a.txt', tempDir, { cache: true });
        expect(freshDecision.ignored).toBe(false);
      });
    });
  });
});
