import {
  getTaskLimiter,
  getLimiterFor,
  initializeTaskLimiter,
} from '../../../src/utils/taskLimiter.js';

describe('taskLimiter', () => {
  const limiter = getTaskLimiter();

  beforeEach(() => {
    limiter.reset();
  });

  test('initializes budgets and stats', () => {
    initializeTaskLimiter({
      totalBudget: 12,
      budgets: {
        discovery: 5,
        glob: 4,
        transform: 3,
      },
    });

    const stats = limiter.getStats();
    expect(stats.discovery.budget).toBe(5);
    expect(stats.glob.budget).toBe(4);
    expect(stats.transform.budget).toBe(3);
    expect(stats.total.budget).toBe(12);
  });

  test('does not reinitialize after first initialization', () => {
    initializeTaskLimiter({ totalBudget: 9, budgets: { discovery: 9 } });
    initializeTaskLimiter({ totalBudget: 100, budgets: { discovery: 100 } });

    const stats = limiter.getStats();
    expect(stats.discovery.budget).toBe(9);
    expect(stats.total.budget).toBe(9);
  });

  test('creates limiter for unknown domain with default budget', () => {
    const customLimiter = getLimiterFor('custom');
    expect(customLimiter).toBeDefined();

    const stats = limiter.getStats();
    expect(stats.custom.budget).toBe(5);
  });

  test('updates budget and validates invalid values', () => {
    getLimiterFor('io', 2);
    limiter.setBudget('io', 7);
    expect(limiter.getStats().io.budget).toBe(7);

    expect(() => limiter.setBudget('io', 0)).toThrow(/Budget must be at least 1/);
  });

  test('returns zero counts for unknown domains', () => {
    expect(limiter.getActiveCount('missing')).toBe(0);
    expect(limiter.getPendingCount('missing')).toBe(0);
  });

  test('waitForDomain waits for active and pending work to drain', async () => {
    const ioLimiter = getLimiterFor('io', 1);
    let completed = false;

    ioLimiter(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      completed = true;
    });

    await limiter.waitForDomain('io');

    expect(completed).toBe(true);
    expect(limiter.getActiveCount('io')).toBe(0);
    expect(limiter.getPendingCount('io')).toBe(0);
  });

  test('waitForAll waits for all domains', async () => {
    const a = getLimiterFor('a', 1);
    const b = getLimiterFor('b', 1);
    let doneA = false;
    let doneB = false;

    a(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      doneA = true;
    });
    b(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      doneB = true;
    });

    await limiter.waitForAll();

    expect(doneA).toBe(true);
    expect(doneB).toBe(true);
    expect(limiter.getTotalInflight()).toBe(0);
  });

  test('clearAll drops queued tasks', async () => {
    const q = getLimiterFor('queue', 1);
    let ran = 0;

    q(async () => {
      ran++;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    q(async () => {
      ran++;
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    limiter.clearAll();
    await limiter.waitForDomain('queue');

    expect(ran).toBe(1);
  });
});
