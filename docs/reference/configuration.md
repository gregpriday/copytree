# Configuration Reference

Complete reference for CopyTree configuration system, including precedence rules, environment variables, and profile configuration.

## Configuration Precedence

CopyTree uses a hierarchical configuration system where settings are merged in this order (highest precedence first):

```
CLI flags > Environment variables > Project config > User config > Default config
```

### Precedence Example

```bash
# Default config
maxFileSize: 10MB

# User config (~/.copytree/config.yml)
maxFileSize: 20MB

# Project config (.copytree/config.yml)
maxFileSize: 50MB

# Environment variable
export COPYTREE_MAX_FILE_SIZE=100MB

# CLI flag
copytree --max-file-size 200MB

# Effective value: 200MB (CLI wins)
```

## Configuration Locations

### 1. Default Configuration

Built-in defaults (lowest precedence):

```javascript
{
  maxFileSize: 10485760,              // 10MB
  maxTotalSize: 104857600,            // 100MB
  maxFileCount: 10000,
  respectGitignore: true,
  includeHidden: false,
  followSymlinks: false,
  defaultProfile: 'default',
  cacheEnabled: true,
  cacheTTL: 3600000                   // 1 hour
}
```

### 2. User Configuration

Global settings for all projects:

**Location**: `~/.copytree/config.yml`

```yaml
# User-wide configuration
maxFileSize: 20971520       # 20MB
maxTotalSize: 209715200     # 200MB
respectGitignore: true
includeHidden: false

# Default profile for all projects
defaultProfile: default

# Cache settings
cache:
  enabled: true
  ttl: 3600000              # 1 hour
  directory: ~/.copytree/cache
```

### 3. Project Configuration

Project-specific settings (higher precedence):

**Location**: `.copytree/config.yml` (in project root)

```yaml
# Project-specific configuration
maxFileSize: 52428800       # 50MB
maxTotalSize: 524288000     # 500MB

# Project default profile
defaultProfile: myproject

# Project-specific exclusions
additionalExclusions:
  - "vendor/**"
  - "storage/**"
  - "*.log"
```

### 4. Environment Variables

Override configuration via environment:

```bash
# Set environment variables
export COPYTREE_MAX_FILE_SIZE=104857600        # 100MB
export COPYTREE_MAX_TOTAL_SIZE=1073741824      # 1GB
export COPYTREE_PROFILE=myprofile
export COPYTREE_RESPECT_GITIGNORE=false
export COPYTREE_CACHE_ENABLED=false

# Run with env vars
copytree
```

### 5. CLI Flags

Highest precedence - override everything:

```bash
copytree \
  --max-file-size 209715200 \
  --max-total-size 2147483648 \
  --profile custom \
  --no-gitignore \
  --include-hidden
```

## Environment Variable Mapping

| Environment Variable | Config Key | CLI Flag | Type | Default |
|---------------------|------------|----------|------|---------|
| `COPYTREE_MAX_FILE_SIZE` | `maxFileSize` | `--max-file-size` | bytes | 10485760 |
| `COPYTREE_MAX_TOTAL_SIZE` | `maxTotalSize` | `--max-total-size` | bytes | 104857600 |
| `COPYTREE_MAX_FILE_COUNT` | `maxFileCount` | `--limit` | number | 10000 |
| `COPYTREE_PROFILE` | `defaultProfile` | `--profile` | string | `default` |
| `COPYTREE_RESPECT_GITIGNORE` | `respectGitignore` | `--no-gitignore` | boolean | `true` |
| `COPYTREE_INCLUDE_HIDDEN` | `includeHidden` | `--include-hidden` | boolean | `false` |
| `COPYTREE_FOLLOW_SYMLINKS` | `followSymlinks` | `--follow-symlinks` | boolean | `false` |
| `COPYTREE_CACHE_ENABLED` | `cache.enabled` | N/A | boolean | `true` |
| `COPYTREE_CACHE_TTL` | `cache.ttl` | N/A | milliseconds | 3600000 |

## Profile Configuration

Profiles control file selection and transformation. See [DDR-0001](./decisions/ddr-0001-profiles-and-transformers.md) for canonical rules.

### Profile Selection Precedence

