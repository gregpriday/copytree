# CopyTree Documentation

CopyTree is a powerful Node.js CLI tool that intelligently copies directory structures and file contents into AI-friendly formats. Perfect for sharing codebases with AI assistants, documentation generation, and code analysis.

> **Requirements**: Node.js 22.12+ | ESM only | [View on GitHub](https://github.com/gregpriday/copytree)

## 🚀 Start Here

**New to CopyTree?** Follow this path to get productive in 10 minutes:

1. **[Quickstart Guide](./getting-started/quickstart.md)** - Install and run your first copy
2. **[Create Your First Profile](./getting-started/first-profile.md)** - Customize file selection for your needs
3. **[Basic Usage](./usage/basic-usage.md)** - Master common workflows and patterns

## 📚 Documentation by Section

### Getting Started

Perfect for newcomers and quick reference:

- **[Quickstart Guide](./getting-started/quickstart.md)** - Get up and running in 10 minutes
- **[Your First Custom Profile](./getting-started/first-profile.md)** - Learn to create profiles step-by-step
- **[Installation Guide](./installation/installation-guide.md)** - Complete installation instructions
- **[Claude Code Integration](./installation/claude-integration.md)** - Use with Claude Code

### User Guides

For day-to-day usage:

- **[Basic Usage](./usage/basic-usage.md)** - Common commands and workflows
- **[Troubleshooting](./usage/troubleshooting.md)** - Solve common problems
- **[Secrets Guard](./usage/secrets-guard.md)** - Prevent accidental secret exposure

### Reference

Authoritative technical references:

- **[Configuration Reference](./reference/configuration.md)** - Complete config system with precedence rules
- **[CLI Reference](./cli/copytree-reference.md)** - All commands and options

### Developer Documentation

For contributors and extenders:

- **[Architecture Guide](./technical/architecture.md)** - Pipeline, stages, and event system
- **[Testing Strategy](./technical/testing-strategy.md)** - Test infrastructure and patterns

## ✨ Key Features

### 1. **Intelligent File Selection**

- **Profile System**: Default profile automatically used; create custom profiles for project-specific needs
- **Git Integration**: Copy only modified or changed files
- **Pattern Matching**: Flexible include/exclude rules

### 2. **Multiple Output Options**

- **Clipboard**: Default output for easy pasting
- **File Output**: Save to file
- **Streaming**: Real-time output for large projects
- **Multiple Formats**: XML (default), Markdown, JSON, NDJSON, SARIF, or tree view

### 3. **Developer-Friendly**

- **External Sources**: Include files from GitHub or other directories
- **Editor Integration**: Works with VS Code, Cursor, and Claude Code
- **Secrets Detection**: Prevent accidental exposure of API keys and credentials

## 🎯 Common Use Cases

### Share Code with AI

```bash
# Copy entire project (uses default profile)
copytree

# Copy with custom profile
copytree --profile myproject
```

### Document Generation

```bash
# Generate project overview as Markdown
copytree --output project-overview.md

# Generate as XML (default format)
copytree --output project-overview.xml
```

### Code Review

```bash
# Copy only git modified files
copytree --modified

# Copy only what is staged for the next commit
copytree --staged

# Copy files changed since a specific ref
copytree --changed HEAD~5
```

### Understand before you copy

```bash
copytree plan .                 # exactly which files, in what order, at what size
copytree inspect .              # structure, active rules, effective profile and budgets
copytree explain docs/README.md # why one path is in, or out
copytree ignore context .       # a content-free inventory for authoring .copytreeignore
```

## 🔧 Configuration

CopyTree uses a two-level configuration system:

1. **Packaged defaults**: shipped with CopyTree
2. **User data configuration**: `config.yaml` in the platform's configuration directory
   (`~/.config/copytree`, `~/Library/Application Support/CopyTree`, or `%APPDATA%\CopyTree`).
   The legacy `~/.copytree/*.js` directory is still read, with a warning;
   `copytree config migrate --write` converts it.

### Quick Configuration

```bash
# Validate configuration
copytree config validate

# Inspect configuration with provenance
copytree config show --sources

# Caches and temporary reference files
copytree cache status
copytree cache clear
copytree cache gc
```

## 📖 Learn More

- [Basic Usage Guide](./usage/basic-usage.md) - Complete usage documentation
- [Troubleshooting Guide](./usage/troubleshooting.md) - Solve common issues
- [Claude Code Integration](./installation/claude-integration.md) - Use with Claude Code

## 🐛 Troubleshooting

Having issues? Check our comprehensive [Troubleshooting Guide](./usage/troubleshooting.md) or run:

```bash
# Check the installation end to end
copytree doctor

# Validate configuration
copytree config validate
```

## 📄 License

CopyTree is open-source software licensed under the MIT License.
