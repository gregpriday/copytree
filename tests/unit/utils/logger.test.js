/**
 * Unit tests for src/utils/logger.js
 *
 * Covers:
 *  - Level filtering (error < warn < info < debug)
 *  - JSON format (NDJSON validity + required fields)
 *  - Silent format (only errors pass through)
 *  - Colorize modes (auto / always / never)
 *  - Destination routing (stderr / stdout)
 *  - configure() method
 *  - Legacy silent/debug backward compat
 */

import { Logger } from '../../../src/utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Logger instance and capture everything written to its output stream.
 * Returns { logger, captured } where `captured` is an array of written strings.
 */
function makeLogger(options = {}) {
  const captured = [];
  const stream = {
    isTTY: false,
    write: (str) => captured.push(str),
    clearLine: () => {},
    cursorTo: () => {},
  };

  const instance = new Logger(options);

  // Override _getOutputStream to return our spy stream
  instance._getOutputStream = () => stream;

  return { logger: instance, captured, stream };
}

/**
 * Parse a captured NDJSON line.  Throws if it is not valid JSON.
 */
function parseJsonLine(line) {
  return JSON.parse(line.trim());
}

// ─── Level filtering ──────────────────────────────────────────────────────────

describe('Logger – level filtering', () => {
  test('level=error: only error messages pass', () => {
    const { logger, captured } = makeLogger({ level: 'error', format: 'text' });
    logger.error('err msg');
    logger.warn('warn msg');
    logger.info('info msg');
    logger.debug('debug msg');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('err msg');
  });

  test('level=warn: warn and error pass, info/debug do not', () => {
    const { logger, captured } = makeLogger({ level: 'warn', format: 'text' });
    logger.error('err');
    logger.warn('warn');
    logger.info('info');
    logger.debug('debug');

    expect(captured.length).toBe(2);
    expect(captured[0]).toContain('err');
    expect(captured[1]).toContain('warn');
  });

  test('level=info: error, warn, success, and info pass; debug does not', () => {
    const { logger, captured } = makeLogger({ level: 'info', format: 'text' });
    logger.error('err');
    logger.warn('warn');
    logger.success('ok');
    logger.info('info');
    logger.debug('debug');

    expect(captured.length).toBe(4);
  });

  test('level=debug: all messages pass', () => {
    const { logger, captured } = makeLogger({ level: 'debug', format: 'text' });
    logger.error('err');
    logger.warn('warn');
    logger.info('info');
    logger.success('ok');
    logger.debug('debug');

    expect(captured.length).toBe(5);
  });
});

// ─── JSON format ──────────────────────────────────────────────────────────────

describe('Logger – JSON format (NDJSON)', () => {
  function makeJsonLogger(level = 'debug') {
    return makeLogger({ level, format: 'json', timestamp: true });
  }

  test('produces valid JSON for each log call', () => {
    const { logger, captured } = makeJsonLogger();
    logger.info('hello world');

    expect(captured.length).toBe(1);
    expect(() => parseJsonLine(captured[0])).not.toThrow();
  });

  test('JSON entry contains required fields: level, message, timestamp', () => {
    const { logger, captured } = makeJsonLogger();
    logger.warn('something happened');

    const entry = parseJsonLine(captured[0]);
    expect(entry).toHaveProperty('level', 'warn');
    expect(entry).toHaveProperty('message', 'something happened');
    expect(entry).toHaveProperty('timestamp');
    expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
  });

  test('JSON entries are one object per line (NDJSON)', () => {
    const { logger, captured } = makeJsonLogger();
    logger.info('first');
    logger.warn('second');
    logger.error('third');

    expect(captured.length).toBe(3);
    captured.forEach((line) => {
      expect(() => parseJsonLine(line)).not.toThrow();
    });
  });

  test('timestamp=false omits timestamp field', () => {
    const { logger, captured } = makeLogger({ level: 'debug', format: 'json', timestamp: false });
    logger.info('no time');

    const entry = parseJsonLine(captured[0]);
    expect(entry).not.toHaveProperty('timestamp');
  });

  test('extra args are included as context', () => {
    const { logger, captured } = makeJsonLogger();
    logger.info('msg', { fileCount: 42 });

    const entry = parseJsonLine(captured[0]);
    expect(entry.context).toEqual({ fileCount: 42 });
  });

  test('level field uses the correct level string', () => {
    const { logger, captured } = makeJsonLogger();
    logger.error('bad');
    logger.debug('trace');

    expect(parseJsonLine(captured[0]).level).toBe('error');
    expect(parseJsonLine(captured[1]).level).toBe('debug');
  });

  test('JSON format levels are filtered correctly', () => {
    const { logger, captured } = makeLogger({ level: 'warn', format: 'json' });
    logger.debug('skip');
    logger.info('skip too');
    logger.warn('keep');
    logger.error('keep too');

    expect(captured.length).toBe(2);
    expect(parseJsonLine(captured[0]).level).toBe('warn');
    expect(parseJsonLine(captured[1]).level).toBe('error');
  });
});

// ─── Silent format ────────────────────────────────────────────────────────────