```
1. CLI --profile flag
2. Environment variable COPYTREE_PROFILE
3. Project config defaultProfile
4. User config defaultProfile
5. Built-in default profile (automatic)
```

**Example**:

```bash
# 1. CLI flag (highest precedence)
copytree --profile api-docs

# 2. Environment variable
export COPYTREE_PROFILE=api-docs
copytree

# 3. Project config
# .copytree/config.yml
defaultProfile: api-docs

# 4. User config
# ~/.copytree/config.yml
defaultProfile: api-docs

# 5. Built-in default (automatic)
copytree  # Uses built-in default profile
```

### Profile Search Paths

When loading a profile by name, CopyTree searches in this order:

```
1. Project:   .copytree/<name>.yml
2. User:      ~/.copytree/profiles/<name>.yml
3. Built-in:  <install>/profiles/<name>.yml
```

## Transformer Configuration

**Canonical Rule**: Transformers are configured **in profiles only**, not via CLI or configuration files.

See [Transformer Reference](../profiles/transformer-reference.md) for details.

```yaml
# In profile file (.copytree/myprofile.yml)
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 50

  image:
    enabled: true
    options:
      extractText: true

  markdown:
    enabled: true
    options:
      mode: strip
```

## Configuration Validation

### Validate Configuration

Check your effective configuration:

```bash
# Validate syntax and values
copytree config:validate

# Show configuration with sources
copytree config:inspect
```

**Example output**:

```
Configuration Validation: ✓ Valid

Effective Configuration:
  maxFileSize: 20971520 (20MB)
    Source: User config (~/.copytree/config.yml)

  maxTotalSize: 524288000 (500MB)
    Source: Project config (.copytree/config.yml)

  defaultProfile: "myproject"
    Source: Project config (.copytree/config.yml)

  respectGitignore: true
    Source: Default config

  cacheEnabled: false
    Source: Environment variable (COPYTREE_CACHE_ENABLED)
```

### Configuration Schema

Valid configuration options:

```yaml
# File size limits
maxFileSize: 10485760           # Maximum single file size (bytes)
maxTotalSize: 104857600         # Maximum total size of all files (bytes)
maxFileCount: 10000             # Maximum number of files to process

# File discovery
respectGitignore: true          # Respect .gitignore rules
includeHidden: false            # Include hidden files (starting with .)
followSymlinks: false           # Follow symbolic links

# Default behavior
defaultProfile: "default"       # Default profile to use
defaultFormat: "xml"            # Default output format (xml, json, markdown, tree)

# Cache configuration
cache:
  enabled: true                 # Enable caching
  ttl: 3600000                  # Cache time-to-live (milliseconds)
  directory: "~/.copytree/cache"  # Cache directory

# Additional exclusions (merged with profile)
additionalExclusions:
  - "vendor/**"
  - "storage/**"
  - "*.log"

# Performance
streaming:
  enabled: false                # Enable streaming mode
  threshold: 10485760           # Stream files larger than this (bytes)

# Debug
verbose: false                  # Enable verbose logging
debug: false                    # Enable debug logging
```

## Common Configuration Scenarios

### Scenario 1: Large Projects

Optimize for large codebases:

```yaml
# .copytree/config.yml
maxFileSize: 52428800           # 50MB
maxTotalSize: 1073741824        # 1GB
maxFileCount: 50000

streaming:
  enabled: true
  threshold: 10485760           # Stream files >10MB

cache:
  enabled: true
  ttl: 7200000                  # 2 hours
```

### Scenario 2: Team Configuration

Standardize settings for team:

```yaml
# .copytree/config.yml (committed to repo)
defaultProfile: "team-standard"
respectGitignore: true

additionalExclusions:
  - "vendor/**"
  - "storage/**"
  - "coverage/**"
  - "*.log"

maxFileSize: 20971520           # 20MB limit for all team members
```

### Scenario 3: CI/CD Pipeline

Optimize for automated environments:

```bash
# .env or CI configuration
export COPYTREE_CACHE_ENABLED=false
export COPYTREE_MAX_FILE_SIZE=52428800
export COPYTREE_PROFILE=ci-minimal
export COPYTREE_STREAMING_ENABLED=true
```

