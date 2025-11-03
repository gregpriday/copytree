# Advanced Profile Features

This guide covers advanced features and techniques for creating sophisticated CopyTree profiles.

## Pattern Matching Deep Dive

### Compound Patterns

Combine multiple patterns for complex selections:

```yaml
# Multiple extensions with directories
include:
  - "src/**/*.{js,jsx,ts,tsx}"
  # Specific files in any test directory
  - "**/test/**/*.spec.js"
  # Multiple directory levels
  - "packages/*/src/**/*.js"

# Exclude patterns with exceptions
exclude:
  - "**/*.test.js"

# But include this one
always:
  - "src/core.test.js"
```

### Brace Expansion

Use braces for alternatives:

```yaml
include:
  # File types
  - "**/*.{yml,yaml}"           # YAML files
  - "**/*.{test,spec}.js"       # Test files
  # Directory alternatives
  - "{src,lib,bin}/**/*.js"     # Multiple dirs
  - "**/{utils,helpers}/*.js"   # Utility directories
  # Complex combinations
  - "{src,test}/**/*.{js,ts}"   # Src and test, JS and TS
```

### Character Classes

Use brackets for character matching:

```yaml
include:
  # Single character matching
  - "**/[A-Z]*.js"          # Files starting with uppercase
  - "**/*.[jt]s"            # .js or .ts files
  # Negation
  - "**/[!_]*.js"           # Not starting with underscore
  - "**/[!.]*.js"           # Not hidden files
  # Ranges
  - "v[0-9]/**"             # Version directories (v0, v1, etc.)
  - "**/*[0-9].test.js"     # Numbered test files
```

### Globstar Patterns

The `**` pattern matches zero or more directories:

```yaml
include:
  # At any depth
  - "**/package.json"        # All package.json files
  - "**/node_modules/**"     # Everything in any node_modules
  # Start or middle
  - "packages/**/index.js"   # Index files in packages
  - "**/components/**/*.jsx" # Components at any level
  # Multiple globstars
  - "**/test/**/*.test.js"   # Test files in test dirs
```

## Rule Precedence and Combination

### Rule Processing Order

Understanding how patterns are processed:

1. **Exclude First**: All exclude patterns are applied
2. **Include Second**: Include patterns select from remaining files
3. **Always Last**: Always patterns force inclusion

```yaml
# 1. First, exclude all test files
exclude:
  - "**/*.test.js"

# 2. Then include source files
include:
  - "src/**/*.js"

# 3. Finally, force include specific test
always:
  - "src/critical.test.js"
```

### Pattern Precedence

More specific patterns override general ones:

```yaml
# General exclusion
exclude:
  - "**/*.log"

# But include specific logs
always:
  - "debug/important.log"

# General inclusion
include:
  - "src/**/*"

# But exclude generated files
exclude:
  - "src/**/*.generated.js"
```

## Always List Deep Dive

### When to Use Always

The `always` patterns bypass all other patterns:

```yaml
# Critical files that must be included
always:
  - "package.json"
  - "package-lock.json"
  - "README.md"

# Override exclude patterns
exclude:
  - "**/*.env"
always:
  - ".env.example"    # But include example

# Include specific test files
exclude:
  - "**/*.test.js"
always:
  - "integration.test.js"
```

### Always vs Include

```yaml
# Include - can be excluded by other patterns
include:
  - "config/*.js"
exclude:
  - "**/*.local.js"  # Would exclude config/db.local.js

# Always - cannot be excluded
always:
  - "config/critical.js"
exclude:
  - "**/*.js"  # Won't affect critical.js (always takes precedence)
```

## External Sources

### Advanced GitHub Integration

```yaml
external:
  # Specific branch
  - source: https://github.com/user/lib/tree/develop
    destination: external/lib-dev

  # Subdirectory only
  - source: https://github.com/user/monorepo/tree/main/packages/ui
    destination: external/ui

  # With filtering (use rules array for external sources)
  - source: https://github.com/user/docs
    destination: docs/external
    rules:
      - "**/*.md"
      - "!**/drafts/**"

  # Optional sources (don't fail if unavailable)
  - source: https://github.com/private/repo
    destination: external/private
    optional: true
```

