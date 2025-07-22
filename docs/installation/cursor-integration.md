# Cursor IDE Integration

This guide covers setting up CopyTree for seamless integration with Cursor IDE, enabling you to query your codebase directly from Cursor's AI chat interface.

## Overview

The CopyTree Cursor integration allows you to use the `@copytree` symbol in Cursor's chat to:

- Copy structured code context to share with AI
- Generate XML/JSON representations of your codebase
- Apply transformations to files (PDF to text, image OCR, etc.)
- Filter files by patterns or Git status

## Prerequisites

- CopyTree installed globally (`npm install -g copytree`)
- Cursor IDE installed and configured
- A project you want to analyze

## Installation

### Automated Setup

CopyTree provides an automated setup command:

```bash
copytree install:cursor
```

This command will:
1. Create a `.cursor/rules/` directory in your project
2. Install the CopyTree MDC rule file
3. Configure the `@copytree` symbol for use in Cursor
4. Provide instructions for activation

### Manual Setup

If you prefer manual installation:

1. Create the rules directory:
   ```bash
   mkdir -p .cursor/rules
   ```

2. Create `.cursor/rules/copytree.mdc` with the MDC rule configuration (see below)

3. Restart Cursor or reload the window

## Usage

### Basic Commands

Once installed, you can use `@copytree` in Cursor's chat:

```
@copytree
```
Copies the current project structure to clipboard in XML format

```
@copytree --profile laravel
```
Uses the Laravel profile to filter relevant files

```
@copytree --modified
```
Only includes files modified since the last commit

### Advanced Usage

#### Output Formats
Choose different output formats:

```
@copytree --format json
```
Outputs in JSON format instead of XML

```
@copytree --format tree
```
Shows a tree view of the project structure

```
@copytree --only-tree
```
Shows only the directory structure without file contents

#### Git Integration
Filter files based on Git status:

```
@copytree --modified
```
Only modified files in working directory

```
@copytree --changed main
```
Files changed compared to main branch

#### File Filtering
Use patterns to include/exclude files:

```
@copytree --filter "src/**/*.js"
```
Only JavaScript files in src directory

```
@copytree --always "README.md" --always "package.json"
```
Always include specific files regardless of other filters

### Options

Available options for customizing output:
- `--profile <name>`: Use a specific profile (laravel, react, api, etc.)
- `--format <type>`: Output format (xml, json, tree)
- `--modified`: Only Git modified files
- `--changed <ref>`: Files changed from Git reference
- `--filter <pattern>`: Include files matching pattern
- `--head <n>`: Limit to first N files
- `--transform`: Apply transformations (PDF to text, OCR, etc.)
- `--only-tree`: Directory structure only
- `--with-line-numbers`: Add line numbers to code

## How It Works

1. **MDC Rule File**: Cursor reads the `.cursor/rules/copytree.mdc` file
2. **Symbol Registration**: The `@copytree` symbol becomes available in chat
3. **Command Execution**: When used, Cursor executes the CopyTree CLI
4. **Context Generation**: CopyTree generates structured output of your codebase
5. **AI Analysis**: Cursor's AI can analyze the structured code context

## Best Practices

### 1. Use Appropriate Profiles
Select profiles that match your project type:
```
@copytree --profile laravel
@copytree --profile react
@copytree --profile api
```

### 2. Filter for Relevance
Use Git filters to focus on current work:
```
@copytree --modified          # Current changes
@copytree --changed feature   # Changes in feature branch
```

### 3. Manage Output Size
For large projects, limit the output:
```
@copytree --head 50              # First 50 files
@copytree --char-limit 50000     # Character limit
@copytree --only-tree            # Structure only
```

### 4. Use Transformations
Enable transformations for better context:
```
@copytree --transform            # All transformations
```

## Troubleshooting

### @copytree Not Recognized

1. Ensure the MDC file exists:
   ```bash
   ls -la .cursor/rules/copytree.mdc
   ```

2. Restart Cursor completely (quit and reopen)

3. Check if you're in the correct project directory

### Command Execution Errors

1. Verify CopyTree is installed globally:
   ```bash
   which copytree
   ```

2. Test the command directly in terminal:
   ```bash
   copytree --dry-run
   ```

3. Check for configuration issues:
   ```bash
   copytree config:validate
   ```

### No Response or Timeout

1. Large projects may take time to analyze
2. Try using a more specific profile
3. Use the `--focus` option to limit scope
4. Check if AI provider is configured correctly

### State Not Maintained

1. Ensure you're using the same chat session
2. Don't clear the conversation between questions
3. State is project-specific - switching projects clears state

## Customization

### Custom Profiles

Create project-specific profiles for better results:

1. Create a custom profile manually in `.copytree/myproject.yaml`

2. Use it with @copytree:
   ```
   @copytree --profile myproject
   ```

### Excluding Files

Use `.ctreeignore` to exclude irrelevant files:

```bash
# .ctreeignore
node_modules/
*.log
dist/
coverage/
```

### Focus Areas

Create profiles that focus on specific areas:

```yaml
# .copytree/api-focus.yaml
name: api-focus
description: Focus on API-related files

rules:
  - include: "routes/**/*.js"
  - include: "controllers/**/*.js"
  - include: "middleware/**/*.js"
  - exclude: "**/*.test.js"
```

## Integration with Other Features

### Watch Mode
Combine with watch mode for real-time updates:
```bash
copytree watch --profile react
```

### External Sources
Include documentation or related repos:
```yaml
external:
  - source: https://github.com/org/related-service
    destination: external/related-service
```

## Tips for Effective Use

1. **Start Simple**: Begin with basic questions about project structure
2. **Use Examples**: Ask for code examples when learning patterns
3. **Cross-Reference**: Ask about relationships between components
4. **Debugging**: Use for understanding error messages and stack traces
5. **Documentation**: Ask CopyTree to explain complex algorithms or business logic

## Limitations

- Response quality depends on code organization and comments
- Large projects may have slower response times
- Some dynamic behaviors may not be fully captured
- AI responses are based on static code analysis

## Uninstalling

To remove the Cursor integration:

```bash
rm -rf .cursor/rules/copytree.mdc
```

Or to remove all Cursor rules:

```bash
rm -rf .cursor/
```

## Related Documentation

- [Claude Code Integration](./claude-integration.md) - Alternative AI integration
- [Profile Overview](../profiles/profile-overview.md) - Understanding profiles
- [Basic Usage](../usage/basic-usage.md) - General CopyTree usage
- [Ask Command Reference](../cli/copytree-reference.md#ask-command) - Detailed ask command options