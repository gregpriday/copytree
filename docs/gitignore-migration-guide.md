# Migrating from PHP GitIgnore Library to Node.js braces + ignore

This guide explains how to migrate CopyTree's custom gitignore functionality from the PHP implementation (using `gregpriday/gitignore-php`) to the Node.js implementation using the `braces` and `ignore` npm packages.

## Overview of Migration

The PHP version uses:
- `gregpriday/gitignore-php` for gitignore pattern matching
- Custom `.ctreeignore` file support
- `PatternConverter` for converting glob patterns to regex

The Node.js version will use:
- `ignore` (v7.0.5) - For gitignore-compliant pattern matching
- `braces` (v3.0.3) - For brace expansion in glob patterns
- Native `glob` package for file system traversal

## Key Components to Migrate

### 1. GitIgnoreManager → ignore

**PHP Implementation:**
```php
$gitIgnoreManager = new GitIgnoreManager($basePath, true, ['.ctreeignore']);
$files = array_filter($files, fn($file) => $gitIgnoreManager->accept($file));
```

**Node.js Implementation:**
```javascript
const ignore = require('ignore');
const fs = require('fs');
const path = require('path');

class GitIgnoreManager {
  constructor(basePath, respectGitignore = true, additionalIgnoreFiles = []) {
    this.basePath = basePath;
    this.ig = ignore();
    
    // Load .gitignore
    if (respectGitignore) {
      const gitignorePath = path.join(basePath, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        this.ig.add(fs.readFileSync(gitignorePath, 'utf8'));
      }
    }
    
    // Load additional ignore files (e.g., .ctreeignore)
    additionalIgnoreFiles.forEach(ignoreFile => {
      const ignorePath = path.join(basePath, ignoreFile);
      if (fs.existsSync(ignorePath)) {
        this.ig.add(fs.readFileSync(ignorePath, 'utf8'));
      }
    });
  }
  
  accept(filePath) {
    // Convert absolute path to relative for ignore checking
    const relativePath = path.relative(this.basePath, filePath);
    return !this.ig.ignores(relativePath);
  }
}
```

### 2. PatternConverter → braces + glob-to-regexp

**PHP Implementation:**
```php
use GregorPriday\GitIgnorePHP\PatternConverter;

$regex = PatternConverter::patternToRegex($pattern);
$isMatch = preg_match($regex, $path);
```

**Node.js Implementation:**
```javascript
const braces = require('braces');
const globToRegExp = require('glob-to-regexp');

class PatternConverter {
  static patternToRegex(pattern) {
    // First expand any brace patterns
    const expanded = braces(pattern, { expand: true });
    
    // Convert each expanded pattern to regex
    const regexes = expanded.map(p => globToRegExp(p, { extended: true }));
    
    // Combine into a single regex that matches any of the patterns
    if (regexes.length === 1) {
      return regexes[0];
    }
    
    const combined = regexes.map(r => r.source).join('|');
    return new RegExp(`(${combined})`);
  }
  
  static isMatch(path, pattern) {
    const regex = this.patternToRegex(pattern);
    return regex.test(path);
  }
}
```

### 3. FileLoader Implementation

**Complete Node.js FileLoader:**
```javascript
const glob = require('glob');
const ignore = require('ignore');
const braces = require('braces');
const fs = require('fs');
const path = require('path');

class FileLoader {
  constructor(basePath, config) {
    this.basePath = basePath;
    this.config = config;
    this.gitIgnoreManager = this.createGitIgnoreManager();
  }
  
  createGitIgnoreManager() {
    const ig = ignore();
    
    // Add global exclusions from config
    if (this.config.globalExclusions) {
      ig.add(this.config.globalExclusions);
    }
    
    // Load .gitignore
    const gitignorePath = path.join(this.basePath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    }
    
    // Load .ctreeignore
    const ctreeignorePath = path.join(this.basePath, '.ctreeignore');
    if (fs.existsSync(ctreeignorePath)) {
      ig.add(fs.readFileSync(ctreeignorePath, 'utf8'));
    }
    
    return ig;
  }
  
  loadFiles(patterns = ['**/*']) {
    const allFiles = new Set();
    
    // Expand brace patterns
    const expandedPatterns = patterns.flatMap(pattern => 
      braces(pattern, { expand: true })
    );
    
    // Collect all files matching the patterns
    expandedPatterns.forEach(pattern => {
      const files = glob.sync(pattern, {
        cwd: this.basePath,
        nodir: true,
        dot: true,
        ignore: this.config.basePathExclusions || []
      });
      
      files.forEach(file => allFiles.add(file));
    });
    
    // Filter using gitignore rules
    const filesArray = Array.from(allFiles);
    return this.gitIgnoreManager.filter(filesArray).map(file => 
      path.join(this.basePath, file)
    );
  }
}
```

### 4. RulesetFilter Implementation

