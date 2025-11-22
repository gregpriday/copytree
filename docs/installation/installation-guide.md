# Installation Guide

This guide covers the complete installation process for CopyTree on your system.

## Prerequisites

### System Requirements

- **Node.js**: Version 20.0 or higher (LTS recommended)
- **npm**: Version 10.0 or higher (comes with Node.js)
- **Git**: For repository operations and Git integration features
- **Operating System**: macOS, Linux, or Windows with WSL

> **Important**: CopyTree requires Node.js 20+ and uses ES Modules (ESM) only. CommonJS is not supported.

### Optional Dependencies

These tools enhance CopyTree's capabilities but are not required for basic operation:

- **Pandoc**: For advanced document conversion (DOCX, ODT, etc.)
- **Tesseract**: For OCR capabilities on images

### Checking Prerequisites

```bash
# Check Node.js version
node --version  # Should show v20.0.0 or higher

# Check npm version
npm --version   # Should show 10.0.0 or higher

# Check Git installation
git --version   # Any recent version

# Check optional tools
pandoc --version    # Optional
```

## Installation Methods

### 1. Global Installation (Recommended)

Install CopyTree globally to use it from any directory:

```bash
npm install -g copytree
```

### 2. Local Installation

For project-specific use:

```bash
npm install --save-dev copytree
```

Then use with npx:
```bash
npx copytree
```

### 3. Development Installation

To contribute or modify CopyTree:

```bash
git clone https://github.com/gregpriday/copytree.git
cd copytree
npm install
npm link  # Makes 'copytree' command available globally
```

## Post-Installation Setup

### 1. Verify Installation

```bash
# Check version
copytree --version

# Test basic functionality
copytree --display --dry-run
```

### 2. Automatic Setup

CopyTree automatically creates required directories on first use:

- `~/.copytree/cache/` - Cache directory (created when caching is used)
- `~/.copytree/repos/` - GitHub repository cache (created when cloning repos)

**No manual setup required!** Just start using CopyTree.

### 3. Manual Configuration (Optional)

Alternatively, create configuration manually:

```bash
# Create config directory
mkdir -p ~/.copytree

# Create configuration file
cat > ~/.copytree/config.json << EOF
{
  "app": {
    "name": "CopyTree",
    "version": "1.0.0",
    "maxFileSize": 10485760,
    "maxTotalSize": 104857600
  },
  "cache": {
    "enabled": true,
    "ttl": 3600
  }
}
EOF
```

### 4. Environment Variables

You can also use environment variables:

```bash
# Add to ~/.bashrc, ~/.zshrc, or equivalent
export COPYTREE_CACHE_ENABLED="true"
```

## Installing Optional Dependencies

### macOS (using Homebrew)

```bash
# Install all optional dependencies
brew install pandoc

# Or install individually
brew install pandoc      # Document conversion
```

### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install dependencies
sudo apt install pandoc
```

### Windows (WSL)

Follow the Ubuntu/Debian instructions within WSL.

## Configuration Options

### Profile Directory

Create a directory for custom profiles:

```bash
mkdir -p ~/.copytree/profiles
```

### Cache Configuration

CopyTree caches external repositories and transformations:

```bash
# Clear all caches
copytree cache:clear

# Clear specific caches
copytree cache:clear --transformations
copytree cache:clear --git

# View cache settings
copytree config:inspect
```

## Verification

### Basic Test

```bash
# Copy current directory (dry run)
copytree --dry-run

# List available profiles
copytree profile:list

# Validate configuration
copytree config:validate
```

### Test Installation

```bash
# Test with dry run
copytree --dry-run

# Note: Transformers are configured in profiles, not via CLI flags
```

## Troubleshooting

For comprehensive troubleshooting information, see our [Troubleshooting Guide](../usage/troubleshooting.md).

### Command Not Found

If `copytree` command is not found after global installation:

```bash
# Check npm global bin directory
npm bin -g

# Add to PATH if needed (add to ~/.bashrc or ~/.zshrc)
export PATH="$(npm bin -g):$PATH"

# Verify installation location
npm list -g copytree
```

### Permission Errors

If you encounter EACCES errors during global installation:

```bash
# Option 1: Use npm's prefix
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2: Use npx instead of global install
npm install copytree
npx copytree
```

### Missing Dependencies

```bash
# Check which optional dependencies are missing
copytree config:validate

# Install missing dependencies based on your OS (see above)
```

### Configuration Issues

```bash
# Validate configuration
copytree config:validate

# Inspect configuration
copytree config:inspect

# Validate configuration
copytree config:validate
```

### Node.js Version Issues

```bash
# Install Node Version Manager (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node.js 20
nvm install 20
nvm use 20
```

## Platform-Specific Notes

### macOS
- Clipboard integration works out of the box
- Install Xcode Command Line Tools if Git is missing: `xcode-select --install`

### Linux
- May need to install xclip or xsel for clipboard support
- Some distributions require additional packages for Node.js

### Windows
- Use WSL2 for best compatibility
- Native Windows support is experimental
- Clipboard integration requires additional setup

## Next Steps

1. [Configure Claude Code Integration](./claude-integration.md) - Set up Claude Code integration
2. [Explore Profiles](../profiles/profile-overview.md) - Learn about file selection profiles
3. [Read CLI Reference](../cli/copytree-reference.md) - Explore all available commands

## Getting Help

```bash
# View help
copytree --help

# View specific command help
copytree copy --help
copytree config:validate --help

# Check documentation
See the docs/ folder in the repository
```

If you encounter issues not covered here, please:
1. Check our comprehensive [Troubleshooting Guide](../usage/troubleshooting.md)
2. Visit our [GitHub repository](https://github.com/gregpriday/copytree) for updates and to report bugs
