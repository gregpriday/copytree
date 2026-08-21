/**
 * E2E Test Utilities
 *
 * Helper functions for running CLI commands and normalizing output
 * for deterministic golden file comparisons.
 */

import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';
import { normalizeForGolden } from '../helpers/determinism.js';

const { version: COPYTREE_VERSION } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
);

/**
 * Run the CopyTree CLI with given arguments
 *
 * @param {string[]} args - CLI arguments
 * @param {object} options - Execution options
 * @param {string} options.cwd - Working directory
 * @param {object} options.env - Environment variables
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
export function runCli(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const cli = path.resolve(process.cwd(), 'bin/copytree.js');

    const child = spawn(node, [cli, ...args], {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TZ: 'UTC',
        LANG: 'C',
        LC_ALL: 'C',
        // A repository cache the suite owns. `os.homedir()` ignores `HOME` on
        // macOS, so without this a cache command run from an end-to-end test
        // reaches the developer's real clones.
        COPYTREE_REPO_CACHE_PATH: options.repoCache || path.join(os.tmpdir(), 'copytree-e2e-repos'),
        // Suppress info/warn log output in E2E tests: these tests verify
        // stdout program output (golden files), not log verbosity.
        // Error-level messages still appear so that negative test cases work.
        COPYTREE_LOG_LEVEL: 'error',
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Normalize CLI output for golden file comparison
 *
 * This applies comprehensive normalization including:
 * - ANSI escape codes removal
 * - Path normalization
 * - Timestamp/UUID/hash replacement
 * - Line ending normalization
 * - Git-specific data normalization
 *
 * @param {string} text - Raw CLI output
 * @param {object} options - Normalization options
 * @param {string} options.projectRoot - Project root path to normalize
 * @param {boolean} options.sortTreeLines - Sort tree output lines (for determinism)
 * @returns {string} Normalized output
 */
