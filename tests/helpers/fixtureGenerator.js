/**
 * Test fixture generator for performance benchmarks
 *
 * Generates realistic project structures with varying characteristics:
 * - Different file counts (1k, 10k, 50k)
 * - Varying depth (flat vs deep)
 * - Mixed file sizes
 * - Realistic directory structures (src/, tests/, etc.)
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Generate a test project fixture
 * @param {Object} options - Generation options
 * @param {number} options.fileCount - Target number of files
 * @param {number} [options.maxDepth=5] - Maximum directory depth
 * @param {number} [options.avgFilesPerDir=20] - Average files per directory
 * @param {string} [options.name] - Project name (auto-generated if not provided)
 * @param {boolean} [options.withIgnoreFiles=true] - Add .copytreeignore files
 * @returns {Promise<{path: string, fileCount: number, depth: number}>} Generated fixture info
 */
export async function generateFixture(options = {}) {
  const {
    fileCount = 1000,
    maxDepth = 5,
    avgFilesPerDir = 20,
    name = `bench-${fileCount}-${Date.now()}`,
    withIgnoreFiles = true,
  } = options;

  const fixtureRoot = path.join(os.tmpdir(), 'copytree-bench', name);

  // Clean up existing fixture
  await fs.remove(fixtureRoot);
  await fs.ensureDir(fixtureRoot);

  let filesCreated = 0;
  let maxDepthReached = 0;

  /**
   * Generate directory structure recursively
   */
  async function generateDir(dirPath, currentDepth) {
    if (filesCreated >= fileCount || currentDepth >= maxDepth) {
      return;
    }

    maxDepthReached = Math.max(maxDepthReached, currentDepth);

    // Determine number of files and subdirs for this directory
    const remainingFiles = fileCount - filesCreated;
    const filesInThisDir = Math.min(
      Math.floor(Math.random() * avgFilesPerDir * 1.5) + 5,
      remainingFiles,
    );
    const numSubdirs = currentDepth < maxDepth ? Math.floor(Math.random() * 5) + 1 : 0;

    // Create files
    for (let i = 0; i < filesInThisDir && filesCreated < fileCount; i++) {
      const fileName = `file-${filesCreated}-${generateRandomString(8)}.js`;
      const filePath = path.join(dirPath, fileName);
      const content = generateFileContent(filesCreated, currentDepth);
      await fs.writeFile(filePath, content);
      filesCreated++;
    }

    // Create subdirectories
    if (numSubdirs > 0 && filesCreated < fileCount) {
      const subdirNames = generateRealisticDirNames(numSubdirs, currentDepth);
      for (const subdirName of subdirNames) {
        const subdirPath = path.join(dirPath, subdirName);
        await fs.ensureDir(subdirPath);
        await generateDir(subdirPath, currentDepth + 1);
      }
    }

    // Add .copytreeignore file at some depths
    if (withIgnoreFiles && currentDepth % 2 === 0 && Math.random() > 0.7) {
      const ignoreContent = generateIgnoreRules();
      await fs.writeFile(path.join(dirPath, '.copytreeignore'), ignoreContent);
    }
  }

  // Create root directory structure
  const rootDirs = ['src', 'tests', 'lib', 'config', 'docs'];
  for (const dir of rootDirs) {
    const dirPath = path.join(fixtureRoot, dir);
    await fs.ensureDir(dirPath);
    await generateDir(dirPath, 1);
    if (filesCreated >= fileCount) break;
  }

  // Add root-level files
  await fs.writeFile(path.join(fixtureRoot, 'package.json'), '{"name": "bench-project"}');
  await fs.writeFile(path.join(fixtureRoot, 'README.md'), '# Benchmark Project\n');
  await fs.writeFile(path.join(fixtureRoot, '.gitignore'), 'node_modules\n*.log\n.DS_Store\n');

  return {
    path: fixtureRoot,
    fileCount: filesCreated,
    depth: maxDepthReached,
  };
}

/**
 * Generate realistic directory names based on depth
 */
function generateRealisticDirNames(count, depth) {
  const names = [];
  const prefixes = ['module', 'component', 'util', 'helper', 'service', 'model', 'view'];
  const suffixes = ['core', 'common', 'shared', 'base', 'extended', 'impl'];

  for (let i = 0; i < count; i++) {
    if (depth === 0) {
      names.push(['src', 'tests', 'lib', 'config', 'docs', 'scripts'][i % 6]);
    } else {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      names.push(`${prefix}-${suffix}-${i}`);
    }
  }

  return names;
}

/**
 * Generate file content with varying size
 */
function generateFileContent(index, depth) {
  const lines = Math.floor(Math.random() * 100) + 10;
  const content = [];

  content.push(`// Generated file ${index} at depth ${depth}`);
  content.push(`export const FILE_ID = ${index};`);
  content.push('');

  for (let i = 0; i < lines; i++) {
    content.push(`// Line ${i}: ${generateRandomString(40)}`);
  }

  content.push('');
  content.push(`export default { id: ${index}, depth: ${depth} };`);

  return content.join('\n');
}

/**
 * Generate random ignore rules
 */
function generateIgnoreRules() {
  const rules = ['# Generated ignore file', '*.log', '*.tmp', 'temp/', 'cache/', '.DS_Store'];
  return rules.join('\n');
}

/**
 * Generate random string
 */
function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Clean up all benchmark fixtures
 */
export async function cleanupFixtures() {
  const benchRoot = path.join(os.tmpdir(), 'copytree-bench');
  await fs.remove(benchRoot);
}

export default { generateFixture, cleanupFixtures };
