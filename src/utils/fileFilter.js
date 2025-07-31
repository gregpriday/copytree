const { minimatch } = require('minimatch');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class FileFilter {
  constructor(basePath = '.') {
    this.basePath = basePath;
    this.patterns = [];
    
    // Add default exclusions
    if (config.defaultExclusions) {
      this.addPatterns(config.defaultExclusions);
    }
    
    // Load .gitignore if it exists
    this.loadGitignore();
    
    // Load .copytreeignore if it exists
    this.loadCopytreeignore();
  }
  
  loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      this.addGitignorePatterns(content);
    }
  }
  
  loadCopytreeignore() {
    const copytreeignorePath = path.join(this.basePath, '.copytreeignore');
    if (fs.existsSync(copytreeignorePath)) {
      const content = fs.readFileSync(copytreeignorePath, 'utf8');
      this.addGitignorePatterns(content);
    }
  }
  
  addGitignorePatterns(content) {
    // Parse gitignore content
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Convert gitignore pattern to minimatch pattern
      let pattern = trimmed;
      
      // Handle negation patterns
      const isNegated = pattern.startsWith('!');
      if (isNegated) {
        pattern = pattern.substring(1);
      }
      
      // If pattern doesn't start with /, it matches anywhere
      if (!pattern.startsWith('/')) {
        pattern = '**/' + pattern;
      } else {
        // Remove leading slash for relative matching
        pattern = pattern.substring(1);
      }
      
      // If pattern ends with /, it only matches directories
      if (pattern.endsWith('/')) {
        pattern = pattern + '**';
      }
      
      this.patterns.push({
        pattern,
        isNegated,
        original: trimmed
      });
    }
  }
  
  addPatterns(patterns) {
    if (Array.isArray(patterns)) {
      patterns.forEach(p => this.addPattern(p));
    } else if (typeof patterns === 'string') {
      patterns.split('\n').forEach(p => this.addPattern(p.trim()));
    }
  }
  
  addPattern(pattern) {
    if (!pattern || pattern.startsWith('#')) return;
    
    // Check if it's a negation pattern
    const isNegated = pattern.startsWith('!');
    let cleanPattern = isNegated ? pattern.substring(1) : pattern;
    
    // Convert gitignore pattern to minimatch pattern
    // If pattern doesn't start with /, it matches anywhere
    if (!cleanPattern.startsWith('/')) {
      cleanPattern = '**/' + cleanPattern;
    } else {
      // Remove leading slash for relative matching
      cleanPattern = cleanPattern.substring(1);
    }
    
    // If pattern ends with /, it only matches directories
    if (cleanPattern.endsWith('/')) {
      cleanPattern = cleanPattern + '**';
    }
    
    this.patterns.push({
      pattern: cleanPattern,
      isNegated,
      original: pattern
    });
  }
  
  shouldIgnore(filePath) {
    // Convert absolute path to relative path from basePath
    const relativePath = path.relative(this.basePath, filePath);
    
    // Process patterns in order - last match wins for gitignore compatibility
    let ignored = false;
    
    for (const { pattern, isNegated } of this.patterns) {
      const options = {
        dot: true,
        matchBase: true,
        nocase: process.platform === 'win32'
      };
      
      if (minimatch(relativePath, pattern, options)) {
        ignored = !isNegated;
      }
    }
    
    return ignored;
  }
  
  filter(files) {
    return files.filter(file => !this.shouldIgnore(file));
  }
  
  createChildFilter(subPath) {
    const childFilter = new FileFilter(path.join(this.basePath, subPath));
    // Copy current patterns
    childFilter.patterns = [...this.patterns];
    return childFilter;
  }
}

module.exports = FileFilter;