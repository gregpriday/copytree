# Custom Instructions

CopyTree supports custom instructions that are included in the output to guide AI analysis. This allows you to provide context-specific guidance for different projects or use cases.

## How Instructions Work

Instructions are loaded from Markdown files and included in the XML/JSON output under the `<ct:instructions>` tag (XML) or `instructions` field (JSON). The AI receives these instructions along with your code, helping it understand how to analyze your project.

## Instructions Loading Priority

CopyTree looks for instructions in this order:

1. **User directory**: `~/.copytree/instructions/`
2. **App directory**: `src/templates/instructions/` (built-in)

## Using Instructions

### Default Instructions

By default, CopyTree uses the "default" instructions:

```bash
# Uses default instructions
copytree

# Explicit default
copytree --instructions default
```

### Custom Instructions

Create custom instructions for specific use cases:

```bash
# Use custom instructions
copytree --instructions react-review
copytree --instructions api-documentation
copytree --instructions security-audit
```

### Disable Instructions

Skip instructions entirely:

```bash
# No instructions in output
copytree --no-instructions
```

## Creating Custom Instructions

### 1. Create Instructions Directory

```bash
mkdir -p ~/.copytree/instructions
```

### 2. Create Instructions File

Create a Markdown file for your custom instructions:

**Example: `~/.copytree/instructions/react-review.md`**

```markdown
This XML document represents a React application codebase for code review purposes. 

Focus your analysis on:

1. **Component Architecture**: Examine component structure, props usage, and composition patterns
2. **State Management**: Review useState, useEffect, and context usage
3. **Performance**: Look for unnecessary re-renders, missing dependencies, and optimization opportunities
4. **Best Practices**: Check for proper error boundaries, accessibility, and testing patterns
5. **Security**: Identify potential XSS vulnerabilities and unsafe practices

When referencing files, use the @ notation (e.g., @src/components/Header.jsx). Provide specific line numbers when suggesting improvements.
```

**Example: `~/.copytree/instructions/api-documentation.md`**

```markdown
This XML document contains API source code for documentation generation.

Please generate comprehensive API documentation including:

1. **Endpoints**: List all routes with HTTP methods, parameters, and responses
2. **Data Models**: Document request/response schemas and validation rules
3. **Authentication**: Describe auth mechanisms and required permissions
4. **Error Handling**: Document error codes and messages
5. **Examples**: Provide sample requests and responses

Format the output as structured documentation with clear sections and code examples.
```

### 3. Verify Instructions

List available instructions:

```bash
copytree config:validate  # Shows available instructions

# Or test directly
copytree --instructions react-review --dry-run
```

## Built-in Instructions

CopyTree includes a default instructions file that provides general guidance for code analysis. You can override this by creating your own `default.md` in your user instructions directory.

## Instructions in Output

### XML Format

```xml
<ct:directory path="/project">
  <ct:metadata>
    <ct:instructions name="react-review">
      Your custom instructions content here...
    </ct:instructions>
  </ct:metadata>
  <ct:files>
    <!-- Files here -->
  </ct:files>
</ct:directory>
```

### JSON Format

```json
{
  "directory": "/project",
  "metadata": {
    "instructions": "Your custom instructions content here..."
  },
  "files": []
}
```

## Environment Configuration

Set default instructions via environment variable:

```bash
export COPYTREE_DEFAULT_INSTRUCTIONS=react-review
copytree  # Uses react-review instructions by default
```

## Common Use Cases

### Code Review Instructions

Create instructions focused on code quality, security, and best practices.

### Documentation Generation

Instructions for extracting API documentation, README content, or technical specifications.

### Refactoring Guidance

Instructions for identifying refactoring opportunities and architectural improvements.

### Framework-Specific Analysis

Custom instructions for React, Vue, Django, Laravel, or other framework-specific concerns.

### Security Audits

Instructions focused on identifying security vulnerabilities and compliance issues.

## Tips

1. **Be Specific**: Include exact requirements for your use case
2. **Use Examples**: Show the expected output format
3. **Reference Style**: Mention the @ file reference notation
4. **Context Matters**: Include relevant background about your project
5. **Iterative Refinement**: Test and refine instructions based on AI responses

## Troubleshooting

### Instructions Not Found

```bash
Error: Instructions 'custom-name' not found
```

Check that the file exists:
- `~/.copytree/instructions/custom-name.md`
- Verify filename and extension

### Instructions Not Applied

Ensure you're not using `--no-instructions` flag and check the output contains the `<ct:instructions>` section.

### Validation Issues

Run config validation to check instructions setup:

```bash
copytree config:validate
```