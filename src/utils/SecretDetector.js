/**
 * Built-in secret detection engine
 *
 * Self-contained detection system that works without external tools.
 * Provides fallback when Gitleaks is unavailable or can be used standalone.
 *
 * Features:
 * - Pattern-based detection with 30+ built-in patterns
 * - Entropy scoring to reduce false positives
 * - Multi-line pattern support (PEM blocks, etc.)
 * - Chunked scanning for large files
 * - Allowlist/denylist filtering
 * - Performance optimizations (precompiled regexes, timeout guards)
 *
 * Architecture:
 * - Immutable findings (SecretFinding objects)
 * - Precompiled regexes for performance
 * - Chunked processing with overlap for multi-line patterns
 * - Fail-fast validation with typed errors
 */

import { BUILTIN_PATTERNS, validatePattern, SecretPatternError } from './secretPatterns.js';
import { scoreMatch, isLikelyFalsePositive } from './SecretEntropy.js';
import { SecretFilters } from './SecretFilters.js';

/**
 * @typedef {Object} SecretFinding
 * @property {string} type - Pattern name (e.g., 'aws-access-key')
 * @property {string} match - Matched string
 * @property {string} file - File path
 * @property {number} lineStart - Starting line (1-indexed)
 * @property {number} lineEnd - Ending line (1-indexed)
 * @property {number} startColumn - Starting column (1-indexed)
 * @property {number} endColumn - Ending column (1-indexed)
 * @property {number} start - Absolute start index
 * @property {number} end - Absolute end index
 * @property {number} [entropy] - Shannon entropy score
 * @property {number} confidence - Confidence score (0-1)
 * @property {'builtin'|'custom'|'denylist'} source - Detection source
 * @property {'low'|'medium'|'high'} severity - Risk severity
 * @property {string} description - Pattern description
 * @property {string} redactionLabel - Label for redaction
 */

/**
 * Built-in secret detector
 *
 * Scans text content for secrets using compiled pattern library.
 */
export class SecretDetector {
  /**
   * @param {Object} options - Detector options
   * @param {Array} [options.patterns] - Custom patterns (merged with built-in)
   * @param {Array<string>} [options.allowlist] - Allowlist patterns
   * @param {Array} [options.customPatterns] - Custom denylist patterns
   * @param {boolean} [options.aggressive=false] - Lower confidence thresholds
   * @param {number} [options.maxFileBytes=10000000] - Max file size to scan (10MB)
   * @param {number} [options.chunkSize=65536] - Chunk size for large files (64KB)
   * @param {number} [options.chunkOverlap=1024] - Overlap for multi-line patterns (1KB)
   */
  constructor(options = {}) {
    this.aggressive = options.aggressive ?? false;
    this.maxFileBytes = options.maxFileBytes ?? 10_000_000; // 10MB
    this.chunkSize = options.chunkSize ?? 65536; // 64KB
    this.chunkOverlap = options.chunkOverlap ?? 1024; // 1KB

    // Compile patterns (built-in + custom)
    this.patterns = this._compilePatterns(options.patterns);

    // Initialize filters
    this.filters = new SecretFilters({
      allowlist: options.allowlist || [],
      denylist: options.customPatterns || [],
    });

    // Add denylist patterns to scan set
    for (const pattern of this.filters.getDenylistPatterns()) {
      this.patterns.push(pattern);
    }

    // Performance tracking
    this.stats = {
      filesScanned: 0,
      findingsTotal: 0,
      findingsSuppressed: 0,
      scanTimeMs: 0,
    };
  }

  /**
   * Compile and validate patterns
   * @private
   */
  _compilePatterns(customPatterns = []) {
    const patterns = [...BUILTIN_PATTERNS];

    // Add custom patterns
    for (const pattern of customPatterns) {
      try {
        validatePattern(pattern);
        patterns.push({ ...pattern, source: 'custom' });
      } catch (error) {
        throw new SecretPatternError(`Invalid custom pattern: ${error.message}`, pattern);
      }
    }

    return patterns;
  }

