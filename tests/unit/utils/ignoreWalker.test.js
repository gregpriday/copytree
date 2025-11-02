import path from 'path';
import { promises as fs } from 'fs';
import { withTempDir, settleFs } from '../../helpers/tempfs.js';
import { getAllFiles } from '../../../src/utils/ignoreWalker.js';

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
});
