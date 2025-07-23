# .ctreeignore Documentation

The `.ctreeignore` file allows you to exclude files and directories from CopyTree's output at the project level, similar to how `.gitignore` works for Git.

## Overview

`.ctreeignore` is a project-specific file that defines patterns for files and directories that should always be excluded when running CopyTree, regardless of the profile being used.

## File Location

Place `.ctreeignore` in your project root:

```
project/
├── .ctreeignore
├── .gitignore
├── package.json
└── src/
```

## Syntax

`.ctreeignore` uses the same syntax as `.gitignore`:

```bash
# Comments start with hash
# Blank lines are ignored

# Exclude specific files
secret.txt
config.local.js

# Exclude file patterns
*.log
*.tmp
.env

# Exclude directories
node_modules/
dist/
coverage/

# Exclude nested patterns
**/temp/
src/**/*.test.js

# Negate patterns (include back)
!important.log
!src/critical.test.js
```

## Pattern Rules

### Basic Patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `file.txt` | Specific file | `config.txt` |
| `*.log` | File extension | All `.log` files |
| `temp/` | Directory | `temp` directory |
| `**/test/` | Any depth | All `test` directories |

### Advanced Patterns

```bash
# Wildcards
*.{js,ts}          # Multiple extensions
file-*.txt         # Pattern matching

# Directory patterns
build/             # Directory (with trailing slash)
/build             # Only root build directory
**/build/          # All build directories

# Negation
!keep-this.log     # Don't ignore this file
!/important/       # Don't ignore this directory
```

## How It Works

### Processing Order

1. `.ctreeignore` patterns are applied first
2. Profile exclude rules are applied second  
3. Profile include rules select from remaining files
4. Profile always rules override everything

### Example Flow

```yaml
# .ctreeignore
*.log
temp/

# Profile rules
rules:
  - include: "**/*"
  - exclude: "*.tmp"
  - always: "debug.log"  # This will still be included
```

## Common Use Cases

### Development Files

```bash
# .ctreeignore
# IDE files
.idea/
.vscode/
*.swp
*.swo

# OS files  
.DS_Store
Thumbs.db

# Development
.env
.env.local
*.local.js
```

### Build Artifacts

```bash
# Build outputs
dist/
build/
out/
*.min.js
*.min.css

# Package files
node_modules/
bower_components/
jspm_packages/

# Temporary files
*.tmp
*.temp
.cache/
.tmp/
```

### Testing Files

```bash
# Test coverage
coverage/
.nyc_output/
*.lcov

# Test artifacts  
test-results/
screenshots/
videos/

# But keep specific test utilities
!test/utils/
```

### Large Files

```bash
# Media files
*.mp4
*.mov
*.zip
*.tar.gz

# Database dumps
*.sql
*.dump

# Logs
*.log
logs/

# But keep error log
!error.log
```

## Integration with Profiles

### Profile Exclusions

`.ctreeignore` works alongside profile exclusions:

```yaml
# Profile
rules:
  - exclude: "**/*.test.js"
  
# .ctreeignore
**/*.spec.js

# Result: Both *.test.js and *.spec.js are excluded
```

### Override with Always

Profile `always` rules override `.ctreeignore`:

```bash
# .ctreeignore
config/*
```

```yaml
# Profile
rules:
  - always: "config/important.js"  # Will be included
```

## Best Practices

### 1. Keep It Simple

Start with obvious exclusions:

```bash
node_modules/
.git/
.env
*.log
```

### 2. Use Comments

Document why files are excluded:

```bash
# Large binary files that shouldn't be in output
*.mp4
*.zip

# Sensitive configuration
.env
secrets/

# Generated files
dist/
*.generated.js
```

### 3. Be Specific

Use precise patterns:

```bash
# Good - specific
/build/           # Only root build
test/**/*.snap    # Only test snapshots

# Avoid - too broad
build            # Might match src/build.js
*.snap           # Might match important files
```

### 4. Test Patterns

Verify your patterns work:

