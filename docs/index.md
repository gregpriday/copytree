# CopyTree Documentation

CopyTree is a powerful Node.js CLI tool that intelligently copies directory structures and file contents into AI-friendly formats. Perfect for sharing codebases with AI assistants, documentation generation, and code analysis.

> **Requirements**: Node.js 20+ | ESM only | [View on GitHub](https://github.com/gregpriday/copytree)

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
- **[Profile Overview](./profiles/profile-overview.md)** - Understanding the profile system
- **[Profile Examples](./profiles/profile-examples.md)** - Real-world profile configurations
- **[Troubleshooting](./usage/troubleshooting.md)** - Solve common problems

### Reference

Authoritative technical references:

- **[Configuration Reference](./reference/configuration.md)** - Complete config system with precedence rules
- **[CLI Reference](./cli/copytree-reference.md)** - All commands and options
- **[Transformer Reference](./profiles/transformer-reference.md)** - PDF, OCR, and file transformers

### Advanced Topics

For power users:

- **[Advanced Profile Features](./profiles/profile-advanced.md)** - External sources, inheritance, optimization
- **[Profile Creation Guide](./profiles/profile-creation-guide.md)** - Comprehensive profile authoring
- **[Secrets Guard](./usage/secrets-guard.md)** - Prevent accidental secret exposure

### Developer Documentation

For contributors and extenders:

- **[Architecture Guide](./technical/architecture.md)** - Pipeline, stages, and event system
- **[Testing Strategy](./technical/testing-strategy.md)** - Test infrastructure and patterns


## ✨ Key Features

### 1. **Intelligent File Selection**
- **Profile System**: Default profile automatically used; create custom profiles for project-specific needs
- **Git Integration**: Copy only modified or changed files
- **Pattern Matching**: Flexible include/exclude rules

### 2. **Advanced Transformations**
- **PDF to Text**: Extract text from PDF documents
- **Image OCR**: Extract text from images using Tesseract
- **Format Conversion**: Markdown processing, CSV formatting, and more

### 3. **Multiple Output Options**
- **Clipboard**: Default output for easy pasting
- **File Output**: Save to file
- **Streaming**: Real-time output for large projects
- **Multiple Formats**: XML (default), Markdown, JSON, NDJSON, SARIF, or tree view

### 4. **Developer-Friendly**
- **External Sources**: Include files from GitHub or other directories
- **Editor Integration**: Works with VS Code, Cursor, and Claude Code

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

# Copy files changed since a specific ref
copytree --changed HEAD~5
```


## 🔧 Configuration

CopyTree uses a two-level configuration system:

1. **Default Configuration**: Built-in defaults
2. **User Configuration**: `~/.copytree/config/` directory (`.js` or `.json` files)

### Quick Configuration
```bash
# Validate configuration
copytree config:validate

# Inspect configuration with provenance
copytree config:inspect

# Clear cache
copytree cache:clear
```

## 📖 Learn More

- [Basic Usage Guide](./usage/basic-usage.md) - Complete usage documentation
- [Troubleshooting Guide](./usage/troubleshooting.md) - Solve common issues
- [Profile Examples](./profiles/profile-examples.md) - Example custom profiles
- [Creating Custom Profiles](./profiles/profile-creation-guide.md) - Build your own profiles
- [Transformer Reference](./profiles/transformer-reference.md) - File transformation options
- [Advanced Features](./profiles/profile-advanced.md) - Power user features

## 🤝 Integration Guides

- [Claude Code Integration](./installation/claude-integration.md) - Use with Claude Code

## 📘 Usage Guides

- [Basic Usage](./usage/basic-usage.md) - Get started with CopyTree
- [Troubleshooting](./usage/troubleshooting.md) - Solve common problems

## 🐛 Troubleshooting

Having issues? Check our comprehensive [Troubleshooting Guide](./usage/troubleshooting.md) or run:

```bash
# Check system requirements
copytree config:validate

# View debug information
DEBUG=copytree:* copytree
```

## 📄 License

CopyTree is open-source software licensed under the MIT License.