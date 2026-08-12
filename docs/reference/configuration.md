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
| `maxFileSize` | N/A | bytes | 10485760 | Memory-safety ceiling; nothing above it is ever read |
| `sizeGate` | `--size-gate` | bytes \| false | 262144 | Per-file gate applied from `stat()`, before opening |
| `maxTotalSize` | `--max-total-size` | bytes | 104857600 | Total size budget across all files |
| `maxFileCount` | `--max-files` | number | 10000 | Maximum number of files |
| `maxCharacterLimit` | `--max-chars` | chars | 2000000 | Character budget across all file content |
| `defaultProfile` | `--profile` | string | `default` | Default profile to use |
| `respectGitignore` | N/A | boolean | `true` | Respect gitignore rules (see below) |
| `gitignore.nested` | N/A | boolean | `true` | Read `.gitignore` at every depth, not just the root |
| `gitignore.infoExclude` | N/A | boolean | `true` | Read `.git/info/exclude` |
| `gitignore.globalExcludesFile` | N/A | boolean | `true` | Read the user's global gitignore (`core.excludesFile`) |
| `includeHidden` | N/A | boolean | `false` | Include hidden files |
| `followSymlinks` | `--follow-symlinks` | boolean | `false` | Follow symbolic links |
| `binaryExtensions` | N/A | object | see below | Extension groups classified as binary without opening the file |
| `exclusionReport.topN` | `--explain` | number | 50 | How many of the largest exclusions to detail |
| `cache.enabled` | N/A | boolean | `true` | Enable caching |
| `cache.ttl` | N/A | milliseconds | 3600000 | Cache time-to-live |

### Size limits, and which one you want

Three different things bound a run, and they are not interchangeable:

- **`maxFileSize`** (10MB) is about **memory**. Nothing above it is ever read, and nothing lifts it.
- **`sizeGate`** (256KB) is about **context**. No single 256KB+ file belongs in a model's context
  window. It is decided from `stat()`, so an oversized file is never opened. Only `always` /
  `.copytreeinclude` lifts it, and the override is reported.
- **`charLimit`** truncates *after* reading, at a line boundary, and marks the cut.

Set `sizeGate: false` (or pass `--no-size-gate`) to disable the gate.

## Exclusion Precedence

One documented order, lowest precedence to highest. Last match wins, as in git.

1. Config `globalExcludedDirectories` / `globalExcludedFiles`
2. Global gitignore (`core.excludesFile`)
3. `.git/info/exclude`
4. Root `.gitignore`
5. Nested `.gitignore` (deepest last)
6. Root `.copytreeignore`
7. Nested `.copytreeignore` (deepest last)
8. `--exclude` patterns
9. `.copytreeinclude` / `--force-include` (highest: overrides everything above)

All of this is plain filesystem reads. CopyTree never shells out to `git check-ignore` and never
requires the target to be a git repository, so it works on a plain folder.

Excluded directories are pruned, not descended into. A pruned directory therefore counts as a
single entry in the exclusion report, representing its whole subtree.

## Binary Classification

`binaryExtensions` groups extensions by category (`video`, `audio`, `image`, `design`, `model3d`,
`font`, `archive`, `diskImage`, `package`, `executable`, `debug`, `database`, `mlWeights`,
`dataBlob`, `document`, `cert`, `other`).

The extension is checked **first**: a file whose extension appears in any group is classified
straight from the path, with no `open` and no `read`. A 3 GB `.mp4` costs the same as a 40 KB
`.ts`. Content sniffing (magic numbers, null bytes, non-printable ratio) only runs for extensions
that are not listed.

Groups are replaced wholesale by user config, so a project can override one category without
restating the rest:

```javascript
// ~/.copytree/copytree.js — treat .key as project text, not key material
module.exports = {
  binaryExtensions: {
    cert: ['.pem', '.der', '.crt', '.cer', '.p12', '.pfx', '.jks', '.gpg'],
  },
};
```

Source-code extensions are protected regardless of configuration. `.ts` is TypeScript far more
often than MPEG transport stream, and `.html` is source code in most repositories, so listing them
in a group has no effect. The full protected list is in `config/copytree.js`; the failure mode is
silent, which is why it is enforced in code rather than left to convention.

Text formats that are usually small and occasionally enormous (`.json`, `.csv`, `.xml`, `.sql`,
`.log`, `.txt`, `.snap`) are deliberately **not** classified by extension: a rule would be wrong in
both directions. They are bounded by `sizeGate` instead.

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
copytree config validate

# Show configuration with sources
copytree config show
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
copytree --profile ci-minimal --stdout
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

## Hermetic Configuration (for embedders)

`~/.copytree` is a feature for a CLI and a hazard for an application. If you ship CopyTree inside a
product, the context an agent receives should not depend on a file outside the project, outside
your control, invisible in your UI, and different on every teammate's machine — and a `.js` file
there is arbitrary code executed in your process.

```js
import { ConfigManager } from 'copytree';

const config = await ConfigManager.create({
  userConfig: false,   // skip ~/.copytree entirely
  strict: true,        // throw ERR_CONFIG_INVALID instead of continuing with a partial config
});

// A config that failed to load has no exclusion lists at all, which looks like
// success and is not. Check rather than assume.
if (!config.isDefaultsLoaded) {
  throw new Error(config.getLoadErrors().map((e) => `${e.scope}: ${e.message}`).join('; '));
}
```

`configSources: ['defaults']` is equivalent to `userConfig: false` and reads more explicitly when
you want the source list spelled out.

A loaded instance is safe to reuse across concurrent `copy()` / `scan()` calls. Create one per
process or per project rather than one per call: loading parses every config file and compiles the
JSON schema, which is measurable startup cost. Only `set()` and `reload()` mutate an instance.

Nothing in the configuration or the pipeline consults `process.cwd()`. Everything resolves from the
package directory and the `basePath` you pass, so a worker thread whose working directory is an app
bundle gets the same answer as a shell in the repository.

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
copytree config show
```

### Validate Configuration

Ensure configuration is valid:

```bash
copytree config validate
```

### Debug Configuration Loading

Enable verbose logging:

```bash
DEBUG=copytree:config copytree config show
```

### Common Issues

**"Configuration validation failed"**

Check YAML/JSON syntax:

```bash
# Validate just the syntax
copytree config validate

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
copytree --profile test-profile --stdout
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
copytree config validate

# Inspect effective configuration
copytree config show
```

## Related Documentation

- **[Your First Custom Profile](../getting-started/first-profile.md)** - Creating custom profiles
- **[CLI Reference](../cli/copytree-reference.md)** - Command-line options
- **[Troubleshooting Guide](../usage/troubleshooting.md)** - Common issues and solutions
