/**
 * Fixture management helpers
 *
 * Utilities for creating, managing, and cleaning up test fixtures.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Jest-compatible directory resolution
const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');
const TMP_DIR = path.join(os.tmpdir(), 'copytree-test');

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
 */
export function tmpPath(name = '') {
  return path.join(TMP_DIR, name);
}

/**
 * Create temp directory
 */
export function createTmpDir() {
  fs.ensureDirSync(TMP_DIR);
  return TMP_DIR;
}

/**
 * Clean temp directory
 */
export function cleanTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.removeSync(TMP_DIR);
  }
}

/**
 * Copy fixture to temp directory
 */
export function copyFixture(name, tmpName = name) {
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
  return fs.readFileSync(goldenFile, 'utf8');
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
 */
export function createLocalGitRepo(name, files = {}) {
  const repoPath = tmpPath(name);
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

  const projectPath = tmpPath(name);
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
 */
export function createLargeProject(name, fileCount = 100, options = {}) {
  const { avgFileSize = 1024, withVariety = true } = options;

  const projectPath = tmpPath(name);
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
 */
export function createRobustnessFixtures(name = 'robustness') {
  const projectPath = tmpPath(name);
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
  const pass = matchGolden(received, goldenName, options);

  if (pass) {
    return {
      pass: true,
      message: () => `Expected content not to match golden file ${goldenName}`,
    };
  } else {
    const golden = readGolden(goldenName);
    return {
      pass: false,
      message: () => {
        const diff = require('jest-diff').default(golden, received);
        return `Expected content to match golden file ${goldenName}\n\n${diff}`;
      },
    };
  }
}
