# Copytree CLI Reference

This is a comprehensive reference for all command-line flags and options available in the `copytree` command.

## Basic Usage

```bash
copytree [path] [options]
```

- `path` (optional): The directory path or GitHub URL to copy. Defaults to the current working directory.

## Options by Category

### Profile Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--profile=<name>` | `-p` | Profile to apply (e.g., laravel, sveltekit) | auto |
| `--no-profile` | | Skip profile loading entirely (useful for creating new profiles) | false |

### Filter Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--filter=<pattern>` | `-f` | Filter files using glob patterns (can be used multiple times) | * |
| `--ai-filter=<desc>` | `-a` | Filter files using AI based on natural language description | |
| `--modified` | `-m` | Only include files modified since last commit | false |
| `--changes=<range>` | `-c` | Filter files changed between two commits (format: "commit1:commit2") | |

### Output Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--output[=<file>]` | `-o` | Output to file. If no filename provided, creates temporary file | |
| `--display` | `-i` | Display output in console | false |
| `--stream` | `-S` | Stream output directly (useful for piping) | false |
| `--as-reference` | `-r` | Copy reference to temporary file instead of content | false |

### Display Control

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--depth=<n>` | `-d` | Maximum depth of directory tree | 10 |
| `--max-lines=<n>` | `-l` | Maximum lines to show per file (0 = unlimited) | 0 |
| `--max-characters=<n>` | `-C` | Maximum characters to show per file (0 = unlimited) | 0 |
| `--only-tree` | `-t` | Include only directory tree, not file contents | false |
| `--order-by=<field>` | | Specify file ordering (default\|modified) | default |
| `--size-report` | `-s` | Display report of files sorted by size after transformation | false |

### Debug & Optimization Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--dry-run` | | Simulate copy process and list files without full output | false |
| `--validate` | | Validate the selected profile and exit (no copy performed) | false |
| `--debug` | | Route all logs to console and set level to debug | false |
| `--no-cache` | | Do not use or keep cached GitHub repositories | false |

## Flag Details

### --validate

The `--validate` flag provides a quick way to check if a profile is syntactically correct without running the full copy pipeline.

**Usage:**
```bash
copytree copy . --profile myapp --validate
```

**Mutual Exclusions:**
Cannot be used with:
- `--dry-run`
- `--ai-filter`
- `--changes`
- `--modified`
- Any output options (`--output`, `--as-reference`, `--display`, `--stream`)

**Exit Codes:**
- `0`: Profile is valid
- `1`: Profile has errors
- `2`: Invalid flag combination

**Related:** For validating all profiles at once, use the dedicated [`profile:validate`](profile-commands.md#profilevalidate) command.

### --dry-run

Simulates the file selection process without generating output or applying transformations.

**Usage:**
```bash
copytree copy . --dry-run --profile laravel
```

**Note:** AI filters are skipped in dry-run mode to avoid API calls.

### --no-profile

Skips all profile loading, showing only files that pass `.gitignore` and `.ctreeignore` filtering.

**Usage:**
```bash
copytree copy . --dry-run --no-profile
```

**Use Case:** Useful when creating new profiles from scratch to see all available files.

## Examples

### Basic Copy Operations

```bash
# Copy current directory to clipboard
copytree

# Copy specific directory
copytree /path/to/project

# Copy GitHub repository
copytree https://github.com/user/repo
```

### Profile Usage

```bash
# Use specific profile
copytree --profile laravel

# Validate profile before use
copytree --profile myapp --validate

# Skip all profiles
copytree --no-profile
```

### Filtering

```bash
# Filter by file pattern
copytree --filter "*.php" --filter "*.js"

# AI-based filtering
copytree --ai-filter "all authentication related files"

# Git-based filtering
copytree --modified
copytree --changes main:feature-branch
```

### Output Control

```bash
# Save to file with generated name
copytree --output

# Save to specific file
copytree --output project-snapshot.txt

# Display in terminal
copytree --display

# Copy as reference
copytree --as-reference
```

## See Also

- [Profile Commands](profile-commands.md) - Commands for managing profiles
- [Creating & Refining Profiles](../profiles/profile-creation-guide.md) - Step-by-step profile creation
- [Profiles Overview](../profiles/profile-overview.md) - Understanding profile structure