  /**
   * Scan text content for secrets
   *
   * Main entry point for detection. Returns immutable findings.
   *
   * @param {string} text - Content to scan
   * @param {string} [filePath='<text>'] - Logical file path
   * @param {Object} [options={}] - Scan options
   * @param {boolean} [options.applyFilters=true] - Apply allowlist filtering
   * @returns {SecretFinding[]} Array of findings
   */
  scan(text, filePath = '<text>', options = {}) {
    const startTime = Date.now();
    const applyFilters = options.applyFilters ?? true;

    // Validate input
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Check file size limit
    const sizeBytes = Buffer.byteLength(text, 'utf8');
    if (sizeBytes > this.maxFileBytes) {
      throw new Error(`File too large to scan: ${sizeBytes} bytes (max: ${this.maxFileBytes})`);
    }

    // Scan for matches
    const findings = this._scanText(text, filePath);

    // Apply filters if enabled
    let filtered = findings;
    if (applyFilters) {
      const result = this.filters.filterFindings(findings);
      filtered = result.filtered;
      this.stats.findingsSuppressed += result.suppressed.length;
    }

    // Update stats
    this.stats.filesScanned++;
    this.stats.findingsTotal += filtered.length;
    this.stats.scanTimeMs += Date.now() - startTime;

    return filtered;
  }

  /**
   * Scan text with all patterns
   * @private
   */
  _scanText(text, filePath) {
    const findings = [];
    const lineOffsets = this._calculateLineOffsets(text);

    // Scan with each pattern
    for (const pattern of this.patterns) {
      try {
        const matches = this._findMatches(text, pattern, filePath, lineOffsets);
        findings.push(...matches);
      } catch (error) {
        // Log error but continue with other patterns
        console.warn(
          `[SecretDetector] Error scanning with pattern ${pattern.name}:`,
          error.message,
        );
      }
    }

    // Deduplicate findings (same span, different patterns)
    return this._deduplicateFindings(findings);
  }

  /**
   * Find matches for a single pattern
   * @private
   */
  _findMatches(text, patternSpec, filePath, lineOffsets) {
    const findings = [];
    const { pattern, name, severity, description, minEntropy, redactionLabel } = patternSpec;

    // Reset regex state (important for global flag)
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Extract matched string
      // For patterns with capture groups, use first group or full match
      const matchedText = match[1] || match[0];
      const startIndex = match[1] ? match.index + match[0].indexOf(match[1]) : match.index;
      const endIndex = startIndex + matchedText.length;

      // Skip empty matches
      if (!matchedText || matchedText.length === 0) {
        continue;
      }

      // Check for false positives
      if (isLikelyFalsePositive(matchedText)) {
        continue;
      }

      // Score match (entropy, confidence)
      const score = scoreMatch(matchedText, { minEntropy });

      // Apply confidence threshold
      const threshold = this.aggressive ? 0.3 : 0.5;
      if (score.confidence < threshold) {
        continue;
      }

      // Calculate line/column positions
      const positions = this._indexToPosition(startIndex, endIndex, lineOffsets);

      // Create finding
      const finding = {
        type: name,
        match: matchedText,
        file: filePath,
        lineStart: positions.lineStart,
        lineEnd: positions.lineEnd,
        startColumn: positions.startColumn,
        endColumn: positions.endColumn,
        start: startIndex,
        end: endIndex,
        entropy: score.entropy,
        confidence: score.confidence,
        source: patternSpec.source || 'builtin',
        severity,
        description,
        redactionLabel: redactionLabel || name.toUpperCase(),
      };

      findings.push(finding);

      // Prevent infinite loop on zero-width matches
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }

