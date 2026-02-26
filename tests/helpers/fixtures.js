/**
 * Fixture management helpers
 *
 * Utilities for creating, managing, and cleaning up test fixtures.
 */

import path from 'path';
import { execSync } from 'child_process';
import { createTestTempDir } from './tempfs.js';

// For E2E tests and golden files, we need the REAL fs-extra, not the mocked version
// We'll get the actual implementation directly from the module
let fsExtra;
try {
  // In Jest context, use requireActual to bypass mocks
  fsExtra = typeof jest !== 'undefined' ? jest.requireActual('fs-extra') : null;
} catch (e) {
  fsExtra = null;
}

// Create our fs object with the functions we need
const fs = {
  ensureDirSync: fsExtra?.ensureDirSync || fsExtra?.default?.ensureDirSync,
  writeFileSync: fsExtra?.writeFileSync || fsExtra?.default?.writeFileSync,
  readFileSync: fsExtra?.readFileSync || fsExtra?.default?.readFileSync,
  existsSync: fsExtra?.existsSync || fsExtra?.default?.existsSync,
  removeSync: fsExtra?.removeSync || fsExtra?.default?.removeSync,
  copySync: fsExtra?.copySync || fsExtra?.default?.copySync,
};

// Jest-compatible directory resolution
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');

/**
 * Get path to a fixture
 */
export function fixturePath(name) {
  return path.join(FIXTURES_DIR, name);
}

/**
 * Get path to a golden file
 */
export function goldenPath(name) {
  return path.join(FIXTURES_DIR, 'goldens', name);
}

/**
 * Get path in temp directory
 * @deprecated Use withTempDir from tempfs.js instead for deterministic cleanup
 */
export function tmpPath(name = '') {
  // Legacy function - delegates to tempfs for proper cleanup
  console.warn('tmpPath is deprecated - use withTempDir from tempfs.js instead');
  const tempDir = createTestTempDir(name || 'legacy');
  return tempDir.path;
}

/**
 * Create temp directory
 * @deprecated Use createTestTempDir or withTempDir from tempfs.js instead
 */
export async function createTmpDir() {
  console.warn('createTmpDir is deprecated - use createTestTempDir from tempfs.js instead');
  const tempDir = await createTestTempDir('fixtures');
  return tempDir.path;
}

/**
 * Clean temp directory
 * @deprecated Cleanup is automatic with withTempDir from tempfs.js
 */
export function cleanTmpDir() {
  console.warn('cleanTmpDir is deprecated - cleanup is automatic with withTempDir from tempfs.js');
  // No-op: cleanup should be handled by withTempDir or explicit cleanup() calls
}

/**
 * Copy fixture to temp directory
 * @deprecated Use withTempDir and copy files manually for better control
 */
export function copyFixture(name, tmpName = name) {
  console.warn('copyFixture is deprecated - use withTempDir and copy manually instead');
  const src = fixturePath(name);
  const dest = tmpPath(tmpName);
  fs.copySync(src, dest);
  return dest;
}

/**
 * Read golden file
 */
