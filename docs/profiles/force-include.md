# Force Include Files

The force-include mechanism ensures that specific files are always included in the output, even if they would normally be filtered out by other exclusion rules. This is particularly useful for including hidden files, configuration files, or any files that should override standard filtering.

## Overview

Force-include has the **highest precedence** in CopyTree's filtering system. Files marked as "always include" will:

- Be discovered even if `includeHidden: false` (default)
- Bypass `.gitignore` and `.copytreeignore` exclusions
- Override profile `exclude` patterns
- Override profile `filter` (include-only) patterns
- Be preserved when using `--git-modified` or `--git-branch` filters

## Three Ways to Force-Include Files

### 1. `.copytreeinclude` File

Create a `.copytreeinclude` file in your project root to specify force-include patterns:

```
# .copytreeinclude
# Force-include hidden configuration directory
.example/**

# Force-include specific hidden files
.env
.env.example

# Force-include docs even if excluded elsewhere
docs/**/*.md
```

**Format**:
- One glob pattern per line
- Lines starting with `#` are comments
- Empty lines are ignored
- Standard glob patterns supported (`*`, `**`, `?`, `[...]`)

### 2. CLI `--always` Flag

Use the `--always` flag to specify force-include patterns on the command line:

```bash
# Single pattern
copytree --always ".example/**"

# Multiple patterns (repeat flag)
copytree --always ".example/**" --always ".env"

# Combined with other filters
copytree --profile default --always ".config/**" --exclude "node_modules/**"
```

### 3. Profile `always` Key

Add force-include patterns to your profile YAML:

```yaml
# profiles/my-profile.yml
name: my-profile
description: Profile with force-included files

include:
  - "**/*"

exclude:
  - "node_modules/**"
  - "*.log"

# Files matching these patterns will always be included
always:
  - ".example/**"
  - ".env"
  - "config/secrets.yml"

options:
  includeHidden: false  # This doesn't affect 'always' patterns
```

## How It Works

### Discovery Phase

When force-include patterns are specified:

1. **Normal discovery** runs first with standard rules (`includeHidden`, `.gitignore`, etc.)
2. **Force-include discovery** runs separately with:
   - `dot: true` (discovers hidden files/directories)
   - `ignore: []` (bypasses all ignore patterns)
3. Results are **merged and deduplicated** by file path

### Marking Phase

The `AlwaysIncludeStage` runs **immediately after discovery** (before any filters):

1. Files matching force-include patterns are marked with `alwaysInclude: true`
2. This flag is preserved throughout the pipeline

### Filter Phase

All subsequent filters respect the `alwaysInclude` flag:

- **ProfileFilterStage**: Returns `true` immediately for `alwaysInclude` files
- **GitFilterStage**: Unions `alwaysInclude` files with git-filtered results

## Pattern Merging

Force-include patterns from all three sources are merged together:

```bash
# Example: Patterns from CLI + profile + .copytreeinclude
copytree --always ".env" --profile my-profile
# Merges:
# - CLI: [".env"]
# - Profile: [".example/**"] (from profile.always)
# - File: [".config/**"] (from .copytreeinclude)
# Result: [".env", ".example/**", ".config/**"]
```

## Use Cases

### Hidden Configuration Directories

```bash
# Include hidden .example/ directory
echo ".example/**" > .copytreeinclude
copytree
```

### Environment Files

```yaml
# Profile with environment files always included
always:
  - ".env"
  - ".env.example"
  - ".env.local"
```

### Documentation Override

```bash
# Force include docs even if profile excludes them
copytree --profile minimal --always "docs/**"
```

### Git-Modified with Context Files

```bash
# Show only modified files, but always include README and config
copytree --git-modified --always "README.md" --always "config/**"
```

## Precedence Rules

**Force-include > All other filters**

The precedence hierarchy is:

