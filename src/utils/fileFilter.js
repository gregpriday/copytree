const ignore = require('ignore');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class FileFilter {
  constructor(basePath = '.') {
    this.basePath = basePath;
    this.ig = ignore();
    
    // Add default exclusions
    this.ig.add(config.defaultExclusions);
    
    // Load .gitignore if it exists
    this.loadGitignore();
    
    // Load .copytreeignore if it exists
    this.loadCopytreeignore();
  }
  
  loadGitignore() {
    const gitignorePath = path.join(this.basePath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      this.ig.add(content);
    }
  }
  
  loadCopytreeignore() {
    const copytreeignorePath = path.join(this.basePath, '.copytreeignore');
    if (fs.existsSync(copytreeignorePath)) {
      const content = fs.readFileSync(copytreeignorePath, 'utf8');
      this.ig.add(content);
    }
  }
  
  addPatterns(patterns) {
    if (Array.isArray(patterns)) {
      this.ig.add(patterns);
    } else if (typeof patterns === 'string') {
      this.ig.add(patterns);
    }
  }
  
  shouldIgnore(filePath) {
    // Convert absolute path to relative path from basePath
    const relativePath = path.relative(this.basePath, filePath);
    return this.ig.ignores(relativePath);
  }
  
  filter(files) {
    return files.filter(file => !this.shouldIgnore(file));
  }
  
  createChildFilter(subPath) {
    const childFilter = new FileFilter(path.join(this.basePath, subPath));
    // Copy current ignore patterns
    childFilter.ig = ignore().add(this.ig);
    return childFilter;
  }
}

module.exports = FileFilter;