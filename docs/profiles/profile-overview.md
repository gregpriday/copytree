# Profile Overview

Profiles are YAML configuration files that tell CopyTree which files to include in your output. They provide a powerful and flexible way to select exactly the files you need for different purposes.

> **📘 Canonical Rules**: For authoritative profile behavior and transformer configuration rules, see [DDR-0001: Profiles and Transformers](../reference/decisions/ddr-0001-profiles-and-transformers.md).

## What are Profiles?

A profile is a reusable configuration that defines:
- Which files to include or exclude
- How to transform certain file types
- Where to find additional files (external sources)
- Special rules for always including specific files

## Basic Profile Structure

Here's a simple profile example:

```yaml
name: my-project
description: Profile for my Node.js project

rules:
  - include: "src/**/*.js"
  - include: "*.json"
  - exclude: "node_modules/**"
  - exclude: "**/*.test.js"
```

This profile:
- Includes all JavaScript files in the `src` directory
- Includes all JSON files in the root
- Excludes the entire `node_modules` directory
- Excludes all test files

## How Profiles Work

### 1. Profile Loading

CopyTree uses the default profile automatically, or you can specify a custom one:

```bash
# Use default profile (automatic)
copytree

# Explicitly specify default profile
copytree --profile default

# Use custom profile
copytree --profile mycustom
```

### 2. File Selection Process

CopyTree processes rules in order:

1. **Initial file discovery** - Find all files in the directory
2. **Apply exclude rules** - Remove files matching exclude patterns
3. **Apply include rules** - Keep only files matching include patterns
4. **Apply always rules** - Force include specific files
5. **Apply transformers** - Process files as configured

### 3. Rule Types

#### Include Rules
```yaml
rules:
  - include: "src/**/*.js"      # All JS files in src
  - include: "*.{json,yaml}"    # JSON and YAML in root
  - include: "docs/**"          # Everything in docs
```

#### Exclude Rules
```yaml
rules:
  - exclude: "node_modules/**"  # Skip dependencies
  - exclude: "**/*.log"         # Skip log files
  - exclude: ".git/**"          # Skip git directory
```

#### Always Rules
Force inclusion regardless of other rules:
```yaml
rules:
  - always: "README.md"         # Always include README
  - always: "package.json"      # Always include package.json
```

## Pattern Syntax

Profiles use glob patterns with these features:

- `*` - Match any characters (except `/`)
- `**` - Match any characters (including `/`)
- `?` - Match single character
- `{a,b}` - Match either a or b
- `[abc]` - Match any character in set
- `[!abc]` - Match any character not in set

### Common Patterns

```yaml
# Match file extensions
"*.js"                  # All .js files in root
"**/*.js"              # All .js files anywhere
"src/**/*.{js,ts}"     # JS and TS files in src

# Match directories
"src/**"               # Everything in src
"**/components/**"     # All components directories

# Match specific names
"**/index.js"          # All index.js files
"**/*Controller.js"    # Files ending with Controller.js

# Negation patterns
"!**/*.test.js"        # Exclude test files
"!**/node_modules/**"  # Exclude node_modules
```

## Advanced Features

### 1. Transformers

Apply transformations to specific file types:

```yaml
rules:
  - include: "**/*.pdf"
    transform: pdf-to-text    # Convert PDFs to text
  
  - include: "**/*.png"
    transform: ocr            # Extract text from images
  
  - include: "src/**/*.js"
    transform: summarize      # AI summarization
    transform_options:
      max_length: 500
```

### 2. External Sources

Include files from other locations:

```yaml
external:
  - source: https://github.com/user/docs
    destination: external/docs
    rules:
      - include: "*.md"
      - exclude: "drafts/**"
```

### 3. Profile Inheritance

Extend existing profiles (like default or your own custom profiles):

```yaml
extends: default  # Inherit from default profile

include:
  - "src/custom/**"

exclude:
  - "src/legacy/**"
```

## Default Profile

CopyTree includes a default profile that works for most projects. Framework auto-detection has been removed - all projects use the default profile unless you specify a custom one.

## Common Use Cases

### 1. Development Profile
Focus on source code:

```yaml
name: development
description: Active development files

include:
  - "src/**/*.{js,jsx,ts,tsx}"
  - "*.{json,yaml}"

exclude:
  - "**/*.test.js"
  - "**/*.spec.js"

always:
  - "package.json"
  - "README.md"
```

### 2. Documentation Profile
Only documentation files:

```yaml
name: docs
description: Documentation files only

include:
  - "**/*.md"
  - "docs/**"

exclude:
  - "node_modules/**"
```

### 3. API Profile
API-related files:

```yaml
name: api
description: API endpoints and schemas

include:
  - "**/routes/**"
  - "**/controllers/**"
  - "**/models/**"
  - "**/middleware/**"
  - "**/*.swagger.yaml"

exclude:
  - "**/*.test.js"
```

## Profile Locations

CopyTree searches for profiles in:

1. **Built-in profiles**: Shipped with CopyTree
   - Default profile works for all project types
   - Located in the package installation

2. **Project profiles**: `.copytree/` directory
   - Custom profiles for your project
   - Version controlled with your code

3. **User profiles**: `~/.copytree/profiles/`
   - Personal profiles available globally
   - Reusable across projects

## Best Practices

### 1. Start Specific
Begin with restrictive rules and expand as needed:

```yaml
# Good - specific and focused
rules:
  - include: "src/**/*.js"
  - include: "src/**/*.jsx"

# Avoid - too broad
rules:
  - include: "**/*"
```

### 2. Use Meaningful Names
Name profiles based on their purpose:

```yaml
# Good names
name: react-components
name: api-documentation
name: test-files

# Avoid generic names
name: my-profile
name: custom
```

### 3. Document Your Profiles
Always include descriptions:

```yaml
name: feature-auth
description: Authentication feature files including components, API, and tests
```

### 4. Leverage Inheritance
Build on existing profiles:

```yaml
extends: default

include:
  # Only add what's different from parent
  - "src/features/auth/**"
```

### 5. Test Your Profiles
Use dry-run to verify:

```bash
copytree --profile my-profile --dry-run --verbose
```

## Debugging Profiles

### View Active Rules
```bash
# See what profile is being used
copytree --debug

# Validate profile syntax
copytree profile:validate my-profile
```

### Common Issues

1. **No files selected**: Rules might be too restrictive
2. **Too many files**: Add more specific exclude rules
3. **Missing files**: Check rule order and patterns
4. **Syntax errors**: Validate YAML formatting

## Next Steps

- [Profile Creation Guide](./profile-creation-guide.md) - Create custom profiles
- [Advanced Features](./profile-advanced.md) - External sources and more
- [Examples](./profile-examples.md) - Real-world configurations