# Profiles Documentation

Profiles are at the heart of CopyTree's intelligent file selection system. They define which files to include, how to process them, and what transformations to apply.

## 📚 Profile Documentation Sections

### [Profile Overview](./profile-overview.md)
Introduction to the profile system, how it works, and key concepts.

### [Profile Creation Guide](./profile-creation-guide.md)
Step-by-step guide to creating custom profiles for specific project needs.

### [Profile Examples](./profile-examples.md)
Real-world examples of profile configurations for various scenarios.

### [Advanced Profile Features](./profile-advanced.md)
Deep dive into advanced features like inheritance, external sources, and complex rules.

### [.copytreeignore Guide](./copytreeignore.md)
Documentation on using .copytreeignore files for project-specific exclusions.

### [Force Include Guide](./force-include.md)
Documentation on forcing specific files to be included regardless of other filters.

### [Transformer Reference](./transformer-reference.md)
Complete reference for all available file transformers and their options.

## 🚀 Quick Start

### Using Profiles

```bash
# Use default profile (automatic)
copytree

# Explicitly specify default profile
copytree --profile default

# Use custom profile
copytree --profile mycustom

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
1. Built-in profiles (includes default profile)
2. Project profiles (`.copytree/` in your project)
3. User profiles (`~/.copytree/profiles/`)

### Profile Selection

1. **Default profile**: Uses default profile when no `--profile` option specified
2. **No framework detection**: No longer auto-detects Laravel, React, etc.
3. **Custom profiles**: Use `--profile` option to specify custom profiles

## 💡 Common Use Cases

### Profile Usage Examples

```bash
# Use default profile (works for all project types)
copytree

# Create custom profiles for specific needs
copytree --profile my-react
copytree --profile api-docs
copytree --profile minimal
```

### Task-Specific Profiles

```bash
# Documentation only (custom)
copytree --profile docs-only

# API endpoints (custom) 
copytree --profile api-endpoints

# Minimal code review (custom)
copytree --profile minimal-review
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