# Claude Code Integration Guide

This guide explains how to integrate Copytree with Claude Code, allowing you to use Copytree's powerful MCP server to query and understand your codebase.

## Overview

The integration provides:
- An MCP server that Claude Code automatically detects and loads
- The `project_ask` tool for querying your codebase
- Stateful conversations for follow-up questions
- Streaming responses for real-time generation

## Prerequisites

Before proceeding with the integration, ensure you have:

1. Copytree installed globally via Composer
2. Copytree configured with appropriate AI API keys
3. Claude Code installed and running
4. A project directory where you want to enable the integration

## Installation Steps

1. **Navigate to Your Project**
   ```bash
   cd /path/to/your/project
   ```

2. **Install the Claude Code Integration**
   ```bash
   copytree install:claude
   ```
   
   This command will:
   - Create or update the `mcp.json` file in your project root
   - Configure the CopyTree MCP server for Claude Code
   - Optionally append usage instructions to your `CLAUDE.md` file (if it exists)

3. **Open Your Project in Claude Code**
   - Open Claude Code
   - Open your project folder
   - The MCP server will be automatically detected and loaded

## Using the MCP Server

### The project_ask Tool

Once the MCP server is loaded, you'll have access to the `project_ask` tool. This tool allows you to:

- Ask questions about your codebase
- Understand project structure and architecture
- Find implementations and functionality
- Debug errors and test failures
- Get context about code interactions

### Basic Usage

The tool accepts these parameters:
- `question` (required): Your question about the project
- `state` (optional): State key for continuing a conversation
- `stream` (optional): Enable streaming responses

### Example Queries

```json
// Simple question
{
  "tool": "project_ask",
  "arguments": {
    "question": "What is the main purpose of this project?"
  }
}

// Follow-up question using state
{
  "tool": "project_ask",
  "arguments": {
    "question": "How does the authentication work?",
    "state": "a1b2c3d4"
  }
}

// Streaming response
{
  "tool": "project_ask",
  "arguments": {
    "question": "Explain the entire architecture in detail",
    "stream": true
  }
}
```

## CLAUDE.md Integration

If your project has a `CLAUDE.md` file, the installer can append CopyTree usage instructions to it. This helps Claude Code understand:

- That the MCP server is available
- What kinds of questions can be asked
- How to use stateful conversations
- How to enable streaming

To manually add or update these instructions, run:
```bash
copytree install:claude --append
```

## How It Works

The integration works through:

1. **mcp.json Configuration**: Defines the MCP server that Claude Code should start
2. **MCP Server**: Runs `copytree mcp` to provide the `project_ask` tool
3. **Automatic Context**: Gathers project context from the working directory
4. **AI Processing**: Uses configured AI providers to answer questions

## Verification

To verify the integration is working:

1. Check that `mcp.json` exists in your project root:
   ```bash
   cat mcp.json
   ```

2. Look for the copytree server configuration:
   ```json
   {
     "mcpServers": {
       "copytree": {
         "command": "copytree",
         "args": ["mcp"],
         "workingDirectory": "{project_root}"
       }
     }
   }
   ```

3. In Claude Code, verify the MCP server is loaded (check the MCP status indicator)

## Troubleshooting

### MCP Server Not Loading

1. Ensure `mcp.json` is in the project root (not in a subdirectory)
2. Verify Copytree is installed globally and accessible in PATH
3. Check Claude Code's MCP logs for errors

### Tool Not Available

1. Restart Claude Code after installation
2. Ensure the MCP server started successfully
3. Check for any error messages in Claude Code

### API Key Issues

If you get errors about missing API keys:

1. Run `copytree install:copytree` to configure API keys
2. Check your `~/.copytree/.env` file
3. Ensure at least one AI provider is configured

## Next Steps

- Learn about [Basic Usage](../usage/basic-usage.md)
- Explore [MCP Server Features](../usage/mcp-server.md)
- Check the [Troubleshooting Guide](../usage/troubleshooting.md) if you encounter issues