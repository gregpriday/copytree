# Configuration Reference

Complete reference for CopyTree configuration system, including precedence rules, environment variables, and profile configuration.

## Configuration Precedence

CopyTree uses a simple two-level configuration system:

```
User config > Default config
```

Settings are loaded from:
1. **Built-in defaults** from `config/*.js` files
2. **User overrides** from `~/.copytree/*.js` or `~/.copytree/*.json` files

The two levels are deeply merged, with user configuration overriding defaults.

### Precedence Example

```bash
# Default config (config/app.js)
maxFileSize: 10MB

# User config (~/.copytree/app.js)
maxFileSize: 20MB

# Effective value: 20MB (user config wins)
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

**Location**: `~/.copytree/*.js` or `~/.copytree/*.json`

**JavaScript Format**:
```javascript
// ~/.copytree/app.js
export default {
  maxFileSize: 20971520,       // 20MB
  maxTotalSize: 209715200,     // 200MB
  respectGitignore: true,
  includeHidden: false,

  // Default profile for all projects
  defaultProfile: 'default',

  // Cache settings
  cache: {
    enabled: true,
    ttl: 3600000,              // 1 hour
    directory: '~/.copytree/cache'
  }
};
```

**JSON Format**:
```json
{
  "maxFileSize": 20971520,
  "maxTotalSize": 209715200,
  "respectGitignore": true,
  "includeHidden": false,
  "defaultProfile": "default",
  "cache": {
    "enabled": true,
    "ttl": 3600000,
    "directory": "~/.copytree/cache"
  }
}
```

**Note**: Configuration file names must match the config section name (e.g., `app.js`, `ai.js`).

## Configuration Keys

| Config Key | CLI Flag | Type | Default | Description |
|-----------|----------|------|---------|-------------|
| `maxFileSize` | N/A | bytes | 10485760 | Maximum single file size |
| `maxTotalSize` | N/A | bytes | 104857600 | Maximum total size of all files |
| `maxFileCount` | `--limit` | number | 10000 | Maximum number of files |
| `defaultProfile` | `--profile` | string | `default` | Default profile to use |
| `respectGitignore` | N/A | boolean | `true` | Respect .gitignore rules |
| `includeHidden` | N/A | boolean | `false` | Include hidden files |
| `followSymlinks` | `--follow-symlinks` | boolean | `false` | Follow symbolic links |
| `cache.enabled` | N/A | boolean | `true` | Enable caching |
| `cache.ttl` | N/A | milliseconds | 3600000 | Cache time-to-live |

## Profile Configuration

Profiles control file selection. See [Your First Custom Profile](../getting-started/first-profile.md) for details.

### Profile Selection Precedence

```
1. CLI --profile flag
2. User config defaultProfile
3. Built-in default profile (automatic)
```

**Example**:

```bash
# 1. CLI flag (highest precedence)
copytree --profile api-docs

# 2. User config
# ~/.copytree/app.js
export default {
  defaultProfile: 'api-docs'
};

# 3. Built-in default (automatic)
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

Transformers handle file loading and processing. The built-in transformers include:

- **file-loader**: Loads file content
- **binary**: Handles binary files with placeholder or base64 encoding
- **streaming-file-loader**: Streams large files (>10MB) for memory efficiency

```yaml
# In profile file (.copytree/myprofile.yml)
transformers:
  file-loader:
    enabled: true
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
    Source: User config (~/.copytree/app.js)

  maxTotalSize: 104857600 (100MB)
    Source: Default config

  defaultProfile: "myproject"
    Source: User config (~/.copytree/app.js)

  respectGitignore: true
    Source: Default config

  cache.enabled: true
    Source: Default config
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

Standardize settings via shared profile:

```yaml
# .copytree/team-standard.yml (committed to repo)
name: team-standard
description: Team standard profile

include:
  - "src/**"
  - "docs/**"

exclude:
  - "vendor/**"
  - "storage/**"
  - "coverage/**"
  - "*.log"

transformers:
  file-loader:
    enabled: true
```

**Note**: Configuration files (not profiles) cannot be shared at the project level. Use profiles for team standardization.

### Scenario 3: CI/CD Pipeline

Use CLI flags for CI environments:

```bash
# CI script
copytree --profile ci-minimal --display
```

### Scenario 4: Personal Defaults

Set personal preferences globally:

```javascript
// ~/.copytree/app.js
export default {
  defaultProfile: 'mydefault',
  defaultFormat: 'markdown',

  maxFileSize: 52428800,           // 50MB

  cache: {
    enabled: true,
    ttl: 14400000                  // 4 hours
  },

  // Prefer hidden files for my workflow
  includeHidden: true
};
```

## Configuration Files Format

### JSON Format

**Location**: `~/.copytree/*.json`

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

### JavaScript Format (Recommended)

**Location**: `~/.copytree/*.js`

```javascript
// ~/.copytree/app.js
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

**Note**: Configuration files must use ES module syntax (`export default`) and match the config section name.

## Troubleshooting Configuration

### Check Effective Configuration

See which settings are active and their sources:

```bash
copytree config:inspect
```

### Validate Configuration

Ensure configuration is valid:

```bash
copytree config:validate
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

**"User config not loading"**

Check file location and format:

```bash
# Must be in ~/.copytree/ directory
ls ~/.copytree/app.js
ls ~/.copytree/app.json

# Check file has proper ES module export (for .js files)
# Must use: export default { ... }
# Not: module.exports = { ... }

# File name must match config section
# app.js for app config
# ai.js for AI config
```

## Best Practices

### 1. Use Profiles for Team Settings

Commit profiles to share team standards:

```yaml
# .copytree/team-standard.yml (committed)
name: team-standard
description: Team standard profile

include:
  - "src/**"
  - "docs/**"

exclude:
  - "vendor/**"     # PHP dependencies
  - "storage/**"    # Laravel storage
  - "coverage/**"   # Test coverage
  - "*.log"
```

### 2. Use User Config for Personal Preferences

Keep personal settings in `~/.copytree/`:

```javascript
// ~/.copytree/app.js (not committed)
export default {
  defaultFormat: 'markdown',
  cache: {
    ttl: 7200000  // I prefer longer cache
  }
};
```

### 3. Use CLI Flags for Experimenting

```bash
# Try different settings without modifying config
copytree --profile test-profile --display
```

### 4. Document Configuration Files

Add comments to user config:

```javascript
// ~/.copytree/app.js

export default {
  // Prefer larger file size for my projects
  maxFileSize: 20 * 1024 * 1024,  // 20MB

  // Always use my custom profile by default
  defaultProfile: 'mydefault',

  // Longer cache TTL for slower network
  cache: {
    enabled: true,
    ttl: 4 * 60 * 60 * 1000  // 4 hours
  }
};
```

### 5. Validate Configuration Regularly

```bash
# Check configuration is valid
copytree config:validate

# Inspect effective configuration
copytree config:inspect
```

## Related Documentation

- **[Your First Custom Profile](../getting-started/first-profile.md)** - Creating custom profiles
- **[CLI Reference](../cli/copytree-reference.md)** - Command-line options
- **[Troubleshooting Guide](../usage/troubleshooting.md)** - Common issues and solutions
