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
copytree --display
```

## Understanding Profiles

Profiles are the heart of CopyTree's intelligent file selection.

### Auto-Detection

By default, CopyTree auto-detects your project type:

```bash
# Auto-detects Laravel, React, Django, etc.
copytree
```

### Using Specific Profiles

Override auto-detection with a specific profile:

```bash
# Use Laravel profile
copytree --profile laravel

# Use React profile
copytree --profile react

# See all available profiles
copytree profile:list
```

### Common Built-in Profiles

- `laravel` - Laravel PHP framework
- `react` - React applications
- `vue` - Vue.js applications
- `django` - Django Python framework
- `nodejs` - Generic Node.js projects
- `api` - API-focused files
- `docs` - Documentation files only
- `minimal` - Essential code files
- `full` - All files (respecting .gitignore)

## File Selection Methods

### 1. Pattern-Based Selection

Use glob patterns to select specific files:

```bash
# Only JavaScript files
copytree --filter "*.js"

# Multiple patterns
copytree --filter "*.js" --filter "*.jsx"

# Complex patterns
copytree --filter "src/**/*.{js,ts}"
```

### 2. Git-Based Selection

Select files based on Git status:

```bash
# Only modified files
copytree --modified

# Files changed between commits
copytree --changes main..feature-branch

# Files changed in last 5 commits
copytree --changes HEAD~5..HEAD
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
# Save to specific file
copytree --output project-snapshot.xml

# Different formats
copytree --output snapshot.json --format json
```

### 3. Console Display

```bash
# Display in terminal
copytree --display

# Display with syntax highlighting
copytree --display --format tree
```

### 4. Streaming

```bash
# Stream output (for piping)
copytree --stream | gzip > project.xml.gz

# Stream to another tool
copytree --stream | some-analysis-tool
```

## Output Formats

### XML (Default)

```bash
copytree --format xml
```

Output structure:
```xml
<project>
  <file path="src/index.js">
    <content>// File content here</content>
  </file>
</project>
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

## Common Workflows

### 1. Share Code with AI

```bash
# Copy project for AI analysis
copytree --profile react

# Copy with transformations
copytree --transform
```

### 2. Code Review Preparation

```bash
# Copy recent changes
copytree --modified

# Copy feature branch changes
copytree --changes main..feature/new-feature

# Include git status
copytree --git-status
```

### 3. Documentation Generation

```bash
# Copy for documentation
copytree --profile docs

# Copy with file info
copytree --file-size --line-numbers

# Tree structure only
copytree --only-tree
```

### 4. Debugging Support

```bash
# Copy with line numbers
copytree --line-numbers

# Dry run to see what would be copied
copytree --dry-run
```

## Advanced Options

### Content Limiting

```bash
# Limit directory depth
copytree --depth 3

# Limit lines per file
copytree --max-lines 100

# Limit characters per file
copytree --max-characters 5000
```

### File Information

```bash
# Include line numbers
copytree --line-numbers

# Include file sizes
copytree --file-size

# Include git status
copytree --git-status

# Size report
copytree --size-report
```

### Transformations

```bash
# Apply transformers (PDF to text, etc.)
copytree --transform

# Skip transformations
copytree --no-transform
```

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
      - include: "*.md"
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

# Use depth limits
copytree --depth 3
```

### 3. Skip Unnecessary Processing

```bash
# Skip transformations for speed
copytree --no-transform

# Skip cache for fresh results
copytree --no-cache
```

## Troubleshooting

### Check What Will Be Copied

```bash
# Dry run
copytree --dry-run

# Validate profile
copytree --validate --profile myprofile
```

### Debug Issues

```bash
# Enable debug output
copytree --debug

# Verbose output
copytree --verbose

# Check configuration
copytree config:validate
```

### Common Issues

1. **Nothing copied**: Check if files match profile rules
2. **Too many files**: Use more specific profile or filters
3. **Missing files**: Check .ctreeignore and gitignore
4. **Slow performance**: Limit scope or skip transformations

## Next Steps

- [Create Custom Profiles](../profiles/profile-creation-guide.md)
- [Learn About Transformers](../profiles/transformer-reference.md)
- [Set Up AI Integration](../installation/claude-integration.md)
- [Explore Advanced Features](../profiles/profile-advanced.md)