# CopyTree

A sophisticated Node.js CLI tool that copies directory structures and file contents into structured XML format with AI-powered features. Migrated from PHP/Laravel Zero with enhanced capabilities.

## Features

- 🚀 **Fast file processing** with streaming and parallel operations
- 🤖 **AI-powered filtering** using natural language queries (Google Gemini)
- 📁 **Smart file detection** with 13+ file transformers (PDF, images, etc.)
- 🔍 **Git integration** for filtering modified/changed files  
- 📋 **Flexible output** formats (XML, JSON, tree view)
- 🎯 **Profile system** with built-in templates for common frameworks
- 💬 **Conversational AI** for codebase questions and analysis
- 🔧 **Claude Code integration** via MCP protocol
- ⚡ **Watch mode** for real-time file monitoring

## Installation

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

## Quick Start

```bash
# Copy current directory to XML
copytree

# Copy specific directory with AI filtering
copytree /path/to/project --ai-filter "authentication and user management files"

# Use a framework profile
copytree --profile laravel --output project-structure.xml

# Ask AI about your codebase
copytree ask "How does the authentication system work?"

# Watch for changes and auto-regenerate
copytree watch /path/to/project --output live-structure.xml
```

## Usage Examples

### Basic Operations
```bash
# Copy current directory
copytree

# Copy to file
copytree --output structure.xml

# Copy to clipboard (macOS)
copytree --clipboard

# Dry run (preview without executing)
copytree --dry-run

# Different output formats
copytree --format json --output structure.json
copytree --format tree  # Tree view in console
```

### Advanced Filtering
```bash
# Include/exclude patterns
copytree --include "*.js" --include "*.ts" --exclude "node_modules"

# Git-based filtering
copytree --modified     # Only modified files
copytree --changed      # Files changed from main branch

# AI-powered filtering
copytree --ai-filter "API routes and database models"
copytree --ai-filter "test files that are failing"
```

### Profile Usage
```bash
# List available profiles
copytree profile:list

# Validate a profile
copytree profile:validate laravel

# Use built-in profiles
copytree --profile laravel      # Laravel projects
copytree --profile sveltekit    # SvelteKit projects
copytree --profile default      # General projects
```

### AI Features
```bash
# Ask questions about your codebase
copytree ask "What are the main API endpoints?"
copytree ask "Where is user authentication handled?"
copytree ask "What tests are failing and why?"

# Streaming responses
copytree ask "Explain the database schema" --stream

# Maintain conversation context
copytree ask "How does login work?" --state conversation-1
copytree ask "What about logout?" --state conversation-1
```

## Configuration

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

## Commands Reference

### Core Commands
- `copytree [path]` - Copy directory structure to XML/JSON
- `copytree ask <query>` - Ask AI questions about your codebase  
- `copytree watch [path]` - Monitor directory and auto-regenerate output

### Profile Management
- `copytree profile:list` - List all available profiles
- `copytree profile:validate <name>` - Validate profile configuration

### Utility Commands
- `copytree cache:clear` - Clear AI and file processing caches
- `copytree config:validate` - Validate application configuration
- `copytree install:claude` - Set up Claude Code integration

## File Transformers

CopyTree includes specialized transformers for different file types:

- **Text files**: Direct content inclusion with encoding detection
- **Markdown**: Rendered HTML or plain text modes
- **PDF**: Text extraction with metadata
- **Images**: OCR text extraction and metadata
- **CSV**: Structured data with preview options
- **Binary**: Metadata and file signatures only
- **AI Summary**: AI-generated summaries for large files

## Integration

### Claude Code Integration
Set up CopyTree as an MCP server for Claude Code:

```bash
# In your project directory
copytree install:claude

# This creates mcp.json and optionally updates CLAUDE.md
# Restart Claude Code to load the integration
```

### Git Integration
CopyTree integrates with Git to provide context-aware file filtering:

```bash
# Show only files modified in working directory
copytree --modified

# Show files changed from main branch
copytree --changed

# Include git status in output
copytree --git-status
```

## Performance

CopyTree is optimized for large codebases:

- **Streaming processing** for memory efficiency
- **Parallel file processing** where possible
- **Smart caching** for AI operations and file transformations
- **Configurable limits** to prevent resource exhaustion

### Benchmarks
- **Small projects** (10 files): ~100ms
- **Medium projects** (100 files): ~1s  
- **Large projects** (1000+ files): ~10s

Run benchmarks: `npm run benchmark`

## Development

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

### Architecture
CopyTree uses a pipeline architecture with stages:

1. **FileDiscoveryStage** - Find files matching patterns
2. **GitFilterStage** - Apply git-based filtering
3. **AIFilterStage** - Apply AI-powered filtering  
4. **ProfileFilterStage** - Apply profile-based rules
5. **FileLoadingStage** - Load file contents
6. **TransformStage** - Apply file transformations
7. **OutputFormattingStage** - Format output (XML/JSON/tree)
8. **StreamingOutputStage** - Write to destination

### Testing
- **Unit tests**: `tests/unit/`
- **Integration tests**: `tests/integration/`
- **Performance tests**: `tests/performance/`

Coverage target: 80%

## Troubleshooting

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

## Migration from PHP Version

If migrating from the PHP version of CopyTree:

1. **Configuration**: Convert PHP config arrays to JavaScript objects
2. **Profiles**: YAML profiles remain compatible
3. **Commands**: Most command syntax is preserved
4. **AI features**: Now uses Google Gemini instead of multiple providers

See `docs/migration-guide.md` for detailed migration instructions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

MIT License. See [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and release notes.