const braces = require('braces');
const path = require('path');

class PatternExpander {
  /**
   * Expand brace patterns into an array of patterns
   * Examples:
   * - "*.{js,ts}" -> ["*.js", "*.ts"]
   * - "src/{components,utils}/*.js" -> ["src/components/*.js", "src/utils/*.js"]
   * - "{src,lib}/**/*.{js,ts}" -> ["src/**/*.js", "src/**/*.ts", "lib/**/*.js", "lib/**/*.ts"]
   */
  static expand(pattern) {
    if (typeof pattern !== 'string') {
      return [pattern];
    }
    
    try {
      return braces(pattern);
    } catch (error) {
      // If expansion fails, return the original pattern
      return [pattern];
    }
  }
  
  /**
   * Expand multiple patterns
   */
  static expandMultiple(patterns) {
    if (!Array.isArray(patterns)) {
      return this.expand(patterns);
    }
    
    const expanded = [];
    for (const pattern of patterns) {
      expanded.push(...this.expand(pattern));
    }
    
    // Remove duplicates
    return [...new Set(expanded)];
  }
  
  /**
   * Normalize patterns for cross-platform compatibility
   */
  static normalize(pattern) {
    // Convert Windows backslashes to forward slashes
    return pattern.replace(/\\/g, '/');
  }
  
  /**
   * Check if a pattern contains braces
   */
  static hasBraces(pattern) {
    return /\{.*\}/.test(pattern);
  }
  
  /**
   * Expand and normalize patterns
   */
  static expandAndNormalize(patterns) {
    const expanded = this.expandMultiple(patterns);
    return expanded.map(p => this.normalize(p));
  }
}

module.exports = PatternExpander;