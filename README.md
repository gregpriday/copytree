# CopyTree

A powerful Node.js CLI tool that transforms codebases into structured, AI-friendly formats. This is a complete rewrite of the original PHP/Laravel Zero version with full feature parity and enhanced capabilities.

## 🚀 Features

### Core Functionality
- **Smart File Discovery** - Intelligent file selection with gitignore support
- **15+ File Transformers** - PDF text extraction, image OCR/descriptions, code summaries
- **Multiple Output Formats** - XML, JSON, tree view, and markdown
- **Profile System** - Pre-configured profiles for Laravel, SvelteKit, and more
- **External Sources** - Include files from GitHub repos or other directories
- **Character Limiting** - Stay within AI context windows automatically

### AI Integration (Gemini)
- **Natural Language Filtering** - "Show me authentication files"
- **AI-Powered Summaries** - Automatic code and test file summarization
- **Image Analysis** - Generate descriptions for images and diagrams
- **Conversational Interface** - Ask questions about your codebase
- **Smart Profile Creation** - AI suggests optimal settings for your project

### Advanced Features
- **Watch Mode** - Monitor changes and regenerate output automatically
- **Git Integration** - Filter by modified, staged, or untracked files
- **MCP Server** - Direct integration with Claude Desktop
- **Profile Auto-Detection** - Automatically detect project type
- **Deduplication** - Remove duplicate files based on content
- **Always Include** - Force include critical files regardless of filters

## 📦 Installation

### Global Installation
```bash
npm install -g copytree
```

### Local Development
```bash
git clone <repository-url>
cd copytree
npm install
npm link  # Makes 'copytree' available globally
```

## 🚀 Quick Start

```bash
# Copy current directory to clipboard
copytree

# Copy specific directory with AI filtering
copytree /path/to/project -a "authentication and user management files"

# Use a framework profile
copytree -p laravel -o project-structure.xml

# Ask AI about your codebase
copytree ask "How does the authentication system work?"

# Watch for changes and auto-regenerate
copytree watch /path/to/project -o live-structure.xml

# Copy from GitHub repository
copytree https://github.com/user/repo -p default

# Copy specific branch/path from GitHub
copytree https://github.com/user/repo/tree/main/src -o repo-src.xml
```

## 📖 Usage Examples

### Basic Operations
```bash
# Copy current directory (default: to clipboard)
copytree

# Copy to file
copytree -o structure.xml

# Display to console instead of clipboard
copytree -i

# Copy file path reference to clipboard
copytree -r

# Dry run (preview files without copying)
copytree --dry-run

# Show only directory tree structure (no file contents)
copytree -t

# Different output formats
copytree --format json -o structure.json
copytree --format tree  # Tree view in console
```

### Advanced Filtering
```bash
# Include/exclude patterns
copytree -f "*.js" -f "*.ts" --exclude "node_modules"

# Git-based filtering
copytree -m                 # Only modified files
copytree -c main            # Files changed from main branch

# AI-powered filtering
copytree -a "API routes and database models"
copytree -a "test files that are failing"

# Combine filters
copytree -p laravel -m -a "controller files"
```

### Profile Usage
```bash
# List available profiles
copytree profile:list

# Validate a profile
copytree profile:validate laravel

# Create a new profile with AI assistance
copytree profile:create

# Use built-in profiles
copytree -p laravel      # Laravel projects
copytree -p sveltekit    # SvelteKit projects
copytree -p default      # General projects
```

### AI Features
```bash
# Ask questions about your codebase
copytree ask "What are the main API endpoints?"
copytree ask "Where is user authentication handled?"
copytree ask "What tests are failing and why?"

# Streaming responses
copytree ask "Explain the database schema" -S

# Maintain conversation context
copytree ask "How does login work?" -s conversation-1
copytree ask "What about logout?" -s conversation-1

# AI-powered file summaries
copytree --transform  # Apply all transformers including AI summaries
```

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in your project or home directory:

```bash
# AI Configuration (Google Gemini)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_DEFAULT_MODEL=gemini-1.5-flash

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

## 📚 Commands Reference

### Core Commands
- `copytree [path]` - Copy directory structure to XML/JSON
- `copytree ask <query>` - Ask AI questions about your codebase  
- `copytree watch [path]` - Monitor directory and auto-regenerate output
- `copytree mcp [directory]` - Start MCP server for Claude integration

### Profile Management
- `copytree profile:create [path]` - Create new profile with AI assistance
- `copytree profile:list` - List all available profiles
- `copytree profile:validate <name>` - Validate profile configuration

### Documentation & Setup
- `copytree copy:docs` - Copy built-in documentation
- `copytree install:copytree` - Set up CopyTree environment
- `copytree install:claude` - Configure Claude Desktop integration

### Utility Commands
- `copytree cache:clear` - Clear AI and file processing caches
- `copytree config:validate` - Validate application configuration

## 🔧 File Transformers

CopyTree includes 15+ specialized transformers:

### Text Processing
- **FileLoader**: Default transformer, loads content as-is
- **FirstLines**: Show only first N lines of files
- **MarkdownTransformer**: Strip formatting or convert markdown
- **MarkdownLinkStripper**: Remove links while preserving text
- **HTMLStripper**: Convert HTML to plain text

### AI-Powered (Gemini)
- **AISummary**: General AI-powered summaries
- **FileSummary**: Summarize any text file in 2-3 sentences
- **UnitTestSummary**: Specialized summaries for test files
- **ImageDescription**: Describe images using vision AI
- **SvgDescription**: Analyze and describe SVG files

### Document Conversion
- **PDFTransformer**: Extract text from PDF files
- **DocumentToText**: Convert Word/ODT documents (requires Pandoc)
- **CSVTransformer**: Preview or full CSV content with formatting

### Binary & Media
- **BinaryTransformer**: Replace binary content with metadata
- **ImageTransformer**: Handle images with OCR (Tesseract) or AI descriptions

## 🔌 Integration

### Claude Desktop Integration
Set up CopyTree as an MCP server for Claude Desktop:

```bash
# Install globally first
npm install -g copytree

