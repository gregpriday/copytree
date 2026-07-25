/**
 * Manifest construction.
 *
 * The manifest is the lightweight view of a run: one entry per file, with no
 * content retained, safe to hold in a long-lived process. Entries carry an
 * outcome, not just a path and size — a structure-only lockfile and a fully
 * included source file are not the same thing, and a preview built from the
 * manifest has to be able to tell them apart.
 */

import { minimatch } from 'minimatch';
import { categorizeByExt } from './BinaryDetector.js';

/**
 * Stable manifest outcome values.
 *
 * `excluded:<reason>` entries use the reason keys from
 * {@link module:utils/exclusionReport.EXCLUSION_REASONS}.
 *
 * @readonly
 * @enum {string}
 */
export const MANIFEST_OUTCOMES = Object.freeze({
  /** Content was included in the output */
  INCLUDED: 'included',
  /** Present in the tree, content deliberately omitted (lock files, SVG) */
  STRUCTURE_ONLY: 'structure-only',
  /** Present in the tree as a one-line placeholder (binary, media) */
  BINARY_PLACEHOLDER: 'binary-placeholder',
  /** Included, but content was cut by the character budget */
  TRUNCATED: 'truncated',
});

/**
 * @typedef {Object} ManifestEntry
 * @property {string} path - POSIX path relative to the base path
 * @property {number} size - File size in bytes
 * @property {string} [modified] - ISO timestamp of last modification
 * @property {string} outcome - One of {@link MANIFEST_OUTCOMES}, or `excluded:<reason>`
 */

/**
 * Classify what happened to a single file.
 *
 * Works both after loading (using the flags the loading stage set) and on a dry
 * run (predicting from the path and config), so a preview and the real run
 * agree.
 *
 * @param {Object} file - File entry
 * @param {Object} [options={}] - Classification inputs
 * @param {string[]} [options.structureOnlyPatterns=[]] - Patterns treated as structure-only
 * @param {Object} [options.binaryExtensions] - Grouped binary extension config
 * @returns {string} Outcome value
 */
export function classifyOutcome(file, options = {}) {
  if (!file) return MANIFEST_OUTCOMES.INCLUDED;

  if (file.excludedReason && file.excluded && !file.isBinary) {
    return `excluded:${file.excludedReason}`;
  }

  if (file.truncated) {
    return MANIFEST_OUTCOMES.TRUNCATED;
  }

  if (file.binaryCategory === 'structure-only') {
    return MANIFEST_OUTCOMES.STRUCTURE_ONLY;
  }

  if (file.isBinary) {
    return MANIFEST_OUTCOMES.BINARY_PLACEHOLDER;
  }

  // Content has not been loaded (dry run): predict from the path.
  if (file.content === undefined) {
    const patterns = options.structureOnlyPatterns || [];
    const isStructureOnly = patterns.some((pattern) =>
      minimatch(file.path, pattern, { dot: true, nocase: process.platform === 'win32' }),
    );
    if (isStructureOnly) return MANIFEST_OUTCOMES.STRUCTURE_ONLY;

    const ext = extname(file.path);
    if (categorizeByExt(ext, options.binaryExtensions)) {
      return MANIFEST_OUTCOMES.BINARY_PLACEHOLDER;
    }
  }

  return MANIFEST_OUTCOMES.INCLUDED;
}

/**
 * Build the manifest for a set of files.
 *
 * @param {Array<Object>} files - File entries
 * @param {Object} [options={}] - Same options as {@link classifyOutcome}
 * @returns {ManifestEntry[]} Manifest entries
 */
export function buildManifest(files, options = {}) {
  const list = Array.isArray(files) ? files : [];

  return list.filter(Boolean).map((file) => {
    const entry = {
      path: file.path,
      size: file.size || 0,
      outcome: classifyOutcome(file, options),
    };

    if (file.modified) {
      entry.modified =
        file.modified instanceof Date ? file.modified.toISOString() : String(file.modified);
    }

    return entry;
  });
}

/**
 * Extract a lowercase extension from a POSIX path.
 * @param {string} filePath - POSIX path
 * @returns {string} Extension including the dot, or an empty string
 */
function extname(filePath) {
  const base =
    String(filePath || '')
      .split('/')
      .pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}