export function readGolden(name) {
  const goldenFile = goldenPath(name);
  if (!fs.existsSync(goldenFile)) {
    throw new Error(`Golden file not found: ${goldenFile}`);
  }
  // Normalize line endings to \n for cross-platform consistency
  return fs.readFileSync(goldenFile, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Write golden file (use with care, typically in update mode)
 */
export function writeGolden(name, content) {
  const goldenFile = goldenPath(name);
  fs.ensureDirSync(path.dirname(goldenFile));
  fs.writeFileSync(goldenFile, content, 'utf8');
}

/**
 * Compare against golden file
 */
export function matchGolden(content, name, options = {}) {
  const { update = process.env.UPDATE_GOLDEN === 'true' } = options;

  if (update) {
    writeGolden(name, content);
    return true;
  }

  const golden = readGolden(name);
  return content === golden;
}

/**
 * Create a local git repository fixture
 *
 * NOTE: This function still uses legacy tmpPath. Consider using withTempDir instead:
 * await withTempDir('repo-name', async (tempDir) => {
 *   const repo = await createLocalGitRepoInDir(tempDir, files);
 *   // use repo
 * });
 */
export function createLocalGitRepo(name, files = {}) {
  const tempDir = createTestTempDir(name);
  const repoPath = tempDir.path;
  fs.ensureDirSync(repoPath);

  // Initialize git repo
  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });

  // Create files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoPath, filePath);
    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  // Initial commit
  if (Object.keys(files).length > 0) {
    execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
  }

  return {
    path: repoPath,
    addFiles(newFiles) {
      for (const [filePath, content] of Object.entries(newFiles)) {
        const fullPath = path.join(repoPath, filePath);
        fs.ensureDirSync(path.dirname(fullPath));
        fs.writeFileSync(fullPath, content, 'utf8');
      }
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "Add files"', { cwd: repoPath, stdio: 'pipe' });
    },
    createBranch(branchName) {
      execSync(`git checkout -b ${branchName}`, { cwd: repoPath, stdio: 'pipe' });
    },
    checkout(ref) {
      execSync(`git checkout ${ref}`, { cwd: repoPath, stdio: 'pipe' });
    },
    getCurrentBranch() {
      return execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf8' }).trim();
    },
    getCommitHash(ref = 'HEAD') {
      return execSync(`git rev-parse ${ref}`, { cwd: repoPath, encoding: 'utf8' }).trim();
    },
  };
}

/**
 * Create a simple project fixture programmatically
 *
 * NOTE: This function uses temp directory creation. Consider using withTempDir instead:
 * await withTempDir('test-project', async (tempDir) => {
 *   await createSimpleProjectInDir(tempDir, options);
 *   // use project
 * });
 */
export function createSimpleProject(name = 'test-project', options = {}) {
  const {
    withGit = false,
    files = {
      'README.md': '# Test Project\n\nThis is a test project.',
      'package.json': JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          description: 'Test project',
          main: 'index.js',
        },
        null,
        2,
      ),
      'src/index.js': 'console.log("Hello, world!");',
      'src/utils.js': 'export function add(a, b) { return a + b; }',
    },
  } = options;

  const tempDir = createTestTempDir(name);
  const projectPath = tempDir.path;
  fs.ensureDirSync(projectPath);

  // Create files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(projectPath, filePath);
    fs.ensureDirSync(path.dirname(fullPath));
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  // Initialize git if requested
  if (withGit) {
    execSync('git init', { cwd: projectPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: projectPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: projectPath, stdio: 'pipe' });
    execSync('git add .', { cwd: projectPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: projectPath, stdio: 'pipe' });
  }

  return projectPath;
}

/**
 * Create a large project for performance testing
 *
 * NOTE: This function uses temp directory creation. Consider using withTempDir instead.
 */
export function createLargeProject(name, fileCount = 100, options = {}) {
  const { avgFileSize = 1024, withVariety = true } = options;

  const tempDir = createTestTempDir(name);
  const projectPath = tempDir.path;
  fs.ensureDirSync(projectPath);

  const extensions = withVariety
    ? ['.js', '.ts', '.json', '.md', '.txt', '.css', '.html']
    : ['.js'];

  for (let i = 0; i < fileCount; i++) {
    const ext = extensions[i % extensions.length];
    const dir = `src/module${Math.floor(i / 10)}`;
    const filePath = path.join(projectPath, dir, `file${i}${ext}`);

    fs.ensureDirSync(path.dirname(filePath));

    let content;
    if (ext === '.json') {
      content = JSON.stringify({ id: i, data: 'x'.repeat(avgFileSize / 2) });
    } else if (ext === '.md') {
      content = `# File ${i}\n\n${'Lorem ipsum '.repeat(avgFileSize / 12)}`;
    } else {
      content = `// File ${i}\n${'const x = 1;\n'.repeat(avgFileSize / 15)}`;
    }

    fs.writeFileSync(filePath, content, 'utf8');
  }

  return projectPath;
}

