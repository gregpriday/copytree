# Basic Usage Guide

This guide covers the fundamental usage patterns of CopyTree for everyday development tasks.

## Quick Start

### Installation Check

First, verify CopyTree is installed correctly:

```bash
# Check version
copytree --version

# View help
copytree --help
```

### Basic Copy Operation

The simplest use case - copy your current project to clipboard:

```bash
# Copy current directory
copytree

# Copy specific directory
copytree /path/to/project

# Copy and display in terminal
copytree --stdout
```

## Understanding Profiles

Profiles are the heart of CopyTree's intelligent file selection. CopyTree includes a default profile that works for most projects, or you can create custom profiles for specific needs.

### Profile Selection

CopyTree uses the following profile selection order:

1. If `--profile` flag is provided → use the specified profile
2. Else → use the built-in default profile automatically

```bash
# Use default profile (automatic)
copytree

# Explicitly specify default profile
copytree --profile default

# Use a custom profile
copytree --profile mycustom
```

The default profile provides sensible exclusions for common build artifacts, dependencies, and IDE files while including all source code and documentation.

### When to Use Custom Profiles

Create custom profiles when you need to:
- Focus on specific file types or directories
- Apply transformers to certain files
- Include files from external sources
- Override default exclusion rules

```bash
# Use custom React profile
copytree --profile my-react

# Use custom API profile
copytree --profile api-docs

# Preview profile selection
copytree plan . --profile api-docs
```

### Example Custom Profile Use Cases

- `react-components` - Only React component files
- `api-docs` - API endpoints and schemas
- `docs-only` - Documentation files only
- `minimal-js` - Essential JavaScript files
- `full-stack` - Both frontend and backend code

## File Selection Methods

### 1. Pattern-Based Selection

Use glob patterns to select specific files:

```bash
# Only JavaScript files
copytree --include "*.js"

# Multiple patterns
copytree --include "*.js" --include "*.jsx"

# Complex patterns
copytree --include "src/**/*.{js,ts}"
```

### 2. Git-Based Selection

Select files based on Git status:

```bash
# Only modified files
copytree --modified

# Files changed between commits
copytree --changed main..feature-branch

# Files changed in last 5 commits
copytree --changed HEAD~5..HEAD
```

## Output Options

### 1. Clipboard (Default)

```bash
# Copy to clipboard
copytree

# Explicitly specify clipboard
copytree --clipboard
```

### 2. File Output

```bash
# Save to specific file (defaults to xml)
copytree --output project-snapshot.xml

# Different formats
copytree --output snapshot.json --format json
copytree --output snapshot.md --format markdown
```

### 3. Console Display

```bash
# Display in terminal
copytree --stdout

# Display with syntax highlighting
copytree --stdout --format tree
```

### 4. Streaming

```bash
# Stream output (for piping)
copytree --stdout | gzip > project.xml.gz

# Stream to another tool
copytree --stdout | some-analysis-tool
```

### 5. Instructions Control

```bash
# Disable instructions in output
copytree --no-instructions

# Use custom instructions
copytree --instructions custom

# Use default instructions (explicit)
copytree --instructions default
```

## Output Formats

### Markdown (Default)

```bash
copytree --format markdown
```

Output structure:
```markdown
---
format: copytree-md@1
...
---

# CopyTree Export — project

## Directory Tree
```text
├── src/
└── README.md
```

## Files

<!-- copytree:file-begin path="@src/index.js" size=123 ... -->
### @src/index.js
```js
// File content here
```
<!-- copytree:file-end path="@src/index.js" -->
```

### JSON

```bash
copytree --format json
```

Output structure:
```json
{
  "files": [
    {
      "path": "src/index.js",
      "content": "// File content here"
    }
  ]
}
```

### Tree View

```bash
copytree --format tree
```

Output structure:
```
project/
├── src/
│   ├── index.js
│   └── components/
│       └── App.js
└── package.json
```

### XML

```bash
copytree --format xml
```

Produces XML metadata and files; useful when integrating with XML-based tooling.

## Common Workflows

### 1. Share Code with AI

```bash
# Copy project for AI analysis
copytree --profile my-react

# Copy with transformations (configured in profile)
copytree --profile my-react
```

### 2. Code Review Preparation

```bash
# Copy recent changes
copytree --modified

# Copy feature branch changes
copytree --changed main..feature/new-feature

# Include git status
copytree --git-status
```

### 3. Documentation Generation

```bash
# Copy for documentation
copytree --profile docs-only

# Copy with rich metadata and line numbers
copytree --profile mycustom --metadata --line-numbers

# Tree structure only
copytree --profile mycustom --no-content
```

### 4. Debugging Support

```bash
# Copy with line numbers
copytree --line-numbers

# Dry run to see what would be copied
copytree plan .
```

## Advanced Options

### Content Limiting

```bash
# Limit characters per file
copytree --max-chars 5000

# Limit to first N files
copytree --max-files 50
```

### File Information

```bash
# Include line numbers
copytree --line-numbers

# Include git status for every selected file
copytree --git-status

# Optional rich metadata is on by default; strip it down to the schema fields
copytree --no-metadata
```

### Transformations

Transformers are configured in profiles, not via CLI flags. To enable transformations like PDF-to-text or image OCR, configure them in your profile:

```yaml
# In your profile (e.g., .copytree/myprofile.yml)
transformers:
  pdf:
    enabled: true
    options:
      maxPages: 50

  image:
    enabled: true
    options:
      extractText: true
```

Then use the profile:

```bash
copytree --profile myprofile
```

Built-in transformers: file-loader, binary, streaming-file-loader.

## Working with External Sources

### GitHub Repositories

```bash
# Copy from GitHub
copytree https://github.com/user/repo

# Specific branch
copytree https://github.com/user/repo/tree/develop

# Subdirectory
copytree https://github.com/user/repo/tree/main/src
```

### Multiple Sources

Create a profile with external sources:

```yaml
name: with-docs
external:
  - source: https://github.com/org/docs
    destination: docs/external
    rules:
      - "*.md"
      - "**/*.md"
```

## Performance Tips

### 1. Use Specific Profiles

```bash
# Better performance
copytree --profile api

# Than generic
copytree --profile full
```

### 2. Limit Scope

```bash
# Focus on specific directories
copytree src/ --profile react

# Limit number of files
copytree --max-files 100
```

### 3. Skip Unnecessary Processing

```bash
# Skip cache for fresh results
copytree --no-transform-cache
```

## Troubleshooting

### Check What Will Be Copied

```bash
# Dry run
copytree plan .

# Validate profile
copytree --validate --profile myprofile
```

### Debug Issues

```bash
# Check configuration
copytree config validate

# Inspect configuration with provenance
copytree config show
```

### Common Issues

1. **Nothing copied**: Check if files match profile rules
2. **Too many files**: Use more specific profile or filters
3. **Missing files**: Check .copytreeignore and gitignore
4. **Slow performance**: Limit scope with `--max-files` or bypass the transformation cache with `--no-transform-cache`

## Next Steps

- [Create Your First Profile](../getting-started/first-profile.md) - Custom file selection
- [Claude Code Integration](../installation/claude-integration.md) - Use with Claude Code
- [Configuration Reference](../reference/configuration.md) - Project-wide settings