**Node.js RulesetFilter with Advanced Pattern Matching:**
```javascript
const braces = require('braces');
const ignore = require('ignore');
const minimatch = require('minimatch');

class RulesetFilter {
  constructor(rules) {
    this.rules = rules;
    this.includePatterns = [];
    this.excludePatterns = [];
    this.advancedRules = [];
    
    this.processRules();
  }
  
  processRules() {
    this.rules.forEach(rule => {
      if (typeof rule === 'string') {
        // Simple pattern
        if (rule.startsWith('!')) {
          this.includePatterns.push(rule.substring(1));
        } else {
          this.excludePatterns.push(rule);
        }
      } else if (typeof rule === 'object') {
        // Advanced rule with operators
        this.advancedRules.push(rule);
      }
    });
  }
  
  filter(files) {
    // Create ignore instance for exclusions
    const ig = ignore().add(this.excludePatterns);
    
    return files.filter(file => {
      const relativePath = path.relative(process.cwd(), file);
      
      // Check exclusions first
      if (ig.ignores(relativePath)) {
        // Check if it's force-included
        const isIncluded = this.includePatterns.some(pattern => {
          const expanded = braces(pattern, { expand: true });
          return expanded.some(p => minimatch(relativePath, p));
        });
        
        if (!isIncluded) return false;
      }
      
      // Check advanced rules
      return this.checkAdvancedRules(file, relativePath);
    });
  }
  
  checkAdvancedRules(file, relativePath) {
    for (const rule of this.advancedRules) {
      const match = this.evaluateRule(rule, file, relativePath);
      if (match === false) return false;
    }
    return true;
  }
  
  evaluateRule(rule, file, relativePath) {
    switch (rule.operator) {
      case 'contains':
        return relativePath.includes(rule.value);
      
      case 'startsWith':
        return relativePath.startsWith(rule.value);
      
      case 'endsWith':
        return relativePath.endsWith(rule.value);
      
      case 'regex':
        return new RegExp(rule.value).test(relativePath);
      
      case 'startsWithAny':
        return rule.values.some(v => relativePath.startsWith(v));
      
      case 'endsWithAny':
        return rule.values.some(v => relativePath.endsWith(v));
      
      case 'containsAny':
        return rule.values.some(v => relativePath.includes(v));
      
      default:
        return true;
    }
  }
}
```

### 5. Complete Integration Example

**Putting it all together in the copy command:**
```javascript
const { FileLoader } = require('./FileLoader');
const { RulesetFilter } = require('./RulesetFilter');
const config = require('../config');

class CopyCommand {
  async execute(sourcePath, options) {
    // Initialize file loader
    const fileLoader = new FileLoader(sourcePath, {
      globalExclusions: config.defaultExclusions,
      basePathExclusions: config.basePathExclusions
    });
    
    // Load files with pattern support
    let patterns = ['**/*'];
    if (options.filter) {
      // Support brace expansion in filter patterns
      patterns = [options.filter];
    }
    
    let files = fileLoader.loadFiles(patterns);
    
    // Apply profile-based filtering if specified
    if (options.profile) {
      const profile = await this.loadProfile(options.profile);
      if (profile.rules) {
        const rulesetFilter = new RulesetFilter(profile.rules);
        files = rulesetFilter.filter(files);
      }
    }
    
    // Apply always-include patterns
    if (options.alwaysInclude) {
      files = this.applyAlwaysInclude(files, options.alwaysInclude);
    }
    
    return files;
  }
  
  applyAlwaysInclude(files, alwaysIncludePatterns) {
    const fileSet = new Set(files);
    
    alwaysIncludePatterns.forEach(pattern => {
      const expanded = braces(pattern, { expand: true });
      expanded.forEach(expandedPattern => {
        const matches = glob.sync(expandedPattern, {
          cwd: process.cwd(),
          nodir: true,
          absolute: true
        });
        matches.forEach(file => fileSet.add(file));
      });
    });
    
    return Array.from(fileSet);
  }
}
```

## Migration Checklist

1. **Install required packages:**
   ```bash
   npm install ignore@7.0.5 braces@3.0.3 glob minimatch glob-to-regexp
   ```

2. **Replace GitIgnoreManager usage:**
   - Use the `ignore` package for gitignore pattern matching
   - Implement custom GitIgnoreManager wrapper for compatibility

3. **Replace PatternConverter usage:**
   - Use `braces` for brace expansion
   - Use `glob-to-regexp` or `minimatch` for glob pattern matching

4. **Update FileLoader:**
   - Replace Symfony Finder with `glob`
   - Use `ignore` for filtering instead of custom implementation

5. **Update RulesetFilter:**
   - Combine `ignore` for exclusions and `minimatch` for inclusions
   - Use `braces` for pattern expansion

6. **Test edge cases:**
   - Verify `.ctreeignore` support works correctly
   - Test complex brace patterns like `{src,lib}/{**/*.js,**/*.ts}`
   - Ensure negation patterns (`!important.js`) work as expected
   - Test performance with large repositories

## Benefits of This Approach

1. **Standards Compliance**: The `ignore` package strictly follows gitignore specification
2. **Better Performance**: Both packages are highly optimized
3. **Cleaner Code**: Less custom pattern matching logic to maintain
4. **More Features**: Brace expansion adds powerful pattern capabilities
5. **Community Support**: Well-maintained packages with active communities

## Example Usage

```javascript
// Create a file collector with full gitignore support
const collector = new FileCollector('./my-project');

// Add custom ignore patterns
collector.addIgnorePatterns([
  'dist/',
  '*.log',
  '!important.log'
]);

// Find files with brace expansion
const sourceFiles = collector.find('{src,lib}/**/*.{js,ts,jsx,tsx}');

// Apply profile-based filtering
const filtered = collector.applyProfile('react', sourceFiles);
```

This migration provides a more robust, maintainable, and feature-rich implementation while preserving all the functionality of the original PHP version.