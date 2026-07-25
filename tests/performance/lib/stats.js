/**
 * Summary statistics for benchmark samples.
 *
 * Reports median and p95 rather than mean: a single scheduling hiccup moves a
 * mean and leaves a median alone, and the mean of five samples is not a number
 * worth gating on. Outliers are reported, never silently dropped.
 */

/**
 * @param {number[]} values - Sample values
 * @param {number} p - Percentile in [0, 100]
 * @returns {number} The percentile value
 */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}

/** @param {number[]} values - Sample values @returns {number} Median */
export function median(values) {
  return percentile(values, 50);
}

/**
 * Median absolute deviation: a spread measure that a single outlier cannot
 * inflate, unlike standard deviation.
 * @param {number[]} values - Sample values
 * @returns {number} MAD
 */
export function medianAbsoluteDeviation(values) {
  if (values.length === 0) return 0;
  const mid = median(values);
  return median(values.map((value) => Math.abs(value - mid)));
}

/**
 * Coefficient of variation as a percentage. A scenario whose CV sits above
 * roughly 10% is too noisy to gate on and should be fixed or demoted.
 * @param {number[]} values - Sample values
 * @returns {number} CV percent
 */
export function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return (Math.sqrt(variance) / mean) * 100;
}

/**
 * Summarize one metric across samples.
 * @param {number[]} values - Sample values
 * @returns {Object} Summary
 */
export function summarize(values) {
  const clean = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (clean.length === 0) return null;

  return {
    n: clean.length,
    median: round(median(clean)),
    p95: round(percentile(clean, 95)),
    min: round(Math.min(...clean)),
    max: round(Math.max(...clean)),
    mad: round(medianAbsoluteDeviation(clean)),
    cvPercent: round(coefficientOfVariation(clean)),
  };
}

/**
 * Summarize every numeric metric present across a set of samples.
 * @param {Object[]} samples - Raw samples
 * @returns {Object} Metric name -> summary
 */
export function summarizeSamples(samples) {
  const keys = new Set();
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'number' && Number.isFinite(value)) keys.add(key);
    }
  }

  const out = {};
  for (const key of keys) {
    const summary = summarize(samples.map((sample) => sample[key]));
    if (summary) out[key] = summary;
  }
  return out;
}

/** @param {number} value - Any number @returns {number} Rounded to 3 decimals */
function round(value) {
  return Number(value.toFixed(3));
}
