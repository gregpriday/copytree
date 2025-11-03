# Creating Your First Custom Profile

Learn how to create custom profiles to tailor CopyTree's file selection for your specific needs.

## Why Create a Custom Profile?

The default profile works great for general use, but you might want a custom profile to:

- **Focus on specific features or modules** (e.g., only authentication code)
- **Apply transformers** (extract text from PDFs, run OCR on images)
- **Include external sources** (GitHub repos, other directories)
- **Override default exclusions** (include lock files, test files, etc.)
- **Share team configurations** (commit profiles to version control)

## Profile Basics

A profile is a YAML file that tells CopyTree:
- Which files to **include**
- Which files to **exclude**
- Which **transformers** to apply
- Where to find **external sources**

## Your First Profile

Let's create a profile that focuses on your project's documentation.

### Step 1: Create Profile Directory

Profiles can be stored in three locations, with this search order:

1. **Project**: `.copytree/` (committed with your code)
2. **User**: `~/.copytree/profiles/` (personal, available globally)
3. **Built-in**: `profiles/` (comes with CopyTree)

For this tutorial, we'll create a project profile:

```bash
# In your project root
mkdir -p .copytree

# Create the profile file
touch .copytree/docs-only.yml
```

### Step 2: Define Basic Structure

Edit `.copytree/docs-only.yml`:

```yaml
name: docs-only
description: Include only documentation files
version: 1.0.0

# Include patterns (glob syntax)
include:
  - "**/*.md"           # All Markdown files
  - "docs/**/*"         # Everything in docs directory
  - "README*"           # README files
  - "CHANGELOG*"        # Changelog files

# Exclude patterns
exclude:
  - "node_modules/**"   # Never include dependencies
  - "**/test/**"        # Skip test documentation
```

### Step 3: Test Your Profile

Validate the profile syntax:

```bash
copytree profile:validate docs-only
```

**Expected output**:
```
✓ Profile 'docs-only' is valid
  - Found 3 include rules
  - Found 2 exclude rules
  - No transformers configured
```

Preview what files will be selected:

```bash
copytree --profile docs-only --dry-run
```

This shows which files match your rules without actually copying.

### Step 4: Use Your Profile

```bash
# Copy to clipboard
copytree --profile docs-only

# Display in terminal
copytree --profile docs-only --display

# Save to file
copytree --profile docs-only --output documentation.md
```

**Success!** You've created and used your first custom profile.

## Common Profile Patterns

### Pattern 1: Source Code Only

Focus on implementation files:

```yaml
name: source-only
description: Source code without tests or config

include:
  - "src/**/*.{js,jsx,ts,tsx}"
  - "lib/**/*.{js,ts}"
  - "*.{js,ts}"

exclude:
  - "**/*.test.{js,ts}"
  - "**/*.spec.{js,ts}"
  - "**/__tests__/**"
  - "**/*.config.{js,ts}"

always:
  - "package.json"
  - "tsconfig.json"
```

### Pattern 2: API Documentation

API endpoints and schemas:

```yaml
name: api-docs
description: API routes, controllers, and schemas

include:
  - "src/routes/**/*"
  - "src/controllers/**/*"
  - "src/models/**/*"
  - "src/middleware/**/*"
  - "**/*.swagger.{yml,yaml,json}"
  - "**/*.openapi.{yml,yaml,json}"

exclude:
  - "**/*.test.*"

always:
  - "package.json"
  - "README.md"
```

### Pattern 3: Frontend Components

React/Vue components:

```yaml
name: components
description: Frontend components and styles

include:
  - "src/components/**/*"
  - "src/pages/**/*"
  - "src/styles/**/*"
  - "**/*.{jsx,tsx,vue}"
  - "**/*.{css,scss,sass}"

exclude:
  - "**/*.test.{jsx,tsx}"
  - "**/*.spec.{jsx,tsx}"
  - "**/*.stories.{jsx,tsx}"

always:
  - "package.json"
  - "tailwind.config.js"
```

## Advanced Features

### Using Transformers

Add transformers to process specific file types:

```yaml
name: with-transformers
description: Extract text from PDFs and images

include:
  - "**/*.{md,pdf,png,jpg}"
  - "docs/**/*"

transformers:
  # Extract text from PDFs
  pdf:
    enabled: true
    options:
      maxPages: 20
      includeMetadata: true

  # OCR on images
  image:
    enabled: true
    options:
      extractText: true
      language: eng

  # Strip markdown formatting
  markdown:
    enabled: true
    options:
      mode: strip
```

See [Transformer Reference](../profiles/transformer-reference.md) for all available transformers.

### Profile Inheritance

Extend existing profiles:

