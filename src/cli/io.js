/**
 * Stream ownership for the query commands.
 *
 * stdout carries the requested payload and nothing else. stderr carries
 * progress, warnings, deprecation notices and completion. That boundary is what
 * makes `copytree plan . --format json | jq` work while diagnostics stay
 * visible, and it is normative for every command, not only for copy.
 */

import path from 'path';
import fs from '../utils/fsx.js';
import { logger } from '../utils/logger.js';

/**
 * Point the shared logger at stderr, honouring the caller's severity and format.
 *
 * @param {Object} feedback - Canonical feedback request
 */
function configureLogger(feedback) {
  const options = { destination: 'stderr' };
  if (feedback.logLevel) options.level = feedback.logLevel;
  if (feedback.logFormat) options.format = feedback.logFormat;
  if (feedback.color === false) options.colorize = 'never';
  if (feedback.quiet) options.level = 'error';
  logger.configure(options);
}

/**
 * Whether ANSI colour is permitted.
 *
 * `NO_COLOR` is honoured because it is the convention, `--no-color` because it
 * is explicit, and a non-TTY because nobody pipes escape codes on purpose.
 *
 * @param {Object} [feedback={}] - Feedback request
 * @param {NodeJS.WriteStream} [stream=process.stderr] - Target stream
 * @returns {boolean} True when colour may be used
 */
export function colorAllowed(feedback = {}, stream = process.stderr) {
  if (feedback.color === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(stream.isTTY);
}

/**
 * Write the requested payload where it was asked to go.
 *
 * @param {string} text - Payload
 * @param {Object} [options={}] - Destination
 * @param {string|null} [options.output] - File path, or null for stdout
 * @returns {Promise<{destination: 'stdout'|'file', path: string|null}>} What happened
 */
export async function writePayload(text, options = {}) {
  const body = text.endsWith('\n') ? text : `${text}\n`;

  if (!options.output || options.output === '-') {
    process.stdout.write(body);
    return { destination: 'stdout', path: null };
  }

  const target = path.resolve(options.output);
  await fs.ensureDir(path.dirname(target));
  await fs.writeFile(target, body, 'utf8');
  return { destination: 'file', path: target };
}

/**
 * A minimal feedback channel for the query commands.
 *
 * Deliberately not the run reporter: these commands have no phases, no live
 * line and no completion model. They emit a handful of lines, and building a
 * progress display for them would be machinery in search of a purpose.
 */
export class Feedback {
  /**
   * @param {Object} [options={}] - Options
   * @param {Object} [options.feedback] - Canonical feedback request
   * @param {NodeJS.WriteStream} [options.stream] - Target stream
   */
  constructor(options = {}) {
    const feedback = options.feedback || {};
    this.stream = options.stream || process.stderr;

    // Stage and service logs are feedback, not payload. Pinned here because
    // every command that has any output at all builds one of these, and stdout
    // belongs to the requested document.
    configureLogger(feedback);
    this.quiet = feedback.quiet === true;
    this.verbose = feedback.verbose === true;
    this.jsonMode = feedback.logFormat === 'json';
    // `error` suppresses warn-level notices, which is how a deprecation stays
    // out of a golden-file test's stderr while still reaching an ordinary user.
    this.level = feedback.logLevel ?? (this.quiet ? 'error' : 'info');
  }

  /**
   * Whether a severity passes the current floor.
   * @param {'error'|'warn'|'info'|'debug'} level - Severity
   * @returns {boolean} True when it should be written
   */
  enabled(level) {
    const order = { error: 0, warn: 1, info: 2, debug: 3 };
    return (order[level] ?? 2) <= (order[this.level] ?? 2);
  }

  /**
   * Write one line of feedback.
   * @param {string} message - Message text
   * @param {Object} [options={}] - Options
   * @param {'error'|'warn'|'info'|'debug'} [options.level='info'] - Severity
   * @param {string} [options.event] - Event name for JSON feedback
   * @param {Object} [options.data] - Extra fields for JSON feedback
   */
  write(message, options = {}) {
    const level = options.level ?? 'info';
    if (!this.enabled(level)) return;

    if (this.jsonMode) {
      this.stream.write(
        `${JSON.stringify({
          schema: 'copytree-feedback@1',
          event:
            options.event ?? (level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'note'),
          level,
          message,
          ...(options.data || {}),
        })}\n`,
      );
      return;
    }

    this.stream.write(`${message}\n`);
  }

  /**
   * Write a line only when the caller asked for run detail.
   *
   * `--verbose` on a query command means the same thing it means on a copy:
   * say what was resolved, how much of it there was, and how long it took.
   * Without this the flag parsed, was stored, and was read by nothing.
   *
   * @param {string} message - Detail line
   * @param {Object} [options={}] - Options forwarded to {@link Feedback#write}
   */
  detail(message, options = {}) {
    if (!this.verbose) return;
    this.write(message, { event: 'detail', ...options });
  }

  /**
   * Emit the deprecation and security notices collected during parsing.
   * @param {Array<{kind: string, message: string, code?: string}>} notices - Notices
   */
  notices(notices = []) {
    for (const notice of notices) {
      this.write(notice.message, {
        level: 'warn',
        event: notice.kind === 'security' ? 'warning' : 'deprecation',
        data: notice.code ? { code: notice.code } : {},
      });
    }
  }
}
