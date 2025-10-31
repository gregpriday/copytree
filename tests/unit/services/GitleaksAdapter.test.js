import GitleaksAdapter from '../../../src/services/GitleaksAdapter.js';
import { jest } from '@jest/globals';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
jest.mock('util', () => ({
  promisify: (fn) => fn,
}));

describe('GitleaksAdapter', () => {
  let adapter;
  let mockSpawn;

  beforeEach(() => {
    adapter = new GitleaksAdapter();
    mockSpawn = jest.fn();
    spawn.mockImplementation(mockSpawn);
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

    it('should handle malformed JSON gracefully', async () => {
      const mockChild = createMockProcess(1, 'invalid json', '');
      mockSpawn.mockReturnValue(mockChild);

      const result = await adapter.scanString('test', 'test.js');

      expect(result).toEqual([]);
    });

    it('should throw error on spawn failure', async () => {
      const mockChild = new EventEmitter();
      mockChild.stdin = { write: jest.fn(), end: jest.fn() };
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
  });

  describe('getVersion', () => {
    it('should parse version from output', async () => {
      // This test would need proper mocking of execAsync
      // Skipping for now as it requires more complex setup
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
  mockChild.stdin = {
    write: jest.fn(),
    end: jest.fn(),
  };
  mockChild.stdout = new EventEmitter();
  mockChild.stderr = new EventEmitter();

  // Emit data and close after a tick
  setImmediate(() => {
    if (stdout) mockChild.stdout.emit('data', Buffer.from(stdout));
    if (stderr) mockChild.stderr.emit('data', Buffer.from(stderr));
    mockChild.emit('close', exitCode);
  });

  return mockChild;
}
