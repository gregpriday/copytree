# Cursor IDE Integration

This guide covers setting up CopyTree for seamless integration with Cursor IDE, enabling you to query your codebase directly from Cursor's AI chat interface.

## Overview

The CopyTree Cursor integration allows you to use the `@copytree` symbol in Cursor's chat to:

- Ask questions about your codebase
- Debug complex issues with AI assistance
- Get contextual code explanations
- Navigate large projects efficiently
- Understand dependencies and relationships

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

### Basic Queries

Once installed, you can use `@copytree` in Cursor's chat:

```
@copytree ask "What is the main purpose of this project?"
```

```
@copytree ask "How does the authentication system work?"
```

```
@copytree ask "Where are the API endpoints defined?"
```

### Advanced Usage

#### Contextual Questions
Be specific about what you want to know:

```
@copytree ask "Explain the data flow in the user registration process"
```

```
@copytree ask "What design patterns are used in the service layer?"
```

#### Debugging Help
Use CopyTree to understand code issues:

```
@copytree ask "Why might the login function be returning undefined?"
```

```
@copytree ask "What are the dependencies of the PaymentService class?"
```

#### Code Navigation
Find specific implementations:

```
@copytree ask "Where is email validation implemented?"
```

```
@copytree ask "Show me all the database migrations"
```

### Stateful Conversations

CopyTree maintains conversation state for follow-up questions:

```
// Initial question
@copytree ask "What authentication methods are supported?"

// Follow-up question (maintains context)
@copytree ask "How is JWT token validation implemented?"
```

### Options

You can pass additional options to customize behavior:

```
@copytree ask "Analyze the testing strategy" --profile nodejs
```

Available options:
- `--profile <name>`: Use a specific profile for file selection
- `--verbose`: Get more detailed responses
- `--focus <path>`: Limit analysis to specific directories

## How It Works

1. **MDC Rule File**: Cursor reads the `.cursor/rules/copytree.mdc` file
2. **Symbol Registration**: The `@copytree` symbol becomes available in chat
3. **Command Execution**: When used, Cursor executes the CopyTree CLI
4. **Context Generation**: CopyTree analyzes your codebase and generates context
5. **AI Response**: Cursor's AI uses the context to provide accurate answers

## Best Practices

### 1. Be Specific
More specific questions yield better results:
- ❌ "How does this work?"
- ✅ "How does the payment processing workflow handle failed transactions?"

### 2. Use Project Context
Reference specific files or components:
- "Explain the purpose of UserController.js"
- "How does the config/database.js file connect to MongoDB?"

### 3. Iterative Exploration
Start broad, then narrow down:
1. "What are the main components of this application?"
2. "Tell me more about the authentication component"
3. "How does the JWT refresh token mechanism work?"

### 4. Leverage Profiles
Use appropriate profiles for better results:
```
@copytree ask "Analyze the React components" --profile react
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
   copytree ask "test question"
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

1. Create a custom profile:
   ```bash
   copytree profile:create --name myproject
   ```

2. Use it with @copytree:
   ```
   @copytree ask "Analyze the codebase" --profile myproject
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