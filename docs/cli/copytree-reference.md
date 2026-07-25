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

#### `--exclude=<pattern>`, `-x <pattern>`
Exclude files matching glob patterns. Can be used multiple times.

```bash
copytree --exclude "**/*.test.js" --exclude "fixtures/**"
```

### Scope Options

#### `--scope <path...>`
Copy only these paths. **Literal paths, not globs** — a directory named `src/[draft]` is just a
path, and there is nothing to escape.

Ignore rules still resolve from the project root: the root `.gitignore`, the root
`.copytreeignore`, and every nested ignore file between the root and the selection all apply. A
scoped run selects exactly the files a filtered full run would. Output paths stay relative to the
project root, so `@`-references handed to an agent still resolve.

Traversal starts at the selection rather than the root, so the cost scales with what you asked for
instead of with the size of the repository.

```bash
# One folder, repository rules
copytree --scope src/panels/file-browser

# Several entries, files as well as directories
copytree --scope src/panels package.json

# Compose with a filter: TypeScript files under src
copytree --scope src --filter "**/*.ts"
```

#### `--scope-include-ignored`
Let `--scope` entries override the ignore rules that would otherwise exclude them. Off by default,
so a scoped run keeps the "same set as a full run" guarantee. Use it for the deliberate gesture —
you navigated into a gitignored folder and want it anyway. Config exclusions still apply, so
`node_modules` stays out.

```bash
copytree --scope build/generated --scope-include-ignored
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

### Format Options

#### `--format=<type>`
Output format: `xml`, `markdown|md`, `json`, `ndjson`, `sarif`, or `tree`.

**Default:** `xml`

```bash
copytree --format json
copytree --format ndjson
copytree --format sarif
copytree --format tree
copytree --format xml  # default
copytree --format markdown
```

### Display Control Options

#### `--head=<number>`, `-l <number>`
Limit to first N files processed.

```bash
copytree --head 50
copytree -l 100
```

#### `--char-limit=<number>`, `-C <number>`
Character budget across all file content.

Truncation happens at a line boundary and is marked inline
(`… [truncated 4,213 of 9,001 lines]`), so an agent cannot conclude the file simply ends there.
When a single line is longer than the remaining budget — a minified bundle, say — the cut is
mid-line and labelled as such rather than dropping the file. Chunks never end on an unpaired
UTF-16 surrogate.

```bash
copytree --char-limit 100000
copytree -C 50000
```

### Budget Options

Budgets are applied **after sorting**, so which files survive follows `--sort`. Truncation is
always reported, never silent: a silently truncated context is worse than an error, because the
agent answers confidently from a partial repository.

#### `--size-gate=<size>` / `--no-size-gate`
Hard per-file size gate, applied from `stat()` before anything is opened. Default: **256KB**.

This is not the same as `maxFileSize` (a 10MB memory-safety ceiling) or `--char-limit` (which
truncates *after* reading). No single 256KB+ file belongs in an agent's context window, and the
gate exists whether or not truncation is enabled.

Only `--always` and `.copytreeinclude` lift the gate, and the override is reported.

```bash
copytree --size-gate 64KB
copytree --no-size-gate            # include large files
copytree --size-gate 64KB --always "docs/spec.md"
```

#### `--max-total-size=<size>`
Total size budget across all selected files.

```bash
copytree --max-total-size 5MB
```

#### `--max-files=<number>`
Maximum number of files to include.

Budgets keep the head of the sorted list and drop the tail, and `--sort` is ascending by default.
`--sort modified` therefore keeps the *oldest* files; pair it with `--sort-order desc` to keep the
recently-touched ones.

```bash
copytree --max-files 500 --sort modified --sort-order desc   # keep the newest 500
copytree --max-files 500 --sort size                         # keep the 500 smallest
```

#### `--sort-order <asc|desc>`
Sort direction (default: `asc`). Decides which end of the list a budget keeps.

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
copytree --always "*.config.js" --always "config.example.js"
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

**Note:** Transformers are configured in profiles, not via CLI flags. Built-in transformers include file-loader, binary, and streaming-file-loader.

### Debug & Optimization Options

#### `--dry-run`
Plan the run without reading or formatting content.

A dry run is a strict prefix of the real run: the same file set, in the same order, under the same
budgets. It reports the file count, total size, an approximate token count, and what was excluded.

```bash
copytree --dry-run
```

```
Dry run - nothing was read or written.
Base path: /repo
221 file(s), 1.42 MB, ~406k tokens
25 excluded: 19 copytreeignore, 4 gitignore, 1 configExclude, 1 sizeGate
```

#### `--explain`
Report which rule excluded each file, with the ignore file and line it came from. Turns "why isn't
my file here?" from a bisect into a glance.

```bash
copytree --dry-run --explain
```

```
Largest exclusions:
  package-lock.json — 351.44 KB — sizeGate [sizeGate:262144]
  CHANGELOG.md — 14.78 KB — copytreeignore [CHANGELOG.md] (/repo/.copytreeignore:20)
  sub/nested.txt — 2 B — gitignore [nested.txt] (/repo/sub/.gitignore:1)
```

Aggregate counts are always collected and cost nothing extra. `--explain` adds the per-file detail.

#### `--validate`
Validate profile syntax without processing files.

```bash
copytree --validate --profile myprofile
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

## Exit Codes

- `0` - Success
- `1` - Profile validation or loading errors
- `2` - Invalid option combination
- `3` - File system or Git errors

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

# Preview profile selection
copytree --profile mycustom --dry-run
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

# Dry run with validation
copytree --dry-run --validate

# Limit output
copytree --head 50 --char-limit 100000

# Stream large projects
copytree --stream | gzip > project.md.gz
```

## Notes

- The `--validate` option cannot be combined with output options or filters
- External sources (GitHub URLs) are cached by default in `~/.copytree/repos/`
- Use `DEBUG=copytree:*` environment variable for detailed debugging
