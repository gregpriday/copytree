# MCP Server Usage Guide

This guide provides detailed information about using CopyTree's Model Context Protocol (MCP) server and its available tools.

## Overview

The CopyTree MCP server provides a standardized interface for AI assistants to interact with your codebase. It implements the Model Context Protocol, allowing seamless integration with Claude Code and other MCP-compatible tools.

## Starting the MCP Server

### Basic Usage

```bash
copytree mcp
```

### With Options

```bash
# With specific profile
copytree mcp --profile laravel

# With debug logging
copytree mcp --debug

# With specific port
copytree mcp --port 3000
```

## Available Tools

The MCP server provides six powerful tools for codebase interaction:

### 1. project_ask

Ask natural language questions about your codebase.

**Parameters:**
- `question` (required): Your question about the codebase
- `profile` (optional): Profile name to use for file selection
- `focus` (optional): Path to focus the analysis on
- `state` (optional): Conversation state for follow-ups
- `stream` (optional): Enable streaming responses

**Examples:**

```json
{
  "tool": "project_ask",
  "arguments": {
    "question": "What is the authentication flow in this application?"
  }
}
```

```json
{
  "tool": "project_ask",
  "arguments": {
    "question": "How are user permissions handled?",
    "profile": "laravel",
    "focus": "app/Http/Middleware"
  }
}
```

**Use Cases:**
- Understanding code architecture
- Debugging complex issues
- Learning how features work
- Finding implementation details
- Code review assistance

### 2. project_copy

Generate structured XML output of project files.

**Parameters:**
- `profile` (optional): Profile name for file selection
- `filter` (optional): Additional file pattern filters
- `ai_filter` (optional): Natural language filter description
- `format` (optional): Output format (xml, json, tree)
- `include_git_status` (optional): Include Git status info
- `transform` (optional): Apply file transformations

**Examples:**

```json
{
  "tool": "project_copy",
  "arguments": {
    "profile": "react",
    "filter": "*.jsx",
    "include_git_status": true
  }
}
```

```json
{
  "tool": "project_copy",
  "arguments": {
    "ai_filter": "all test files",
    "format": "tree"
  }
}
```

**Use Cases:**
- Creating project snapshots
- Sharing code context with AI
- Generating documentation
- Code analysis preparation

### 3. list_files

List files in the project with optional filtering.

**Parameters:**
- `path` (optional): Directory path to list
- `pattern` (optional): Glob pattern for filtering
- `profile` (optional): Profile to apply
- `recursive` (optional): Include subdirectories

**Examples:**

```json
{
  "tool": "list_files",
  "arguments": {
    "path": "src",
    "pattern": "*.js",
    "recursive": true
  }
}
```

```json
{
  "tool": "list_files",
  "arguments": {
    "profile": "api",
    "pattern": "**/*Controller.js"
  }
}
```

**Use Cases:**
- Project structure exploration
- Finding specific file types
- Verifying file organization
- Quick file inventory

### 4. read_file

Read the contents of a specific file.

**Parameters:**
- `path` (required): File path to read
- `encoding` (optional): File encoding (default: utf8)
- `line_start` (optional): Starting line number
- `line_end` (optional): Ending line number

**Examples:**

```json
{
  "tool": "read_file",
  "arguments": {
    "path": "package.json"
  }
}
```

```json
{
  "tool": "read_file",
  "arguments": {
    "path": "src/index.js",
    "line_start": 50,
    "line_end": 100
  }
}
```

**Use Cases:**
- Examining specific files
- Reading configuration files
- Checking implementation details
- Reviewing code sections

### 5. search_files

Search for patterns across the codebase.

**Parameters:**
- `query` (required): Search pattern or regex
- `path` (optional): Directory to search in
- `file_pattern` (optional): File pattern to search
- `case_sensitive` (optional): Case-sensitive search
- `regex` (optional): Use regex pattern
- `max_results` (optional): Limit number of results

**Examples:**

```json
{
  "tool": "search_files",
  "arguments": {
    "query": "TODO",
    "file_pattern": "*.js"
  }
}
```

```json
{
  "tool": "search_files",
  "arguments": {
    "query": "class.*Controller",
    "regex": true,
    "path": "app/Http/Controllers"
  }
}
```

**Use Cases:**
- Finding specific code patterns
- Locating TODOs and FIXMEs
- Searching for function usage
- Code refactoring preparation

### 6. get_file_tree

Get the project's directory structure.

**Parameters:**
- `path` (optional): Starting directory
- `max_depth` (optional): Maximum tree depth
- `show_hidden` (optional): Include hidden files
- `profile` (optional): Apply profile filters

**Examples:**

