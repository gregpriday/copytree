# Obtaining and Configuring Your Gemini API Key

A Google Gemini API key is required for Copytree's AI-powered features. This guide will walk you through the process of obtaining and configuring your API key.

## Features Requiring the API Key

The Gemini API key enables the following features in Copytree:

1. `copytree ask` command for querying your codebase
2. AI filtering with `--ai-filter`
3. Automatic filename generation with `--output`
4. Code and file summarization
5. Automatic expert selection for the `ask` command
6. AI-assisted profile creation with `profile:create`

## Prerequisites

- A Google account
- Access to Google AI Studio (formerly MakerSuite)

## Obtaining Your API Key

1. Visit [Google AI Studio](https://makersuite.google.com)
2. Sign in with your Google account
3. Look for the "Get API key" option or navigate to the API key section
4. Create a new API key (you may need to create a Google Cloud project if you haven't already)
5. Copy the generated API key and keep it secure

## Configuring the API Key

You have two methods to configure your API key:

### Method 1: Interactive Installer (Recommended)

This is the easiest method as it guides you through the process and verifies the key:

1. Open your terminal and run:
   ```bash
   copytree install:copytree
   ```

2. The installer will:
   - Create the necessary `~/.copytree` directory structure
   - Prompt you to enter your Gemini API key
   - Guide you through model selection
   - Configure additional settings
   - Test your API key
   - Set up the conversation history database

### Method 2: Manual Configuration

If you prefer manual configuration:

1. Create the configuration directory:
   ```bash
   mkdir -p ~/.copytree
   ```

2. Create or edit the `.env` file:
   ```bash
   nano ~/.copytree/.env
   ```

3. Add your API key:
   ```env
   GEMINI_API_KEY="YOUR_API_KEY_HERE"
   ```

4. (Optional) Configure additional settings:
   ```env
   # AI Model Settings
   GEMINI_ASK_MODEL="gemini-2.5-pro-exp-03-25"
   
   # System Settings
   GEMINI_REQUEST_TIMEOUT="120"
   COPYTREE_HISTORY_LIMIT="20"
   COPYTREE_GC_DAYS="7"
   ```

## Default Configuration Options

When using the interactive installer, you'll be prompted to configure these settings:

### AI Models
- Ask Model: `gemini-2.5-pro-exp-03-25`
- Expert Selector: `models/gemini-2.0-flash`
- Summarization: `models/gemini-2.0-flash-lite`
- Classification: `models/gemini-2.0-flash`
- General Purpose: `models/gemini-2.0-flash`

### System Settings
- Request Timeout: 120 seconds
- History Limit: 20 items
- Garbage Collection: 7 days

## Verifying Your Configuration

After configuring your API key, verify it works by running one of these commands:

1. Test the `ask` command:
   ```bash
   copytree ask "What is the purpose of this project?" --profile=default
   ```

2. Test AI filtering:
   ```bash
   copytree --ai-filter="Files related to command execution" --display --only-tree
   ```

If these commands execute without API key errors, your configuration is working correctly.

## Security Considerations

- Keep your API key secure and never share it publicly
- Don't commit the `.env` file to version control
- Consider using environment variables if deploying in a shared environment

## Troubleshooting

If you encounter issues with your API key:

1. Verify the key is correctly copied from Google AI Studio
2. Ensure the key is properly formatted in the `.env` file
3. Run `copytree install:copytree` to test the key
4. Check the [Troubleshooting Guide](../usage/troubleshooting.md) for more help

## Next Steps

- Learn about [Basic Usage](../usage/basic-usage.md)
- Set up [Cursor Integration](cursor-integration.md)
- Explore [Advanced Topics](../usage/advanced-topics.md) 