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

# Display tree structure only (no file contents)
copytree -t
copytree --only-tree

# Copy from GitHub repository
copytree https://github.com/user/repo

# Display in terminal
copytree --display

# Note: Destination behavior
# - default (no flags): writes a temp file and copies its path to the clipboard,
#   so pasting into an agent hands over a file to read rather than inline context
# - -y/--clipboard: copies the output text itself
# - --display: prints to terminal
# - -o/--output: writes to a file
# - -S/--stream: streams to stdout/file (best for large outputs or CI)
```

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

- `--format <xml|json|markdown|tree>` – Output format (default: **xml**)
- `--scope <path...>` – Copy only these paths (literal, not globs), with root-anchored ignore rules
- `-t, --only-tree` – Tree structure only (no file contents)
- `-i, --display` – Print to terminal instead of clipboard
- `-v, --verbose` – Show run detail: phases, selection summary, size and duration
- `-q, --quiet` – Say nothing about a successful run; failures still go to stderr
- `-y, --clipboard` – Copy the output text itself, instead of a file reference
- `-S, --stream` – Stream output to stdout/file (ideal for large projects or CI)
- `-x, --exclude <pattern...>` – Exclude glob patterns
- `-C, --char-limit <n>` – Character budget across all file content
- `--size-gate <size>` / `--no-size-gate` – Per-file size gate, applied before opening (default 256KB)
- `--max-total-size <size>` / `--max-files <n>` – Bound the whole context
- `--explain` – Report which rule excluded each file, and where that rule came from
- `--with-line-numbers` – Add line numbers to file contents
- `--info` – Include file metadata (size, modified date)
- `--show-size` – Show file sizes in output
- `--with-git-status` – Include git status for each file
- `--no-folder-profile` – Skip auto-discovery of a `.copytree.yml` folder profile
- `--always <pattern...>` – Force include specific patterns (the only thing that lifts the size gate)
- `--dedupe` – Remove duplicate files
- `--sort <path|size|modified|name|extension>` – Sort files (also decides which survive a budget)

## 🍳 Common Recipes

```bash
# Only modified files
copytree -m
copytree --modified

# Compare with main branch
copytree -c main
copytree --changed main

# Include JS/TS files, exclude node_modules
copytree -f "*.js" -f "*.ts" --exclude "node_modules"

# Copy GitHub folder to XML
copytree https://github.com/user/repo/tree/main/src -o repo-src.xml

# Stream output (great for CI or large projects)
copytree -S --format markdown > output.md
copytree --stream --format json | jq .

# One folder, but with the whole repository's ignore rules
copytree --scope src/panels/file-browser

# Several entries at once; paths are literal, so no glob escaping
copytree --scope "src/[draft]" package.json

# Bound the context, and keep the recently-touched files when it bites
# (budgets keep the head of the sorted list, so ask for newest-first)
copytree --max-total-size 2MB --sort modified --sort-order desc

# Dry run (preview without copying), with the reason each file was dropped
copytree --dry-run
copytree --dry-run --explain

# Show only tree structure (no file contents)
copytree -t
copytree --only-tree

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
copytree -p my-profile -o summary.md

# A .copytree.yml in the project is auto-discovered; skip it with
copytree --no-folder-profile
```

## ⚙️ Configuration

CopyTree uses hard-coded defaults to keep things simple. Configuration is managed through:

### Configuration Files

- **Global**: `~/.copytree/config/`
- **Project**: `.copytree/config/`

Example `~/.copytree/config/copytree.js`:
```javascript
module.exports = {
  defaultExclusions: ['node_modules', '.git', 'dist', 'build'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  includeHidden: false,
  respectGitignore: true
};
```

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
files, in the same order, under the same budgets as the real run:

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

### Main Commands
- `copytree [path]` - Copy directory structure
- `copytree cache:clear` - Clear caches
- `copytree config:validate` - Validate configuration
- `copytree config:inspect` - Inspect effective configuration with source provenance (redacts secrets by default)

> **Note:** CopyTree automatically creates required directories (e.g., `~/.copytree/cache/`, `~/.copytree/profiles/`) on first use. No manual setup is required.

## 🐛 Troubleshooting

### Quick Fixes

**Large file errors**
→ Adjust `COPYTREE_MAX_FILE_SIZE` environment variable

**Binary files**
→ Use `--include-binary` to include binary files; control placeholder/base64 encoding via config

**Memory issues**
→ Reduce `COPYTREE_MAX_TOTAL_SIZE` or enable streaming mode with `-S/--stream`

**Slow performance**
→ Enable caching, add more exclusion patterns

**Profile not found**
→ Check search paths: project `.copytree/` → user `~/.copytree/profiles/` → built-in `profiles/`

**Git errors**
→ Ensure directory is a git repository with `git status`

### Debug Mode

```bash
# Enable verbose logging
DEBUG=copytree:* copytree /path/to/project

# Performance monitoring
COPYTREE_PERFORMANCE=true copytree /path/to/project

# Validate configuration
copytree config:validate
copytree config:inspect

# Clear cache
copytree cache:clear
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
