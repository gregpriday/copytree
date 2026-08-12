import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';
import { isAbortError } from '../utils/errors.js';

// `execFile`, not `exec`: version detection does not need a shell, and starting
// one is a second process plus a round of command-string parsing on a path the
// user may well have put a space in.
const execFileAsync = promisify(execFile);

/** How long a single scan may take before it is stopped. */
const SCAN_TIMEOUT_MS = 10000;

/** How long a terminated child has to exit before it is killed outright. */
const KILL_GRACE_MS = 2000;

/**
 * The most output a single scan may produce.
 *
 * Generous for a findings report, and small enough that a binary writing
 * forever cannot be copied into this process's heap in its entirety.
 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Whether a parsed entry is a finding this codebase can actually act on.
 *
 * Shape matters because of what happens downstream: the redactor locates a
 * secret from its coordinates, and an entry without them is normalised toward
 * the start of the file. A malformed finding therefore does not merely fail —
 * it gets counted as *found and redacted* while the real secret stays in the
 * document, which reads as successful protection in the statistics.
 *
 * @param {*} entry - Parsed array element
 * @returns {boolean} True when the entry can be located and redacted
 */
function isUsableFinding(entry) {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    !Array.isArray(entry) &&
    Number.isInteger(entry.StartLine)
  );
}

/**
 * Parse a Gitleaks findings report.
 *
 * The distinction this preserves is between *no findings* and *findings we
 * could not read*. Collapsing the two is how a scanner that said "secrets
 * found" produces a clean result.
 *
 * `detected` is the exit code's verdict. When Gitleaks has said it found
 * something, an empty list is not an answer — it is the same silence as an
 * unparseable one, and treating `[]`, `null` or blank output as "clean" there
 * reintroduces exactly the fail-open this function exists to close.
 *
 * @param {string} stdout - Raw report
 * @param {boolean} [detected=false] - Whether the exit code reported findings
 * @returns {Array|null} Findings, or null when the report cannot be trusted
 */
