import { isRetryableFsError } from './errors.js';

/**
 * Execute a filesystem operation with exponential backoff retry logic
 * @param {Function} operation - Async operation to execute
 * @param {Object} options - Retry configuration
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.initialDelay=100] - Initial delay in milliseconds
 * @param {number} [options.maxDelay=2000] - Maximum delay in milliseconds
 * @param {boolean} [options.jitter=false] - Add random jitter to delays
 * @param {Function} [options.onRetry] - Callback for retry events ({ attempt, delay, code })
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @returns {Promise<*>} Result of the operation
 * @throws {Error} If operation fails after all retries or on non-retryable error
 */
export async function withFsRetry(operation, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 2000,
    jitter = false,
    onRetry = () => {},
    signal,
  } = options;

  const createAbortError = () => {
    const abortError = new Error('Operation aborted');
    abortError.code = 'ABORT_ERR';
    return abortError;
  };

  let attempt = 0;

  while (true) {
    attempt++;

    try {
      // Check for abort signal
      if (signal?.aborted) {
        throw createAbortError();
      }

      // Execute the operation
      const result = await operation();

      // If the operation completed but the signal was aborted, treat as aborted
      if (signal?.aborted) {
        throw createAbortError();
      }

      return result;
    } catch (error) {
      const retryable = isRetryableFsError(error);

      // If not retryable or max attempts reached, throw the error
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitterDelay = jitter ? Math.floor(baseDelay * (0.5 + Math.random())) : baseDelay;
      const delay = Math.min(jitterDelay, maxDelay);

      if (signal?.aborted) {
        throw createAbortError();
      }

      // Call retry callback
      await onRetry({ attempt, delay, code: error.code });

      // Wait before retrying with abort support
      await new Promise((resolve, reject) => {
        let timeoutId;
        const onAbort = () => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
          }
          signal?.removeEventListener('abort', onAbort);
          reject(createAbortError());
        };

        timeoutId = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delay);

        if (signal) {
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }
}
