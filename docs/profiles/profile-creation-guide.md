# Profile Creation Guide

CopyTree includes a default profile that works for most projects. This guide walks you through creating custom profiles when you need project-specific configurations.

## Quick Start

### Profile Creation

Create a YAML file in `.copytree/` directory:

```bash
mkdir -p .copytree
cat > .copytree/my-profile.yml << 'EOF'
name: my-profile
description: Custom profile for my project

include:
  - "src/**/*.js"
  - "*.json"

exclude:
  - "**/*.test.js"
EOF
```

## Profile Structure

### Basic Structure

```yaml
name: profile-name         # Required: Unique identifier
description: Profile desc  # Required: What this profile does

# File selection rules
include:
  - "pattern"

exclude:
  - "pattern"

always:
  - "file"
```

### Complete Structure

```yaml
name: my-app
description: My application profile
version: 1.0.0
extends: default          # Inherit from another profile

# File selection rules
include:
  - "src/**/*.{js,jsx}"
  - "lib/**/*.js"

exclude:
  - "**/*.test.js"
  - "**/fixtures/**"

always:
  - "README.md"
  - "package.json"

# External sources
external:
  - source: https://github.com/user/shared-lib
    destination: external/shared
    rules:
      - "src/**/*.js"
    optional: true

# Processing options
options:
  respectGitignore: true
  maxFileSize: 5242880    # 5MB
  maxTotalSize: 52428800  # 50MB
  maxFileCount: 5000

# Transformers
transformers:
  markdown:
    enabled: true
    options:
      mode: strip
  pdf:
    enabled: true
    options:
      maxPages: 10
```


## Rule Writing

### Include Rules

Include patterns define what files to keep:

```yaml
include:
  # Basic patterns
  - "*.js"              # All .js files in root
  - "src/**/*.js"       # All .js files in src
  - "**/*.{js,ts}"      # JS and TS files anywhere

  # Directory patterns
  - "src/**"            # Everything in src
  - "**/components/**"  # All components dirs

  # Specific files
  - "config/*.json"     # JSON configs
  - "**/index.js"       # All index.js files
```

### Exclude Rules

Exclude patterns remove files from selection:

```yaml
exclude:
  # Common exclusions
  - "node_modules/**"   # Dependencies
  - "**/*.test.js"      # Test files
  - "dist/**"           # Build output
  - "**/*.log"          # Log files

  # Pattern exclusions
  - "**/*-lock.json"    # Lock files
  - ".*/**"             # Hidden directories
```

### Always Rules

Force include specific files:

```yaml
always:
  - "README.md"
  - "package.json"
  - ".env.example"
  - "src/config/app.js"
```

### Rule Order

Rules are processed in this order:
1. Exclude rules (remove files)
2. Include rules (select from remaining)
3. Always rules (force add files)

## Pattern Syntax

### Glob Patterns

CopyTree uses glob patterns:

| Pattern | Matches |
|---------|---------|
| `*` | Any characters except `/` |
| `**` | Any characters including `/` |
| `?` | Single character |
| `[abc]` | Any character in set |
| `[!abc]` | Any character not in set |
| `{a,b}` | Either a or b |

### Examples

```yaml
# Extensions
"*.js"                    # Files ending in .js
"**/*.{js,jsx,ts,tsx}"   # Multiple extensions

# Directories  
"src/**"                  # All in src
"**/test/**"             # All test directories

# Complex patterns
"src/**/[!_]*.js"        # JS files not starting with _
"**/*.spec.{js,ts}"      # Spec files
```

## Profile Inheritance

### Extending Profiles

Build on existing profiles:

```yaml
extends: default

# Inherits all default rules
# Add your customizations
include:
  - "src/custom/**"

exclude:
  - "src/legacy/**"
```

### Multiple Inheritance

Extend multiple profiles (left to right precedence):

```yaml
extends: [base, react, custom]
```

## Transformers

### Configuring Transformers

Enable and configure file transformations:

```yaml
transformers:
  # PDF to text
  pdf:
    enabled: true
    options:
      maxPages: 20
  
  # Markdown processing
  markdown:
    enabled: true
    options:
      mode: strip    # or 'html'
  
  # File preview
  first-lines:
    enabled: true
    options:
      lineCount: 50
```

### Available Transformers

See [Transformer Reference](./transformer-reference.md) for complete list.

## External Sources

### GitHub Repositories

Include files from GitHub:

```yaml
external:
  - source: https://github.com/user/repo
    destination: external/repo
    rules:
      - "src/**/*.js"
```

