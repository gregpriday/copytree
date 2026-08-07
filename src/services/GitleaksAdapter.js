import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

// `execFile`, not `exec`: version detection does not need a shell, and starting
// one is a second process plus a round of command-string parsing on a path the
// user may well have put a space in.
const execFileAsync = promisify(execFile);

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
    this._versionPromise = null; // Cache `gitleaks version`, once per adapter
    this._scanArgsPromise = null; // Cache the derived argument vector

    // Circuit breaker. An operational failure — the binary is incompatible,
    // missing a config it was pointed at, or gone from disk mid-run — will fail
    // identically for every remaining file. Without this, a thousand-file
    // repository spawns a thousand doomed processes and logs a thousand
    // warnings, turning a scanner misconfiguration into the slowest possible
    // run. `broken` is set once; the caller then falls back to the built-in
    // scanner for the rest of the run.
    this.broken = null;
  }

  /**
   * Whether the scanner has failed operationally and should not be retried.
   *
   * @returns {Error|null} The failure that opened the circuit, or null
   */
  get failure() {
    return this.broken;
  }

  /**
   * Check if gitleaks binary is available
   * @returns {Promise<boolean>} True if gitleaks is installed and accessible
   */
  async isAvailable() {
    if (this._available !== null) {
      return this._available;
    }

    // Availability and version are the same question asked twice: both ran
    // `gitleaks version`, so every scanned run spawned the binary once to learn
    // it existed and again to learn what it was. Asking once answers both.
    this._available = (await this.getVersion()) !== null;
    return this._available;
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
    // A scanner that has already failed operationally fails the same way again.
    // Rethrowing the original keeps the caller's fallback path identical to the
    // first failure, without paying for another process to rediscover it.
    if (this.broken) throw this.broken;

    // Version detection and argument assembly are resolved once per adapter,
    // not once per file.
    const { args } = await this._scanArgs();

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

      // Anything else is operational — a spawn failure, an unparseable exit
      // code, a timeout. It will recur for every remaining file, so the circuit
      // opens here and this is the last process this adapter starts.
      this.broken = new Error(`Gitleaks execution failed: ${error.message}`, { cause: error });
      throw this.broken;
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
      let timedOut = false;

      // Set timeout to kill hung scans
      const timeoutMs = 10000; // 10 seconds
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch (e) {
          // Process may have already exited
        }
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn gitleaks: ${error.message}`));
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (timedOut) {
          reject(new Error('Gitleaks scan timed out after 10 seconds'));
          return;
        }
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
    // One `gitleaks version` per adapter, not one per file. This used to be
    // called from `scanString()`, so scanning a thousand files spawned a
    // thousand extra processes purely to re-derive an answer that cannot change
    // while the process is running.
    if (this._versionPromise) return this._versionPromise;

    this._versionPromise = (async () => {
      try {
        const { stdout } = await execFileAsync(this.binaryPath, ['version'], { timeout: 5000 });
        // Parse version from output (format: "v8.19.0" or similar)
        const match = stdout.match(/v?(\d+\.\d+\.\d+)/);
        return match ? match[1] : stdout.trim();
      } catch (error) {
        return null;
      }
    })();

    return this._versionPromise;
  }

  /**
   * Resolve the capability flags and static argument list for this binary, once.
   *
   * The argument vector depends only on the binary's version and this adapter's
   * own options, none of which vary per file, so it is built a single time and
   * reused for every scan.
   *
   * @returns {Promise<{args: string[]}>} Arguments common to every scan
   * @private
   */
  async _scanArgs() {
    if (this._scanArgsPromise) return this._scanArgsPromise;

    this._scanArgsPromise = (async () => {
      const version = (await this.getVersion()) || '';
      const modern = /^8\.(19|[2-9]\d)\./.test(version) || /^9\./.test(version);

      const args = modern ? ['stdin'] : ['detect', '--no-git'];

      args.push(
        '--report-format',
        'json',
        '--report-path',
        '-', // stdout
        '--no-banner',
        '--no-color',
        '--log-level',
        this.logLevel,
        // Newer versions take a percentage; older ones take a boolean flag.
        modern ? '--redact=100' : '--redact',
      );

      if (this.configPath) {
        args.push('-c', this.configPath);
      }

      if (this.extraArgs.length > 0) {
        args.push(...this.extraArgs);
      }

      return { args };
    })();

    return this._scanArgsPromise;
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
