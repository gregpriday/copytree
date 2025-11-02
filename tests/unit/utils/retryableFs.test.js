import { withFsRetry } from '../../../src/utils/retryableFs.js';

describe('withFsRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('successful operations', () => {
    it('should return result immediately on success', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const promise = withFsRetry(operation);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should succeed after retries for EBUSY errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('Resource busy'), { code: 'EBUSY' }))
        .mockRejectedValueOnce(Object.assign(new Error('Resource busy'), { code: 'EBUSY' }))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100, onRetry });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, delay: 100, code: 'EBUSY' });
      expect(onRetry).toHaveBeenNthCalledWith(2, { attempt: 2, delay: 200, code: 'EBUSY' });
    });

    it('should succeed after retries for EPERM errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EPERM' }))
        .mockResolvedValue('success');

      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should succeed after retries for EMFILE errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('Too many open files'), { code: 'EMFILE' }))
        .mockResolvedValue('success');

      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryable error codes', () => {
    const retryableCodes = ['EBUSY', 'EPERM', 'EACCES', 'EMFILE', 'ENFILE', 'EAGAIN', 'EIO'];

    retryableCodes.forEach((code) => {
      it(`should retry on ${code} error`, async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(Object.assign(new Error(`Test ${code}`), { code }))
          .mockResolvedValue('success');

        const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100 });

        await jest.runAllTimersAsync();
        const result = await promise;

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('non-retryable errors', () => {
    const nonRetryableCodes = ['ENOENT', 'EISDIR', 'EINVAL'];

    nonRetryableCodes.forEach((code) => {
      it(`should not retry on ${code} error`, async () => {
        const operation = jest
          .fn()
          .mockRejectedValue(Object.assign(new Error(`Test ${code}`), { code }));

        const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100 });

        await expect(promise).rejects.toThrow(`Test ${code}`);
        expect(operation).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('exponential backoff', () => {
    it('should use exponential backoff delays', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      const promise = withFsRetry(operation, {
        maxAttempts: 4,
        initialDelay: 100,
        maxDelay: 2000,
        onRetry,
      });

      await jest.runAllTimersAsync();
      await promise;

      // Verify exponential backoff: 100ms, 200ms, 400ms
      expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ delay: 100 }));
      expect(onRetry).toHaveBeenNthCalledWith(2, expect.objectContaining({ delay: 200 }));
      expect(onRetry).toHaveBeenNthCalledWith(3, expect.objectContaining({ delay: 400 }));
    });

    it('should cap delay at maxDelay', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));

      const onRetry = jest.fn();
      const promise = withFsRetry(operation, {
        maxAttempts: 10,
        initialDelay: 100,
        maxDelay: 500,
        onRetry,
      });

      // Catch the promise to prevent unhandled rejection
      promise.catch(() => {});

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();

      // After reaching maxDelay, all subsequent delays should be capped
      const delays = onRetry.mock.calls.map((call) => call[0].delay);
      expect(delays[0]).toBe(100); // 100 * 2^0
      expect(delays[1]).toBe(200); // 100 * 2^1
      expect(delays[2]).toBe(400); // 100 * 2^2
      expect(delays[3]).toBe(500); // Capped at maxDelay
      expect(delays[4]).toBe(500); // Still capped
    });

    it('should apply jitter when enabled', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      const promise = withFsRetry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        jitter: true,
        onRetry,
      });

      await jest.runAllTimersAsync();
      await promise;

      // With jitter, delays should be between 50% and 150% of base delay (before maxDelay cap)
      const delay1 = onRetry.mock.calls[0][0].delay;
      const delay2 = onRetry.mock.calls[1][0].delay;

      expect(delay1).toBeGreaterThanOrEqual(50); // 0.5 * 100
      expect(delay1).toBeLessThanOrEqual(150); // 1.5 * 100
      expect(delay2).toBeGreaterThanOrEqual(100); // 0.5 * 200
      expect(delay2).toBeLessThanOrEqual(300); // 1.5 * 200
    });
  });

  describe('max attempts', () => {
    it('should fail after maxAttempts retries', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));

      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100 });

      // Catch the promise to prevent unhandled rejection
      promise.catch(() => {});

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('EBUSY');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect maxAttempts of 1 (no retries)', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));

      const promise = withFsRetry(operation, { maxAttempts: 1, initialDelay: 100 });

      await expect(promise).rejects.toThrow('EBUSY');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe.skip('abort signal', () => {
    it('should throw abort error when signal is aborted', async () => {
      const controller = new AbortController();
      const operation = jest.fn().mockImplementation(async () => {
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'should not reach here';
      });

      const promise = withFsRetry(operation, { signal: controller.signal });

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow('Operation aborted');
    });

    it('should check abort signal before each attempt', async () => {
      const controller = new AbortController();
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockImplementation(async () => {
          // Should not be called due to abort
          return 'should not reach here';
        });

      setTimeout(() => controller.abort(), 50);

      const promise = withFsRetry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
        signal: controller.signal,
      });

      await jest.runAllTimersAsync();
      await expect(promise).rejects.toThrow();
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry with attempt info', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockResolvedValue('success');

      const onRetry = jest.fn();
      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100, onRetry });

      await jest.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        delay: 100,
        code: 'EBUSY',
      });
    });

    it('should not call onRetry on final success without retries', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const onRetry = jest.fn();

      const promise = withFsRetry(operation, { maxAttempts: 3, onRetry });

      await jest.runAllTimersAsync();
      await promise;

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should handle async onRetry callback', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
        .mockResolvedValue('success');

      const onRetry = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const promise = withFsRetry(operation, { maxAttempts: 3, initialDelay: 100, onRetry });

      await jest.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalled();
    });
  });
});
