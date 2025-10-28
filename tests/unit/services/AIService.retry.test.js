/**
 * AIService retry and fallback tests
 *
 * Validates retry logic, exponential backoff, provider fallback,
 * and error categorization for retryable vs non-retryable errors.
 */

import { jest } from '@jest/globals';

// Mock error types
class AIProviderError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.details = details;
  }
}

// Error codes
const ERROR_CODES = {
  RATE_LIMIT: 'RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_API_KEY: 'INVALID_API_KEY',
  SAFETY_FILTER: 'SAFETY_FILTER',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  INVALID_REQUEST: 'INVALID_REQUEST'
};

// Retry categorization
function isRetryableError(error) {
  const retryableCodes = [
    ERROR_CODES.RATE_LIMIT,
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.SERVICE_UNAVAILABLE,
    ERROR_CODES.NETWORK_ERROR
  ];

  if (error.code) {
    return retryableCodes.includes(error.code);
  }

  // Check error message for patterns
  const retryablePatterns = /rate.?limit|timeout|unavailable|ECONNREFUSED|ETIMEDOUT/i;
  return retryablePatterns.test(error.message);
}

// Mock AI Service with retry logic
class MockAIService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 100;
    this.providers = options.providers || ['gemini', 'fallback'];
    this.currentProvider = 0;
    this.attemptLog = [];
  }

  async callProvider(provider, prompt, options = {}) {
    const attempt = {
      provider,
      timestamp: Date.now(),
      attempt: this.attemptLog.length + 1
    };

    this.attemptLog.push(attempt);

    // Simulate provider behavior
    if (options.simulateError) {
      throw options.simulateError;
    }

    return {
      content: `Response from ${provider}`,
      provider,
      success: true
    };
  }

  async retryWithBackoff(fn, retries = this.maxRetries) {
    let lastError;
    let attempt = 0;

    while (attempt < retries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt++;

        if (!isRetryableError(error)) {
          // Non-retryable, fail immediately
          throw error;
        }

        if (attempt >= retries) {
          // Max retries reached
          break;
        }

        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Check for retry-after header
        if (error.details?.retryAfter) {
          const retryAfter = error.details.retryAfter * 1000;
          await new Promise(resolve => setTimeout(resolve, retryAfter));
        }
      }
    }

    throw lastError;
  }

  async generate(prompt, options = {}) {
    // Try primary provider with retries
    try {
      return await this.retryWithBackoff(async () => {
        return await this.callProvider(
          this.providers[this.currentProvider],
          prompt,
          options
        );
      });
    } catch (primaryError) {
      // Try fallback providers
      for (let i = 1; i < this.providers.length; i++) {
        this.currentProvider = i;
        try {
          return await this.callProvider(this.providers[i], prompt, {});
        } catch (fallbackError) {
          // Continue to next fallback
          continue;
        }
      }

      // All providers failed
      throw primaryError;
    }
  }

  getAttemptCount() {
    return this.attemptLog.length;
  }

  getProviders() {
    return [...new Set(this.attemptLog.map(a => a.provider))];
  }

  reset() {
    this.attemptLog = [];
    this.currentProvider = 0;
  }
}

