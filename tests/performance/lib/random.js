/**
 * Seeded pseudo-random number generation for benchmark fixtures.
 *
 * Benchmarks compare a candidate against a baseline, so the workload has to be
 * byte-identical between the two runs. `Math.random()` cannot give that, and a
 * fixture that differs between runs turns every measurement into noise.
 */

/**
 * mulberry32: a small, fast, well-distributed 32-bit PRNG.
 *
 * @param {number} seed - Integer seed
 * @returns {() => number} Generator returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded generator with the helpers fixture building actually needs.
 */
export class SeededRandom {
  /**
   * @param {number} seed - Integer seed
   */
  constructor(seed) {
    this.seed = seed;
    this._next = mulberry32(seed);
  }

  /** @returns {number} Float in [0, 1) */
  float() {
    return this._next();
  }

  /**
   * @param {number} min - Inclusive lower bound
   * @param {number} max - Inclusive upper bound
   * @returns {number} Integer in [min, max]
   */
  int(min, max) {
    return min + Math.floor(this._next() * (max - min + 1));
  }

  /**
   * @template T
   * @param {T[]} items - Items to choose from
   * @returns {T} A deterministically chosen item
   */
  pick(items) {
    return items[Math.floor(this._next() * items.length)];
  }

  /**
   * @param {number} length - Number of characters
   * @returns {string} Lowercase alphanumeric string
   */
  token(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(this._next() * chars.length)];
    }
    return out;
  }
}

export default SeededRandom;