/**
 * Create malformed/edge-case files for robustness testing
 *
 * NOTE: This function uses temp directory creation. Consider using withTempDir instead.
 */
export function createRobustnessFixtures(name = 'robustness') {
  const tempDir = createTestTempDir(name);
  const projectPath = tempDir.path;
  fs.ensureDirSync(projectPath);

  const fixtures = {
    // Empty file
    'empty.txt': '',

    // Very long line
    'long-line.txt': 'x'.repeat(100000),

    // Non-UTF8 content (binary disguised as text)
    'fake-text.txt': Buffer.from([0xff, 0xfe, 0x00, 0x01]),

    // Path with spaces and special chars
    'path with spaces/file (1).txt': 'content',

    // Deep nesting
    'a/b/c/d/e/f/g/h/i/j/deep.txt': 'deep file',

    // Case variations
    'File.TXT': 'uppercase extension',
    'file.txt': 'lowercase extension',

    // Zero-byte files
    'zero-byte.bin': Buffer.alloc(0),

    // Large file marker (will be created separately)
    LARGE_FILE_PLACEHOLDER: '# This will be replaced with actual large file',
  };

  for (const [filePath, content] of Object.entries(fixtures)) {
    const fullPath = path.join(projectPath, filePath);
    fs.ensureDirSync(path.dirname(fullPath));

    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }

  return {
    path: projectPath,
    createLargeFile(sizeMB = 15) {
      const largeFile = path.join(projectPath, 'large.txt');
      const chunkSize = 1024 * 1024; // 1MB chunks
      const stream = fs.createWriteStream(largeFile);

      for (let i = 0; i < sizeMB; i++) {
        stream.write('x'.repeat(chunkSize));
      }

      stream.end();
      return largeFile;
    },
    createSymlink(target, link) {
      const targetPath = path.join(projectPath, target);
      const linkPath = path.join(projectPath, link);
      fs.ensureDirSync(path.dirname(linkPath));
      fs.symlinkSync(targetPath, linkPath);
      return linkPath;
    },
  };
}

/**
 * Jest custom matcher for golden files
 */
export function toMatchGolden(received, goldenName, options = {}) {
  const update = process.env.UPDATE_GOLDEN === 'true' || options.update;

  if (update) {
    // Update mode: write golden and pass
    writeGolden(goldenName, received);
    return {
      pass: true,
      message: () => `Golden file ${goldenName} updated`,
    };
  }

  // Comparison mode: read and compare
  try {
    const golden = readGolden(goldenName);
    const pass = received === golden;

    if (pass) {
      return {
        pass: true,
        message: () => `Expected content not to match golden file ${goldenName}`,
      };
    } else {
      // Get jest-diff - handle both CommonJS and ESM
      let jestDiff;
      try {
        const jestDiffModule = typeof jest !== 'undefined' ? jest.requireActual('jest-diff') : null;
        // Handle different export shapes: { diff }, { default }, or direct callable
        jestDiff = jestDiffModule?.diff || jestDiffModule?.default || jestDiffModule;
        // Ensure it's actually a function
        if (typeof jestDiff !== 'function') {
          jestDiff = null;
        }
      } catch {
        // Fallback: just show a simple message without diff
        jestDiff = null;
      }

      const diffOutput = jestDiff
        ? jestDiff(golden, received)
        : `Expected:\n${golden}\n\nReceived:\n${received}`;

      return {
        pass: false,
        message: () => `Expected content to match golden file ${goldenName}\n\n${diffOutput}`,
      };
    }
  } catch (error) {
    return {
      pass: false,
      message: () =>
        `Golden file ${goldenName} not found. Run with UPDATE_GOLDEN=true to create it.\nError: ${error.message}`,
    };
  }
}
