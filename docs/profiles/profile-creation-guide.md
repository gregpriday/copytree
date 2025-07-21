# Profile Creation Guide

This guide walks you through creating custom profiles for CopyTree, from simple configurations to advanced setups.

## Quick Start

### Interactive Profile Creation

The easiest way to create a profile is using the interactive command:

```bash
copytree profile:create
```

This will prompt you for:
1. Profile name
2. Description
3. Base profile to extend (optional)
4. Include patterns
5. Exclude patterns
6. Transformer configuration
7. External sources

### Manual Profile Creation

Create a YAML file in `.copytree/` directory:

```bash
mkdir -p .copytree
cat > .copytree/my-profile.yml << 'EOF'
name: my-profile
description: Custom profile for my project

rules:
  - include: "src/**/*.js"
  - include: "*.json"
  - exclude: "**/*.test.js"
EOF
```

## Profile Structure

### Basic Structure

```yaml
name: profile-name         # Required: Unique identifier
description: Profile desc  # Required: What this profile does

rules:                    # File selection rules
  - include: "pattern"
  - exclude: "pattern"
  - always: "file"
```

### Complete Structure

```yaml
name: my-app
description: My application profile
version: 1.0.0
extends: default          # Inherit from another profile

# File selection rules
rules:
  - include: "src/**/*.{js,jsx}"
  - include: "lib/**/*.js"
  - exclude: "**/*.test.js"
  - exclude: "**/fixtures/**"
  - always: "README.md"
  - always: "package.json"

# External sources
external:
  - source: https://github.com/user/shared-lib
    destination: external/shared
    rules:
      - include: "src/**/*.js"
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

## Creating Profiles with AI

CopyTree can analyze your project and generate an optimized profile:

```bash
# AI-powered profile generation
copytree profile:create --name my-project

# Skip AI generation
copytree profile:create --skip-ai

# Custom character limit for analysis
copytree profile:create --character-limit 200000
```

The AI will:
1. Analyze your project structure
2. Identify frameworks and patterns
3. Generate appropriate include/exclude rules
4. Suggest relevant transformers

## Rule Writing

### Include Rules

Include patterns define what files to keep:

```yaml
rules:
  # Basic patterns
  - include: "*.js"              # All .js files in root
  - include: "src/**/*.js"       # All .js files in src
  - include: "**/*.{js,ts}"      # JS and TS files anywhere
  
  # Directory patterns
  - include: "src/**"            # Everything in src
  - include: "**/components/**"  # All components dirs
  
  # Specific files
  - include: "config/*.json"     # JSON configs
  - include: "**/index.js"       # All index.js files
```

### Exclude Rules

Exclude patterns remove files from selection:

```yaml
rules:
  # Common exclusions
  - exclude: "node_modules/**"   # Dependencies
  - exclude: "**/*.test.js"      # Test files
  - exclude: "dist/**"           # Build output
  - exclude: "**/*.log"          # Log files
  
  # Pattern exclusions
  - exclude: "**/*-lock.json"    # Lock files
  - exclude: ".*/**"             # Hidden directories
```

### Always Rules

Force include specific files:

```yaml
rules:
  - always: "README.md"
  - always: "package.json"
  - always: ".env.example"
  - always: "src/config/app.js"
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
extends: react

rules:
  # Inherits all react rules
  # Add your customizations
  - include: "src/custom/**"
  - exclude: "src/legacy/**"
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
  
  # AI summarization
  ai-summary:
    enabled: true
    options:
      maxLength: 500
      model: gemini-1.5-flash
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
      - include: "src/**/*.js"
      - exclude: "**/*.test.js"
```

### Local Directories

Include from other local paths:

```yaml
external:
  - source: ../shared-components
    destination: shared
    rules:
      - include: "**/*.jsx"
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

rules:
  - include: "src/**/*.{js,jsx,ts,tsx}"
  - include: "public/**/*"
  - include: "*.{json,md}"
  - exclude: "**/*.test.{js,ts}"
  - exclude: "**/*.spec.{js,ts}"
  - exclude: "src/**/__tests__/**"
  - always: "package.json"
  - always: "tsconfig.json"
```

### API Documentation

```yaml
name: api-docs
description: API endpoints and documentation

rules:
  - include: "**/routes/**/*.js"
  - include: "**/controllers/**/*.js"
  - include: "**/*.swagger.{json,yaml}"
  - include: "docs/**/*.md"
  - exclude: "**/*.test.js"
```

### Monorepo Package

```yaml
name: monorepo-pkg
description: Specific package in monorepo

rules:
  - include: "packages/my-package/**/*"
  - exclude: "**/node_modules/**"
  - exclude: "**/dist/**"
  - always: "packages/my-package/package.json"
```

## Best Practices

### 1. Start Simple

Begin with basic patterns:

```yaml
rules:
  - include: "src/**/*.js"
  - exclude: "**/*.test.js"
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
rules:
  # Source code
  - include: "src/**/*.js"
  - include: "src/**/*.jsx"
  
  # Tests
  - include: "tests/**/*.js"
  - exclude: "tests/fixtures/**"
  
  # Configuration
  - always: "package.json"
  - always: "babel.config.js"
```

## Troubleshooting

### No Files Selected

**Problem**: Profile selects zero files

**Debug**:
```bash
# Check without profile
copytree --no-profile --dry-run

# Check exclude rules
copytree --profile my-profile --debug
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
rules:
  # Production code only
  - include: "src/**/*.js"
  - exclude: "src/**/*.dev.js"  # Development files
  - exclude: "src/**/*.mock.js" # Mock files
```

### Performance Optimization

For large projects:

```yaml
options:
  maxFileSize: 1048576     # 1MB - skip large files
  maxTotalSize: 10485760   # 10MB total
  maxFileCount: 1000       # Limit file count

rules:
  # Be specific to reduce scanning
  - include: "src/core/**/*.js"  # Not "**/*.js"
```

### Multi-Environment Profiles

Create variants:

```yaml
# .copytree/base.yml
name: base
rules:
  - include: "src/**/*.js"

# .copytree/dev.yml
extends: base
rules:
  - include: "tests/**"
  - include: "docs/**"

# .copytree/prod.yml
extends: base
rules:
  - exclude: "**/*.test.js"
  - exclude: "docs/**"
```

## Next Steps

- [Profile Examples](./profile-examples.md) - More real-world examples
- [Advanced Features](./profile-advanced.md) - Deep dive into advanced features
- [Transformer Reference](./transformer-reference.md) - All available transformers