function parseFindings(stdout, detected = false) {
  const text = (stdout ?? '').trim();

  if (!text) {
    // Gitleaks writes nothing when it has nothing to report — but only a clean
    // exit makes that claim.
    return detected ? null : [];
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // Gitleaks emits `null` rather than `[]` for an empty report in some
  // versions. Same rule: believable on a clean exit, not on a detection.
  if (parsed === null) return detected ? null : [];
  if (!Array.isArray(parsed)) return null;
  if (!parsed.every(isUsableFinding)) return null;
  // "Found secrets" and "here are none of them" cannot both be true.
  if (detected && parsed.length === 0) return null;

  return parsed;
}

/**
 * Render stderr for an error message, bounded and stripped of control bytes.
 *
 * @param {string} stderr - Captured stderr
 * @returns {string} Message fragment
 */
function describeStderr(stderr) {
  // Deliberately says almost nothing.
  //
  // This string ends up in `stats.secretsGuard.degraded.reason` and on the
  // user's terminal, and its source is a program whose entire subject is
  // secrets — a custom rule set, a debug log level or a misconfiguration can
  // put a matched value on stderr. Heuristic redaction would leak any format
  // the heuristic does not recognise, which is the wrong side to be wrong on.
  //
  // The full stderr is available at debug level, where the reader has asked
  // for it and it is not being copied into a statistics object.
  const text = (stderr ?? '').trim();
  if (!text) return '';

  logger.debug('Gitleaks stderr', { stderr: text.slice(0, 4000) });
  return ' (see the debug log for the scanner output)';
}

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
   * @param {Object} [options={}] - Scan options
   * @param {AbortSignal} [options.signal] - Cancels the scan and stops the child
   * @returns {Promise<GitleaksFinding[]>} Array of findings
   * @throws {Error} If gitleaks execution fails, or reports findings it cannot serialize
   */
  async scanString(content, logicalPath = 'stdin', options = {}) {
    // A scanner that has already failed operationally fails the same way again.
    // Rethrowing the original keeps the caller's fallback path identical to the
    // first failure, without paying for another process to rediscover it.
    if (this.broken) throw this.broken;

    // Version detection and argument assembly are resolved once per adapter,
    // not once per file.
    const { args } = await this._scanArgs();

    try {
      const findings = await this._executeGitleaks(args, content, options.signal);

      // Remap File field to logical path
      return findings.map((finding) => ({
        ...finding,
        File: logicalPath,
      }));
    } catch (error) {
      // Exit 1 means Gitleaks found secrets. The findings are on stdout.
      if (error.code === 1) {
        const findings = parseFindings(error.stdout, true);

        // `null` means Gitleaks said "secrets found" and we could not read
        // which ones. This used to return `[]` — turning the scanner's own
        // detection into a clean verdict because of a serialization problem,
        // which is the exact shape of a security failure: the guard reports
        // success precisely when it has most reason not to.
        //
        // Throwing hands the file to the caller's fallback scanner and marks
        // the run degraded. A weaker second opinion is a defensible answer.
        // Silence is not.
        if (findings === null) {
          throw this._fail(
            'Gitleaks reported findings but its report was empty or unreadable; ' +
              'the file was re-scanned with the built-in scanner',
            error,
          );
        }

        return findings.map((finding) => ({ ...finding, File: logicalPath }));
      }

      // A cancellation is the caller's decision, not a scanner failure. Turning
      // it into one would open the circuit, fall back to the built-in scanner,
      // and mark the run degraded — for a run that is being abandoned anyway.
      if (isAbortError(error)) throw error;

      // Anything else is operational — a spawn failure, an unparseable exit
      // code, a timeout. It will recur for every remaining file, so the circuit
      // opens here and this is the last process this adapter starts.
      throw this._fail(`Gitleaks execution failed: ${error.message}`, error);
    }
  }

  /**
   * Open the circuit breaker and produce the failure to throw.
   *
   * @param {string} message - What went wrong
   * @param {Error} cause - Underlying failure
   * @returns {Error} The recorded failure
   * @private
   */
  _fail(message, cause) {
    // The cause is deliberately NOT attached. A Gitleaks error carries its
    // stdout, and stdout is the findings report — which can contain the matched
    // secret. An error object reaches logs, `stats`, and whatever the embedding
    // application does with both, and structured loggers serialise `cause`
    // along with everything hanging off it.
    this.broken = new Error(message);
    if (cause?.code !== undefined) this.broken.exitCode = cause.code;
    return this.broken;
  }

  /**
   * Execute gitleaks command and capture JSON output
   * @private
   * @param {string[]} args - Command arguments
   * @param {string} stdin - Content to pipe to stdin
   * @returns {Promise<GitleaksFinding[]>} Parsed findings
   */
  async _executeGitleaks(args, stdin, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('Gitleaks scan aborted'));
        return;
      }

      const child = spawn(this.binaryPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      let overflowed = false;
      let outcome = null;
      let hardKill = null;

      /**
       * Ask the child to stop, then insist.
       *
       * A `kill()` with no escalation is a request a wedged process is free to
       * ignore, which turns a hung scan into a hung run.
       *
       * @param {string} reason - Why it is being stopped
       */
      const terminate = (reason) => {
        outcome ??= reason;
        try {
          child.kill('SIGTERM');
        } catch {
          // Already gone.
        }
        hardKill ??= setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Already gone.
          }
        }, KILL_GRACE_MS).unref();
      };

      const timer = setTimeout(() => terminate('timeout'), SCAN_TIMEOUT_MS);
      const onAbort = () => terminate('aborted');
      signal?.addEventListener('abort', onAbort, { once: true });

      /**
       * Accumulate a stream, refusing to grow without bound.
       *
       * A misconfigured binary that writes forever would otherwise be copied
       * into this process's heap in its entirety.
       *
       * @param {string} name - Which buffer to append to
       * @returns {Function} Data handler
       */
      const collect = (name) => (data) => {
        if (overflowed) return;
        const text = data.toString();
        if (name === 'stdout') {
          if (stdout.length + text.length > MAX_OUTPUT_BYTES) {
            overflowed = true;
            terminate('overflow');
            return;
          }
          stdout += text;
        } else {
          if (stderr.length + text.length > MAX_OUTPUT_BYTES) return;
          stderr += text;
        }
      };

      child.stdout.on('data', collect('stdout'));
      child.stderr.on('data', collect('stderr'));

      /** Release the timers and listeners this scan owns. */
      const cleanup = () => {
        clearTimeout(timer);
        if (hardKill) clearTimeout(hardKill);
        signal?.removeEventListener('abort', onAbort);
      };

      child.on('error', (error) => {
        cleanup();
        reject(new Error(`Failed to spawn gitleaks: ${error.message}`));
      });

      child.on('close', (code) => {
        cleanup();

        if (outcome === 'aborted') {
          reject(signal?.reason ?? new Error('Gitleaks scan aborted'));
          return;
        }
        if (outcome === 'timeout') {
          reject(new Error(`Gitleaks scan timed out after ${SCAN_TIMEOUT_MS / 1000} seconds`));
          return;
        }
        if (outcome === 'overflow') {
          reject(new Error(`Gitleaks produced more than ${MAX_OUTPUT_BYTES} bytes of output`));
          return;
        }

        if (code === 0) {
          const findings = parseFindings(stdout);

          // Unreadable output on a nominal success is a scanner malfunction,
          // not a clean scan. Returning `[]` here asserted "this file contains
          // no secrets" on the strength of output nobody could read.
          if (findings === null) {
            reject(new Error('Gitleaks exited cleanly but its report could not be parsed'));
            return;
          }

          resolve(findings);
          return;
        }

        if (code === 1) {
          // Secrets found. Expected, and the findings are on stdout.
          const error = new Error('Secrets detected');
          error.code = code;
          error.stdout = stdout;
          reject(error);
          return;
        }

        // Only stderr, never stdout: stdout is the findings report, and a
        // finding can carry the secret it matched. An error message ends up in
        // logs, in `stats`, and in whatever the embedding application does with
        // both.
        reject(new Error(`Gitleaks exited with code ${code}${describeStderr(stderr)}`));
      });

      child.stdin.on('error', () => {
        // A child that died before reading stdin gives us EPIPE. The exit code
        // is the real story; this would just race it.
      });
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