```json
{
  "tool": "get_file_tree",
  "arguments": {
    "max_depth": 3,
    "show_hidden": false
  }
}
```

```json
{
  "tool": "get_file_tree",
  "arguments": {
    "path": "src",
    "profile": "react"
  }
}
```

**Use Cases:**
- Understanding project structure
- Navigation assistance
- Documentation generation
- Project overview

## Advanced Usage

### Stateful Conversations

The `project_ask` tool supports stateful conversations:

```json
// First question
{
  "tool": "project_ask",
  "arguments": {
    "question": "What database does this project use?"
  }
}

// Follow-up with state
{
  "tool": "project_ask",
  "arguments": {
    "question": "How are migrations handled?",
    "state": "previous-conversation-id"
  }
}
```

### Combining Tools

Tools can be used together for comprehensive analysis:

1. Use `get_file_tree` to understand structure
2. Use `search_files` to find specific patterns
3. Use `read_file` to examine implementations
4. Use `project_ask` to understand the big picture

### Streaming Responses

Enable streaming for real-time responses:

```json
{
  "tool": "project_ask",
  "arguments": {
    "question": "Explain the entire authentication system",
    "stream": true
  }
}
```

### Profile-Based Analysis

Use profiles to focus on specific aspects:

```json
{
  "tool": "project_copy",
  "arguments": {
    "profile": "api",
    "transform": true
  }
}
```

## Performance Optimization

### Caching

The MCP server caches responses for better performance:

- Project structure is cached
- AI responses are cached (configurable TTL)
- File contents are cached until modified

### Large Projects

For large projects, use these strategies:

1. **Use Profiles**: Limit file scope with appropriate profiles
2. **Focus Paths**: Use the `focus` parameter to limit analysis
3. **Incremental Queries**: Break complex questions into smaller parts
4. **File Patterns**: Use specific patterns to reduce file count

### Memory Management

The server uses streaming and chunking for large operations:

- Files are processed in chunks
- Large responses are streamed
- Memory usage is monitored and limited

## Error Handling

### Common Errors

1. **File Not Found**
   ```json
   {
     "error": "File not found",
     "code": "FILE_NOT_FOUND",
     "path": "/path/to/file"
   }
   ```

2. **Invalid Profile**
   ```json
   {
     "error": "Profile not found",
     "code": "PROFILE_NOT_FOUND",
     "profile": "invalid-profile"
   }
   ```

3. **AI Service Error**
   ```json
   {
     "error": "AI service unavailable",
     "code": "AI_SERVICE_ERROR",
     "details": "API key not configured"
   }
   ```

### Error Recovery

- Retry failed operations automatically
- Fallback to basic operations if AI fails
- Provide detailed error messages
- Log errors for debugging

## Security Considerations

### Access Control

- MCP server respects file system permissions
- No access outside the project directory
- Gitignore patterns are respected
- Sensitive files can be excluded via profiles

### Safe Operations

- Read-only operations only
- No file modifications
- No code execution
- No external network calls (except AI)

## Best Practices

### 1. Use Appropriate Profiles

Always use the most specific profile for your project type:
- Better performance
- More relevant results
- Reduced noise

### 2. Structure Questions Well

- Be specific about what you want to know
- Reference specific files or components when relevant
- Use technical terms appropriately
- Break complex questions into parts

### 3. Leverage Caching

- Repeated questions use cached responses
- Clear cache when project changes significantly
- Configure cache TTL appropriately

### 4. Monitor Performance

- Use `--debug` flag for performance metrics
- Watch for slow operations
- Optimize profiles for large projects

## Integration Examples

### With Claude Code

```json
{
  "mcpServers": {
    "copytree": {
      "command": "copytree",
      "args": ["mcp"],
      "cwd": "/path/to/project"
    }
  }
}
```

### With Custom Clients

```python
import requests

# Make MCP request
response = requests.post('http://localhost:3000/mcp', json={
    'tool': 'project_ask',
    'arguments': {
        'question': 'What is this project about?'
    }
})

result = response.json()
```

## Troubleshooting

### Server Won't Start

1. Check if port is in use
2. Verify CopyTree installation
3. Check file permissions
4. Review debug logs

### Slow Responses

1. Use more specific profiles
2. Reduce file scope with patterns
3. Check cache configuration
4. Monitor system resources

### Incorrect Results

1. Verify profile configuration
2. Check .ctreeignore settings
3. Update file index
4. Clear cache if needed

## Related Documentation

- [Claude Code Integration](../installation/claude-integration.md)
- [Profile Overview](../profiles/profile-overview.md)
- [CLI Reference](../cli/copytree-reference.md)