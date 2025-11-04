/**
 * Telemetry and metrics system for performance monitoring
 *
 * Provides centralized metrics collection for:
 * - File discovery performance
 * - Operation timing (histograms)
 * - Error tracking (counters)
 * - Resource utilization (gauges)
 */

/**
 * Metrics storage
 */
class MetricsCollector {
  constructor() {
    /** @type {Map<string, number[]>} */
    this.histograms = new Map();

    /** @type {Map<string, number>} */
    this.counters = new Map();

    /** @type {Map<string, number>} */
    this.gauges = new Map();

    /** @type {boolean} */
    this.enabled = process.env.COPYTREE_METRICS === '1' || process.env.COPYTREE_METRICS === 'true';
  }

  /**
   * Record a timing value (histogram)
   * @param {string} name - Metric name
   * @param {number} value - Duration in milliseconds
   * @param {Object} [labels] - Optional labels for filtering
   */
  recordTiming(name, value, labels = {}) {
    if (!this.enabled) return;

    const key = this._makeKey(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key).push(value);
  }

  /**
   * Increment a counter
   * @param {string} name - Metric name
   * @param {number} [delta=1] - Amount to increment
   * @param {Object} [labels] - Optional labels for filtering
   */
  incrementCounter(name, delta = 1, labels = {}) {
    if (!this.enabled) return;

    const key = this._makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + delta);
  }

  /**
   * Set a gauge value
   * @param {string} name - Metric name
   * @param {number} value - Current value
   * @param {Object} [labels] - Optional labels for filtering
   */
  setGauge(name, value, labels = {}) {
    if (!this.enabled) return;

    const key = this._makeKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Get histogram statistics (min, max, mean, p50, p95, p99)
   * @param {string} name - Metric name
   * @param {Object} [labels] - Optional labels for filtering
   * @returns {Object|null} Statistics object or null if no data
   */
  getHistogramStats(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const values = this.histograms.get(key);

    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: sum / sorted.length,
      p50: this._percentile(sorted, 0.5),
      p95: this._percentile(sorted, 0.95),
      p99: this._percentile(sorted, 0.99),
    };
  }

  /**
   * Get counter value
   * @param {string} name - Metric name
   * @param {Object} [labels] - Optional labels for filtering
   * @returns {number} Counter value
   */
  getCounter(name, labels = {}) {
    const key = this._makeKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get gauge value
   * @param {string} name - Metric name
   * @param {Object} [labels] - Optional labels for filtering
   * @returns {number|undefined} Gauge value
   */
  getGauge(name, labels = {}) {
    const key = this._makeKey(name, labels);
    return this.gauges.get(key);
  }

  /**
   * Get all metrics
   * @returns {Object} All metrics data
   */
  getAll() {
    const histogramStats = {};
    for (const [key, _values] of this.histograms) {
      const { name, labels } = this._parseKey(key);
      if (!histogramStats[name]) {
        histogramStats[name] = [];
      }
      histogramStats[name].push({
        labels,
        ...this.getHistogramStats(name, labels),
      });
    }

    const counters = {};
    for (const [key, value] of this.counters) {
      const { name, labels } = this._parseKey(key);
      if (!counters[name]) {
        counters[name] = [];
      }
      counters[name].push({ labels, value });
    }

    const gauges = {};
    for (const [key, value] of this.gauges) {
      const { name, labels } = this._parseKey(key);
      if (!gauges[name]) {
        gauges[name] = [];
      }
      gauges[name].push({ labels, value });
    }

    return {
      histograms: histogramStats,
      counters,
      gauges,
      enabled: this.enabled,
    };
  }

  /**
   * Format metrics for display
   * @returns {string} Formatted metrics
   */
  format() {
    if (!this.enabled) {
      return 'Metrics disabled (set COPYTREE_METRICS=1 to enable)';
    }

    const lines = ['=== Metrics ===', ''];

    // Histograms
    const histogramStats = {};
    for (const [key, _values] of this.histograms) {
      const { name, labels } = this._parseKey(key);
      if (!histogramStats[name]) {
        histogramStats[name] = [];
      }
      histogramStats[name].push({
        labels,
        ...this.getHistogramStats(name, labels),
      });
    }

    if (Object.keys(histogramStats).length > 0) {
      lines.push('Histograms:');
      for (const [name, entries] of Object.entries(histogramStats)) {
        lines.push(`  ${name}:`);
        for (const entry of entries) {
          const labelStr = Object.keys(entry.labels).length > 0 ? ` {${JSON.stringify(entry.labels)}}` : '';
          lines.push(
            `    ${labelStr} count=${entry.count}, min=${entry.min.toFixed(2)}ms, max=${entry.max.toFixed(2)}ms, ` +
              `mean=${entry.mean.toFixed(2)}ms, p50=${entry.p50.toFixed(2)}ms, p95=${entry.p95.toFixed(2)}ms, p99=${entry.p99.toFixed(2)}ms`,
          );
        }
      }
      lines.push('');
    }

    // Counters
    if (this.counters.size > 0) {
      lines.push('Counters:');
      for (const [key, value] of this.counters) {
        const { name, labels } = this._parseKey(key);
        const labelStr = Object.keys(labels).length > 0 ? ` {${JSON.stringify(labels)}}` : '';
        lines.push(`  ${name}${labelStr}: ${value}`);
      }
      lines.push('');
    }

    // Gauges
    if (this.gauges.size > 0) {
      lines.push('Gauges:');
      for (const [key, value] of this.gauges) {
        const { name, labels } = this._parseKey(key);
        const labelStr = Object.keys(labels).length > 0 ? ` {${JSON.stringify(labels)}}` : '';
        lines.push(`  ${name}${labelStr}: ${value}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.histograms.clear();
    this.counters.clear();
    this.gauges.clear();
  }

  /**
   * Calculate percentile from sorted array
   * @private
   */
  _percentile(sorted, percentile) {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Make a key from name and labels
   * @private
   */
  _makeKey(name, labels) {
    if (Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Parse a key into name and labels
   * @private
   */
  _parseKey(key) {
    const match = key.match(/^([^{]+)(?:\{([^}]+)\})?$/);
    if (!match) {
      return { name: key, labels: {} };
    }

    const [, name, labelStr] = match;
    const labels = {};

    if (labelStr) {
      for (const pair of labelStr.split(',')) {
        const [k, v] = pair.split('=');
        labels[k] = v;
      }
    }

    return { name, labels };
  }
}

// Global singleton instance
const globalMetrics = new MetricsCollector();

/**
 * Get the global metrics collector
 * @returns {MetricsCollector}
 */
export function getMetrics() {
  return globalMetrics;
}

/**
 * Record a timing metric
 * @param {string} name - Metric name
 * @param {number} value - Duration in milliseconds
 * @param {Object} [labels] - Optional labels
 */
export function recordTiming(name, value, labels) {
  globalMetrics.recordTiming(name, value, labels);
}

/**
 * Increment a counter
 * @param {string} name - Metric name
 * @param {number} [delta=1] - Amount to increment
 * @param {Object} [labels] - Optional labels
 */
export function incrementCounter(name, delta, labels) {
  globalMetrics.incrementCounter(name, delta, labels);
}

/**
 * Set a gauge value
 * @param {string} name - Metric name
 * @param {number} value - Current value
 * @param {Object} [labels] - Optional labels
 */
export function setGauge(name, value, labels) {
  globalMetrics.setGauge(name, value, labels);
}

export default globalMetrics;
