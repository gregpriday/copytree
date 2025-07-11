---
title: Profiles
nav: Profiles
weight: 30
---

# Profiles Documentation

Profiles in Copytree provide powerful control over file selection, processing, and transformation. Whether you're documenting code, preparing context for AI assistants, or extracting specific project information, profiles help you get exactly what you need.

## Documentation Structure

### Getting Started
1. **[Profile Overview](profile-overview.md)**  
   Learn the basics of profile structure, core configuration keys, and best practices.

2. **[Creating & Refining Profiles](profile-creation-guide.md)**  
   Step-by-step guide to creating and perfecting profiles using the `--dry-run` workflow.

### Advanced Topics
3. **[Advanced Profiles](profile-advanced.md)**  
   Master complex glob patterns, brace expansion, character classes, and advanced filtering techniques.

4. **[Profile Examples](profile-examples.md)**  
   Ready-to-use profile templates for common frameworks and use cases.

5. **[Built-in Profiles](builtin-profiles.md)**  
   Reference list of all profiles that ship with Copytree.

6. **[.ctreeignore Files](ctreeignore.md)**  
   Learn how to use `.ctreeignore` files for project-specific exclusions.

### Reference
7. **[Profile Commands](../cli/profile-commands.md)**  
   CLI commands for listing, validating, and creating profiles.

## Quick Start

```bash
# List available profiles
copytree profile:list

# Create a new profile interactively
copytree profile:create .

# Validate a profile
copytree profile:validate myprofile

# Test a profile with dry-run
copytree copy . --profile myprofile --dry-run
```

## Key Concepts

- **Profiles are YAML files** that define include/exclude patterns, transformations, and external sources
- **Gitignore-style patterns** make file selection intuitive and familiar
- **Profile inheritance** allows extending and customizing existing profiles
- **Transformations** can convert files (e.g., images to text descriptions) during processing
- **External sources** let you merge files from other repositories or directories

## Next Steps

- Start with the [Profile Overview](profile-overview.md) to understand the basics
- Use [Creating & Refining Profiles](profile-creation-guide.md) to build your first custom profile
- Explore [Profile Examples](profile-examples.md) for inspiration