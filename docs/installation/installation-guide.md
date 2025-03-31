# Installation Guide

This guide will walk you through the process of installing Copytree on your macOS system. Copytree is designed exclusively for macOS and requires several prerequisites to function properly.

## Prerequisites

Before installing Copytree, ensure you have the following components installed on your system:

### Required Components

1. **PHP 8.2 or higher**
   - Required extensions: `fileinfo`, `gd`, `pdo`
   - Verify your PHP version: `php -v`
   - Check installed extensions: `php -m`

2. **Composer** (PHP package manager)
   - Install from [getcomposer.org](https://getcomposer.org/download/)

3. **Git** (Version control system)
   ```bash
   brew install git
   ```

4. **Pandoc** (Document converter)
   ```bash
   brew install pandoc
   ```

5. **Poppler** (PDF utilities)
   ```bash
   brew install poppler
   ```

### Optional Components

- **Google Gemini API Key** - Required for AI-powered features:
  - `copytree ask` command
  - AI filtering (`--ai-filter`)
  - Automatic filename generation
  - [See instructions for obtaining a key](gemini-api-key.md)

## Installation Steps

1. **Install Copytree via Composer**
   ```bash
   composer global require gregpriday/copytree
   ```

2. **Update Your PATH**
   Add the Composer global bin directory to your system's PATH. Add this line to your shell configuration file (`~/.zshrc`, `~/.bash_profile`, or `~/.config/fish/config.fish`):
   ```bash
   export PATH="$HOME/.composer/vendor/bin:$PATH"
   ```
   
   After adding the line, reload your shell configuration:
   ```bash
   source ~/.zshrc  # or ~/.bash_profile for bash
   ```

3. **(Optional) Create an Alias**
   For convenience, add this line to your shell configuration file:
   ```bash
   alias c="copytree"
   ```

## Configuration

Run the interactive installer to set up Copytree:

```bash
copytree install:copytree
```

The installer will:

1. Create the `~/.copytree` directory structure
2. Guide you through configuring:
   - Gemini API Key
   - AI model selections for different tasks
   - Request timeout settings
   - History limits
   - Garbage collection settings
3. Test your API key
4. Set up the SQLite database for conversation history

### Configuration Options

During the installation, you'll be prompted to configure several settings:

- **AI Models**:
  - Ask Model (Default: `gemini-2.5-pro-exp-03-25`)
  - Expert Selector Model (Default: `models/gemini-2.0-flash`)
  - Summarization Model (Default: `models/gemini-2.0-flash-lite`)
  - Classification Model (Default: `models/gemini-2.0-flash`)
  - General Purpose Model (Default: `models/gemini-2.0-flash`)

- **System Settings**:
  - Request Timeout (Default: 120 seconds)
  - History Limit (Default: 20 items)
  - Garbage Collection (Default: 7 days)

## Cursor Integration

To use Copytree with Cursor, you'll need to install the Cursor rule file in each project where you want to use it. See the [Cursor Integration Guide](cursor-integration.md) for detailed instructions.

## Verifying Your Installation

1. Check the installed version:
   ```bash
   copytree --version
   ```

2. Test basic functionality:
   ```bash
   copytree --display
   ```

3. If you configured an API key, test AI features:
   ```bash
   copytree ask "What is the main purpose of this project?" --profile=default
   ```

## Next Steps

- Learn about [Basic Usage](../usage/basic-usage.md)
- Set up [Cursor Integration](cursor-integration.md)
- Configure your [Gemini API Key](gemini-api-key.md)

## Troubleshooting

If you encounter any issues during installation, please refer to our [Troubleshooting Guide](../usage/troubleshooting.md). 