export function normalize(text, options = {}) {
  if (!text) return '';

  let output = text;

  // 1. Strip ANSI escape codes (colors, spinners, progress)
  output = stripAnsi(output);

  // 2. Remove TTY overwrites (carriage returns from progress updates)
  output = output.replace(/\r[^\n]/g, '\n');

  // 3. Remove UI status/spinner lines (⏳, ✅, etc.)
  const uiPatterns = [
    /^[⏳✅❌⚠️✓✗🔍📁📝🖥️]\s+.*$/gm, // Status messages with emoji
    /^Loading profile.*$/gm,
    /^Validating path.*$/gm,
    /^Starting pipeline.*$/gm,
    /^\d+ files? \[.*\] (copied to clipboard|displayed to terminal|written to).*$/gm,
  ];

  for (const pattern of uiPatterns) {
    output = output.replace(pattern, '');
  }

  // 4. Remove duplicate progress lines (caused by \r overwrites)
  const lines = output.split('\n');
  const uniqueLines = [];
  let lastLine = null;

  for (const line of lines) {
    // Skip empty lines that appear after progress updates
    if (line.trim() === '' && lastLine && lastLine.includes('%')) {
      continue;
    }
    // Skip duplicate progress lines
    if (line === lastLine && line.includes('%')) {
      continue;
    }
    // Skip ANSI escape sequences that weren't removed. Anchored to a complete
    // CSI remnant (`[2K`, `[?25h`) rather than "starts with a bracket and some
    // capitals", which also swallowed every `[ERR_...]` code line the error
    // contract requires.
    if (line.match(/^\[[?\d;]*[A-Za-z]$/)) {
      continue;
    }
    uniqueLines.push(line);
    lastLine = line;
  }
  output = uniqueLines.join('\n');

  // 5. Normalize Windows paths in basePath only (not in output content)
  // This prevents breaking JSON escape sequences like \n
  let basePath = options.projectRoot || process.cwd();
  basePath = basePath.replace(/\\/g, '/'); // Backslashes to forward slashes
  basePath = basePath.replace(/\/+/g, '/'); // Multiple slashes to single
  basePath = basePath.replace(/^[A-Z]:\/+/g, '/'); // D:/a -> /a

  // 6. Apply comprehensive normalization (paths, timestamps, IDs, metrics)
  output = normalizeForGolden(output, {
    basePath,
    normalizeAll: true,
  });

  // 7. Normalize CopyTree version (prevents golden file breakage on version bumps)
  const escapedVersion = COPYTREE_VERSION.replace(/\./g, '\\.');
  output = output.replace(new RegExp(`"${escapedVersion}"`, 'g'), '"<VERSION>"');
  // Also normalize the "0.0.0" fallback version used when package.json version is unresolvable
  output = output.replace(/"version":\s*"0\.0\.0"/g, '"version": "<VERSION>"');

  // 8. Normalize Windows backslashes in file paths
  // Matches patterns like path="@src\test.js" and converts to path="@src/test.js"
  output = output.replace(/(path=["']@[^"']*?)\\+([^"']*?["'])/g, '$1/$2');
  // Also handle Windows paths in JSON "path": "src\test.js" and "directory": "D:\a\b"
  output = output.replace(/("(?:path|directory)"\s*:\s*"[^"]*?)\\+([^"]*?")/g, '$1/$2');
  // Markdown headers like ### @src\test.js → ### @src/test.js
  output = output.replace(/(###\s+@[^\n]*?)\\+([^\n]*)/g, '$1/$2');
  // Markdown file comments like <!-- copytree:file-begin path="@src\test.js" -->
  output = output.replace(/(<!--[^>]*?path=["']@[^"']*?)\\+([^"']*?["'][^>]*?-->)/g, '$1/$2');
  // SARIF format "uri": "file:///src\test.js" → "file:///src/test.js"
  output = output.replace(/("uri"\s*:\s*"[^"]*?)\\+([^"]*?")/g, '$1/$2');
  // SARIF message text: "File discovered: src\test.js" → "File discovered: src/test.js"
  output = output.replace(/("text"\s*:\s*"[^"]*?)\\+([^"]*?")/g, '$1/$2');
  // SARIF workingDirectory: "file:///<PROJECT_ROOT>" → "file://<PROJECT_ROOT>"
  output = output.replace(/"uri":\s*"file:\/\/\/(<PROJECT_ROOT>)"/g, '"uri": "file://$1"');

  // 9. Normalize Git-specific data
  output = normalizeGitData(output);

  // 10. Sort tree lines if requested (for cross-OS determinism)
  if (options.sortTreeLines) {
    output = sortTreeOutput(output);
  }

  // 11. Final cleanup: trim trailing whitespace, normalize final newline
  output = output
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

  return output;
}

/**
 * Normalize Git-specific data (SHAs, branches, status)
 *
 * @param {string} content - Content to normalize
 * @returns {string} Normalized content
 */
function normalizeGitData(content) {
  let normalized = content;

  // Git SHA hashes (7-40 hex chars, with word boundaries)
  normalized = normalized.replace(/\b[0-9a-f]{7,40}\b/gi, '<SHA>');

  // Git branch names in various contexts
  normalized = normalized.replace(/branch:\s*["']?[^"'\s]+["']?/gi, 'branch: <BRANCH>');
  normalized = normalized.replace(/on branch\s+\S+/gi, 'on branch <BRANCH>');

  // Git status indicators (preserve the indicator, normalize the file path)
  // This is already handled by path normalization, but we can add specific patterns

  return normalized;
}

/**
 * Sort the directory-tree block for deterministic comparison.
 *
 * The tree's sibling order depends on filesystem enumeration, which differs
 * between platforms, so it is sorted before comparison. Only the tree block is:
 * the previous implementation took every line from the first tree glyph to the
 * last non-empty line and sorted all of it, which in XML and Markdown output
 * meant the closing tags and every `<ct:file>` element were swept in and
 * reordered too. The resulting goldens were not valid XML — `</ct:directory>`
 * landed third, `<ct:files>` closed before it opened — so they could not detect
 * a structural regression, which is the one thing they exist for.
 *
 * The block is now the maximal run of consecutive tree lines. Whatever precedes
 * the first glyph (an opening tag) and follows the last entry (a closing tag)
 * belongs to the line's position, not to the entry, so it stays put while the
 * entries between them move.
 *
 * @param {string} output - Output containing a directory tree
 * @returns {string} Output with the tree block sorted
 */
function sortTreeOutput(output) {
  const lines = output.split('\n');
  const TREE_GLYPH = /[├└│]/;

  const start = lines.findIndex((line) => TREE_GLYPH.test(line));
  if (start === -1) return output;

  // Extend only while lines are themselves tree lines. A line whose first
  // non-whitespace character is not a tree glyph ends the block.
  let end = start;
  while (end + 1 < lines.length && /^\s*[├└│]/.test(lines[end + 1])) {
    end += 1;
  }

  const first = lines[start];
  const prefix = first.slice(0, first.search(TREE_GLYPH));

  // A closing tag on the final entry's line is part of the container, not the
  // entry, so it must not travel with it when the entries are reordered.
  const last = lines[end];
  const suffixAt = last.indexOf('<');
  const suffix = suffixAt === -1 ? '' : last.slice(suffixAt);

  const entries = lines.slice(start, end + 1).map((line, index) => {
    let entry = line;
    if (index === 0) entry = entry.slice(prefix.length);
    if (index === end - start && suffix) entry = entry.slice(0, entry.length - suffix.length);
    return entry;
  });

  entries.sort((a, b) => {
    const cleanA = a.replace(/^[├└│─\s]+/, '').trim();
    const cleanB = b.replace(/^[├└│─\s]+/, '').trim();
    return cleanA.localeCompare(cleanB);
  });

  const sorted = entries.map((entry, index) => {
    if (index === 0) return prefix + entry;
    if (index === entries.length - 1) return entry + suffix;
    return entry;
  });

  return [...lines.slice(0, start), ...sorted, ...lines.slice(end + 1)].join('\n');
}

/**
 * Setup Git environment for tests
 *
 * Returns environment variables that ensure deterministic Git output
 *
 * @returns {object} Git environment variables
 */
export function getGitEnv() {
  return {
    GIT_AUTHOR_NAME: 'copytree-bot',
    GIT_AUTHOR_EMAIL: 'bot@example.com',
    GIT_COMMITTER_NAME: 'copytree-bot',
    GIT_COMMITTER_EMAIL: 'bot@example.com',
    GIT_AUTHOR_DATE: '2025-01-15T12:00:00Z',
    GIT_COMMITTER_DATE: '2025-01-15T12:00:00Z',
  };
}
