import { minimatch } from 'minimatch';
import path from 'path';

/**
 * Advanced rule-based file filtering
 * Supports include, exclude, and always patterns with complex rule objects
 */
class RulesetFilter {
  constructor(includeRules = [], excludeRules = [], alwaysRules = []) {
    this.includeRules = this.normalizeRules(includeRules);
    this.excludeRules = this.normalizeRules(excludeRules);
    this.alwaysRules = this.normalizeRules(alwaysRules);
  }

  /**
   * Check if a file should be accepted
   */
  accept(file) {
    // Check always rules first (highest priority)
    if (this.matchesAny(file, this.alwaysRules)) {
      return true;
    }

    // Check exclude rules
    if (this.matchesAny(file, this.excludeRules)) {
      return false;
    }

    // Check include rules
    // If no include rules, accept all non-excluded files
    return this.includeRules.length === 0 || this.matchesAny(file, this.includeRules);
  }

  /**
   * Check if file matches any of the rules
   */
  matchesAny(file, rules) {
    for (const rule of rules) {
      if (this.matchesRule(file, rule)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file matches a single rule
   */
  matchesRule(file, rule) {
    if (typeof rule === 'string') {
      // Simple glob pattern
      return this.matchesGlob(file.relativePath, rule);
    } else if (typeof rule === 'object') {
      // Complex rule object
      return this.matchesComplexRule(file, rule);
    }
    return false;
  }

  /**
   * Match file against glob pattern
   */
  matchesGlob(filePath, pattern) {
    return minimatch(filePath, pattern, {
      matchBase: true,
      dot: true,
      nocase: process.platform === 'win32',
    });
  }

  /**
   * Match file against complex rule object
   */
  matchesComplexRule(file, rule) {
    // Rule can have multiple conditions that must all match
    for (const [field, condition] of Object.entries(rule)) {
      if (!this.matchesCondition(file, field, condition)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Match a single condition
   */
  matchesCondition(file, field, condition) {
    const value = this.getFieldValue(file, field);

    if (typeof condition === 'string') {
      // Simple equality
      return value === condition;
    } else if (typeof condition === 'object') {
      // Complex condition with operators
      return this.matchesOperator(value, condition);
    }

    return false;
  }

  /**
   * Get field value from file object
   */
  getFieldValue(file, field) {
    switch (field) {
    case 'path':
    case 'relativePath':
      return file.relativePath;

    case 'folder':
    case 'directory':
      return path.dirname(file.relativePath);

    case 'filename':
    case 'name':
      return path.basename(file.relativePath);

    case 'extension':
    case 'ext':
      return path.extname(file.relativePath).toLowerCase();

    case 'size':
      return file.stats?.size || 0;

    case 'content':
      return file.content?.toString() || '';

    case 'type':
      return file.type || 'unknown';

    default:
      return file[field];
    }
  }

  /**
   * Match value against operator condition
   */
  matchesOperator(value, condition) {
    const operator = condition.operator || condition.op || '=';
    const compareValue = condition.value || condition.val;

    switch (operator) {
    case '=':
    case '==':
    case 'equals':
      return value === compareValue;

    case '!=':
    case 'not':
    case 'notEquals':
      return value !== compareValue;

    case 'contains':
    case 'includes':
      return String(value).includes(String(compareValue));

    case 'startsWith':
    case 'begins':
      return String(value).startsWith(String(compareValue));

    case 'endsWith':
    case 'ends':
      return String(value).endsWith(String(compareValue));

    case 'regex':
    case 'matches':
      return new RegExp(compareValue).test(String(value));

    case '>':
    case 'gt':
      return Number(value) > Number(compareValue);

    case '>=':
    case 'gte':
      return Number(value) >= Number(compareValue);

    case '<':
    case 'lt':
      return Number(value) < Number(compareValue);

    case '<=':
    case 'lte':
      return Number(value) <= Number(compareValue);

    case 'in':
      return Array.isArray(compareValue) && compareValue.includes(value);

    case 'notIn':
      return Array.isArray(compareValue) && !compareValue.includes(value);

    default:
      return false;
    }
  }

  /**
   * Normalize rules to ensure consistent format
   */
  normalizeRules(rules) {
    if (!Array.isArray(rules)) {
      return rules ? [rules] : [];
    }
    return rules.filter((rule) => rule !== null && rule !== undefined);
  }
}

export default RulesetFilter;
