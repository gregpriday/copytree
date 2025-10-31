import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { getAllFiles } from '../../../src/utils/ignoreWalker.js';

describe('ignoreWalker', () => {
  let tempDir;

  beforeEach(async () => {
    const tempPath = path.join(os.tmpdir(), 'ignore-walker-');
    tempDir = await fs.mkdtemp(tempPath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createProject = async (files) => {
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

  const getIgnored = async (allFiles, options) => {
    const keptFiles = await getAllFiles(tempDir, options);
    const keptPaths = new Set(keptFiles.map(f => f.path));
    return allFiles.filter(f => !keptPaths.has(f));
  }

  it('should ignore a file specified in .copytreeignore', async () => {
    const allFiles = await createProject({
      '.copytreeignore': 'a.txt',
      'a.txt': 'a',
      'b.txt': 'b',
    });

    const ignored = await getIgnored(allFiles);
    expect(ignored).toEqual([path.join(tempDir, 'a.txt')]);
  });

  it('should handle nested .copytreeignore files', async () => {
    const allFiles = await createProject({
      '.copytreeignore': 'a.txt',
      'nested/a.txt': 'a',
      'nested/.copytreeignore': 'b.txt',
      'nested/b.txt': 'b',
      'nested/c.txt': 'c',
      'b.txt': 'b-root',
    });

    const ignored = await getIgnored(allFiles);
    const expected = [
      path.join(tempDir, 'nested/a.txt'),
      path.join(tempDir, 'nested/b.txt'),
    ].sort();

    const ignoredPaths = ignored.map(p => path.join(p));
    expect(ignoredPaths.sort()).toEqual(expected);
  });

  it('should handle negations in ignore files', async () => {
    const allFiles = await createProject({
      '.copytreeignore': `*.log
!important.log`,
      'a.log': 'a',
      'important.log': 'important',
    });

    const ignored = await getIgnored(allFiles);
    expect(ignored).toEqual([path.join(tempDir, 'a.log')]);
  });

  it('should use .gitignore when specified', async () => {
    const allFiles = await createProject({
      '.gitignore': 'a.txt',
      'a.txt': 'a',
      'b.txt': 'b',
    });

    const ignored = await getIgnored(allFiles, { ignoreFileName: '.gitignore' });
    expect(ignored).toEqual([path.join(tempDir, 'a.txt')]);
  });

  it('should prefer .copytreeignore over .gitignore if both exist and .copytreeignore is default', async () => {
    const allFiles = await createProject({
      '.gitignore': 'a.txt',
      '.copytreeignore': 'b.txt',
      'a.txt': 'a',
      'b.txt': 'b',
    });

    const ignored = await getIgnored(allFiles);
    expect(ignored).toEqual([path.join(tempDir, 'b.txt')]);
  });

  it('should ignore entire directories', async () => {
    const allFiles = await createProject({
      '.copytreeignore': 'node_modules/',
      'node_modules/a.js': 'a',
      'src/index.js': 'index',
    });

    const ignored = await getIgnored(allFiles);
    expect(ignored).toEqual([path.join(tempDir, 'node_modules/a.js')]);
  });

  it('should handle complex nested rules and negations', async () => {
    const allFiles = await createProject({
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

    const ignored = await getIgnored(allFiles);
    const expected = [
      path.join(tempDir, 'logs/a.log'),
      path.join(tempDir, 'logs/important.log'),
      path.join(tempDir, 'src/feature/utils.js'),
    ].sort();

    expect(ignored.sort()).toEqual(expected);
  });
});
