# CopyTree CLI Reference

## Basic Usage

```bash
copytree [path] [options]
```

**Arguments:**
- `path` - Directory path or GitHub URL to copy (defaults to current directory)

## What a Run Prints

A normal run shows one live progress line while it works, then replaces it with
one line saying what happened:

```text
📎 File reference copied — 612 files · ~184k tokens
```

A successful run leads with **where the output went**, because there is nothing
to warn about and that is the next thing you want to know. Anything else leads
with the **outcome**:

| Glyph                 | ASCII     | Meaning                                                              |
| --------------------- | --------- | -------------------------------------------------------------------- |
| `📎` `📋` `💾` `🖥️` `📡` | `[ok]`    | Succeeded — file reference, clipboard, file, terminal, stream         |
| `⚠`                   | `[warn]`  | Usable output, but a limit or a fallback changed it                   |
| `✗`                   | `[error]` | Failed; nothing was produced                                          |
| `○`                   | `-`       | Nothing to do, or nothing done — preview, empty selection, cancelled  |

Anywhere Unicode is not safe — a redirected stream, `TERM=dumb`, a legacy
Windows console — every one of these degrades to its ASCII form.

The token estimate is always present, because that is the number that decides
whether the context will fit.

A run that finishes faster than ~130ms never shows a spinner at all, so short
commands produce exactly one line.

### stdout and stderr

- **stdout** carries the requested document, and nothing else — XML, Markdown,
  JSON, NDJSON, SARIF or the tree.
- **stderr** carries everything addressed to a person: progress, the completion
  line, warnings, errors and verbose detail.

This is a contract, not a convention. `copytree --display --format json | jq .`
is valid while the run still reports its progress, and no pipeline stage writes
to either stream directly.

Under `--log-format json` the feedback becomes NDJSON on stderr — one object per
line, stable `event` names (`run.start`, `phase.change`, `run.complete`,
`run.failed`), no ANSI and no emoji.

### Warnings

CopyTree warns only about things that could change whether you trust the output:
files omitted by a budget or the size gate, content shortened by `--char-limit`,
unreadable files, a file it could not scan for secrets, a failed conversion, or a
clipboard fallback.

Routine filtering — `.gitignore`, `node_modules`, your own `--exclude` — is the
tool working as asked, and is reported only under `--verbose`.

**Redactions are not warnings.** When the secrets guard redacts a match or leaves
out a secret-prone file, that is the feature working, and its detector is tuned
to over-match on purpose. Those appear as a calm note under a normal success
line, naming the files involved:

```text
📎 File reference copied — 67 files · ~630k tokens
  3 possible secrets redacted in config.js, server.js and deploy.js
  1 secret-prone file left out: .env
```

A warning is reserved for the cases where the guard could *not* do its job: a
finding it failed to redact (the credential is still in the output), or a file it
could not scan and therefore excluded.

### Steps that failed but did not stop the run

Some stages degrade rather than fail. A directory that is not a Git repository,
or a `--changed` ref that does not resolve, leaves the files unfiltered instead
of aborting the copy — but the result is then a whole-project context where a
diff was asked for, so it is reported:

```text
⚠ Displayed 612 files with warnings — ~184k tokens
  --changed no-such-ref could not be applied, so no files were filtered by git status: …
```

The exit code stays 0, because output was produced. Use `--quiet` if a script
should ignore this, and read the warning if a human should not.

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
so a scoped run keeps the "same set as a full run" guarantee. Use it for the deliberate gesture:
you navigated into a gitignored folder and want it anyway.

```bash
copytree --scope build/generated --scope-include-ignored
```

#### `--scope-include-config-excluded`
Let `--scope` entries override the *config* exclusions blocking them (`node_modules`, and anything
in `copytree.globalExcludedDirectories` / `globalExcludedFiles`).

Separate from `--scope-include-ignored` because the two answer different questions: one is "yes, I
know it's gitignored", the other is "yes, I really do mean `node_modules`". A path excluded by both
layers needs both flags, which scoping into `node_modules` normally does, since most repositories
also gitignore it.

`.git` is excluded by a layer neither flag lifts.

```bash
copytree --scope node_modules/some-package --scope-include-ignored --scope-include-config-excluded
```

### Output Options

#### `--output[=<file>]`, `-o [<file>]`
Save output to a file.

```bash
copytree --output output.xml
copytree -o output.xml
```

#### `--display`, `-i`
Print the output to the terminal instead of writing a file reference.

```bash
copytree --display
copytree -i
```

#### `--verbose`, `-v`
Show run detail: the phases as they happen, what was selected and what was not,
and the output size and duration on the completion line. By default a run prints
only a live progress line and one completion line.

```bash
copytree --verbose
copytree -v
```

`--verbose` is for you; `--log-level debug` is for diagnosing CopyTree itself
(stage names, timings, cache hits). They are separate on purpose.

#### `--quiet`, `-q`
Say nothing about a successful run. Progress, the completion line and non-fatal
warnings are all suppressed; failures still go to stderr and still set a non-zero
exit code.

```bash
copytree --quiet -o context.xml
```

`--log-level error` and `--log-format silent` have the same effect.

#### `--stream`, `-S`
Stream output without buffering (useful for piping).

```bash
copytree --stream | less
copytree -S > project.xml
```

See `--clipboard` under Content Options for copying the output text itself. The default is a file
reference: CopyTree writes the output to a temp file and puts that path on the clipboard.

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

#### `--clipboard`, `-y`
Copy the output text itself to the clipboard, rather than a reference to a file
containing it.

The default is a file reference: CopyTree writes the output to a temp file and
puts that path on the clipboard, so pasting into an agent hands over a file to
read instead of a few hundred kilobytes of inline context. Use this when you want
the text itself, for example to paste into a chat box directly.

```bash
copytree --clipboard
copytree -y
```

#### `--as-reference`, `-r`
No-op. Writing a file reference is the default, so this flag selects the
behaviour you would get anyway. Accepted so existing scripts and habits keep
working.

#### `--no-folder-profile`
Skip auto-discovery of a `.copytree.yml` (or `.copytree.yaml` / `.copytree.json`)
profile in the project being copied. Discovery is on by default; a profile named
explicitly with `-p` takes precedence over a discovered one.

```bash
copytree --no-folder-profile
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
# Copy current directory; the clipboard gets a path to the output file
copytree

# Copy the output text itself instead
copytree --clipboard

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