### Local Directories

Include from other local paths:

```yaml
external:
  - source: ../shared-components
    destination: shared
    rules:
      - "**/*.jsx"
    optional: true  # Don't fail if missing
```

## Testing Profiles

### Dry Run

Test without output:

```bash
# See what files would be included
copytree --profile my-profile --dry-run

# Verbose output
copytree --profile my-profile --dry-run --verbose
```

### Validation

Check profile syntax:

```bash
# Basic validation
copytree profile:validate my-profile

# Strict validation
copytree profile:validate my-profile --strict
```

### File Count

Check selection results:

```bash
# See file count and size
copytree --profile my-profile --dry-run | tail -n 5
```

## Common Patterns

### React Application

```yaml
name: react-app
description: React application with TypeScript

include:
  - "src/**/*.{js,jsx,ts,tsx}"
  - "public/**/*"
  - "*.{json,md}"

exclude:
  - "**/*.test.{js,ts}"
  - "**/*.spec.{js,ts}"
  - "src/**/__tests__/**"

always:
  - "package.json"
  - "tsconfig.json"
```

### API Documentation

```yaml
name: api-docs
description: API endpoints and documentation

include:
  - "**/routes/**/*.js"
  - "**/controllers/**/*.js"
  - "**/*.swagger.{json,yaml}"
  - "docs/**/*.md"

exclude:
  - "**/*.test.js"
```

### Monorepo Package

```yaml
name: monorepo-pkg
description: Specific package in monorepo

include:
  - "packages/my-package/**/*"

exclude:
  - "**/node_modules/**"
  - "**/dist/**"

always:
  - "packages/my-package/package.json"
```

## Best Practices

### 1. Start Simple

Begin with basic patterns:

```yaml
include:
  - "src/**/*.js"

exclude:
  - "**/*.test.js"
```

### 2. Use Dry Run

Test iteratively:

```bash
# Initial test
copytree --profile my-profile --dry-run

# Refine rules
vim .copytree/my-profile.yml

# Test again
copytree --profile my-profile --dry-run
```

### 3. Document Purpose

Clear descriptions help:

```yaml
name: feature-auth
description: |
  Authentication feature files including:
  - React components
  - API endpoints
  - Tests
  - Documentation
```

### 4. Organize Rules

Group related patterns:

```yaml
# Source code
include:
  - "src/**/*.js"
  - "src/**/*.jsx"
  - "tests/**/*.js"

exclude:
  - "tests/fixtures/**"

# Configuration
always:
  - "package.json"
  - "babel.config.js"
```

## Troubleshooting

### No Files Selected

**Problem**: Profile selects zero files

**Debug**:
```bash
# See what files would be included
copytree --profile my-profile --dry-run --verbose
```

**Solutions**:
- Make include patterns less restrictive
- Check for typos in patterns
- Verify file extensions

### Too Many Files

**Problem**: Profile includes unwanted files

**Solutions**:
- Add specific exclude rules
- Use more precise include patterns
- Set file limits in options

### Pattern Not Matching

**Problem**: Expected files not included

**Debug**:
```bash
# List actual files
find . -name "*.js" -type f

# Test specific pattern
copytree --filter "src/**/*.js" --dry-run
```

### Validation Errors

**Problem**: Profile won't validate

**Common issues**:
- Invalid YAML syntax
- Missing required fields (name, description)
- Invalid pattern syntax
- Unknown transformer names

## Advanced Techniques

### Conditional Rules

Use comments for clarity:

```yaml
# Production code only
include:
  - "src/**/*.js"

exclude:
  - "src/**/*.dev.js"  # Development files
  - "src/**/*.mock.js" # Mock files
```

### Performance Optimization

For large projects:

```yaml
options:
  maxFileSize: 1048576     # 1MB - skip large files
  maxTotalSize: 10485760   # 10MB total
  maxFileCount: 1000       # Limit file count

# Be specific to reduce scanning
include:
  - "src/core/**/*.js"  # Not "**/*.js"
```

### Multi-Environment Profiles

Create variants:

```yaml
# .copytree/dev.yml
extends: default

include:
  - "tests/**"
  - "docs/**"

# .copytree/prod.yml
extends: default

exclude:
  - "**/*.test.js"
  - "docs/**"
```

## Next Steps

- [Profile Examples](./profile-examples.md) - More real-world examples
- [Advanced Features](./profile-advanced.md) - Deep dive into advanced features
- [Transformer Reference](./transformer-reference.md) - All available transformers