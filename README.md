# CopyTree

A Node.js CLI tool that copies directory structures and file contents into structured XML format. This is a port of the original PHP/Laravel Zero implementation.

## Installation

```bash
npm install -g copytree
```

Or clone and link locally:
```bash
git clone https://github.com/yourusername/copytree
cd copytree
npm install
npm link
```

## Usage

### Basic Usage

```bash
# Copy current directory
copytree

# Copy specific directory
copytree /path/to/directory

# Copy to clipboard (default behavior on macOS)
copytree

# Display output to console
copytree --display

# Save to file
copytree --output output.xml
```

### Advanced Features

```bash
# AI-powered file filtering
copytree --ai-filter "authentication related files"

# Git integration
copytree --modified    # Only modified files
copytree --changed     # Only changed files

# Use profiles
copytree --profile laravel

# Dry run
copytree --dry-run
```

## Configuration

Copy `.env.example` to `.env` and add your API keys:

```bash
GEMINI_API_KEY=your_api_key_here
```

## Commands

- `copytree [path]` - Main copy command
- `copytree profile:create` - Create a profile using AI
- `copytree ask <query>` - Ask AI about your codebase
- `copytree install:claude` - Install Claude integration

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development
npm start
```

## License

MIT