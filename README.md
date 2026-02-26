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
# Copy to clipboard (default: XML format)
copytree

# Copy as file reference (useful for pasting into LLMs)
copytree -r

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
# - default (no flags): copies to clipboard
# - --display: prints to terminal
# - -o/--output: writes to a file
# - -S/--stream: streams to stdout/file (best for large outputs or CI)
```

## 🎯 Why CopyTree?

- **Smart File Discovery** - Intelligent selection with `.gitignore`, `.copytreeignore`, and `.copytreeinclude` support
- **Multiple Output Formats** - XML (default), Markdown, JSON, tree view
- **Profile System** - Default profile with customizable overrides
- **Git Integration** - Filter by modified files, branch diffs, staged changes
- **External Sources** - Include files from GitHub repos or other directories
- **Character Limiting** - Stay within AI context windows automatically
- **Secrets Detection** - Prevent accidental exposure of API keys and credentials
- **Electron Ready** - Works in Electron ≥28 main processes for desktop apps

## 🔧 Frequently Used Flags

- `--format <xml|json|markdown|tree>` – Output format (default: **xml**)
- `-t, --only-tree` – Tree structure only (no file contents)
- `-i, --display` – Print to terminal instead of clipboard
- `--clipboard` – Force copy to clipboard
- `-S, --stream` – Stream output to stdout/file (ideal for large projects or CI)
- `-C, --char-limit <n>` – Enforce character budget per file
- `--with-line-numbers` – Add line numbers to file contents
- `--info` – Include file metadata (size, modified date)
- `--show-size` – Show file sizes in output
- `--with-git-status` – Include git status for each file
- `-r, --as-reference` – Generate file and copy its reference (for LLMs)
- `--always <pattern...>` – Force include specific patterns
- `--dedupe` – Remove duplicate files
- `--sort <path|size|modified|name|extension>` – Sort files

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

# Dry run (preview without copying)
copytree --dry-run

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
copytree --profile my-profile

# Auto-detect a folder profile as a reference
copytree --as-reference
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

## 🛠️ Requirements

- **Node.js 20+** (required by engines in package.json)

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
