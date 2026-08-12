# CopyTree

> Turn any codebase into a structured, AI-friendly format that fits in context windows.

[![npm version](https://img.shields.io/npm/v/copytree)](https://www.npmjs.com/package/copytree)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🌐 **[copytree.dev](https://copytree.dev)**

**Who is this for?**
- Engineers sharing code context with AI tools (Claude, ChatGPT, etc.)
- Code reviewers capturing diffs and changes
- Documentation writers exporting structured code snippets

## 📦 Installation

```bash
npm install -g copytree
```

## ⚡ Quick Start

```bash
# Copy a file reference to the clipboard (default; XML format)
copytree

# Copy the output text itself to the clipboard instead
copytree --clipboard

# Save to file
copytree -o project-structure.xml

# Structure and metadata, without file bodies
copytree --no-content

# Copy from GitHub repository
copytree https://github.com/user/repo

# Write the export to stdout
copytree --stdout

# Note: destination behaviour — exactly one of these
# - default (no flags): writes a temp file and copies a file reference, so pasting
#   into an agent hands over a file to read rather than inline context
# - -y/--clipboard: copies the output text itself
# - --stdout:       writes the export to stdout
# - -o/--output:    writes the export to a file
# - --reference:    the default, stated explicitly
```

## 🔎 Understand a project before you copy it

Four read-only commands answer the questions a copy cannot:

```bash
copytree plan .                      # exactly which files, in what order, at what size
copytree inspect .                   # structure, active rules, effective profile and budgets
copytree explain docs/README.md      # why one path is in, or out, down to the rule and line
copytree ignore context .            # a content-free inventory for authoring .copytreeignore
```

None of them read file contents, write an export, or touch the clipboard.

## 🎯 Why CopyTree?

- **One ignore engine** - Nested `.gitignore` at every depth, `.git/info/exclude`, your global
  gitignore, `.copytreeignore`, and `.copytreeinclude`, all applied through a single path used by
  both the CLI and the SDK. No `git check-ignore` subprocess, and no git repository required
- **Scoped copy** - Copy one folder with the whole repository's rules, using literal paths rather
  than globs
- **Budgets that bind** - Per-file size gate, total size, file count, and character budget, all
  applied in a defined order and always reported when they truncate
- **Exclusion accounting** - Every run can answer "what didn't make it, and why", down to the
  ignore file and line number
- **Extension-first binary handling** - A 3 GB `.mp4` costs one `stat`, not an open and a read
- **Multiple Output Formats** - XML (default), Markdown, JSON, NDJSON, SARIF, tree view, each
  versioned so downstream prompts can detect a change
- **Git Integration** - Filter by modified files, branch diffs, staged changes
- **Token estimates** - "Copied 47 files (~78k tokens)" is the number that decides whether you
  paste it
- **Secrets Detection** - Prevent accidental exposure of API keys and credentials
- **Electron Ready** - Works in Electron ≥34 main processes for desktop apps

## 🔧 Frequently Used Flags

Repeatable options take one value per occurrence: `--include a --include b`.

- `--format <xml|markdown|json|ndjson|sarif|tree>` – Output format (default: **xml**)
- `--profile <name>` – Use a file-selection profile; `--no-profile` skips auto-discovery
- `--scope <path>` – Copy only this literal path (not a glob), with root-anchored ignore rules
- `--include <glob>` – Narrow the selection; a file must match at least one
- `-x, --exclude <pattern>` – Add a Git-style exclusion rule
- `--force-include <glob>` – Override ordinary excludes and the size gate
- `--no-content` – Structure and metadata, without file bodies
- `--stdout` – Write the export to stdout
- `-v, --verbose` – Show run detail: selection summary, size and duration
- `-q, --quiet` – Say nothing about a successful run; failures still go to stderr
- `-y, --clipboard` – Copy the output text itself, instead of a file reference
- `--size-gate <size>` / `--no-size-gate` – Per-file size gate, applied before opening (default 256KB)
- `--max-total-size <size>` / `--max-files <n>` / `--max-chars <n>` – Bound the whole context
- `--line-numbers` – Add line numbers to text content
- `--git-status` – Attach Git status to selected files
- `--binary <default|omit|comment|placeholder|base64|convert>` – Binary/document policy
- `--secrets <redact|fail|off>` – Secret policy (default: **redact**)
- `--dedupe` – Remove content-identical files
- `--sort <path|size|modified|name|extension|depth>` / `--order <asc|desc>` – Selection order,
  which also decides which files survive a budget

Full reference: [docs/cli/copytree-reference.md](docs/cli/copytree-reference.md), generated from the
command schema. `copytree help --format json` emits the same schema for machines.

## 🍳 Common Recipes

```bash
# Only modified files
copytree -m
copytree --modified

# Compare with main branch
copytree -c main
copytree --changed main

# Include JS/TS files, exclude node_modules
copytree --include "**/*.js" --include "**/*.ts" --exclude "node_modules"

# Copy GitHub folder to XML
copytree https://github.com/user/repo/tree/main/src -o repo-src.xml

# Send the export to stdout (great for CI or a pipe)
copytree --stdout --format markdown > output.md
copytree --stdout --format json | jq .

# One folder, but with the whole repository's ignore rules
copytree --scope src/panels/file-browser

# Several entries at once; paths are literal, so no glob escaping
copytree --scope "src/[draft]" package.json

# Bound the context, and keep the recently-touched files when it bites
# (budgets keep the head of the sorted list, so ask for newest-first)
copytree --max-total-size 2MB --sort modified --order desc

# Preview the exact selection, with the reason each file was dropped
copytree plan .
copytree plan . --explain

# Structure only, no file bodies
copytree --no-content

# Different output formats
copytree --format json -o structure.json
copytree --format xml -o structure.xml
copytree --format markdown -o structure.md
```

## 📋 Profiles (60-second guide)

Profiles control which files are included and how they're processed.

**Create a custom profile:**
```yaml
# .copytree/my-profile.yml
name: my-profile
include: ["src/**/*.js", "README.md"]
exclude: ["**/*.test.js"]
output:
  format: markdown
```

**Use your profile:**
```bash
# Use a profile by name
copytree --profile my-profile -o summary.md

# A .copytree.yml in the project is auto-discovered; skip it with
copytree --no-profile
```

## ⚙️ Configuration

CopyTree uses hard-coded defaults to keep things simple. Configuration is managed through:

### Configuration Files

User preferences are **data, not code**, in the conventional location for your platform:

- Linux: `$XDG_CONFIG_HOME/copytree/config.yaml` (or `~/.config/copytree/config.yaml`)
- macOS: `~/Library/Application Support/CopyTree/config.yaml`
- Windows: `%APPDATA%\CopyTree\config.yaml`

```yaml
# config.yaml
copytree:
  maxFileSize: 10485760   # 10MB
  includeHidden: false
  respectGitignore: true
```

The legacy `~/.copytree/*.js` directory is still read, with a warning. Executing JavaScript from a
home directory inside a host process is inappropriate for an embedder and unreproducible for
everyone, so prefer the data file — `copytree config migrate --write` converts an existing setup
and leaves the legacy directory untouched. Run `copytree config show --sources` to see which file
each effective value came from, and `copytree config validate` to check them.

Project-specific selection belongs in a profile (`.copytree.yml`) or an ignore file, not in user
configuration.

### Ignore Files

Use `.copytreeignore` in your project directory for custom exclusions (uses `.gitignore` syntax):

```bash
# .copytreeignore
node_modules/
*.log
.env
dist/
```

Use `.copytreeinclude` to force-include specific files that would otherwise be excluded (e.g., hidden files):

```bash
# .copytreeinclude
.example/**
.github/**
config/**
```

**Note:** `.copytreeinclude` patterns have the highest precedence and will override all other exclusion rules, including `.gitignore`, `.copytreeignore`, and profile excludes.

## 📦 Programmatic API

CopyTree is designed to be embedded, not just run. The SDK and the CLI share one selection path, so
what you get from `copy()` is what `copytree` would have printed.

```js
import { copy, ConfigManager } from 'copytree';

// Create the config once per process (or per project), not per call.
// `userConfig: false` skips ~/.copytree so the same inputs produce the same
// context on every machine — important when the app is shared or signed.
const config = await ConfigManager.create({ userConfig: false });

const result = await copy(repoRoot, {
  scope: ['src/panels/file-browser'],   // literal paths, dirs or files
  maxTotalSize: 2_000_000,
  charLimit: 400_000,
  explain: true,
  config,
});

console.log(result.output);                      // formatted context
console.log(result.outputFormatVersion);         // 'copytree-xml@1'
console.log(result.stats.estimatedTokens);       // ~78000
console.log(result.stats.excluded.byReason);     // { gitignore: 380, sizeGate: 1, ... }

if (result.stats.truncated) {
  console.warn(`Dropped ${result.stats.truncatedCount} files (${result.stats.truncatedBy})`);
}
```

**Preview before you commit.** A dry run reads nothing and formats nothing, but selects the same
files, in the same order, under the same budgets as the real run — the same guarantee
`copytree plan` gives on the command line:

```js
const plan = await copy(repoRoot, { dryRun: true, config });
plan.manifest.forEach(({ path, size, outcome }) => {
  // outcome: 'included' | 'structure-only' | 'binary-placeholder' | 'truncated'
  console.log(outcome, path, size);
});
```

**Stream when the output is large.** `copyStream()` takes the same options and still gives you the
numbers; chunks never split a code point, so they can go straight to a PTY or socket:

```js
import { copyStream } from 'copytree';

let summary;
for await (const chunk of copyStream(repoRoot, { config, onComplete: (r) => (summary = r) })) {
  pty.write(chunk);
}
console.log(`${summary.stats.totalFiles} files, ~${summary.stats.estimatedTokens} tokens`);
```

**Errors are typed.** Switch on `error.code`, never on the message:

```js
import { ERROR_CODES } from 'copytree';

try {
  await copy(repoRoot, { scope: [selectedPath], config });
} catch (error) {
  switch (error.code) {
    case ERROR_CODES.SCOPE_OUTSIDE_ROOT: return showOutsideProjectWarning();
    case ERROR_CODES.PATH_NOT_FOUND:     return showMissingPathWarning();
    case ERROR_CODES.ABORTED:            return; // user cancelled
    default: throw error;
  }
}
```

"No files matched" is **not** an error. An empty folder or a fully-ignored scope returns a valid
empty result with `stats.noFilesMatched === true`.

Full types ship with the package (`types/index.d.ts`).

## 🛠️ Requirements

- **Node.js 22.12+** (required by engines in package.json)

## 📖 Documentation

For detailed guides, see the `docs/` directory:

- **[Getting Started](docs/index.md)** - Introduction and quick start
- **[CLI Reference](docs/cli/copytree-reference.md)** - Complete command options
- **[Architecture](docs/technical/architecture.md)** - Pipeline and system design
- **[Troubleshooting](docs/usage/troubleshooting.md)** - Common issues and solutions
- **[Electron Integration](docs/installation/electron-integration.md)** - Using CopyTree in Electron apps

## 📚 Commands Reference

| Command | What it does |
|---|---|
| `copytree [path]` | Copy, using a file reference by default |
| `copytree copy [path]` | The explicit form of the default operation |
| `copytree plan [path]` | Preview the exact selection without reading contents |
| `copytree inspect [path]` | Inspect structure, rules, profile and budgets |
| `copytree explain <entry...>` | Explain why paths are included or excluded |
| `copytree ignore context [path]` | Build context for authoring `.copytreeignore` |
| `copytree ignore check [path]` | Validate ignore rules and show their effect |
| `copytree ignore init [path]` | Print or write a conservative starter file |
| `copytree config show\|validate\|migrate` | Inspect, validate or migrate configuration |
| `copytree cache status\|clear\|gc` | Inspect or manage caches and reference files |
| `copytree doctor` | Check CopyTree, clipboard, Git and converters |
| `copytree completion <shell>` | Generate shell completion code |
| `copytree debug profile [path]` | Capture CPU and/or heap profiles |

The colon spellings (`config:validate`, `cache:clear`) still parse and name their replacement.

> **Note:** CopyTree automatically creates required directories (e.g., `~/.copytree/cache/`) on
> first use. Temporary reference files land in `<temp>/copytree/<project>/` and are reclaimed by
> `copytree cache gc` on a seven-day retention policy.

## 🐛 Troubleshooting

### Quick Fixes

**Large file errors**
→ Raise `--size-gate`, or `--force-include` the specific paths you need

**Binary files**
→ `--binary <default|omit|comment|placeholder|base64|convert>` states the policy explicitly

**Memory issues**
→ Lower `--max-total-size`, or narrow the run with `--scope`

**Slow performance**
→ Enable caching, add more exclusion patterns

**Profile not found**
→ `copytree inspect . --view profile` shows the effective profile and where it was read from

**Git errors**
→ Ensure directory is a git repository with `git status`

### Debug Mode

```bash
# Check the installation, clipboard, Git and converters
copytree doctor

# Verbose run detail
copytree --verbose

# Inspect, validate or migrate configuration
copytree config show --sources
copytree config validate
copytree config migrate

# Caches and temporary reference files
copytree cache status
copytree cache clear
copytree cache gc

# CPU or heap profiling of a real copy
copytree debug profile . --type cpu
```

For more solutions, see the [Troubleshooting Guide](docs/usage/troubleshooting.md).

## 🛠️ Development

### Setup

```bash
git clone https://github.com/gregpriday/copytree.git
cd copytree
npm install
npm link  # Makes 'copytree' available globally
```

### Testing

```bash
npm test                   # Run all tests
npm test -- --watch        # Watch mode
npm run test:coverage      # Coverage report
npm run lint               # Lint code
npm run format             # Format code
```

For detailed testing information, see [tests/README.md](tests/README.md).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure tests pass (`npm test`) and coverage meets thresholds (80%)
6. Run linting (`npm run lint`) and formatting (`npm run format`)
7. Commit your changes
8. Push to your branch
9. Open a Pull Request

See our [Testing Guide](tests/README.md) for more details on writing and running tests.

## ⚡ Performance

CopyTree is optimized for large codebases:

- **Streaming processing** - Memory efficient for large files (>10MB)
- **Parallel file processing** - Faster for many files
- **Smart caching** - Avoid redundant transformations
- **Configurable limits** - Prevent resource exhaustion

**Performance targets:**
- Process 10,000 files in < 30 seconds
- Memory usage < 500MB for large projects
- Support projects up to 100MB total size

## 📄 License

MIT License. See [LICENSE](LICENSE) file for details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

---

**Need help?** Check the [docs](docs/) or open an [issue](https://github.com/gregpriday/copytree/issues).
