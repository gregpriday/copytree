# Advanced Profile Features

This guide covers advanced features and techniques for creating sophisticated CopyTree profiles.

## Pattern Matching Deep Dive

### Compound Patterns

Combine multiple patterns for complex selections:

```yaml
rules:
  # Multiple extensions with directories
  - include: "src/**/*.{js,jsx,ts,tsx}"
  
  # Specific files in any test directory
  - include: "**/test/**/*.spec.js"
  
  # Multiple directory levels
  - include: "packages/*/src/**/*.js"
  
  # Exclude patterns with exceptions
  - exclude: "**/*.test.js"
  - always: "src/core.test.js"  # But include this one
```

### Brace Expansion

Use braces for alternatives:

```yaml
rules:
  # File types
  - include: "**/*.{yml,yaml}"           # YAML files
  - include: "**/*.{test,spec}.js"      # Test files
  
  # Directory alternatives
  - include: "{src,lib,bin}/**/*.js"    # Multiple dirs
  - include: "**/{utils,helpers}/*.js"  # Utility directories
  
  # Complex combinations
  - include: "{src,test}/**/*.{js,ts}"  # Src and test, JS and TS
```

### Character Classes

Use brackets for character matching:

```yaml
rules:
  # Single character matching
  - include: "**/[A-Z]*.js"          # Files starting with uppercase
  - include: "**/*.[jt]s"            # .js or .ts files
  
  # Negation
  - include: "**/[!_]*.js"           # Not starting with underscore
  - include: "**/[!.]*.js"           # Not hidden files
  
  # Ranges
  - include: "v[0-9]/**"             # Version directories (v0, v1, etc.)
  - include: "**/*[0-9].test.js"     # Numbered test files
```

### Globstar Patterns

The `**` pattern matches zero or more directories:

```yaml
rules:
  # At any depth
  - include: "**/package.json"        # All package.json files
  - include: "**/node_modules/**"     # Everything in any node_modules
  
  # Start or middle
  - include: "packages/**/index.js"   # Index files in packages
  - include: "**/components/**/*.jsx" # Components at any level
  
  # Multiple globstars
  - include: "**/test/**/*.test.js"   # Test files in test dirs
```

## Rule Precedence and Combination

### Rule Processing Order

Understanding how rules are processed:

1. **Exclude First**: All exclude rules are applied
2. **Include Second**: Include rules select from remaining files
3. **Always Last**: Always rules force inclusion

```yaml
rules:
  # 1. First, exclude all test files
  - exclude: "**/*.test.js"
  
  # 2. Then include source files
  - include: "src/**/*.js"
  
  # 3. Finally, force include specific test
  - always: "src/critical.test.js"
```

### Pattern Precedence

More specific patterns override general ones:

```yaml
rules:
  # General exclusion
  - exclude: "**/*.log"
  
  # But include specific logs
  - always: "debug/important.log"
  
  # General inclusion
  - include: "src/**/*"
  
  # But exclude generated files
  - exclude: "src/**/*.generated.js"
```

## Always List Deep Dive

### When to Use Always

The `always` rule bypasses all other rules:

```yaml
rules:
  # Critical files that must be included
  - always: "package.json"
  - always: "package-lock.json"
  - always: "README.md"
  
  # Override exclude patterns
  - exclude: "**/*.env"
  - always: ".env.example"    # But include example
  
  # Include specific test files
  - exclude: "**/*.test.js"
  - always: "integration.test.js"
```

### Always vs Include

```yaml
# Include - can be excluded by other rules
- include: "config/*.js"
- exclude: "**/*.local.js"  # Would exclude config/db.local.js

# Always - cannot be excluded
- always: "config/critical.js"
- exclude: "**/*.js"  # Won't affect critical.js
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
    
  # With filtering
  - source: https://github.com/user/docs
    destination: docs/external
    rules:
      - include: "**/*.md"
      - exclude: "**/drafts/**"
    
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
    
  # Monorepo packages
  - source: ../../packages/ui
    destination: packages/ui
    rules:
      - include: "src/**/*.{js,jsx}"
      - exclude: "**/*.test.js"
```

### External Source Rules

Rules within external sources:

```yaml
external:
  - source: https://github.com/org/framework
    destination: framework
    rules:
      # Include types
      - include: "types/**/*.d.ts"
      # Include source
      - include: "src/**/*.js"
      # Exclude tests
      - exclude: "**/__tests__/**"
      # But always include
      - always: "README.md"
```

## Complex Transformations

### Conditional Transformers

Apply transformers based on patterns:

```yaml
rules:
  # Large files get summarized
  - include: "src/**/*.js"
    transform: file-size-check
    transform_options:
      threshold: 50000  # 50KB
      fallback: ai-summary
  
  # Documentation gets stripped
  - include: "**/*.md"
    transform: markdown-stripper
    transform_options:
      preserve_links: true
  
  # Images get descriptions
  - include: "**/*.{png,jpg,jpeg}"
    transform: image-description
    transform_options:
      detail_level: high
```

### Transformer Chains

Some transformers can work in sequence:

```yaml
transformers:
  # PDF extraction then summarization
  pdf-processor:
    chain:
      - pdf-to-text
      - ai-summary
    options:
      max_pages: 10
      summary_length: 500
  
  # CSV preview
  csv-preview:
    chain:
      - csv-parser
      - table-formatter
    options:
      max_rows: 20
      format: markdown
```

