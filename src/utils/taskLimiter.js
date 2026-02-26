/**
 * Global concurrency budgeting system
 *
 * Provides centralized concurrency control across different subsystems
 * to prevent oversubscription and ensure predictable resource usage.
 *
 * Design principles:
 * - Domain-specific budgets (discovery, glob, transform)
 * - Shared total budget to prevent system overload
 * - Configurable per domain
 * - Singleton pattern for global coordination
 */

import pLimit from 'p-limit';

/**
 * TaskLimiter manages concurrency budgets for different task domains
 */
class TaskLimiter {
  constructor() {
    /** @type {Map<string, import('p-limit').LimitFunction>} */
    this.limiters = new Map();

    /** @type {Map<string, number>} */
    this.budgets = new Map();

    /** @type {number} */
    this.totalBudget = 20; // Default global budget

    /** @type {boolean} */
    this.initialized = false;
  }

  /**
   * Initialize the task limiter with configuration
   * @param {Object} options - Configuration options
   * @param {number} [options.totalBudget=20] - Total concurrent operations across all domains
   * @param {Object} [options.budgets] - Per-domain budgets
   * @param {number} [options.budgets.discovery] - File discovery concurrency
   * @param {number} [options.budgets.glob] - fast-glob concurrency
   * @param {number} [options.budgets.transform] - Transformation concurrency
   */
  initialize(options = {}) {
    if (this.initialized) {
      return; // Already initialized
    }

    this.totalBudget = options.totalBudget ?? 20;

    // Set per-domain budgets (defaults ensure we don't exceed total budget)
    const defaults = {
      discovery: Math.floor(this.totalBudget * 0.4), // 40% for discovery (8 default)
      glob: Math.floor(this.totalBudget * 0.3), // 30% for glob (6 default)
      transform: Math.floor(this.totalBudget * 0.3), // 30% for transforms (6 default)
    };

    this.budgets = new Map(Object.entries({ ...defaults, ...options.budgets }));

    // Create limiters for each domain
    for (const [domain, budget] of this.budgets) {
      this.limiters.set(domain, pLimit(budget));
    }

    this.initialized = true;
  }

  /**
   * Get or create a limiter for a specific domain
   * @param {string} domain - Domain name (discovery, glob, transform, etc.)
   * @param {number} [defaultBudget] - Default budget if domain not configured
   * @returns {import('p-limit').LimitFunction} p-limit instance for this domain
   */
  for(domain, defaultBudget = 5) {
    if (!this.initialized) {
      // Auto-initialize with defaults
      this.initialize();
    }

    if (!this.limiters.has(domain)) {
      // Create new limiter for unregistered domain
      const budget = defaultBudget;
      this.budgets.set(domain, budget);
      this.limiters.set(domain, pLimit(budget));
    }

    return this.limiters.get(domain);
  }

  /**
   * Update budget for a specific domain
   * @param {string} domain - Domain name
   * @param {number} budget - New budget
   */
  setBudget(domain, budget) {
    if (budget < 1) {
      throw new Error(`Budget must be at least 1, got ${budget}`);
    }

    this.budgets.set(domain, budget);

    // Recreate limiter with new budget
    this.limiters.set(domain, pLimit(budget));
  }

  /**
   * Get current active count for a domain
   * @param {string} domain - Domain name
   * @returns {number} Number of active tasks
   */
  getActiveCount(domain) {
    const limiter = this.limiters.get(domain);
    return limiter ? limiter.activeCount : 0;
  }

  /**
   * Get pending count for a domain
   * @param {string} domain - Domain name
   * @returns {number} Number of pending tasks
   */
  getPendingCount(domain) {
    const limiter = this.limiters.get(domain);
    return limiter ? limiter.pendingCount : 0;
  }

  /**
   * Get total inflight tasks across all domains
   * @returns {number} Total active + pending tasks
   */
  getTotalInflight() {
    let total = 0;
    for (const limiter of this.limiters.values()) {
      total += limiter.activeCount + limiter.pendingCount;
    }
    return total;
  }

  /**
   * Get statistics for all domains
   * @returns {Object} Statistics object
   */
  getStats() {
    const stats = {};
    for (const [domain, limiter] of this.limiters) {
      stats[domain] = {
        budget: this.budgets.get(domain),
        active: limiter.activeCount,
        pending: limiter.pendingCount,
        utilization: limiter.activeCount / this.budgets.get(domain),
      };
    }
    stats.total = {
      budget: this.totalBudget,
      inflight: this.getTotalInflight(),
      utilization: this.getTotalInflight() / this.totalBudget,
    };
    return stats;
  }

  /**
   * Clear all queued tasks (emergency stop)
   */
  clearAll() {
    for (const limiter of this.limiters.values()) {
      limiter.clearQueue();
    }
  }

  /**
   * Wait for all tasks in a domain to complete
   * @param {string} domain - Domain name
   * @returns {Promise<void>}
   */
  async waitForDomain(domain) {
    const limiter = this.limiters.get(domain);
    if (!limiter) return;
    await this._waitUntilIdle(() => limiter.activeCount + limiter.pendingCount);
  }

  /**
   * Wait for all tasks across all domains to complete
   * @returns {Promise<void>}
   */
  async waitForAll() {
    await this._waitUntilIdle(() => {
      let inflight = 0;
      for (const limiter of this.limiters.values()) {
        inflight += limiter.activeCount + limiter.pendingCount;
      }
      return inflight;
    });
  }

  /**
   * Reset the task limiter (for testing)
   */
  reset() {
    this.clearAll();
    this.limiters.clear();
    this.budgets.clear();
    this.initialized = false;
  }

  /**
   * Wait for inflight work to drain.
   * p-limit does not expose an idle() promise, so we poll counts briefly.
   * @private
   * @param {() => number} getInflight
   */
  async _waitUntilIdle(getInflight) {
    while (getInflight() > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

// Global singleton instance
const globalTaskLimiter = new TaskLimiter();

/**
 * Get the global task limiter instance
 * @returns {TaskLimiter}
 */
export function getTaskLimiter() {
  return globalTaskLimiter;
}

/**
 * Convenience function to get a limiter for a domain
 * @param {string} domain - Domain name
 * @param {number} [defaultBudget] - Default budget if not configured
 * @returns {import('p-limit').LimitFunction}
 */
export function getLimiterFor(domain, defaultBudget) {
  return globalTaskLimiter.for(domain, defaultBudget);
}

/**
 * Initialize the global task limiter
 * @param {Object} options - Configuration options
 */
export function initializeTaskLimiter(options) {
  globalTaskLimiter.initialize(options);
}

export default globalTaskLimiter;