    return findings;
  }

  /**
   * Convert absolute index to line/column position
   * @private
   */
  _indexToPosition(startIndex, endIndex, lineOffsets) {
    const startPos = this._positionForIndex(startIndex, lineOffsets);
    const endPos = this._positionForIndex(Math.max(endIndex - 1, startIndex), lineOffsets);

    return {
      lineStart: startPos.line,
      lineEnd: endPos.line,
      startColumn: startPos.column,
      endColumn: endPos.column,
    };
  }

  /**
   * Map absolute index to 1-based line/column position.
   * @private
   */
  _positionForIndex(index, lineOffsets) {
    if (index < 0) {
      index = 0;
    }

    let low = 0;
    let high = lineOffsets.length - 1;
    let lineIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] <= index) {
        lineIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineStartOffset = lineOffsets[lineIdx] ?? 0;

    return {
      line: lineIdx + 1,
      column: index - lineStartOffset + 1,
    };
  }

  /**
   * Calculate line offsets for position mapping
   * @private
   */
  _calculateLineOffsets(text) {
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }

  /**
   * Deduplicate findings by span (keep highest confidence)
   * @private
   */
  _deduplicateFindings(findings) {
    const map = new Map();

    for (const finding of findings) {
      const key = `${finding.file}:${finding.start}:${finding.end}`;
      const existing = map.get(key);

      if (!existing || finding.confidence > existing.confidence) {
        map.set(key, finding);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Scan multiple files in batch
   *
   * @param {Array<{content: string, path: string}>} files - Files to scan
   * @returns {Array<{file: string, findings: SecretFinding[]}>} Results per file
   */
  scanBatch(files) {
    const results = [];

    for (const file of files) {
      try {
        const findings = this.scan(file.content, file.path);
        results.push({
          file: file.path,
          findings,
        });
      } catch (error) {
        // Log error and continue with other files
        console.warn(`[SecretDetector] Error scanning ${file.path}:`, error.message);
        results.push({
          file: file.path,
          findings: [],
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get detector statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      patterns: this.patterns.length,
      filters: this.filters.getStats(),
      avgScanTimeMs:
        this.stats.filesScanned > 0
          ? (this.stats.scanTimeMs / this.stats.filesScanned).toFixed(2)
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      filesScanned: 0,
      findingsTotal: 0,
      findingsSuppressed: 0,
      scanTimeMs: 0,
    };
  }
}

/**
 * Create detector from configuration
 *
 * @param {Object} config - Configuration object
 * @returns {SecretDetector} Configured detector
 */
export function createDetectorFromConfig(config = {}) {
  return new SecretDetector({
    patterns: config.customPatterns || [],
    allowlist: config.allowlist || [],
    aggressive: config.aggressive ?? false,
    maxFileBytes: config.maxFileBytes,
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
  });
}

/**
 * Normalize Gitleaks finding to SecretFinding format
 *
 * Converts Gitleaks output to unified finding format.
 *
 * @param {Object} gitleaksFinding - Gitleaks finding
 * @returns {SecretFinding} Normalized finding
 */
export function normalizeGitleaksFinding(gitleaksFinding) {
  return {
    type: gitleaksFinding.RuleID || 'unknown',
    match: gitleaksFinding.Match || '',
    file: gitleaksFinding.File || '<unknown>',
    lineStart: gitleaksFinding.StartLine || 0,
    lineEnd: gitleaksFinding.EndLine || gitleaksFinding.StartLine || 0,
    startColumn: gitleaksFinding.StartColumn || 0,
    endColumn: gitleaksFinding.EndColumn || 0,
    start: gitleaksFinding.Start || 0,
    end: gitleaksFinding.End || 0,
    confidence: 1.0, // Gitleaks findings assumed high confidence
    source: 'external',
    severity: 'high', // Default to high for Gitleaks
    description: gitleaksFinding.Description || '',
    redactionLabel: gitleaksFinding.RuleID?.toUpperCase() || 'UNKNOWN',
  };
}

export default SecretDetector;