```bash
# See what would be included
copytree --dry-run

# Check if specific file is excluded
copytree --dry-run | grep "filename"
```

## Relationship with .gitignore

### Differences

- `.gitignore` controls version control
- `.ctreeignore` controls CopyTree output
- They can have different patterns

### Using Both

Common approach:

```bash
# .gitignore
node_modules/
.env
dist/

# .ctreeignore  
node_modules/     # Same as git
.env             # Same as git
dist/            # Same as git
*.log            # Additional for CopyTree
temp/            # Additional for CopyTree
```

### Profile Option

Profiles can respect `.gitignore`:

```yaml
options:
  respectGitignore: true  # Also excludes .gitignore patterns
```

## Examples

### Node.js Project

```bash
# .ctreeignore for Node.js project
# Dependencies
node_modules/
bower_components/

# Build outputs
dist/
build/
out/
.next/
.nuxt/

# Test artifacts
coverage/
.nyc_output/

# Logs
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.*
!.env.example

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Temporary
.tmp/
.cache/
*.tmp
```

### React Project

```bash
# .ctreeignore for React
# Dependencies
node_modules/

# Build
build/
dist/
.cache/

# Testing
coverage/
__snapshots__/

# Environment
.env.local
.env.development.local
.env.test.local
.env.production.local

# Misc
.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Optional
storybook-static/
.eslintcache
```

### API Project

```bash
# .ctreeignore for API
# Dependencies
node_modules/

# Logs
logs/
*.log

# Database
*.sqlite
*.db
data/

# Uploads
uploads/
temp/
public/uploads/

# Environment
.env
.env.*
!.env.example

# Testing
coverage/
.nyc_output/

# Documentation build
docs/_build/
api-docs/dist/
```

## Troubleshooting

### Files Still Included

**Problem**: Files matching `.ctreeignore` patterns still appear

**Solutions**:

1. Check pattern syntax:
   ```bash
   # Wrong
   node_modules    # Missing trailing slash
   
   # Correct  
   node_modules/   # Directory pattern
   ```

2. Verify file location:
   ```bash
   # Only matches root
   /temp.txt
   
   # Matches anywhere
   temp.txt
   **/temp.txt
   ```

3. Check profile `always` rules:
   ```yaml
   rules:
     - always: "node_modules/keep-this.js"  # Overrides ignore
   ```

### Pattern Not Working

**Problem**: Pattern doesn't match expected files

**Debug**:

```bash
# Test without .ctreeignore
mv .ctreeignore .ctreeignore.bak
copytree --dry-run

# Test with different pattern
echo "*.test.js" > .ctreeignore
copytree --dry-run
```

### Performance Issues

Large `.ctreeignore` files can slow down file discovery:

```bash
# Optimize patterns
# Instead of many specific files
file1.txt
file2.txt
file3.txt

# Use pattern
file*.txt
```

## Advanced Usage

### Conditional Ignores

Use profiles for conditional exclusions:

```yaml
# Development profile
rules:
  - exclude: "docs/**"    # Exclude docs in dev

# Production profile  
rules:
  - include: "docs/**"    # Include docs in prod
```

### Project-Specific Patterns

For monorepos:

```bash
# Root .ctreeignore
packages/*/node_modules/
packages/*/dist/

# Package-specific (packages/app/.ctreeignore)
test-fixtures/
benchmarks/
```

### Dynamic Patterns

Generate `.ctreeignore` programmatically:

```javascript
// scripts/update-ignore.js
const fs = require('fs');

const patterns = [
  'node_modules/',
  'dist/',
  ...getLargeFiles(),
  ...getGeneratedFiles()
];

fs.writeFileSync('.ctreeignore', patterns.join('\n'));
```

## Next Steps

- [Profile Overview](./profile-overview.md) - Understanding profile system
- [Advanced Profile Features](./profile-advanced.md) - Complex exclusion rules
- [Troubleshooting Guide](../usage/troubleshooting.md) - Common issues