```yaml
name: my-docs
description: Docs profile based on default
extends: default

# Additional includes (merged with parent)
include:
  - "examples/**/*"
  - "tutorials/**/*"

# Additional excludes (merged with parent)
exclude:
  - "**/*.draft.md"
  - "docs/archive/**"
```

### External Sources

Include files from other locations:

```yaml
name: with-external
description: Include files from external sources

include:
  - "src/**/*"

external:
  # Include from GitHub
  - source: https://github.com/user/shared-docs
    destination: external/shared
    rules:
      - include: "**/*.md"

  # Include from local directory
  - source: /path/to/shared/library
    destination: external/lib
    rules:
      - include: "**/*.js"
      - exclude: "**/node_modules/**"
```

## Rule Processing Order

CopyTree processes rules in this order:

1. **Initial Discovery** - Find all files in directory
2. **Exclude Rules** - Remove excluded files
3. **Include Rules** - Keep only included files
4. **Always Rules** - Force-include specific files
5. **Transformers** - Process files as configured

**Important**: `always` rules override all exclusions.

```yaml
include:
  - "src/**/*.js"

exclude:
  - "src/legacy/**"

always:
  - "src/legacy/important.js"  # Included despite exclude rule
```

## Profile Location Strategy

Choose where to store your profiles based on usage:

**Project profiles** (`.copytree/`):
- Committed to version control
- Shared with team members
- Project-specific configurations
- Override user and built-in profiles

```bash
# Create project profile
mkdir -p .copytree
vi .copytree/myproject.yml
```

**User profiles** (`~/.copytree/profiles/`):
- Personal configurations
- Available across all projects
- Not committed to repositories

```bash
# Create user profile
mkdir -p ~/.copytree/profiles
vi ~/.copytree/profiles/personal.yml
```

**Built-in profiles** (package installation):
- Shipped with CopyTree
- Read-only (do not modify)
- Used as base for inheritance

## Best Practices

### 1. Start Specific, Expand as Needed

```yaml
# Good - specific and focused
include:
  - "src/auth/**/*.{js,ts}"
  - "src/auth/**/*.test.{js,ts}"

# Avoid - too broad, then exclude
include:
  - "**/*"
exclude:
  - "everything/you/dont/want/**"
```

### 2. Use Meaningful Names

```yaml
# Good names
name: react-components
name: api-documentation
name: test-files

# Avoid generic names
name: my-profile
name: custom
name: test
```

### 3. Document Your Profiles

Always include a description:

```yaml
name: feature-payment
description: |
  Payment feature files including:
  - Stripe integration
  - Payment components
  - Related tests and docs
version: 1.0.0
```

### 4. Test Before Using

Always validate and dry-run:

```bash
# Validate syntax
copytree profile:validate myprofile

# Preview selection
copytree --profile myprofile --dry-run

# View in terminal first
copytree --profile myprofile --display
```

### 5. Version Your Profiles

Include profiles in version control when appropriate:

```bash
# .gitignore - DO commit project profiles
# (don't add .copytree/ to .gitignore)

# Commit to share with team
git add .copytree/
git commit -m "Add CopyTree profiles for documentation and API"
```

## Common Issues

### "Profile not found"

Check search paths:

```bash
# List available profiles
copytree profile:list

# Check specific locations
ls .copytree/                    # Project profiles
ls ~/.copytree/profiles/         # User profiles
```

### "No files selected"

Rules might be too restrictive:

```bash
# Use dry-run mode to debug
copytree --profile myprofile --dry-run

# This shows:
# - Which rules matched
# - Which files were excluded
# - Final file count
```

### "Validation failed"

Check YAML syntax:

```bash
# Validate profile
copytree profile:validate myprofile

# Common issues:
# - Incorrect indentation (use spaces, not tabs)
# - Missing colons after keys
# - Quotes in wrong places
```

## Next Steps

Now that you can create custom profiles:

1. **[Transformer Reference](../profiles/transformer-reference.md)** - Learn about all available transformers (PDF, image, OCR, etc.)

2. **[Advanced Profile Features](../profiles/profile-advanced.md)** - External sources, complex rules, optimization

3. **[Profile Examples](../profiles/profile-examples.md)** - Real-world configurations for common scenarios

4. **[Configuration Reference](../reference/configuration.md)** - Project-wide and global settings

## Quick Reference

```bash
# Profile management
copytree profile:list                       # List available profiles
copytree profile:validate <name>            # Validate profile
copytree --profile <name> --dry-run         # Preview file selection

# Using profiles
copytree --profile myprofile                # Use custom profile
copytree --profile default                  # Explicit default
copytree                                    # Implicit default

# Profile locations
.copytree/                                  # Project profiles (committed)
~/.copytree/profiles/                       # User profiles (personal)
<install>/profiles/                         # Built-in profiles (read-only)
```

---

**Well done!** You now know how to create custom profiles to tailor CopyTree for any project or use case.
