# Profiles Documentation

Profiles are at the heart of CopyTree's intelligent file selection system. They define which files to include, how to process them, and what transformations to apply.

## 📚 Profile Documentation Sections

### [Profile Overview](./profile-overview.md)
Introduction to the profile system, how it works, and key concepts.

### [Built-in Profiles](./builtin-profiles.md)
Complete list of pre-configured profiles for popular frameworks and use cases.

### [Profile Creation Guide](./profile-creation-guide.md)
Step-by-step guide to creating custom profiles for your projects.

### [Profile Examples](./profile-examples.md)
Real-world examples of profile configurations for various scenarios.

### [Advanced Profile Features](./profile-advanced.md)
Deep dive into advanced features like inheritance, external sources, and complex rules.

### [.ctreeignore Guide](./ctreeignore.md)
Documentation on using .ctreeignore files for project-specific exclusions.

### [Transformer Reference](./transformer-reference.md)
Complete reference for all available file transformers and their options.

## 🚀 Quick Start

### Using a Built-in Profile

```bash
# Auto-detect profile based on project
copytree

# Use specific profile
copytree --profile react
copytree --profile laravel

# List all available profiles
copytree profile:list
```

### Creating a Custom Profile

```bash
# Create profile manually
cat > .copytree/my-profile.yaml << EOF
name: my-profile
description: Custom profile for my project

rules:
  - include: "src/**/*.js"
  - exclude: "**/*.test.js"
EOF

# Use custom profile
copytree --profile my-profile
```

## 🔑 Key Concepts

### Profile Structure

Profiles are YAML files with:
- **Metadata**: Name and description
- **Rules**: Include/exclude patterns
- **Transformers**: File processing options
- **External Sources**: Additional file sources
- **Inheritance**: Extend other profiles

### Profile Locations

CopyTree looks for profiles in:
1. Built-in profiles (shipped with CopyTree)
2. Project profiles (`.copytree/` in your project)
3. User profiles (`~/.copytree/profiles/`)

### Profile Selection

1. **Auto-detection**: CopyTree examines your project structure
2. **Explicit selection**: Use `--profile` option
3. **Fallback**: Uses 'default' profile if no match

## 💡 Common Use Cases

### Framework-Specific Development

```bash
# React development
copytree --profile react

# Laravel API
copytree --profile laravel

# Django project
copytree --profile django
```

### Task-Specific Profiles

```bash
# Documentation only
copytree --profile docs

# API endpoints
copytree --profile api

# Minimal code review
copytree --profile minimal
```

### Custom Workflows

```yaml
# .copytree/feature-x.yaml
name: feature-x
description: Files for Feature X

rules:
  - include: "src/features/x/**/*"
  - include: "tests/features/x/**/*"
  - exclude: "**/*.log"
```

## 🛠️ Profile Management

### Validate Profiles

```bash
# Validate specific profile
copytree profile:validate my-profile

# Strict validation
copytree profile:validate my-profile --strict
```

### List Available Profiles

```bash
# List all profiles
copytree profile:list

# List with details
copytree profile:list --verbose
```

### Create New Profiles

```bash
# Create from template
cp ~/.copytree/profiles/template.yaml .copytree/new-profile.yaml
```

## 📖 Learn More

Start with the [Profile Overview](./profile-overview.md) for a comprehensive introduction, then explore specific topics based on your needs.

For quick reference, check the [Built-in Profiles](./builtin-profiles.md) list or jump straight to [Creating Custom Profiles](./profile-creation-guide.md).