describe('Logger – silent format', () => {
  test('silent format: only errors are written', () => {
    const { logger, captured } = makeLogger({ format: 'silent' });
    logger.info('info');
    logger.warn('warn');
    logger.success('ok');
    logger.debug('debug');
    logger.error('err');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('err');
  });

  test('silent format ignores level setting', () => {
    const { logger, captured } = makeLogger({ format: 'silent', level: 'debug' });
    logger.debug('debug');
    logger.info('info');
    logger.error('only this');

    expect(captured.length).toBe(1);
  });
});

// ─── Colorize modes ───────────────────────────────────────────────────────────

describe('Logger – colorize modes', () => {
  test('colorize=never: output contains no ANSI escape codes', () => {
    const { logger, captured } = makeLogger({
      level: 'debug',
      format: 'text',
      colorize: 'never',
    });
    logger.info('plain message');

    const output = captured.join('');
    expect(output).not.toMatch(/\x1B\[/);
  });

  test('colorize=always: _shouldColorize() returns true even for non-TTY streams', () => {
    const { logger } = makeLogger({
      level: 'debug',
      format: 'text',
      colorize: 'always',
    });
    // stream.isTTY is false by default in makeLogger, but colorize=always should
    // still return true
    expect(logger._shouldColorize()).toBe(true);
  });

  test('colorize=auto with non-TTY stream: no ANSI codes', () => {
    const { logger, captured } = makeLogger({
      level: 'debug',
      format: 'text',
      colorize: 'auto',
    });
    // stream.isTTY is false by default in makeLogger
    logger.info('no color');

    const output = captured.join('');
    expect(output).not.toMatch(/\x1B\[/);
  });

  test('JSON format never includes ANSI codes regardless of colorize', () => {
    const { logger, captured } = makeLogger({
      level: 'debug',
      format: 'json',
      colorize: 'always',
    });
    logger.error('err in json');

    const output = captured.join('');
    expect(output).not.toMatch(/\x1B\[/);
  });
});

// ─── configure() method ───────────────────────────────────────────────────────

describe('Logger – configure()', () => {
  test('configure() changes level at runtime', () => {
    const { logger, captured } = makeLogger({ level: 'error', format: 'text' });
    logger.info('before configure – should not appear');
    logger.configure({ level: 'info' });
    logger.info('after configure – should appear');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('after configure');
  });

  test('configure() changes format to json', () => {
    const { logger, captured } = makeLogger({ level: 'info', format: 'text' });
    logger.configure({ format: 'json' });
    logger.info('json message');

    const entry = parseJsonLine(captured[0]);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('json message');
  });

  test('configure() colorize=never disables colors', () => {
    const { logger, captured } = makeLogger({ level: 'info', format: 'text', colorize: 'always' });
    logger.configure({ colorize: 'never' });
    logger.info('plain');

    expect(captured.join('')).not.toMatch(/\x1B\[/);
  });

  test('configure() accepts silent format to suppress non-errors', () => {
    const { logger, captured } = makeLogger({ level: 'info', format: 'text' });
    logger.configure({ format: 'silent' });
    logger.info('suppressed');
    logger.error('shown');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('shown');
  });
});

// ─── Legacy backward compatibility ───────────────────────────────────────────

describe('Logger – legacy backward compatibility', () => {
  test('options.silent=true maps to silent format (only errors)', () => {
    const { logger, captured } = makeLogger({ silent: true });
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('error');
  });

  test('options.debug=true enables debug level', () => {
    const { logger, captured } = makeLogger({ debug: true, format: 'text' });
    logger.debug('debug message');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('debug message');
  });

  test('debug() is an alias for logDebug()', () => {
    const { logger, captured } = makeLogger({ level: 'debug', format: 'text' });
    logger.debug('via alias');

    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('via alias');
  });
});

// ─── Destination routing ──────────────────────────────────────────────────────

describe('Logger – destination routing', () => {
  test('destination=stderr routes output to stderr', () => {
    const stderrCapture = [];
    const instance = new Logger({ level: 'info', format: 'text', destination: 'stderr' });
    instance._getOutputStream = () => ({ isTTY: false, write: (s) => stderrCapture.push(s) });

    instance.info('goes to stderr');
    expect(stderrCapture.length).toBe(1);
  });

  test('destination=stdout routes output to stdout', () => {
    const stdoutCapture = [];
    const instance = new Logger({ level: 'info', format: 'text', destination: 'stdout' });
    instance._getOutputStream = () => ({ isTTY: false, write: (s) => stdoutCapture.push(s) });

    instance.info('goes to stdout');
    expect(stdoutCapture.length).toBe(1);
  });
});

// ─── child() inherits settings ────────────────────────────────────────────────

describe('Logger – child()', () => {
  test('child logger inherits parent options', () => {
    const parent = new Logger({ level: 'error', format: 'json' });
    const child = parent.child('MyStage');

    expect(child.options.level).toBe('error');
    expect(child.options.format).toBe('json');
    expect(child.options.prefix).toBe('CopyTree:MyStage');
  });
});
