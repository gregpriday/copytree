# Claude Code Integration

This guide covers using CopyTree with Claude Code for enhanced productivity.

## Overview

CopyTree works seamlessly with Claude Code by providing structured, AI-friendly representations of your codebase that you can copy and share. This enables you to:

- Share project context efficiently
- Get AI assistance with code understanding
- Generate documentation
- Analyze code patterns
- Debug issues with full context

## Basic Usage

### 1. Copy Project to Clipboard

The simplest way to share your project with Claude Code:

```bash
# Copy current directory
copytree

# Copy with a specific profile
copytree --profile laravel

# Copy only modified files
copytree --modified
```

### 2. Copy to Reference File

For larger projects or when you need persistent context:

```bash
# Save to a file
copytree --output project-context.xml

# Or use the shorthand
copytree -o project-context.xml
```

Then you can reference this file in Claude Code conversations.


## Best Practices

### 1. Use Appropriate Profiles

Select profiles that match your project type:

```bash
# List available profiles
copytree profile:list

# Use framework-specific profiles
copytree --profile laravel
copytree --profile sveltekit
copytree --profile react
```

### 2. Filter for Relevance

Focus on the code that matters:

```bash
# Only modified files
copytree --modified

# Files changed from main branch
copytree --changed main

# Specific file patterns
copytree --filter "src/**/*.js"
```

### 3. Enable Transformations

Get better context with AI-powered transformations:

```bash
# Enable all transformations
copytree --transform

# This includes:
# - PDF to text conversion
# - Image OCR and descriptions
# - Code summaries for large files
# - Test file summaries
```

### 4. Manage Output Size

For large projects, control the output size:

```bash
# Limit to first 50 files
copytree --head 50

# Set character limit
copytree --char-limit 100000

# Show only tree structure
copytree --only-tree
```

## Workflow Examples

### Debugging Session

```bash
# Copy only files related to the error
copytree --modified --transform -o debug-context.xml
```

### Code Review

```bash
# Copy files changed in feature branch
copytree --changed main --transform
```

### Documentation Generation

```bash
# Copy with summaries and descriptions
copytree --profile docs --transform --always "README.md" --always "docs/**/*"
```

### Understanding New Codebase

```bash
# Get overview with tree structure first
copytree --only-tree

# Then dive into specific areas
copytree --filter "src/components/**" --transform
```

## Tips for Effective Use

1. **Start Small**: Begin with filtered views before sharing entire codebases
2. **Use Profiles**: Leverage built-in profiles for better file selection
3. **Enable Caching**: Keep caching enabled for faster AI transformations
4. **Iterate**: Use git filters to focus on current work
5. **Reference Files**: For ongoing work, use file output instead of clipboard

## Troubleshooting

### Large Clipboard Issues

If clipboard fails with large output:

```bash
# Save to file instead
copytree -o context.xml

# Or limit the output size
copytree --char-limit 50000
```

### Performance Issues

For better performance:

```bash
# Enable caching (default)
copytree --transform

# Or disable specific transformations
copytree --no-transform
```

### Missing Context

If important files are missing:

```bash
# Force include specific files
copytree --always "config/*" --always ".env.example"

# Check what profile is being used
copytree --dry-run
```

## Related Documentation

- [Basic Usage](../usage/basic-usage.md) - General usage guide
- [Profile Overview](../profiles/profile-overview.md) - Understanding profiles
- [CLI Reference](../cli/copytree-reference.md) - Complete command reference