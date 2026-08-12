import { jest } from '@jest/globals';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'events';

// Version detection goes through `execFile`, promisified. Mocking the
// promisified wrapper rather than the callback form keeps the assertions about
// *how many processes are started*, which is what this suite is really for.
let mockExecAsyncFn = jest.fn();

jest.mock('node:child_process');

jest.mock('node:util', () => ({
  promisify: (fn) => {
    if (fn.name === 'execFile') {
      return (...args) => mockExecAsyncFn(...args);
    }
    return fn;
  },
}));

// Import after mocks are set up
import GitleaksAdapter from '../../../src/services/GitleaksAdapter.js';

describe('GitleaksAdapter', () => {
  let adapter;
  let mockSpawn;

  beforeEach(() => {
    adapter = new GitleaksAdapter();
    mockSpawn = jest.fn();

    spawn.mockImplementation(mockSpawn);

    // Reset and configure mockExecAsyncFn for each test
    mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      expect(adapter.binaryPath).toBe('gitleaks');
      expect(adapter.configPath).toBeNull();
      expect(adapter.logLevel).toBe('fatal');
      expect(adapter.extraArgs).toEqual([]);
    });

    it('should accept custom options', () => {
      const customAdapter = new GitleaksAdapter({
        binaryPath: '/custom/gitleaks',
        configPath: '.gitleaks.toml',
        logLevel: 'info',
        extraArgs: ['--verbose'],
      });

      expect(customAdapter.binaryPath).toBe('/custom/gitleaks');
      expect(customAdapter.configPath).toBe('.gitleaks.toml');
      expect(customAdapter.logLevel).toBe('info');
      expect(customAdapter.extraArgs).toEqual(['--verbose']);
    });
  });

  describe('isAvailable', () => {
    it('should return true if gitleaks is available', async () => {
      const mockExec = jest.fn().mockResolvedValue({ stdout: 'gitleaks version 8.19.0' });

      // Mock the exec function
      const originalExec = (await import('child_process')).exec;
      const { promisify } = await import('util');
      jest.spyOn({ promisify }, 'promisify').mockReturnValue(mockExec);

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });

    it('should cache availability check', async () => {
      adapter._available = true;
      const result = await adapter.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('scanString', () => {
    it('should return empty array when no secrets found', async () => {
      const mockChild = createMockProcess(0, '', '');
      mockSpawn.mockReturnValue(mockChild);

      const result = await adapter.scanString('const foo = "bar";', 'test.js');

      expect(result).toEqual([]);
      expect(mockChild.stdin.write).toHaveBeenCalledWith('const foo = "bar";', 'utf8');
      expect(mockChild.stdin.end).toHaveBeenCalled();
    });

    it('should parse findings when secrets found', async () => {
      const findings = [
        {
          RuleID: 'aws-access-key',
          File: 'stdin',
          StartLine: 1,
          EndLine: 1,
          StartColumn: 10,
          EndColumn: 30,
        },
      ];

      const mockChild = createMockProcess(1, JSON.stringify(findings), '');
      mockSpawn.mockReturnValue(mockChild);

      const result = await adapter.scanString('const key = "AKIAIOSFODNN7EXAMPLE";', 'config.js');

      expect(result).toHaveLength(1);
      expect(result[0].RuleID).toBe('aws-access-key');
      expect(result[0].File).toBe('config.js'); // Remapped from stdin
      expect(result[0].StartLine).toBe(1);
    });

    it('should include custom config if specified', async () => {
      const customAdapter = new GitleaksAdapter({
        configPath: '/custom/.gitleaks.toml',
      });

      const mockChild = createMockProcess(0, '', '');
      mockSpawn.mockReturnValue(mockChild);

      await customAdapter.scanString('test', 'test.js');

      expect(mockSpawn).toHaveBeenCalledWith(
        'gitleaks',
        expect.arrayContaining(['-c', '/custom/.gitleaks.toml']),
        expect.any(Object),
      );
    });

    it('should include extra args if specified', async () => {
      const customAdapter = new GitleaksAdapter({
        extraArgs: ['--verbose', '--no-git'],
      });

      const mockChild = createMockProcess(0, '', '');
      mockSpawn.mockReturnValue(mockChild);

      await customAdapter.scanString('test', 'test.js');

      expect(mockSpawn).toHaveBeenCalledWith(
        'gitleaks',
        expect.arrayContaining(['--verbose', '--no-git']),
        expect.any(Object),
      );
    });

    it('should use correct command arguments', async () => {
      const mockChild = createMockProcess(0, '', '');
      mockSpawn.mockReturnValue(mockChild);

      await adapter.scanString('test', 'test.js');

      expect(mockSpawn).toHaveBeenCalledWith(
        'gitleaks',
        [
          'stdin',
          '--report-format',
          'json',
          '--report-path',
          '-',
          '--no-banner',
          '--no-color',
          '--log-level',
          'fatal',
          '--redact=100',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
    });

    it('never turns unreadable findings into a clean result', async () => {
      // Exit 1 is Gitleaks saying "I found secrets". If its report cannot be
      // parsed, the one answer that must not come back is "no secrets" — the
      // guard would be reporting success at the exact moment it has most
      // reason not to. This returned `[]`.
      const mockChild = createMockProcess(1, 'invalid json', '');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).rejects.toThrow(
        /reported findings but its report was empty or unreadable/,
      );

      // And the circuit is open, so the caller falls back for the rest of the run.
      expect(adapter.failure).toBeTruthy();
    });

    it.each([
      ['blank output', ''],
      ['a JSON null', 'null'],
      ['an empty array', '[]'],
      ['an array of nulls', '[null]'],
      ['findings with no location', '[{}]'],
      ['an array of primitives', '["secret"]'],
    ])('treats exit 1 with %s as a scan it cannot trust', async (_name, stdout) => {
      // Exit 1 is Gitleaks saying "I found secrets". Every one of these is the
      // scanner then failing to say what — and "no findings" is the one answer
      // that must not come back, because it reads as a clean file.
      const mockChild = createMockProcess(1, stdout, '');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).rejects.toThrow(/empty or unreadable/);
    });

    it('accepts a well-formed finding on exit 1', async () => {
      const mockChild = createMockProcess(
        1,
        JSON.stringify([{ RuleID: 'aws-key', StartLine: 3, EndLine: 3, Match: 'AKIA...' }]),
        '',
      );
      mockSpawn.mockReturnValue(mockChild);

      const findings = await adapter.scanString('test', 'config.js');

      expect(findings).toHaveLength(1);
      expect(findings[0].File).toBe('config.js');
    });

    it('does not retain the findings report on the error it throws', async () => {
      // stdout IS the findings report, and a finding carries the matched
      // secret. Attaching the original error as `cause` hands that to every
      // structured logger that serialises error chains.
      const secret = 'AKIAIOSFODNN7EXAMPLE';
      const mockChild = createMockProcess(1, `not json ${secret}`, '');
      mockSpawn.mockReturnValue(mockChild);

      const error = await adapter.scanString('test', 'test.js').catch((e) => e);

      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(secret);
      expect(error.cause).toBeUndefined();
    });

    it('keeps a credential out of the message when the scanner puts one on stderr', async () => {
      const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
      const mockChild = createMockProcess(2, '', `debug: matched token=${secret}`);
      mockSpawn.mockReturnValue(mockChild);

      const error = await adapter.scanString('test', 'test.js').catch((e) => e);

      expect(error.message).not.toContain(secret);
    });

    it('propagates a cancellation instead of degrading the scan', async () => {
      const controller = new AbortController();
      const mockChild = new EventEmitter();
      mockChild.stdin = Object.assign(new EventEmitter(), { write: jest.fn(), end: jest.fn() });
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = jest.fn();
      mockSpawn.mockReturnValue(mockChild);
      controller.abort();

      const error = await adapter
        .scanString('test', 'test.js', { signal: controller.signal })
        .catch((e) => e);

      // A cancelled run is not a degraded one: opening the circuit and falling
      // back to a weaker scanner is work for a run that is being abandoned.
      expect(error.name).toBe('AbortError');
      expect(adapter.failure).toBeNull();
    });

    it('never treats an unreadable report on a clean exit as a clean scan', async () => {
      const mockChild = createMockProcess(0, 'not json at all', '');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).rejects.toThrow(
        /exited cleanly but its report could not be parsed/,
      );
    });

    it('treats genuinely empty output on a clean exit as no findings', async () => {
      const mockChild = createMockProcess(0, '', '');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).resolves.toEqual([]);
    });

    it('keeps stdout out of error messages', async () => {
      // stdout is the findings report, and a finding can carry the secret it
      // matched. Error messages reach logs, stats and the embedder.
      const secret = 'AKIAIOSFODNN7EXAMPLE';
      const mockChild = createMockProcess(2, secret, 'config error');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).rejects.toThrow(
        expect.objectContaining({ message: expect.not.stringContaining(secret) }),
      );
    });

    it('should throw error on spawn failure', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdin = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
      });
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockSpawn.mockReturnValue(mockChild);

      const promise = adapter.scanString('test', 'test.js');

      // Emit error after a tick
      setImmediate(() => {
        mockChild.emit('error', new Error('spawn failed'));
      });

      await expect(promise).rejects.toThrow('Failed to spawn gitleaks');
    });

    it('should throw error on non-zero/non-one exit code', async () => {
      const mockChild = createMockProcess(2, '', 'some error');
      mockSpawn.mockReturnValue(mockChild);

      await expect(adapter.scanString('test', 'test.js')).rejects.toThrow(
        'Gitleaks exited with code 2',
      );
    });

    it('should use detect mode for older gitleaks versions', async () => {
      // Mock execAsync to return an old version
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.18.0', stderr: '' });

      const mockChild = createMockProcess(0, '[]', '');
      mockSpawn.mockReturnValue(mockChild);

      await adapter.scanString('test', 'test.js');

      // Should use detect mode instead of stdin
      expect(mockSpawn).toHaveBeenCalledWith(
        'gitleaks',
        expect.arrayContaining(['detect', '--no-git']),
        expect.any(Object),
      );

      // Should use --redact instead of --redact=100
      expect(mockSpawn).toHaveBeenCalledWith(
        'gitleaks',
        expect.arrayContaining(['--redact']),
        expect.any(Object),
      );
    });

    it('should timeout hung scans after 10 seconds', async () => {
      jest.useRealTimers(); // Explicitly use real timers

      const mockChild = new EventEmitter();
      mockChild.stdin = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
      });
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = jest.fn(() => {
        // When kill is called, emit the close event to resolve the promise
        mockChild.emit('close', null); // Or some error code if needed
      });

      mockSpawn.mockReturnValue(mockChild);

      // The promise will hang because the 'close' event is never emitted by default
      const promise = adapter.scanString('test', 'test.js');

      // We expect it to reject with a timeout error
      await expect(promise).rejects.toThrow('Gitleaks scan timed out after 10 seconds');

      // Asked to stop first. A bare `kill()` is a request a wedged process can
      // ignore; the adapter escalates to SIGKILL if SIGTERM goes unanswered.
      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    }, 12000); // Set a test timeout longer than the 10s in the code
  });

  describe('getVersion', () => {
    it('should parse version from output', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });

      const version = await adapter.getVersion();
      expect(version).toBe('8.19.0');
    });

    it('should return null if gitleaks is not available', async () => {
      mockExecAsyncFn = jest.fn().mockRejectedValue(new Error('Command not found'));

      const version = await adapter.getVersion();
      expect(version).toBeNull();
    });
  });

  /**
   * Scanning is per-file; process creation must not be. `scanString()` used to
   * call `getVersion()` on every call, so a thousand-file repository spawned a
   * thousand extra `gitleaks version` processes to re-derive a constant.
   */
  describe('process creation', () => {
    it('runs `gitleaks version` once, however many files are scanned', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
      mockSpawn.mockImplementation(() => createMockProcess(0, '[]', ''));

      await adapter.isAvailable();
      await adapter.scanString('a', 'a.js');
      await adapter.scanString('b', 'b.js');
      await adapter.scanString('c', 'c.js');

      expect(mockExecAsyncFn).toHaveBeenCalledTimes(1);
      // One scan process per file, and nothing more.
      expect(mockSpawn).toHaveBeenCalledTimes(3);
    });

    it('answers isAvailable() from the same probe as getVersion()', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });

      expect(await adapter.isAvailable()).toBe(true);
      expect(await adapter.getVersion()).toBe('8.19.0');

      expect(mockExecAsyncFn).toHaveBeenCalledTimes(1);
    });

    it('reports unavailable when the binary cannot be run', async () => {
      mockExecAsyncFn = jest.fn().mockRejectedValue(new Error('Command not found'));

      expect(await adapter.isAvailable()).toBe(false);
    });

    it('builds the same argument vector for every scan', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
      mockSpawn.mockImplementation(() => createMockProcess(0, '[]', ''));

      await adapter.scanString('a', 'a.js');
      await adapter.scanString('b', 'b.js');

      expect(mockSpawn.mock.calls[0][1]).toEqual(mockSpawn.mock.calls[1][1]);
      expect(mockSpawn.mock.calls[0][1]).toContain('stdin');
    });

    it('runs `gitleaks version` without a shell', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });

      await adapter.getVersion();

      // Binary and arguments passed separately, so a path containing a space
      // needs no quoting and nothing is interpreted by a shell.
      expect(mockExecAsyncFn).toHaveBeenCalledWith('gitleaks', ['version'], expect.any(Object));
    });
  });

  /**
   * An operational failure recurs for every remaining file. Retrying it once per
   * file turns a misconfigured scanner into the slowest possible run: a thousand
   * doomed processes, and a thousand identical warnings burying the one line
   * that explains what went wrong.
   */
  describe('circuit breaker', () => {
    it('starts no further processes after an operational failure', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
      mockSpawn.mockImplementation(() => createMockProcess(2, '', 'unknown flag: --redact=100'));

      await expect(adapter.scanString('a', 'a.js')).rejects.toThrow(/Gitleaks execution failed/);
      await expect(adapter.scanString('b', 'b.js')).rejects.toThrow(/Gitleaks execution failed/);
      await expect(adapter.scanString('c', 'c.js')).rejects.toThrow(/Gitleaks execution failed/);

      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('rethrows the original failure, so the caller sees one cause', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
      mockSpawn.mockImplementation(() => createMockProcess(2, '', 'boom'));

      const first = await adapter.scanString('a', 'a.js').catch((error) => error);
      const second = await adapter.scanString('b', 'b.js').catch((error) => error);

      expect(second).toBe(first);
      expect(adapter.failure).toBe(first);
    });

    it('does not open the circuit when secrets are found', async () => {
      mockExecAsyncFn = jest.fn().mockResolvedValue({ stdout: 'v8.19.0', stderr: '' });
      const finding = JSON.stringify([{ RuleID: 'aws-access-key', StartLine: 1 }]);
      mockSpawn.mockImplementation(() => createMockProcess(1, finding, ''));

      // Exit code 1 means "secrets detected", which is a successful scan.
      expect(await adapter.scanString('a', 'a.js')).toHaveLength(1);
      expect(await adapter.scanString('b', 'b.js')).toHaveLength(1);

      expect(adapter.failure).toBeNull();
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Helper to create a mock child process
 * @param {number} exitCode - Exit code to emit
 * @param {string} stdout - Stdout content
 * @param {string} stderr - Stderr content
 * @returns {EventEmitter} Mock child process
 */
function createMockProcess(exitCode, stdout, stderr) {
  const mockChild = new EventEmitter();
  // A real child's stdin is a writable stream, not a bare object: the adapter
  // listens on it for the EPIPE a child that exits early produces.
  mockChild.stdin = Object.assign(new EventEmitter(), {
    write: jest.fn(),
    end: jest.fn(),
  });
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();
  mockChild.kill = jest.fn();

  // Emit data and close after a tick
  setImmediate(() => {
    if (stdout) mockChild.stdout.emit('data', Buffer.from(stdout));
    if (stderr) mockChild.stderr.emit('data', Buffer.from(stderr));
    mockChild.emit('close', exitCode);
  });

  return mockChild;
}
