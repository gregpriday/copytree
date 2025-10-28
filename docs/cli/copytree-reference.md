# CopyTree CLI Reference

## Basic Usage

```bash
copytree [path] [options]
```

**Arguments:**
- `path` - Directory path or GitHub URL to copy (defaults to current directory)

## Command Options

### Profile Options

#### `--profile=<name>`, `-p <name>`
Use a specific profile for file selection. If omitted, CopyTree uses the **default profile**.

**Examples:**
```bash
copytree --profile mycustom
copytree -p mycustom
```

**Note:** The default profile is automatically used when no profile is specified. Create custom profiles in `~/.copytree/profiles/` or `.copytree/` for project-specific needs.

### Filter Options

#### `--filter=<pattern>`, `-f <pattern>`
Include files matching glob patterns. Can be used multiple times.

```bash
copytree --filter "*.js" --filter "*.ts"
copytree -f "src/**/*.php" -f "tests/**/*.php"
```

#### `--modified`, `-m`
Only include files modified since the last Git commit.

```bash
copytree --modified
copytree -m
```

#### `--changed=<ref>`, `-c <ref>`
Include files changed since a specific Git reference (commit, branch, or tag).

```bash
copytree --changed HEAD~5
copytree -c main
copytree --changed v1.0.0
```

### Output Options

#### `--output[=<file>]`, `-o [<file>]`
Save output to a file.

```bash
copytree --output output.xml
copytree -o output.xml
```

#### `--display`, `-i`
Display output in console instead of copying to clipboard.

```bash
copytree --display
copytree -i
```

#### `--stream`, `-S`
Stream output without buffering (useful for piping).

```bash
copytree --stream | less
copytree -S > project.xml
```

#### `--clipboard`
Explicitly copy to clipboard (default behavior).

```bash
copytree --clipboard
```

#### `--no-clipboard`
Prevent copying to clipboard.

```bash
copytree --no-clipboard --display
```

### Format Options

#### `--format=<type>`
Output format: `markdown|md`, `xml`, `json`, or `tree`.

**Default:** `markdown`

```bash
copytree --format json
copytree --format tree
copytree --format markdown  # default
copytree --format xml
```

### Display Control Options

#### `--head=<number>`, `-l <number>`
Limit to first N files processed.

```bash
copytree --head 50
copytree -l 100
```

#### `--char-limit=<number>`, `-C <number>`
Character limit for total output.

```bash
copytree --char-limit 100000
copytree -C 50000
```

#### `--only-tree`, `-t`
Show only directory structure, no file contents.

```bash
copytree --only-tree
copytree -t
```

### Sorting & Git Status Options

#### `--sort=<by>`, `-s <by>`
Sort files by: `path`, `size`, `modified`, `name`, or `extension`.

```bash
copytree --sort modified
copytree --sort size
copytree -s name
```

#### `--with-git-status`
Include Git status indicators for each file.

```bash
copytree --with-git-status
```

#### `--always=<patterns...>`
Always include these patterns (force-include), even if excluded by profile.

```bash
copytree --always "*.config.js" --always ".env.example"
```

### Content Options

#### `--with-line-numbers`
Include line numbers in output.

```bash
copytree --with-line-numbers
```

#### `--show-size`
Show file sizes in output.

```bash
copytree --show-size
```

#### `--info`
Show information table with project statistics.

```bash
copytree --info
```

#### `--include-binary`
Include binary files in output (normally excluded).

```bash
copytree --include-binary
```

#### `--dedupe`
Remove duplicate files from output.

```bash
copytree --dedupe
```

#### `--as-reference`, `-r`
Generate reference documentation format.

```bash
copytree --as-reference
copytree -r
```

#### `--external=<source...>`
Include external sources (GitHub URLs or local paths).

```bash
copytree --external https://github.com/user/repo
```

### Transformation Options

**Note:** Transformers are configured in profiles, not via CLI flags. See the [Transformer Reference](../profiles/transformer-reference.md) for details on enabling and configuring transformers in your profile.

### Debug & Optimization Options

#### `--dry-run`
Simulate execution without generating output.

```bash
copytree --dry-run
```

#### `--validate`
Validate profile syntax without processing files.

```bash
copytree --validate --profile myprofile
```

#### `--debug`
Enable debug logging.

```bash
copytree --debug
```

#### `--no-cache`
Disable caching for AI operations and external sources.

```bash
copytree --no-cache
```

#### `--no-validate`
Disable configuration validation (for testing/debugging).

```bash
copytree --no-validate
```

### Instructions Options

#### `--no-instructions`
Disable including instructions in output.

```bash
copytree --no-instructions
```

#### `--instructions=<name>`
Use custom instructions set (default: default).

```bash
copytree --instructions custom
copytree --instructions default
```

#### `--verbose`, `-v`
Show detailed progress information.

```bash
copytree --verbose
copytree -v
```

## Exit Codes

- `0` - Success
- `1` - Profile validation or loading errors
- `2` - Invalid option combination
- `3` - File system or Git errors
- `4` - AI service errors

## Examples

### Basic Usage
```bash
# Copy current directory to clipboard
copytree

# Copy specific directory
copytree /path/to/project

# Copy from GitHub
copytree https://github.com/facebook/react
```

### Using Profiles
```bash
# Uses default profile automatically
copytree

# Use custom profile
copytree --profile mycustom

# List available profiles
copytree profile:list
```

### Filtering Files
```bash
# Pattern matching
copytree --filter "src/**/*.js" --filter "*.json"

# Git integration
copytree --modified
copytree --changed HEAD~5
```

### Output Options
```bash
# Save to file (Markdown by default)
copytree --output project-snapshot.md

# Save as XML
copytree --output project-snapshot.xml --format xml

# Display in console
copytree --display

# Different formats
copytree --format json
copytree --format tree
```

### Advanced Usage
```bash
# Combine multiple options
copytree --profile myproject --modified --output snapshot.md

# Debug mode with dry run
copytree --debug --dry-run

# Limit output
copytree --head 50 --char-limit 100000

# Stream large projects
copytree --stream | gzip > project.md.gz
```

## Notes

- The `--validate` option cannot be combined with output options or filters
- External sources (GitHub URLs) are cached by default in `~/.copytree/repos/`
- Use `DEBUG=copytree:*` environment variable for detailed debugging
