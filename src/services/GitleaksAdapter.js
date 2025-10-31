import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

/**
 * Adapter for Gitleaks secret scanning engine
 *
 * Uses Gitleaks stdin mode for in-memory scanning without temp files.
 * Supports JSON output and portable stdout reporting.
 *
 * @see https://github.com/gitleaks/gitleaks
 */
class GitleaksAdapter {
  /**
   * @param {Object} options - Configuration options
   * @param {string} [options.binaryPath='gitleaks'] - Path to gitleaks binary
   * @param {string} [options.configPath] - Path to .gitleaks.toml config file
   * @param {string[]} [options.extraArgs=[]] - Additional CLI arguments
   * @param {string} [options.logLevel='fatal'] - Gitleaks log level
   */
  constructor(options = {}) {
    this.binaryPath = options.binaryPath || 'gitleaks';
    this.configPath = options.configPath || null;
    this.extraArgs = options.extraArgs || [];
    this.logLevel = options.logLevel || 'fatal';
    this._available = null; // Cache availability check
  }

  /**
   * Check if gitleaks binary is available
   * @returns {Promise<boolean>} True if gitleaks is installed and accessible
   */
  async isAvailable() {
    if (this._available !== null) {
      return this._available;
    }

    try {
      await execAsync(`"${this.binaryPath}" version`, { timeout: 5000 });
      this._available = true;
      return true;
    } catch (error) {
      this._available = false;
      return false;
    }
  }

  /**
   * Scan string content for secrets using gitleaks stdin mode
   *
   * @param {string} content - File content to scan
   * @param {string} logicalPath - Logical file path for reporting
   * @returns {Promise<GitleaksFinding[]>} Array of findings
   * @throws {Error} If gitleaks execution fails
   */
  async scanString(content, logicalPath = 'stdin') {
    // Build command arguments
    const args = [
      'stdin',
      '--report-format',
      'json',
      '--report-path',
      '-', // stdout
      '--no-banner',
      '--no-color',
      '--log-level',
      this.logLevel,
      '--redact=100', // Never echo secrets in logs
    ];

    // Add custom config if specified
    if (this.configPath) {
      args.push('-c', this.configPath);
    }

    // Add any extra arguments
    if (this.extraArgs.length > 0) {
      args.push(...this.extraArgs);
    }

    try {
      const findings = await this._executeGitleaks(args, content);

      // Remap File field to logical path
      return findings.map((finding) => ({
        ...finding,
        File: logicalPath,
      }));
    } catch (error) {
      // If gitleaks exits with code 1, it means secrets were found
      // The JSON output should still be valid
      if (error.code === 1 && error.stdout) {
        try {
          const findings = JSON.parse(error.stdout);
          return Array.isArray(findings)
            ? findings.map((f) => ({
                ...f,
                File: logicalPath,
              }))
            : [];
        } catch (parseError) {
          // If we can't parse the output, treat it as no findings
          return [];
        }
      }

      // For other errors, rethrow
      throw new Error(`Gitleaks execution failed: ${error.message}`);
    }
  }

  /**
   * Execute gitleaks command and capture JSON output
   * @private
   * @param {string[]} args - Command arguments
   * @param {string} stdin - Content to pipe to stdin
   * @returns {Promise<GitleaksFinding[]>} Parsed findings
   */
  async _executeGitleaks(args, stdin) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn gitleaks: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          // No secrets found
          try {
            const findings = stdout.trim() ? JSON.parse(stdout) : [];
            resolve(Array.isArray(findings) ? findings : []);
          } catch (error) {
            // Empty or invalid JSON means no findings
            resolve([]);
          }
        } else if (code === 1) {
          // Secrets found - this is expected
          // Return error with stdout so caller can parse findings
          const error = new Error('Secrets detected');
          error.code = code;
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else {
          // Actual error
          reject(new Error(`Gitleaks exited with code ${code}: ${stderr || stdout}`));
        }
      });

      // Write content to stdin
      child.stdin.write(stdin, 'utf8');
      child.stdin.end();
    });
  }

  /**
   * Get version of installed gitleaks binary
   * @returns {Promise<string|null>} Version string or null if not available
   */
  async getVersion() {
    try {
      const { stdout } = await execAsync(`"${this.binaryPath}" version`, { timeout: 5000 });
      // Parse version from output (format: "v8.19.0" or similar)
      const match = stdout.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : stdout.trim();
    } catch (error) {
      return null;
    }
  }
}

/**
 * @typedef {Object} GitleaksFinding
 * @property {string} RuleID - Rule identifier (e.g., 'aws-access-key')
 * @property {string} [Description] - Human-readable description
 * @property {string} [File] - File path (remapped from 'stdin')
 * @property {number} StartLine - Starting line number (1-indexed)
 * @property {number} EndLine - Ending line number (1-indexed)
 * @property {number} StartColumn - Starting column (1-indexed)
 * @property {number} EndColumn - Ending column (1-indexed)
 * @property {string} [Match] - Matched string (may be redacted)
 * @property {string} [Secret] - Raw secret (NEVER log this)
 * @property {string[]} [Tags] - Rule tags (e.g., ['high', 'aws'])
 */

export default GitleaksAdapter;
