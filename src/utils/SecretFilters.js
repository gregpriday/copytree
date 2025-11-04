/**
 * Allowlist and denylist filtering for secret detection
 *
 * Provides project-specific tuning to:
 * - Suppress known false positives (allowlist)
 * - Add custom patterns for project-specific secrets (denylist)
 *
 * Allowlist precedence: allowlist suppressions are applied AFTER pattern
 * matching but BEFORE reporting, ensuring no false positives reach users.
 */

import { minimatch } from 'minimatch';
import { validatePattern, SecretPatternError } from './secretPatterns.js';

/**
 * @typedef {Object} AllowlistRule
 * @property {'string'|'regex'|'glob'} type - Rule type
 * @property {string|RegExp} pattern - Pattern to match
 * @property {string} [reason] - Why this is allowlisted
 */

/**
 * @typedef {Object} DenylistPattern
 * @property {string} name - Pattern name
 * @property {string} pattern - Regex pattern string
 * @property {string} [description] - Pattern description
 * @property {'low'|'medium'|'high'} [severity] - Severity level
 * @property {string} [reason] - Why this pattern is added
 */

/**
 * Secret filter manager
 *
 * Handles allowlist (suppress findings) and denylist (custom patterns).
 */
export class SecretFilters {
  /**
   * @param {Object} options - Filter options
   * @param {Array<string|AllowlistRule>} [options.allowlist=[]] - Allowlist rules
   * @param {Array<DenylistPattern>} [options.denylist=[]] - Custom patterns
   */
  constructor(options = {}) {
    this.allowlistRules = this._compileAllowlist(options.allowlist || []);
    this.denylistPatterns = this._compileDenylist(options.denylist || []);
  }

  /**
   * Compile allowlist rules into executable predicates
   * @private
   */
  _compileAllowlist(rules) {
    const compiled = [];

    for (const rule of rules) {
      try {
        if (typeof rule === 'string') {
          // String rule - check if it's a regex pattern or literal
          if (rule.startsWith('/') && rule.endsWith('/')) {
            // Regex pattern: /pattern/
            const pattern = rule.slice(1, -1);
            compiled.push({
              type: 'regex',
              pattern: new RegExp(pattern, 'i'),
              test: (match) => new RegExp(pattern, 'i').test(match),
            });
          } else if (rule.includes('*') || rule.includes('?')) {
            // Glob pattern: *.example.com
            compiled.push({
              type: 'glob',
              pattern: rule,
              test: (match) => minimatch(match, rule, { nocase: true }),
            });
          } else {
            // Exact string match
            compiled.push({
              type: 'string',
              pattern: rule,
              test: (match) => match.toLowerCase().includes(rule.toLowerCase()),
            });
          }
        } else if (typeof rule === 'object') {
          // Structured rule object
          const { type, pattern, reason } = rule;

          if (type === 'regex') {
            const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
            compiled.push({
              type: 'regex',
              pattern: re,
              reason,
              test: (match) => re.test(match),
            });
          } else if (type === 'glob') {
            compiled.push({
              type: 'glob',
              pattern,
              reason,
              test: (match) => minimatch(match, pattern, { nocase: true }),
            });
          } else {
            // Default to string
            compiled.push({
              type: 'string',
              pattern,
              reason,
              test: (match) => match.toLowerCase().includes(pattern.toLowerCase()),
            });
          }
        }
      } catch (error) {
        // Skip invalid rules but log warning
        console.warn(`[SecretFilters] Invalid allowlist rule: ${rule}`, error.message);
      }
    }

    return compiled;
  }

  /**
   * Compile denylist patterns into pattern specs
   * @private
   */
  _compileDenylist(patterns) {
    const compiled = [];

    for (const pattern of patterns) {
      try {
        // Convert string pattern to RegExp
        let regex;
        if (typeof pattern.pattern === 'string') {
          // Add global flag if not present
          const flags = pattern.flags || 'g';
          regex = new RegExp(pattern.pattern, flags);
        } else if (pattern.pattern instanceof RegExp) {
          regex = pattern.pattern;
        } else {
          throw new Error('Pattern must be a string or RegExp');
        }

        // Build pattern spec
        const spec = {
          name: pattern.name,
          pattern: regex,
          description: pattern.description || `Custom pattern: ${pattern.name}`,
          severity: pattern.severity || 'medium',
          redactionLabel: pattern.redactionLabel || pattern.name.toUpperCase(),
          source: 'denylist',
          reason: pattern.reason,
        };

        // Validate pattern spec
        validatePattern(spec);
        compiled.push(spec);
      } catch (error) {
        throw new SecretPatternError(
          `Invalid denylist pattern "${pattern.name}": ${error.message}`,
          pattern,
          { originalError: error },
        );
      }
    }

    return compiled;
  }