### Local External Sources

```yaml
external:
  # Relative paths
  - source: ../shared-lib
    destination: lib/shared

  # Absolute paths
  - source: /Users/shared/components
    destination: components/shared

  # With environment variables
  - source: ${SHARED_CODE_PATH}/utils
    destination: lib/utils

  # Monorepo packages with filtering
  - source: ../../packages/ui
    destination: packages/ui
    rules:
      - "src/**/*.{js,jsx}"
      - "!**/*.test.js"
```

### External Source Filtering

Filter patterns for external sources (uses simple rules array):

```yaml
external:
  - source: https://github.com/org/framework
    destination: framework
    rules:
      # Include patterns
      - "types/**/*.d.ts"
      - "src/**/*.js"
      # Exclude patterns (use ! prefix)
      - "!**/__tests__/**"
      - "README.md"
```

## Transformer Configuration

### Available Transformers

CopyTree includes the following built-in transformers:

- **file-loader**: Default file content loader (automatically applied)
- **markdown**: Process markdown files (strip formatting or convert)
- **csv**: Format CSV/TSV files as readable tables
- **pdf**: Extract text from PDF documents
- **image**: Extract text from images using OCR
- **binary**: Handle binary files (placeholder or base64 encoding)

### Configuring Transformers

Transformers are configured in the profile's `transformers` section:

```yaml
transformers:
  # Enable PDF text extraction
  pdf:
    enabled: true
    options:
      maxPages: 50

  # Enable markdown processing
  markdown:
    enabled: true
    options:
      mode: strip  # 'strip' or 'html'

  # Enable CSV formatting
  csv:
    enabled: true
    options:
      maxRows: 20

  # Enable image OCR
  image:
    enabled: true
    options:
      extractText: true
      language: eng

  # Configure binary file handling
  binary:
    enabled: true
    options:
      mode: placeholder  # 'placeholder', 'base64', or 'skip'
```

### Transformer Examples by Use Case

```yaml
# For documentation projects
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 100
      includeMetadata: true
  markdown:
    enabled: true
    options:
      mode: strip

# For code analysis
transformers:
  markdown:
    enabled: true
  csv:
    enabled: true
    options:
      maxRows: 10
```

## Directory Handling

### Including Empty Directories

By default, empty directories are excluded. This can be configured in the options:

```yaml
options:
  includeEmptyDirs: true  # Include empty directories

include:
  - "src/**"
  # Empty dirs like src/future/ will now be included
```

### Directory-Only Patterns

Select directories without their contents:

```yaml
# Include directory structure only
include:
  - "**/"

exclude:
  - "**/*.*"  # Exclude all files

# Or specific directory patterns
include:
  - "**/components/"

exclude:
  - "**/components/**/*"  # Exclude contents
```

## Performance Optimization

### Pattern Specificity

More specific patterns perform better:

```yaml
# Slow - checks every file
include:
  - "**/*.js"
exclude:
  - "**/node_modules/**"

# Fast - limits search scope
include:
  - "src/**/*.js"
  - "lib/**/*.js"
  # node_modules already excluded by src/lib scope
```

### Early Exclusion

Exclude large directories early for better performance:

```yaml
# Exclude first (fast)
exclude:
  - "node_modules/**"
  - ".git/**"
  - "coverage/**"
  - "dist/**"

# Then include (searches less)
include:
  - "**/*.js"
```

### File Limits

Set reasonable limits for large projects:

```yaml
options:
  maxFileSize: 1048576      # 1MB - skip large files
  maxTotalSize: 52428800    # 50MB total
  maxFileCount: 5000        # Stop after 5000 files
  maxDepth: 10              # Maximum directory depth

  # Performance options
  followSymlinks: false     # Don't follow symlinks
  respectGitignore: true    # Use .gitignore for exclusion
```