### Scenario 4: Personal Defaults

Set personal preferences globally:

```yaml
# ~/.copytree/config.yml
defaultProfile: "mydefault"
defaultFormat: "markdown"

maxFileSize: 52428800           # 50MB

cache:
  enabled: true
  ttl: 14400000                 # 4 hours

# Prefer hidden files for my workflow
includeHidden: true
```

## Configuration Files Format

### YAML Format (Recommended)

```yaml
# .copytree/config.yml
maxFileSize: 20971520
defaultProfile: myproject

cache:
  enabled: true
  ttl: 3600000
```

### JSON Format

```json
{
  "maxFileSize": 20971520,
  "defaultProfile": "myproject",
  "cache": {
    "enabled": true,
    "ttl": 3600000
  }
}
```

### JavaScript Format (Advanced)

```javascript
// .copytree/config.js
export default {
  maxFileSize: 20 * 1024 * 1024,  // 20MB
  defaultProfile: 'myproject',

  cache: {
    enabled: true,
    ttl: 60 * 60 * 1000,          // 1 hour
  },

  // Dynamic configuration
  additionalExclusions: process.env.NODE_ENV === 'production'
    ? ['test/**', '**/*.test.js']
    : [],
};
```

## Troubleshooting Configuration

### Check Effective Configuration

See which settings are active and their sources:

```bash
copytree config:inspect
```

### Validate Configuration

Ensure configuration is valid:

```bash
copytree config:validate --verbose
```

### Debug Configuration Loading

Enable verbose logging:

```bash
DEBUG=copytree:config copytree config:inspect
```

### Common Issues

**"Configuration validation failed"**

Check YAML/JSON syntax:

```bash
# Validate just the syntax
copytree config:validate

# Common issues:
# - Incorrect indentation (YAML)
# - Missing commas (JSON)
# - Invalid values (e.g., strings for numbers)
```

**"Environment variable not working"**

Ensure correct prefix and format:

```bash
# Correct
export COPYTREE_MAX_FILE_SIZE=20971520

# Incorrect (no COPYTREE_ prefix)
export MAX_FILE_SIZE=20971520

# Verify it's set
echo $COPYTREE_MAX_FILE_SIZE
```

**"Project config not loaded"**

Check file location:

```bash
# Must be in project root
ls .copytree/config.yml

# Not in subdirectory
ls src/.copytree/config.yml  # Won't work
```

## Best Practices

### 1. Use Project Config for Team Settings

Commit `.copytree/config.yml` to share team standards:

```yaml
# .copytree/config.yml (committed)
defaultProfile: team-standard
maxFileSize: 20971520
respectGitignore: true
```

### 2. Use User Config for Personal Preferences

Keep personal settings in `~/.copytree/config.yml`:

```yaml
# ~/.copytree/config.yml (not committed)
defaultFormat: markdown
cache:
  ttl: 7200000  # I prefer longer cache
```

### 3. Use Environment Variables for Temporary Overrides

```bash
# One-time override without changing files
COPYTREE_MAX_FILE_SIZE=104857600 copytree
```

### 4. Use CLI Flags for Experimenting

```bash
# Try different settings without modifying config
copytree --max-file-size 52428800 --no-cache
```

### 5. Document Project Configuration

Add comments to project config:

```yaml
# .copytree/config.yml

# Team standard: 20MB limit to keep AI context manageable
maxFileSize: 20971520

# Always use team-standard profile
defaultProfile: team-standard

# Exclude generated directories
additionalExclusions:
  - "vendor/**"     # PHP dependencies
  - "storage/**"    # Laravel storage
  - "coverage/**"   # Test coverage
```

## Related Documentation

- **[DDR-0001: Profiles and Transformers](./decisions/ddr-0001-profiles-and-transformers.md)** - Canonical rules for profiles and transformers
- **[Profile Overview](../profiles/profile-overview.md)** - Complete guide to profiles
- **[Transformer Reference](../profiles/transformer-reference.md)** - All available transformers
- **[CLI Reference](./cli.md)** - Command-line options
- **[Troubleshooting Guide](../usage/troubleshooting.md)** - Common issues and solutions