  /**
   * Check if a match should be suppressed by allowlist
   *
   * @param {string} match - Matched string
   * @param {string} [filePath] - File path for context
   * @returns {boolean} True if match is allowlisted
   */
  isAllowlisted(match, filePath) {
    if (this.allowlistRules.length === 0) {
      return false;
    }

    // Check match against all rules
    for (const rule of this.allowlistRules) {
      if (rule.test(match)) {
        return true;
      }
    }

    // Also check file path if provided
    if (filePath) {
      for (const rule of this.allowlistRules) {
        if (rule.type === 'glob' && rule.test(filePath)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get denylist patterns to scan
   *
   * @returns {Array} Array of pattern specs
   */
  getDenylistPatterns() {
    return this.denylistPatterns;
  }

  /**
   * Filter findings by removing allowlisted matches
   *
   * @param {Array} findings - Array of findings
   * @returns {{filtered: Array, suppressed: Array}} Filtered and suppressed findings
   */
  filterFindings(findings) {
    const filtered = [];
    const suppressed = [];

    for (const finding of findings) {
      if (this.isAllowlisted(finding.match, finding.file)) {
        suppressed.push({
          ...finding,
          suppressedReason: 'allowlist',
        });
      } else {
        filtered.push(finding);
      }
    }

    return { filtered, suppressed };
  }

  /**
   * Get filter statistics
   *
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      allowlistRules: this.allowlistRules.length,
      denylistPatterns: this.denylistPatterns.length,
      ruleTypes: {
        string: this.allowlistRules.filter((r) => r.type === 'string').length,
        regex: this.allowlistRules.filter((r) => r.type === 'regex').length,
        glob: this.allowlistRules.filter((r) => r.type === 'glob').length,
      },
    };
  }
}

/**
 * Create filters from configuration object
 *
 * @param {Object} config - Configuration
 * @param {Array<string>} [config.allowlist] - Allowlist patterns
 * @param {Array<DenylistPattern>} [config.customPatterns] - Custom patterns
 * @returns {SecretFilters} Configured filters
 */
export function createFiltersFromConfig(config = {}) {
  return new SecretFilters({
    allowlist: config.allowlist || [],
    denylist: config.customPatterns || [],
  });
}

/**
 * Validate allowlist configuration
 *
 * @param {Array} allowlist - Allowlist to validate
 * @returns {{valid: boolean, errors: Array<string>}} Validation result
 */
export function validateAllowlist(allowlist) {
  const errors = [];

  if (!Array.isArray(allowlist)) {
    errors.push('Allowlist must be an array');
    return { valid: false, errors };
  }

  for (let i = 0; i < allowlist.length; i++) {
    const rule = allowlist[i];

    if (typeof rule === 'string') {
      // String rules are always valid
      continue;
    }

    if (typeof rule === 'object' && rule !== null) {
      if (!rule.pattern) {
        errors.push(`Allowlist rule ${i}: missing 'pattern' field`);
      }

      if (rule.type && !['string', 'regex', 'glob'].includes(rule.type)) {
        errors.push(`Allowlist rule ${i}: invalid type '${rule.type}'`);
      }

      // Try to compile regex if present
      if (rule.type === 'regex') {
        try {
          new RegExp(rule.pattern);
        } catch (error) {
          errors.push(`Allowlist rule ${i}: invalid regex: ${error.message}`);
        }
      }
    } else {
      errors.push(`Allowlist rule ${i}: must be string or object`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate denylist configuration
 *
 * @param {Array<DenylistPattern>} denylist - Denylist to validate
 * @returns {{valid: boolean, errors: Array<string>}} Validation result
 */
export function validateDenylist(denylist) {
  const errors = [];

  if (!Array.isArray(denylist)) {
    errors.push('Denylist must be an array');
    return { valid: false, errors };
  }

  const names = new Set();

  for (let i = 0; i < denylist.length; i++) {
    const pattern = denylist[i];

    if (typeof pattern !== 'object' || pattern === null) {
      errors.push(`Denylist pattern ${i}: must be an object`);
      continue;
    }

    // Check required fields
    if (!pattern.name) {
      errors.push(`Denylist pattern ${i}: missing 'name' field`);
    } else if (names.has(pattern.name)) {
      errors.push(`Denylist pattern ${i}: duplicate name '${pattern.name}'`);
    } else {
      names.add(pattern.name);
    }

    if (!pattern.pattern) {
      errors.push(`Denylist pattern ${i}: missing 'pattern' field`);
    } else {
      // Try to compile pattern
      try {
        new RegExp(pattern.pattern, pattern.flags || 'g');
      } catch (error) {
        errors.push(`Denylist pattern ${i}: invalid regex: ${error.message}`);
      }
    }

    // Validate severity if present
    if (pattern.severity && !['low', 'medium', 'high'].includes(pattern.severity)) {
      errors.push(`Denylist pattern ${i}: invalid severity '${pattern.severity}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
