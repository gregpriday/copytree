# CopyTree Documentation

CopyTree is a powerful Node.js CLI tool that intelligently copies directory structures and file contents into AI-friendly formats. Perfect for sharing codebases with AI assistants, documentation generation, and code analysis.

## 🚀 Quick Start

```bash
# Install globally
npm install -g copytree

# Copy current directory to clipboard
copytree

# Copy with a specific profile
copytree --profile laravel
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

### [MCP Server Usage](./usage/mcp-server.md)
Comprehensive guide to using CopyTree's MCP server with Claude Code.

## ✨ Key Features

### 1. **Intelligent File Selection**
- **Profile System**: Pre-configured profiles for popular frameworks (React, Laravel, Django, etc.)
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
- **Multiple Formats**: XML (default), JSON, or tree view

### 4. **Developer-Friendly**
- **Watch Mode**: Auto-regenerate on file changes
- **External Sources**: Include files from GitHub or other directories
- **MCP Server**: Model Context Protocol support
- **Editor Integration**: Works with VS Code, Cursor, and Claude Code

## 🎯 Common Use Cases

### Share Code with AI
```bash
# Copy entire project
copytree

# Copy only Python files
copytree --profile python
```

### Document Generation
```bash
# Generate project overview
copytree --output project-overview.xml

# Create API documentation
copytree --profile api --transform
```

### Code Review
```bash
# Copy recent changes
copytree --modified

# Copy changes between commits
copytree --changes main..feature-branch
```

### Watch Mode Development
```bash
# Watch and auto-copy on changes
copytree watch --profile react

# Watch and save to file
copytree watch --output
```

## 🔧 Configuration

CopyTree uses a hierarchical configuration system:

1. **Default Configuration**: Built-in defaults
2. **User Configuration**: `~/.copytree/` directory
3. **Project Configuration**: `.copytree.yaml` in your project
4. **Environment Variables**: Override any setting

### Quick Configuration
```bash
# Run interactive setup
copytree install:copytree

# Validate configuration
copytree config:validate

# Clear cache
copytree cache:clear
```

## 📖 Learn More

- [Basic Usage Guide](./usage/basic-usage.md) - Complete usage documentation
- [Troubleshooting Guide](./usage/troubleshooting.md) - Solve common issues
- [Built-in Profiles](./profiles/builtin-profiles.md) - Explore available profiles
- [Creating Custom Profiles](./profiles/profile-creation-guide.md) - Build your own profiles
- [Transformer Reference](./profiles/transformer-reference.md) - File transformation options
- [Advanced Features](./profiles/profile-advanced.md) - Power user features

## 🤝 Integration Guides

- [Claude Code Integration](./installation/claude-integration.md) - Use with Claude Code
- [Cursor Integration](./installation/cursor-integration.md) - Set up with Cursor IDE

## 📘 Usage Guides

- [Basic Usage](./usage/basic-usage.md) - Get started with CopyTree
- [MCP Server](./usage/mcp-server.md) - Detailed MCP server documentation
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