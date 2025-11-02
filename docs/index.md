# CopyTree Documentation

CopyTree is a powerful Node.js CLI tool that intelligently copies directory structures and file contents into AI-friendly formats. Perfect for sharing codebases with AI assistants, documentation generation, and code analysis.

## 🚀 Quick Start

```bash
# Install globally
npm install -g copytree

# Copy current directory to clipboard (uses default profile)
copytree

# Copy with a custom profile
copytree --profile myproject
```

## 📚 Documentation Sections

### [Installation Guide](./installation/installation-guide.md)
Complete installation instructions including prerequisites, npm setup, and configuration.

### [CLI Reference](./cli/copytree-reference.md)
Comprehensive command-line reference for all CopyTree commands and options.

### [Profile System](./profiles/profile-overview.md)
Learn about CopyTree's powerful profile system for project-specific file selection.

### [AI Integration](./installation/claude-integration.md)
Set up CopyTree with Claude Code and other AI assistants for enhanced productivity.

### [Technical Documentation](./technical/)
In-depth technical documentation for developers and contributors:
- [Architecture Guide](./technical/architecture.md) - Pipeline system, stages, and core contracts


## ✨ Key Features

### 1. **Intelligent File Selection**
- **Profile System**: Default profile included; create custom profiles for project-specific needs
- **Git Integration**: Copy only modified or changed files
- **Pattern Matching**: Flexible include/exclude rules

### 2. **Advanced Transformations**
- **PDF to Text**: Extract text from PDF documents
- **Image OCR**: Extract text from images using Tesseract
- **Code Summarization**: AI-powered summaries for large files
- **Format Conversion**: Markdown processing, CSV formatting, and more

### 3. **Multiple Output Options**
- **Clipboard**: Default output for easy pasting
- **File Output**: Save to file
- **Streaming**: Real-time output for large projects
- **Multiple Formats**: XML (default), Markdown, JSON, or tree view

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

CopyTree uses a hierarchical configuration system:

1. **Default Configuration**: Built-in defaults
2. **User Configuration**: `~/.copytree/` directory
3. **Project Configuration**: `.copytree.yaml` in your project
4. **Environment Variables**: Override any setting

### Quick Configuration
```bash
# Validate configuration
copytree config:validate

# Inspect configuration with provenance
copytree config:inspect

# Clear cache
copytree cache:clear
```

> **Note:** CopyTree automatically creates required directories (cache, profiles, repos) on first use. No manual setup is required.

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
copytree config:validate --verbose

# View debug information
DEBUG=copytree:* copytree
```

## 📄 License

CopyTree is open-source software licensed under the MIT License.