1. **Force-include** (highest) - `always` patterns from CLI/profile/.copytreeinclude
2. Git filters - `--git-modified`, `--git-branch`
3. Profile `filter` (include-only patterns)
4. Profile `exclude` patterns
5. `.copytreeignore` patterns
6. `.gitignore` patterns (when `respectGitignore: true`)
7. Default exclusions (from config)

**Example**:

```yaml
# Profile
exclude:
  - "**/*"  # Exclude everything

always:
  - "important.txt"  # But force-include this

# Result: Only important.txt is included
```

## Interaction with `.copytreeignore`

Force-include **overrides** `.copytreeignore` exclusions:

```
# .copytreeignore
.example/**  # Exclude hidden directory

# .copytreeinclude
.example/important.txt  # But force-include this specific file

# Result: .example/important.txt is included
```

**Note**: `.copytreeignore` negations (`!pattern`) cannot pull in hidden files that were never discovered. Use `.copytreeinclude` or `always` patterns for that.

## Best Practices

### 1. Use `.copytreeinclude` for Project Defaults

Commit `.copytreeinclude` to version control for team-wide force-include patterns:

```
# .copytreeinclude
# Project-specific files that should always be included
.example/**
.vscode/settings.json
config/default.yml
```

### 2. Use CLI `--always` for Ad-Hoc Needs

Use the CLI flag for one-off force-includes:

```bash
copytree --always ".custom/**"
```

### 3. Use Profile `always` for Reusable Configurations

Create profiles with force-include patterns for specific workflows:

```yaml
# profiles/demo.yml
name: demo
description: For creating demo snapshots

always:
  - ".example/**"
  - "sample-data/**"
  - "README.md"
```

### 4. Combine with Git Filters

Force-include context files when reviewing changes:

```bash
# Show modified files + always include package.json
copytree --git-modified --always "package.json" --always "README.md"
```

## Troubleshooting

### Hidden Files Not Appearing

**Problem**: Hidden files aren't showing up even with `always` patterns.

**Solution**: Ensure glob patterns include `**/` prefix for directory recursion:

```bash
# Wrong: Only matches at root
copytree --always ".example"

# Correct: Matches files inside .example/
copytree --always ".example/**"
```

### Deduplication

**Problem**: Concerned about duplicate files.

**Solution**: CopyTree automatically deduplicates files by path. If a file is discovered both normally and via force-include, it appears exactly once in the output.

### Pattern Syntax

Force-include patterns use standard glob syntax:

- `*` - Matches any characters except `/`
- `**` - Matches any characters including `/` (recursive)
- `?` - Matches exactly one character
- `[abc]` - Matches one character from set
- `{a,b}` - Matches either alternative

## Examples

### Example 1: Hidden Config Directory

```bash
# .copytreeinclude
.config/**
.secrets/**

# Run
copytree
# Result: All files in .config/ and .secrets/ are included
```

### Example 2: Profile with Always-Include

```yaml
# profiles/complete.yml
name: complete
description: Include everything, even hidden files

include:
  - "**/*"

always:
  - ".github/**"
  - ".vscode/**"
  - ".example/**"

options:
  includeHidden: false  # Still false, but 'always' patterns override
```

```bash
copytree --profile complete
```

### Example 3: Git Modified with Context

```bash
# Show modified files plus always include config and docs
copytree \
  --git-modified \
  --always "config/**" \
  --always "README.md" \
  --always "docs/api.md"
```

### Example 4: Override Aggressive Exclusions

```yaml
# Profile with aggressive exclusions
exclude:
  - "**/*"  # Exclude everything

filter:
  - "src/**/*.js"  # Only JS files in src/

always:
  - "README.md"  # But always include README
  - "package.json"  # And package.json
```

## Related Documentation

- [Profile Overview](./profile-overview.md) - Understanding profiles
- [.copytreeignore](./copytreeignore.md) - Exclusion patterns
- [Profile Creation Guide](./profile-creation-guide.md) - Creating custom profiles
- [CLI Reference](../cli/copytree-reference.md) - All command-line options