describe('AIService Retry Logic', () => {
  let service;

  beforeEach(() => {
    service = new MockAIService({
      maxRetries: 3,
      baseDelay: 10, // Fast for testing
      providers: ['gemini', 'fallback']
    });
  });

  describe('Retryable Error Identification', () => {
    it('identifies RATE_LIMIT as retryable', () => {
      const error = new AIProviderError('Rate limit exceeded', ERROR_CODES.RATE_LIMIT);
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies TIMEOUT as retryable', () => {
      const error = new AIProviderError('Request timeout', ERROR_CODES.TIMEOUT);
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies SERVICE_UNAVAILABLE as retryable', () => {
      const error = new AIProviderError('Service unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies NETWORK_ERROR as retryable', () => {
      const error = new AIProviderError('Network error', ERROR_CODES.NETWORK_ERROR);
      expect(isRetryableError(error)).toBe(true);
    });

    it('identifies INVALID_API_KEY as non-retryable', () => {
      const error = new AIProviderError('Invalid API key', ERROR_CODES.INVALID_API_KEY);
      expect(isRetryableError(error)).toBe(false);
    });

    it('identifies SAFETY_FILTER as non-retryable', () => {
      const error = new AIProviderError('Safety filter triggered', ERROR_CODES.SAFETY_FILTER);
      expect(isRetryableError(error)).toBe(false);
    });

    it('identifies QUOTA_EXCEEDED as non-retryable', () => {
      const error = new AIProviderError('Quota exceeded', ERROR_CODES.QUOTA_EXCEEDED);
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('Retry Attempts', () => {
    it('succeeds on first attempt without retries', async () => {
      const result = await service.generate('test prompt');

      expect(result.success).toBe(true);
      expect(service.getAttemptCount()).toBe(1);
    });

    it('retries on retryable errors up to max retries', async () => {
      let callCount = 0;
      const maxCalls = 3;

      const mockService = new MockAIService({ maxRetries: 3, baseDelay: 1 });
      const originalCall = mockService.callProvider.bind(mockService);

      mockService.callProvider = async function(provider, prompt, options) {
        callCount++;
        if (callCount < maxCalls) {
          throw new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT);
        }
        return originalCall(provider, prompt, options);
      };

      const result = await mockService.generate('test');

      expect(result.success).toBe(true);
      expect(callCount).toBe(3);
    });

    it('fails immediately on non-retryable errors', async () => {
      const mockService = new MockAIService({
        maxRetries: 3,
        baseDelay: 1,
        providers: ['gemini'] // Single provider to test failure
      });

      const error = new AIProviderError('Invalid key', ERROR_CODES.INVALID_API_KEY);

      await expect(
        mockService.generate('test', { simulateError: error })
      ).rejects.toThrow('Invalid key');

      expect(mockService.getAttemptCount()).toBe(1); // Only one attempt
    });

    it('throws after max retries exceeded', async () => {
      const mockService = new MockAIService({
        maxRetries: 3,
        baseDelay: 1,
        providers: ['gemini'] // Single provider to test failure
      });

      const error = new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT);

      await expect(
        mockService.generate('test', { simulateError: error })
      ).rejects.toThrow('Rate limit');

      expect(mockService.getAttemptCount()).toBe(3); // Max retries
    });
  });

  describe('Exponential Backoff', () => {
    it('implements exponential backoff between retries', async () => {
      const mockService = new MockAIService({ maxRetries: 4, baseDelay: 10 });
      const delays = [];
      let callCount = 0;

      const originalCall = mockService.callProvider.bind(mockService);
      mockService.callProvider = async function(provider, prompt, options) {
        const now = Date.now();
        if (delays.length > 0) {
          delays.push(now - delays[delays.length - 1]);
        } else {
          delays.push(now);
        }

        callCount++;
        if (callCount < 4) {
          throw new AIProviderError('Timeout', ERROR_CODES.TIMEOUT);
        }
        return originalCall(provider, prompt, options);
      };

      await mockService.generate('test');

      // Verify exponential increase (approximate due to timing)
      expect(delays.length).toBe(4);
      // Second delay should be ~10ms (baseDelay * 2^0)
      // Third delay should be ~20ms (baseDelay * 2^1)
      // Fourth delay should be ~40ms (baseDelay * 2^2)
      // Allow some tolerance for timing
      expect(delays[2]).toBeGreaterThanOrEqual(8); // ~10ms
      expect(delays[3]).toBeGreaterThanOrEqual(15); // ~20ms
    }, 10000);

    it('respects retry-after header when present', async () => {
      const mockService = new MockAIService({
        maxRetries: 3,
        baseDelay: 1,
        providers: ['gemini'] // Single provider to test failure
      });

      const error = new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT, {
        retryAfter: 0.05 // 50ms
      });

      const start = Date.now();

      await expect(
        mockService.generate('test', { simulateError: error })
      ).rejects.toThrow();

      const duration = Date.now() - start;

      // Should have waited for retry-after delays
      // 3 retries with 50ms each = ~150ms minimum
      expect(duration).toBeGreaterThanOrEqual(100);
    }, 10000);
  });

  describe('Provider Fallback', () => {
    it('falls back to secondary provider on primary failure', async () => {
      const mockService = new MockAIService({
        maxRetries: 2,
        baseDelay: 1,
        providers: ['gemini', 'fallback']
      });

      let geminiCalls = 0;
      let fallbackCalls = 0;

      const originalCall = mockService.callProvider.bind(mockService);
      mockService.callProvider = async function(provider, prompt, options) {
        if (provider === 'gemini') {
          geminiCalls++;
          throw new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT);
        } else {
          fallbackCalls++;
          return originalCall(provider, prompt, options);
        }
      };

      const result = await mockService.generate('test');

      expect(result.success).toBe(true);
      expect(result.provider).toBe('fallback');
      expect(geminiCalls).toBe(2); // Tried with retries
      expect(fallbackCalls).toBe(1); // Fallback succeeded
    });

    it('tries multiple fallback providers in order', async () => {
      const mockService = new MockAIService({
        maxRetries: 1,
        baseDelay: 1,
        providers: ['primary', 'fallback1', 'fallback2']
      });

      const attempts = [];

      const originalCall = mockService.callProvider.bind(mockService);
      mockService.callProvider = async function(provider, prompt, options) {
        attempts.push(provider);

        if (provider === 'fallback2') {
          return originalCall(provider, prompt, options);
        }

        throw new AIProviderError('Unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      };

      const result = await mockService.generate('test');

      expect(result.provider).toBe('fallback2');
      expect(attempts).toContain('primary');
      expect(attempts).toContain('fallback1');
      expect(attempts).toContain('fallback2');
    });

    it('fails when all providers exhausted', async () => {
      const mockService = new MockAIService({
        maxRetries: 2,
        baseDelay: 1,
        providers: ['gemini', 'fallback']
      });

      const error = new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT);

      mockService.callProvider = async function() {
        throw error;
      };

      await expect(mockService.generate('test')).rejects.toThrow('Rate limit');
    });
  });

  describe('Retry Decision Logic', () => {
    it('retries on network errors', async () => {
      // Create errors with network-related messages
      const networkErrors = [
        { message: 'Network timeout', shouldRetry: true },
        { message: 'Connection unavailable', shouldRetry: true },
        { message: 'ECONNREFUSED', shouldRetry: true }
      ];

      for (const { message, shouldRetry } of networkErrors) {
        const error = new Error(message);
        expect(isRetryableError(error)).toBe(shouldRetry);
      }
    });

    it('does not retry on validation errors', async () => {
      const error = new AIProviderError('Invalid request', ERROR_CODES.INVALID_REQUEST);
      expect(isRetryableError(error)).toBe(false);
    });

    it('detects rate limit from message patterns', () => {
      const messages = [
        { text: 'Rate limit exceeded', expected: true },
        { text: 'timeout occurred', expected: true },
        { text: 'service unavailable', expected: true }
      ];

      for (const { text, expected } of messages) {
        const error = new Error(text);
        expect(isRetryableError(error)).toBe(expected);
      }
    });
  });

  describe('Attempt Tracking', () => {
    it('logs all attempts with timestamps', async () => {
      await service.generate('test');

      expect(service.attemptLog.length).toBe(1);
      expect(service.attemptLog[0]).toMatchObject({
        provider: 'gemini',
        timestamp: expect.any(Number),
        attempt: 1
      });
    });

    it('tracks provider usage across retries', async () => {
      const mockService = new MockAIService({
        maxRetries: 2,
        baseDelay: 1,
        providers: ['gemini', 'fallback']
      });

      await mockService.generate('test');

      // Check that attempt was logged
      expect(mockService.attemptLog.length).toBeGreaterThan(0);
      expect(mockService.attemptLog[0]).toMatchObject({
        provider: 'gemini',
        attempt: 1
      });
    });
  });

  describe('Real-World Error Scenarios', () => {
    it('handles intermittent failures gracefully', async () => {
      const mockService = new MockAIService({ maxRetries: 4, baseDelay: 1 });
      let callCount = 0;

      const originalCall = mockService.callProvider.bind(mockService);
      mockService.callProvider = async function(provider, prompt, options) {
        callCount++;
        // Fail on attempts 1 and 3, succeed on 2 and 4
        if (callCount === 1 || callCount === 3) {
          throw new AIProviderError('Timeout', ERROR_CODES.TIMEOUT);
        }
        return originalCall(provider, prompt, options);
      };

      const result = await mockService.generate('test');

      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('combines retries and fallback correctly', async () => {
      const mockService = new MockAIService({
        maxRetries: 2,
        baseDelay: 1,
        providers: ['primary', 'fallback']
      });

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const originalCall = mockService.callProvider.bind(mockService);
      mockService.callProvider = async function(provider, prompt, options) {
        if (provider === 'primary') {
          primaryCalls++;
          // Primary fails with retryable error
          throw new AIProviderError('Rate limit', ERROR_CODES.RATE_LIMIT);
        } else {
          fallbackCalls++;
          // Fallback succeeds
          return originalCall(provider, prompt, options);
        }
      };

      const result = await mockService.generate('test');

      expect(result.provider).toBe('fallback');
      expect(primaryCalls).toBe(2); // Retried
      expect(fallbackCalls).toBe(1); // Succeeded first try
    });
  });
});
