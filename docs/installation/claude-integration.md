# Claude Code Integration

This guide covers setting up CopyTree's MCP (Model Context Protocol) server for seamless integration with Claude Code.

## Overview

CopyTree includes a built-in MCP server that allows Claude Code to directly interact with your codebase. This enables Claude to:

- Ask questions about your project structure and code
- Search for specific files or patterns
- Read file contents
- Generate structured project summaries
- Understand your codebase context better

## Prerequisites

- CopyTree installed globally (`npm install -g copytree`)
- Claude Code desktop application
- A project you want to analyze

## Installation

### 1. Run the Claude Integration Setup

CopyTree provides an automated setup command:

```bash
copytree install:claude
```

This command will:
- Detect your Claude Code configuration file location
- Add CopyTree's MCP server configuration
- Validate the setup
- Provide instructions for restarting Claude Code

### 2. Manual Setup (Alternative)

If you prefer manual setup or the automated setup doesn't work:

1. Locate your Claude Code configuration file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the CopyTree MCP server configuration:

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

3. Restart Claude Code for the changes to take effect.

## Configuration Options

### Basic Configuration

The minimal configuration shown above is usually sufficient. The MCP server will:
- Start in the specified working directory (`cwd`)
- Use default CopyTree settings
- Auto-detect project type and apply appropriate profiles

### Advanced Configuration

You can pass additional arguments to customize behavior:

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp", "--profile", "laravel", "--debug"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Available options:
- `--profile <name>`: Use a specific profile
- `--debug`: Enable debug logging
- `--port <number>`: Use a specific port (default: auto)

## Available Tools

Once configured, Claude Code can use these CopyTree tools:

### 1. `project_ask`
Ask questions about the codebase using natural language.

**Example prompts in Claude:**
- "What is the main purpose of this project?"
- "How does the authentication system work?"
- "Where is the database configuration?"
- "Find all API endpoints"

### 2. `project_copy`
Generate structured XML output of project files.

**Example usage in Claude:**
- "Copy all React components"
- "Get the contents of the authentication module"
- "Show me all test files"

### 3. `list_files`
List files in the project with optional filtering.

**Example usage in Claude:**
- "List all JavaScript files"
- "Show me files in the src directory"
- "Find all test files"

### 4. `read_file`
Read the contents of a specific file.

**Example usage in Claude:**
- "Read the package.json file"
- "Show me the main configuration file"
- "What's in the README?"

### 5. `search_files`
Search for patterns across the codebase.

**Example usage in Claude:**
- "Search for 'TODO' comments"
- "Find all occurrences of 'authenticate'"
- "Search for error handling patterns"

### 6. `get_file_tree`
Get the project's directory structure.

**Example usage in Claude:**
- "Show me the project structure"
- "What's the directory layout?"
- "Display the file tree"

## Usage in Claude Code

### Starting a Conversation

1. Open Claude Code
2. Start a new conversation
3. The MCP indicator should show "copytree" as available
4. Begin asking questions about your codebase

### Example Workflow

```
You: What is the structure of this project?

Claude: [Uses get_file_tree tool to analyze structure]
This appears to be a Node.js project with the following structure...

You: How does the authentication system work?

Claude: [Uses project_ask and search_files tools]
Based on my analysis of the codebase...

You: Can you show me all the API endpoints?

Claude: [Uses search_files tool with pattern matching]
I found the following API endpoints...
```

### Best Practices

1. **Be Specific**: More specific questions yield better results
2. **Use Context**: Reference specific files or components when asking questions
3. **Iterative Exploration**: Start broad, then narrow down to specific areas
4. **Combine Tools**: Claude will automatically use multiple tools for comprehensive answers

## Troubleshooting

### MCP Server Not Showing in Claude

1. Verify configuration file is valid JSON:
   ```bash
   # Check syntax
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

2. Ensure CopyTree is in PATH:
   ```bash
   which copytree  # Should show the installation path
   ```

3. Restart Claude Code completely (quit and reopen)

### Connection Errors

1. Check if MCP server starts manually:
   ```bash
   copytree mcp --debug
   ```

2. Verify working directory exists and is accessible

3. Check for port conflicts (try specifying a different port)

### Tool Errors

1. Ensure you're in a valid project directory
2. Check file permissions
3. Verify Git is installed (for Git-related features)
4. Run `copytree config:validate` to check configuration

### Debug Mode

Enable debug logging for troubleshooting:

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp", "--debug"],
      "cwd": "/path/to/your/project",
      "env": {
        "DEBUG": "copytree:*"
      }
    }
  }
}
```

## Advanced Usage

### Multiple Projects

Configure multiple CopyTree instances for different projects:

```json
{
  "mcpServers": {
    "project-frontend": {
      "command": "copytree",
      "args": ["mcp"],
      "cwd": "/path/to/frontend"
    },
    "project-backend": {
      "command": "copytree",
      "args": ["mcp"],
      "cwd": "/path/to/backend"
    }
  }
}
```

### Custom Profiles

Use project-specific profiles:

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp", "--profile", "my-custom-profile"],
      "cwd": "/path/to/project"
    }
  }
}
```

### Environment Variables

Pass environment variables to customize behavior:

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp"],
      "cwd": "/path/to/project",
      "env": {
        "COPYTREE_AI_PROVIDER": "gemini",
        "COPYTREE_CACHE_ENABLED": "false"
      }
    }
  }
}
```

## Tips for Effective Use

1. **Project Context**: Always start Claude Code from your project directory for best results
2. **Profile Selection**: Use appropriate profiles for your project type
3. **File Filters**: Leverage .ctreeignore to exclude irrelevant files
4. **Caching**: CopyTree caches responses for better performance
5. **Regular Updates**: Keep CopyTree updated for new features and improvements

## Related Documentation

- [MCP Server Usage](../usage/mcp-server.md) - Detailed MCP server documentation
- [Profile Overview](../profiles/profile-overview.md) - Understanding profiles
- [Basic Usage](../usage/basic-usage.md) - General CopyTree usage