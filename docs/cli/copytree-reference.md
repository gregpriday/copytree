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
Apply a custom profile for file selection (required).

**Examples:**
```bash
copytree --profile mycustom
copytree -p mycustom
```

#### Note: Profile Required
A custom profile is now required for all operations. Create profiles in `~/.copytree/profiles/` or `.copytree/`.

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

#### `--changes=<range>`, `-c <range>`
Include files changed between Git commits or branches.

```bash
copytree --changes main..feature-branch
copytree -c HEAD~5..HEAD
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
Output format: `xml` (default), `json`, or `tree`.

```bash
copytree --format json
copytree --format tree
```

### Display Control Options

#### `--depth=<number>`, `-d <number>`
Maximum directory traversal depth.

**Default:** 10

```bash
copytree --depth 3
copytree -d 5
```

#### `--max-lines=<number>`, `-l <number>`
Maximum lines per file (0 = unlimited).

**Default:** 0

```bash
copytree --max-lines 100
copytree -l 50
```

#### `--max-characters=<number>`, `-C <number>`
Maximum characters per file.

**Default:** 0 (unlimited)

```bash
copytree --max-characters 5000
copytree -C 10000
```

#### `--only-tree`, `-t`
Show only directory structure, no file contents.

```bash
copytree --only-tree
copytree -t
```

### Git Integration Options

#### `--order-by=<field>`
Order files by: `default` or `modified`.

**Default:** `default`

```bash
copytree --order-by modified
```

#### `--git-status`, `-g`
Include Git status indicators for each file.

```bash
copytree --git-status
copytree -g
```

### Content Options

#### `--line-numbers`, `-n`
Include line numbers in output.

```bash
copytree --line-numbers
copytree -n
```

#### `--file-size`, `-z`
Show file sizes in output.

```bash
copytree --file-size
copytree -z
```

#### `--size-report`, `-s`
Generate a report of files sorted by size.

```bash
copytree --size-report
copytree -s
```

### Transformation Options

#### `--transform`, `-T`
Apply file transformers (PDF to text, image OCR, etc.).

```bash
copytree --transform
copytree -T
```

#### `--no-transform`
Skip all file transformations.

```bash
copytree --no-transform
```

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
Skip caching for external sources (GitHub repos).

```bash
copytree https://github.com/user/repo --no-cache
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
# Use custom profile (required)
copytree --profile mycustom

# List available custom profiles
copytree profile:list
```

### Filtering Files
```bash
# Pattern matching
copytree --filter "src/**/*.js" --filter "*.json"

# Git integration
copytree --modified
copytree --changes main..develop
```

### Output Options
```bash
# Save to file with AI-generated name
copytree --output

# Save to specific file
copytree --output project-snapshot.xml

# Display in console
copytree --display

# Different formats
copytree --format json
copytree --format tree
```

### Advanced Usage
```bash
# Combine multiple options
copytree --profile react --modified --transform --output

# Debug mode with dry run
copytree --debug --dry-run

# Size analysis
copytree --size-report --max-lines 50

# Stream large projects
copytree --stream --no-transform | gzip > project.xml.gz
```

## Notes

- The `--validate` option cannot be combined with output options or filters
- External sources (GitHub URLs) are cached by default in `~/.copytree/repos/`
- Use `DEBUG=copytree:*` environment variable for detailed debugging