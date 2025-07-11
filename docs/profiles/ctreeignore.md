# Using .ctreeignore Files

The `.ctreeignore` file provides project-specific exclusion rules for Copytree, working exactly like `.gitignore` but specifically for file copying operations. This allows you to maintain different ignore rules for version control and documentation/copying purposes.

## Why Use .ctreeignore?

While `.gitignore` handles version control exclusions, you might want different rules for Copytree:

- **Include build artifacts** in documentation but not in git
- **Exclude sensitive files** from AI context that are still tracked in git
- **Filter test data** that's needed for development but not for documentation
- **Temporary exclusions** during refactoring or development

## File Format

`.ctreeignore` uses the same syntax as `.gitignore`:

```
# Comments start with hash
*.log              # Ignore all log files
/build             # Ignore build directory at root
debug/             # Ignore all debug directories
!important.log     # But include important.log
```

## Syntax Rules

### Basic Patterns

- `*.txt` - Match all .txt files in any directory
- `temp/` - Match directories named temp
- `/root.txt` - Match root.txt only in the root directory
- `!exception.txt` - Negate previous rules (force inclusion)

### Advanced Patterns

- `**/*.log` - Match .log files in all subdirectories
- `src/**/test/` - Match test directories at any depth under src
- `*.{js,ts}` - Match files with .js or .ts extensions
- `[Dd]ebug/` - Match Debug/ or debug/ directories

## Example: Development Environment

```
# .ctreeignore for a Laravel project

# Local environment files not in .gitignore
.env.local
.env.*.local

# Development databases
*.sqlite
database/*.db

# IDE specific files that might be in git
.idea/workspace.xml
.vscode/settings.json

# Local documentation builds
docs/_build/
docs/.doctrees/

# Development fixtures too large for AI context
tests/fixtures/large-*.json
storage/app/test-uploads/

# Temporary development files
*.tmp
*.temp
*-temp.*
```

## Example: AI Context Optimization

```
# .ctreeignore for AI assistant contexts

# Large generated files
public/js/app.js
public/css/app.css
public/mix-manifest.json

# Minified vendor files
vendor/**/*.min.js
node_modules/**/*.min.js

# Binary assets
**/*.{jpg,jpeg,png,gif,ico,pdf,zip}

# Lock files (usually not needed for context)
composer.lock
package-lock.json
yarn.lock

# Cache and compiled files
bootstrap/cache/*
storage/framework/cache/*
storage/framework/views/*

# But include cache configuration
!bootstrap/cache/.gitignore
```

## Precedence and Interaction

The `.ctreeignore` file works **in addition to** `.gitignore`, not as a replacement:

1. **.gitignore is processed first** - Files ignored by git are automatically excluded and cannot be re-included by `.ctreeignore`
2. **.ctreeignore adds additional exclusions** - These are applied on top of gitignore rules, further filtering the remaining files
3. **Profile rules can override both** - The profile's `always` list can force inclusion of files excluded by either ignore file
4. **Command-line filters are applied last** - The `--filter` flag has the final say on what's included

**Important**: `.ctreeignore` cannot override `.gitignore` to include files that git ignores. It can only add more exclusions to files that git tracks.

### Example Precedence

```bash
# Given:
# .gitignore: *.log
# .ctreeignore: *.tmp
# Profile always: important.log

# Result:
# - other.log: excluded (by .gitignore)
# - data.tmp: excluded (by .ctreeignore)  
# - important.log: included (by profile always)
```

## Best Practices

### 1. Keep It Focused

Don't duplicate `.gitignore` rules unless necessary:

```
# Bad - duplicating .gitignore
node_modules/
vendor/

# Good - Copytree-specific exclusions
*.generated.js
*-compiled.css
```

### 2. Use Comments

Document why files are excluded:

```
# Exclude large test datasets that overwhelm AI context
tests/fixtures/10mb-dataset.json

# Local development SSL certificates
docker/nginx/certs/*.pem
```

### 3. Organize by Purpose

Group related exclusions:

```
# === Development Environment ===
.env.local
docker-compose.override.yml

# === IDE Files ===
.idea/dataSources.xml
.vscode/launch.json

# === Build Artifacts ===
public/build/
dist/
```

### 4. Test with Dry Run

Always verify your ignore rules:

```bash
# See what files would be included
copytree copy . --dry-run

# Check specific file
copytree copy . --dry-run | grep "myfile.txt"
```

## Common Patterns

### Exclude by Size

For large files that should be in git but not in AI context:

```
# Large media files
public/videos/*.mp4
public/downloads/*.zip

# Database dumps
backup/*.sql
*.dump
```

### Exclude by Sensitivity

For files with sensitive data:

```
# API mock responses with real data
tests/mocks/*-real-data.json

# Performance profiling results
profiling/*.pprof
benchmarks/results/*.csv
```

### Temporary Exclusions

For work-in-progress:

```
# TODO: Remove after refactoring
src/legacy/**
src/deprecated/**

# WIP feature branches
feature/experimental/**
```

## Troubleshooting

### Files Still Appearing

1. Check if the file is in a profile's `always` list
2. Verify pattern syntax matches the file path
3. Use `--dry-run` to test patterns
4. Remember that leading `/` means root-relative

### Pattern Not Working

```bash
# Debug pattern matching
copytree copy . --dry-run | grep -E "pattern|file"

# List all active ignore sources
cat .gitignore .ctreeignore | grep -v "^#" | sort -u
```

## See Also

- [Profile Overview](profile-overview.md) - Understanding profile precedence
- [Advanced Profiles](profile-advanced.md) - Complex pattern matching
- [Creating & Refining Profiles](profile-creation-guide.md) - Testing exclusion rules