## Using .copytreeignore

### Project-Specific Exclusions

Create `.copytreeignore` in your project:

```bash
# .copytreeignore
# Build artifacts
dist/
build/
out/
*.min.js

# Test coverage
coverage/
.nyc_output/

# Large files
*.log
*.sql
*.csv

# Temporary files
*.tmp
*.temp
.cache/

# IDE
.idea/
.vscode/
*.swp
```

### Ignore File Precedence

1. `.copytreeignore` patterns are applied first
2. Profile exclude patterns are applied second
3. Profile include patterns select from remaining
4. Always patterns override everything

### Pattern Syntax

`.copytreeignore` uses gitignore syntax:

```bash
# Comments start with #
*.log              # All log files
!important.log     # Except this one
/build             # Only root build directory
build/             # All build directories
**/temp            # All temp directories
```

## Advanced Profile Examples

### Monorepo Profile

```yaml
name: monorepo-smart
description: Intelligent monorepo handling

# Package sources
include:
  - "packages/*/src/**/*.{js,ts}"
  - "packages/*/package.json"
  - "shared/**/*.js"

# Exclude patterns
exclude:
  - "shared/**/*.test.js"
  - "packages/*/node_modules/**"

# Config files (always include)
always:
  - "lerna.json"
  - "package.json"
  - "tsconfig.json"
```

### Microservices Profile

```yaml
name: microservices
description: Multiple service architecture

# Service source code
include:
  - "services/*/src/**/*.js"
  - "services/*/package.json"
  - "services/*/api/**/*.{yaml,json}"
  - "lib/**/*.js"
  - "services/*/Dockerfile"
  - "docker-compose*.yml"

# Exclude service-level deps
exclude:
  - "services/*/node_modules/**"
```

### Documentation Profile

```yaml
name: docs-advanced
description: Comprehensive documentation

# Markdown files and API docs
include:
  - "**/*.md"
  - "**/*.swagger.{yaml,json}"
  - "**/openapi.{yaml,json}"
  - "docs/examples/**/*"
  - "**/*.example.{js,ts}"
  - "**/*.{svg,png,jpg}"

# Exclude patterns
exclude:
  - "**/node_modules/**/*.md"
  - "**/screenshots/**"

# Enable transformers for documentation
transformers:
  markdown:
    enabled: true
    options:
      mode: strip
  image:
    enabled: true
    options:
      extractText: true
```

## Performance Considerations

### Profile Options for Performance

```yaml
options:
  # Use .gitignore for automatic exclusions
  respectGitignore: true

  # Don't follow symbolic links
  followSymlinks: false

  # Set file size limits
  maxFileSize: 5242880      # 5MB per file
  maxTotalSize: 52428800    # 50MB total

  # Limit directory depth
  maxDepth: 10
```

### Pattern Optimization Tips

1. **Start with specific paths** - `src/**` instead of `**`
2. **Use extensions** - `*.js` instead of `*`
3. **Exclude early** - Put exclusions before inclusions
4. **Avoid deep recursion** - Limit `**` usage
5. **Use brace expansion** - `{a,b,c}` instead of multiple patterns

## Debugging Profile Patterns

### Testing Patterns

```bash
# Test specific pattern
copytree --filter "src/**/*.js" --dry-run

# See what's included/excluded
copytree --profile my-profile --dry-run

# Debug pattern matching
DEBUG=copytree:* copytree --profile my-profile --dry-run
```

### Pattern Validation

Test patterns incrementally by building up complexity:

```yaml
# Start simple
include:
  - "src/*.js"

# Add complexity
include:
  - "src/**/*.js"

# Add exclusions
exclude:
  - "src/**/*.test.js"

# Add exceptions
always:
  - "src/critical.test.js"
```

## Next Steps

- [Profile Examples](./profile-examples.md) - Real-world profile configurations
- [Transformer Reference](./transformer-reference.md) - All available transformers
- [Troubleshooting Guide](../usage/troubleshooting.md) - Common issues and solutions