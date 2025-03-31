# Cursor Integration Guide

This guide explains how to integrate Copytree with the Cursor editor, allowing you to use Copytree's powerful context generation directly within Cursor's AI chat interface.

## Overview

The integration allows you to:
- Query your codebase using `@copytree ask` within Cursor
- Provide Cursor's AI with relevant context from your project
- Enable more accurate and context-aware code generation and analysis

## Prerequisites

Before proceeding with the integration, ensure you have:

1. Copytree installed globally via Composer
2. Copytree configured with a Gemini API key
3. Cursor editor installed
4. A project directory where you want to enable the integration

## Installation Steps

1. **Navigate to Your Project**
   ```bash
   cd /path/to/your/project
   ```

2. **Install the Cursor Rule**
   ```bash
   copytree install:cursor
   ```
   
   This command will:
   - Create the `.cursor/rules/` directory if it doesn't exist
   - Copy the `copytree.mdc` rule file into your project
   - Prompt for confirmation if the file already exists

3. **Version Control (Optional)**
   - Consider adding `.cursor/rules/copytree.mdc` to your repository
   - This ensures other team members get the integration when they clone the project
   - If you don't want to commit it, add `.cursor/` to your `.gitignore`

4. **Restart Cursor**
   If Cursor was already open:
   - Use `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux)
   - Select "Developer: Reload Window"
   - Or simply restart Cursor

## Using Copytree in Cursor

### Basic Usage

1. Open your project in Cursor
2. Open the Chat Panel (`Cmd+K` or `Ctrl+K`)
3. Type `@copytree ask` followed by your question in quotes:
   ```
   @copytree ask "Explain the purpose of the FileTransformer class."
   ```

### Using State for Follow-up Questions

For related questions that build on previous context:

1. Start a new conversation with state:
   ```
   @copytree ask "Where is the main pipeline logic defined?" --state
   ```

2. Use the provided state key for follow-up questions:
   ```
   @copytree ask "How does that pipeline handle file filtering?" --state=a1b2c3d4
   ```

### Example Queries

```
# View project structure
@copytree ask "What files are in the root directory?" --only-tree

# Understand code functionality
@copytree ask "How does the file transformation process work?"

# Find implementations
@copytree ask "Where is the GitHubUrlHandler implemented?"

# Debug issues
@copytree ask "Why might I be seeing the error 'Invalid JSON response'?"
```

## How It Works

The integration is powered by the `copytree.mdc` rule file, which:

1. Associates the `@copytree` symbol with the Copytree CLI tool
2. Provides documentation for Cursor's AI about available commands
3. Defines when and how to apply the integration within your project

## Verification

To verify the integration is working:

1. Open your project in Cursor
2. Type `@copytree` in the chat panel
3. You should see `copytree ask` appear as a suggestion
4. Try a simple query:
   ```
   @copytree ask "What files are in the root directory?" --only-tree
   ```

## Troubleshooting

### `@copytree` Not Recognized

1. Verify the rule file exists:
   ```bash
   ls .cursor/rules/copytree.mdc
   ```
2. Reinstall the rule:
   ```bash
   copytree install:cursor
   ```
3. Reload Cursor

### Command Errors

If you encounter errors when running `@copytree ask`:

1. Try running the command directly in your terminal:
   ```bash
   copytree ask "Your question"
   ```
2. Check your Copytree installation:
   ```bash
   copytree install:copytree
   ```
3. Verify your API key configuration
4. Ensure all prerequisites are installed

## Next Steps

- Learn about [Basic Usage](../usage/basic-usage.md)
- Explore [Advanced Topics](../usage/advanced-topics.md)
- Check the [Troubleshooting Guide](../usage/troubleshooting.md) if you encounter issues 