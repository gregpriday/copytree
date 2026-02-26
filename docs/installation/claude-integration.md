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
# Copy current directory (uses default profile)
copytree

# Copy with a custom profile
copytree --profile myproject

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

Create and use custom profiles for your project needs:

```bash
# Use default profile (automatic)
copytree

# Use custom profile
copytree --profile myproject

# Preview profile selection
copytree --profile myproject --dry-run
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

### 3. Manage Output Size

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
copytree --modified -o debug-context.md
```

### Code Review

```bash
# Copy files changed since main branch
copytree --changed main
```

### Documentation Generation

```bash
# Copy documentation with force-include
copytree --always "README.md" --always "docs/**/*"
```

### Understanding New Codebase

```bash
# Get overview with tree structure first
copytree --only-tree

# Then dive into specific areas
copytree --filter "src/components/**"
```

## Tips for Effective Use

1. **Start Small**: Begin with filtered views before sharing entire codebases
2. **Use Profiles**: Create custom profiles for better file selection
3. **Enable Caching**: Keep caching enabled (default) for faster AI transformations
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
# Caching is enabled by default for AI operations
copytree

# Disable caching if needed
copytree --no-cache
```

### Missing Context

If important files are missing:

```bash
# Force include specific files
copytree --always "config/*" --always "config.example.js"

# Check what profile is being used
copytree --dry-run
```

## Related Documentation

- [Basic Usage](../usage/basic-usage.md) - General usage guide
- [Your First Custom Profile](../getting-started/first-profile.md) - Creating profiles
- [CLI Reference](../cli/copytree-reference.md) - Complete command reference