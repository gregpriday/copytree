/**
 * E2E Test Utilities
 *
 * Helper functions for running CLI commands and normalizing output
 * for deterministic golden file comparisons.
 */

import path from 'path';
import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';
import { normalizeForGolden } from '../helpers/determinism.js';

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

  // 3. Remove duplicate progress lines (caused by \r overwrites)
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
    uniqueLines.push(line);
    lastLine = line;
  }
  output = uniqueLines.join('\n');

  // 4. Apply comprehensive normalization (paths, timestamps, IDs, metrics)
  output = normalizeForGolden(output, {
    basePath: options.projectRoot || process.cwd(),
    normalizeAll: true,
  });

  // 5. Normalize Git-specific data
  output = normalizeGitData(output);

  // 6. Normalize Windows drive letters
  output = output.replace(/[A-Z]:\\/g, '/');

  // 7. Sort tree lines if requested (for cross-OS determinism)
  if (options.sortTreeLines) {
    output = sortTreeOutput(output);
  }

  // 8. Final cleanup: trim trailing whitespace, normalize final newline
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
 * Sort tree output lines for deterministic comparison
 *
 * Only sorts the tree structure lines, preserving header/footer
 *
 * @param {string} output - Tree output
 * @returns {string} Sorted output
 */
function sortTreeOutput(output) {
  const lines = output.split('\n');
  const headerEndIndex = lines.findIndex((line) => line.match(/^[├└│]/));

  if (headerEndIndex === -1) {
    // No tree structure found, return as-is
    return output;
  }

  const header = lines.slice(0, headerEndIndex);
  const treeLines = lines.slice(headerEndIndex);

  // Separate tree lines from footer (empty lines at end)
  let footerStartIndex = treeLines.length;
  for (let i = treeLines.length - 1; i >= 0; i--) {
    if (treeLines[i].trim() !== '') {
      footerStartIndex = i + 1;
      break;
    }
  }

  const tree = treeLines.slice(0, footerStartIndex);
  const footer = treeLines.slice(footerStartIndex);

  // Sort tree lines (preserving indentation structure)
  const sorted = tree.sort((a, b) => {
    // Extract the file/folder name without tree characters
    const cleanA = a.replace(/^[├└│─\s]+/, '').trim();
    const cleanB = b.replace(/^[├└│─\s]+/, '').trim();
    return cleanA.localeCompare(cleanB);
  });

  return [...header, ...sorted, ...footer].join('\n');
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
