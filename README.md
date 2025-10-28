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
# Copy current directory to markdown
copytree -o project-structure.md

# Copy to clipboard
copytree

# Copy from GitHub repository
copytree https://github.com/user/repo

# Display in terminal instead
copytree --display
```

## 🎯 Why CopyTree?

- **Smart File Discovery** - Intelligent selection with gitignore support
- **15+ File Transformers** - PDF text extraction, image OCR/descriptions, AI summaries
- **Multiple Output Formats** - Markdown, XML, JSON, tree view
- **Profile System** - Default profile with customizable overrides
- **Git Integration** - Filter by modified files, branch diffs, staged changes
- **External Sources** - Include files from GitHub repos or other directories
- **Character Limiting** - Stay within AI context windows automatically

## 🍳 Common Recipes

```bash
# Only modified files
copytree -m
copytree --git-modified

# Compare with main branch
copytree -c main
copytree --changed main

# Include JS/TS files, exclude node_modules
copytree -f "*.js" -f "*.ts" --exclude "node_modules"

# Copy GitHub folder to XML
copytree https://github.com/user/repo/tree/main/src -o repo-src.xml

# Apply AI transformers (summaries, OCR)
copytree --transform

# Dry run (preview without copying)
copytree --dry-run

# Show only tree structure (no file contents)
copytree -t
copytree --tree-only

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
transformers:
  file-loader: true
  markdown: true
output:
  format: markdown
```

**Use your profile:**
```bash
# Validate first
copytree profile:validate my-profile

# Then use it
copytree -p my-profile -o summary.md
copytree --profile my-profile

# List all available profiles
copytree profile:list
```

## 🤖 AI Integration

CopyTree can call AI providers for intelligent summaries, image descriptions, and code analysis.

**Supported providers:**
- **Gemini** (Google AI) - Set `GEMINI_API_KEY`
- **OpenAI** - Set `OPENAI_API_KEY` (when configured)
- More providers can be added via configuration

**Enable AI features:**
```bash
# Set API key
export GEMINI_API_KEY=your_key_here

# Use AI transformers
copytree --transform
```

**Note:** When you enable AI transformers, file content may be sent to your configured AI provider. Review your organization's policies, scrub secrets, and use `.copytreeignore` to exclude sensitive files.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in your project or home directory:

```bash
# AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=your_openai_key_here  # Optional

# Performance Settings
COPYTREE_MAX_FILE_SIZE=10485760      # 10MB
COPYTREE_MAX_TOTAL_SIZE=104857600    # 100MB
COPYTREE_MAX_FILE_COUNT=10000

# Cache Settings
COPYTREE_CACHE_ENABLED=true
COPYTREE_CACHE_TTL=86400000          # 24 hours
```

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

Use `.copytreeignore` in your project directory for custom exclusions (uses `.gitignore` syntax).

## 🛠️ Requirements

- **Node.js** 18+ (LTS recommended)
- **Optional dependencies:**
  - [Pandoc](https://pandoc.org) - For Word/ODT document conversion
  - [Tesseract](https://github.com/tesseract-ocr/tesseract) - For image OCR capabilities

## 📖 Documentation

For detailed guides, see the `docs/` directory:

- **[Getting Started](docs/index.md)** - Introduction and quick start
- **[CLI Reference](docs/cli/copytree-reference.md)** - Complete command options
- **[Profile Overview](docs/profiles/profile-overview.md)** - Creating and using profiles
- **[Transformer Reference](docs/profiles/transformer-reference.md)** - All 15+ transformers explained
- **[Architecture](docs/technical/architecture.md)** - Pipeline and system design
- **[Troubleshooting](docs/usage/troubleshooting.md)** - Common issues and solutions

## 📚 Commands Reference

### Main Commands
- `copytree [path]` - Copy directory structure
- `copytree profile:list` - List available profiles
- `copytree profile:validate <name>` - Validate a profile
- `copytree cache:clear` - Clear caches
- `copytree config:validate` - Validate configuration
- `copytree copy:docs` - Copy built-in documentation

## 🐛 Troubleshooting

### Quick Fixes

**Large file errors**
→ Adjust `COPYTREE_MAX_FILE_SIZE` environment variable

**Memory issues**
→ Reduce `COPYTREE_MAX_TOTAL_SIZE` or enable streaming mode

**AI features not working**
→ Verify `GEMINI_API_KEY` is set correctly and valid

**Slow performance**
→ Enable caching, use lighter transformers, add more exclusion patterns

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
npm run test:watch         # Watch mode
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
- **Smart caching** - Avoid redundant AI calls and transformations
- **Configurable limits** - Prevent resource exhaustion

**Performance targets:**
- Process 10,000 files in < 30 seconds
- Memory usage < 500MB for large projects
- Support projects up to 100MB total size

## 🎯 Creating Profiles with AI

You can create custom profiles using AI assistants like Claude Code:

```bash
# Create a profile interactively
claude -p "Please create a CopyTree profile for this project.
Start by running \`copytree copy:docs --display\` to read the docs,
then create an optimal profile."

# Or build a .copytreeignore file
claude -p "Please create a .copytreeignore file for this project.
Start by running \`copytree copy:docs --display\` to review ignore rules."
```

The `copytree copy:docs --display` step provides accurate documentation to ensure quality profile creation.

For detailed guidance: [Profile Creation Guide](docs/profiles/profile-creation-guide.md)

## 📄 License

MIT License. See [LICENSE](LICENSE) file for details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.

---

**Need help?** Check the [docs](docs/) or open an [issue](https://github.com/gregpriday/copytree/issues).
