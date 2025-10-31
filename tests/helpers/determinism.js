/**
 * Determinism helpers for stable test outputs
 *
 * These utilities normalize nondeterministic data (timestamps, paths, IDs)
 * to enable golden file comparisons and snapshot testing across environments.
 */

import path from 'path';
import os from 'os';

/**
 * Normalize absolute paths to relative, OS-agnostic format
 */
export function normalizePaths(content, options = {}) {
  const { basePath = process.cwd(), placeholder = '<PROJECT_ROOT>' } = options;

  let normalized = content;

  // Replace absolute paths with placeholder
  const absolutePattern = new RegExp(basePath.replace(/[/\\]/g, '[/\\\\]'), 'g');
  normalized = normalized.replace(absolutePattern, placeholder);

  // Normalize Windows paths to Unix style
  normalized = normalized.replace(/\\/g, '/');

  // Normalize home directory
  const homeDir = os.homedir();
  normalized = normalized.replace(new RegExp(homeDir.replace(/[/\\]/g, '[/\\\\]'), 'g'), '<HOME>');

  return normalized;
}

/**
 * Normalize timestamps to stable format
 */
export function normalizeTimestamps(content, options = {}) {
  const { placeholder = '<TIMESTAMP>', includeMillis = false } = options;

  let normalized = content;

  // ISO 8601 timestamps
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, placeholder);

  // Unix timestamps (milliseconds)
  if (includeMillis) {
    normalized = normalized.replace(/\b\d{13}\b/g, placeholder);
  }

  // Unix timestamps (seconds)
  normalized = normalized.replace(/\b\d{10}\b/g, placeholder);

  // Relative time strings
  normalized = normalized.replace(/\d+\s*(ms|second|minute|hour|day)s?\s*ago/gi, '<TIME_AGO>');

  return normalized;
}

/**
 * Normalize UUIDs and request IDs
 */
export function normalizeIds(content, options = {}) {
  const { uuidPlaceholder = '<UUID>', requestIdPlaceholder = '<REQUEST_ID>' } = options;

  let normalized = content;

  // UUIDs (v4)
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    uuidPlaceholder,
  );

  // Request IDs (various formats)
  normalized = normalized.replace(
    /"requestId"\s*:\s*"[^"]+"/g,
    `"requestId": "${requestIdPlaceholder}"`,
  );

  // Generic hash-like IDs (40 hex chars)
  normalized = normalized.replace(/\b[0-9a-f]{40}\b/gi, '<HASH>');

  return normalized;
}

/**
 * Normalize performance metrics (durations, memory)
 */
export function normalizeMetrics(content, options = {}) {
  const {
    durationPlaceholder = '<DURATION>',
    memoryPlaceholder = '<MEMORY>',
    sizePlaceholder = '<SIZE>',
  } = options;

  let normalized = content;

  // Duration values (ms, s, etc.)
  normalized = normalized.replace(
    /"(duration|latency|time)":\s*\d+(\.\d+)?/g,
    `"$1": ${durationPlaceholder}`,
  );
  normalized = normalized.replace(
    /\d+(\.\d+)?\s*(ms|milliseconds?|s|seconds?)/gi,
    durationPlaceholder,
  );

  // Memory values (bytes, MB, etc.)
  normalized = normalized.replace(
    /"(memory|memoryUsage|heapUsed)":\s*\d+(\.\d+)?/g,
    `"$1": ${memoryPlaceholder}`,
  );
  normalized = normalized.replace(/\d+(\.\d+)?\s*(bytes?|KB|MB|GB)/gi, memoryPlaceholder);

  // File sizes
  normalized = normalized.replace(/"(size|fileSize)":\s*\d+(\.\d+)?/g, `"$1": ${sizePlaceholder}`);

  return normalized;
}

/**
 * Normalize tokens/counts that vary by provider
 */
export function normalizeTokens(content, options = {}) {
  const { placeholder = '<TOKEN_COUNT>' } = options;

  let normalized = content;

  // Token counts
  normalized = normalized.replace(
    /"(tokensUsed|inputTokens|outputTokens|totalTokens)":\s*\d+/g,
    `"$1": ${placeholder}`,
  );

  return normalized;
}

/**
 * Comprehensive normalization for golden file comparisons
 */
export function normalizeForGolden(content, options = {}) {
  const { basePath = process.cwd(), normalizeAll = true } = options;

  let normalized = content;

  if (normalizeAll) {
    normalized = normalizePaths(normalized, { basePath });
    normalized = normalizeTimestamps(normalized);
    normalized = normalizeIds(normalized);
    normalized = normalizeMetrics(normalized);
    normalized = normalizeTokens(normalized);
  } else {
    // Apply selective normalization based on options
    if (options.paths !== false) {
      normalized = normalizePaths(normalized, options);
    }
    if (options.timestamps !== false) {
      normalized = normalizeTimestamps(normalized, options);
    }
    if (options.ids !== false) {
      normalized = normalizeIds(normalized, options);
    }
    if (options.metrics !== false) {
      normalized = normalizeMetrics(normalized, options);
    }
    if (options.tokens !== false) {
      normalized = normalizeTokens(normalized, options);
    }
  }

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n');

  // Trim trailing whitespace on each line
  normalized = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  return normalized;
}

/**
 * Seed random for deterministic tests
 */
export function seedRandom(seed = 12345) {
  // Simple seeded random implementation for tests
  let state = seed;
  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Mock date for deterministic time-based tests
 */
export function mockDate(isoString = '2025-01-15T12:00:00.000Z') {
  const mockNow = new Date(isoString).getTime();

  const originalDate = global.Date;
  const MockDate = class extends originalDate {
    constructor(...args) {
      if (args.length === 0) {
        super(mockNow);
      } else {
        super(...args);
      }
    }

    static now() {
      return mockNow;
    }
  };

  global.Date = MockDate;

  return () => {
    global.Date = originalDate;
  };
}

/**
 * Set locale for deterministic sorting/formatting
 */
export function setTestLocale(locale = 'en-US') {
  const original = process.env.LC_ALL;
  process.env.LC_ALL = locale;

  return () => {
    if (original !== undefined) {
      process.env.LC_ALL = original;
    } else {
      delete process.env.LC_ALL;
    }
  };
}