# In your project directory
copytree install:claude

# This creates mcp.json and optionally updates CLAUDE.md
# Restart Claude Desktop to load the integration
```

### MCP Server Features
- **project_ask**: Query codebases with natural language
- **project_copy**: Generate structured output
- Stateful conversations
- Streaming responses
- Git integration
- Custom file filtering

### Git Integration
CopyTree integrates with Git to provide context-aware file filtering:

```bash
# Show only files modified in working directory
copytree -m

# Show files changed from main branch
copytree -c main

# Include git status in output
copytree --with-git-status

# Compare with specific branch
copytree -c develop
```

## 🏗️ Architecture

CopyTree uses an event-driven pipeline architecture with 16 processing stages:

1. **FileDiscoveryStage** - Find files matching patterns
2. **ProfileFilterStage** - Apply profile-based rules
3. **GitFilterStage** - Apply git-based filtering
4. **AIFilterStage** - Apply AI-powered filtering  
5. **ExternalSourceStage** - Include external files
6. **TransformStage** - Apply file transformations
7. **DeduplicationStage** - Remove duplicate files
8. **CharacterLimitStage** - Enforce size limits
9. **OutputFormattingStage** - Format output (XML/JSON/tree)
10. **StreamingOutputStage** - Write to destination

And additional stages for caching, metadata, sorting, and more.

## ⚡ Performance

CopyTree is optimized for large codebases:

- **Streaming processing** for memory efficiency
- **Parallel file processing** where possible
- **Smart caching** for AI operations and file transformations
- **Configurable limits** to prevent resource exhaustion

### Performance Targets
- Process 10,000 files in < 30 seconds
- Memory usage < 500MB for large projects  
- Support projects up to 100MB total size
- Stream files > 10MB without loading into memory

Run benchmarks: `npm run benchmark`

## 🛠️ Development

### Setup
```bash
git clone <repository-url>
cd copytree
npm install

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

### Project Structure
```
copytree/
├── src/
│   ├── commands/        # CLI command implementations
│   ├── pipeline/        # Processing pipeline stages
│   ├── services/        # Core services (AI, Cache, Git)
│   ├── transforms/      # File transformers
│   └── utils/          # Utility functions
├── config/             # Default configurations
├── profiles/           # Built-in profiles
├── docs/               # Documentation
└── tests/              # Test suites
```

### Testing
- **Unit tests**: `tests/unit/`
- **Integration tests**: `tests/integration/`
- **Performance tests**: `tests/performance/`
- **Test fixtures**: `tests/fixtures/`

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Getting Started](docs/index.md)** - Introduction and quick start
- **[Installation Guide](docs/installation/installation-guide.md)** - Detailed setup instructions
- **[CLI Reference](docs/cli/copytree-reference.md)** - Complete command documentation
- **[Profile Overview](docs/profiles/profile-overview.md)** - Understanding profiles
- **[Transformer Reference](docs/profiles/transformer-reference.md)** - All transformers explained
- **[MCP Server Guide](docs/usage/mcp-server.md)** - Claude Desktop integration
- **[Troubleshooting](docs/usage/troubleshooting.md)** - Common issues and solutions

## 🐛 Troubleshooting

### Common Issues

**Large file errors**: Adjust `COPYTREE_MAX_FILE_SIZE` environment variable

**Memory issues**: Reduce `COPYTREE_MAX_TOTAL_SIZE` or use streaming mode

**AI features not working**: Verify `GEMINI_API_KEY` is set correctly

**Slow performance**: Enable caching and check file exclusion patterns

### Debug Mode
```bash
# Enable verbose logging
DEBUG=copytree:* copytree /path/to/project

# Performance monitoring
COPYTREE_PERFORMANCE=true copytree /path/to/project
```

## 🔄 Migration from PHP Version

If migrating from the PHP version of CopyTree:

1. **Configuration**: Convert PHP config arrays to JavaScript objects
2. **Profiles**: YAML profiles remain compatible
3. **Commands**: Most command syntax is preserved
4. **AI Provider**: Now uses Google Gemini exclusively (no OpenAI/Anthropic support)
5. **New Features**: MCP server, watch mode, enhanced pipeline architecture

Key differences:
- Single AI provider (Gemini) instead of multiple
- JavaScript configuration instead of PHP arrays
- Enhanced pipeline architecture
- Native MCP server implementation
- More transformers (15+ vs 13)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

MIT License. See [LICENSE](LICENSE) file for details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.