## Directory Handling

### Including Empty Directories

By default, empty directories are excluded:

```yaml
options:
  includeEmptyDirs: true  # Include empty directories

rules:
  - include: "src/**"
  # Empty dirs like src/future/ will be included
```

### Directory-Only Patterns

Select directories without their contents:

```yaml
rules:
  # Include directory structure only
  - include: "**/"
  - exclude: "**/*.*"  # Exclude all files
  
  # Specific directory patterns
  - include: "**/components/"
  - exclude: "**/components/**/*"  # Exclude contents
```

## Performance Optimization

### Pattern Specificity

More specific patterns perform better:

```yaml
# Slow - checks every file
rules:
  - include: "**/*.js"
  - exclude: "**/node_modules/**"

# Fast - limits search scope
rules:
  - include: "src/**/*.js"
  - include: "lib/**/*.js"
  # node_modules already excluded by src/lib scope
```

### Early Exclusion

Exclude large directories early:

```yaml
rules:
  # Exclude first (fast)
  - exclude: "node_modules/**"
  - exclude: ".git/**"
  - exclude: "coverage/**"
  - exclude: "dist/**"
  
  # Then include (searches less)
  - include: "**/*.js"
```

### File Limits

Set reasonable limits for large projects:

```yaml
options:
  maxFileSize: 1048576      # 1MB - skip large files
  maxTotalSize: 52428800    # 50MB total
  maxFileCount: 5000        # Stop after 5000 files
  
  # Performance options
  followSymlinks: false     # Don't follow symlinks
  respectGitignore: true    # Use .gitignore for exclusion
```

## Using .ctreeignore

### Project-Specific Exclusions

Create `.ctreeignore` in your project:

```bash
# .ctreeignore
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

1. `.ctreeignore` patterns are applied first
2. Profile exclude rules are applied second
3. Profile include rules select from remaining
4. Always rules override everything

### Pattern Syntax

`.ctreeignore` uses gitignore syntax:

```bash
# Comments start with #
*.log              # All log files
!important.log     # Except this one
/build             # Only root build directory
build/             # All build directories
**/temp            # All temp directories
```

## Advanced Rule Examples

### Monorepo Profile

```yaml
name: monorepo-smart
description: Intelligent monorepo handling

rules:
  # Package sources
  - include: "packages/*/src/**/*.{js,ts}"
  - include: "packages/*/package.json"
  
  # Shared code
  - include: "shared/**/*.js"
  - exclude: "shared/**/*.test.js"
  
  # Config files
  - always: "lerna.json"
  - always: "package.json"
  - always: "tsconfig.json"
  
  # Exclude all package node_modules
  - exclude: "packages/*/node_modules/**"
```

### Microservices Profile

```yaml
name: microservices
description: Multiple service architecture

rules:
  # Service source code
  - include: "services/*/src/**/*.js"
  - include: "services/*/package.json"
  
  # API definitions
  - include: "services/*/api/**/*.{yaml,json}"
  
  # Shared libraries
  - include: "lib/**/*.js"
  
  # Docker configs
  - include: "services/*/Dockerfile"
  - include: "docker-compose*.yml"
  
  # Exclude service-level deps
  - exclude: "services/*/node_modules/**"
```

### Documentation Profile

```yaml
name: docs-advanced
description: Comprehensive documentation

rules:
  # Markdown files
  - include: "**/*.md"
  - exclude: "**/node_modules/**/*.md"
  
  # API docs
  - include: "**/*.swagger.{yaml,json}"
  - include: "**/openapi.{yaml,json}"
  
  # Code examples
  - include: "docs/examples/**/*"
  - include: "**/*.example.{js,ts}"
  
  # Diagrams
  - include: "**/*.{svg,png,jpg}"
    transform: image-optimizer
  
  # But not screenshots
  - exclude: "**/screenshots/**"
```

## Performance Considerations

### Node.js Specific Optimizations

```yaml
options:
  # Use fast-glob optimizations
  useGitignore: true        # Automatic .gitignore respect
  followSymbolicLinks: false
  
  # Streaming for large files
  streamThreshold: 5242880  # 5MB - stream larger files
  
  # Parallel processing
  concurrency: 4           # Process 4 files at once
```

### Pattern Optimization Tips

1. **Start with specific paths** - `src/**` instead of `**`
2. **Use extensions** - `*.js` instead of `*`
3. **Exclude early** - Put exclusions before inclusions
4. **Avoid deep recursion** - Limit `**` usage
5. **Use brace expansion** - `{a,b,c}` instead of multiple rules

## Debugging Profile Patterns

### Testing Patterns

```bash
# Test specific pattern
copytree --filter "src/**/*.js" --dry-run

# See what's excluded
copytree --profile my-profile --dry-run --verbose

# Debug pattern matching
DEBUG=copytree:* copytree --profile my-profile --dry-run
```

### Pattern Validation

```yaml
# Test patterns incrementally
rules:
  # Start simple
  - include: "src/*.js"
  
  # Add complexity
  - include: "src/**/*.js"
  
  # Add exclusions
  - exclude: "src/**/*.test.js"
  
  # Add exceptions
  - always: "src/critical.test.js"
```

## Next Steps

- [Profile Examples](./profile-examples.md) - Real-world profile configurations
- [Transformer Reference](./transformer-reference.md) - All available transformers
- [Troubleshooting Guide](../usage/troubleshooting.md) - Common issues and solutions