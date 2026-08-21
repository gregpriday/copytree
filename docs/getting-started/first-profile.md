# Creating Your First Custom Profile

Learn how to create custom profiles to tailor CopyTree's file selection for your specific needs.

## Why Create a Custom Profile?

The default profile works great for general use, but you might want a custom profile to:

- **Focus on specific features or modules** (e.g., only authentication code)
- **Set budgets and output format** (a size cap, Markdown instead of XML)
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
  - '**/*.md' # All Markdown files
  - 'docs/**/*' # Everything in docs directory
  - 'README*' # README files
  - 'CHANGELOG*' # Changelog files

# Exclude patterns
exclude:
  - 'node_modules/**' # Never include dependencies
  - '**/test/**' # Skip test documentation
```

### Step 3: Test Your Profile

Preview what files will be selected:

```bash
copytree plan . --profile docs-only
```

This shows which files match your rules without actually copying.

### Step 4: Use Your Profile

```bash
# Copy to clipboard
copytree --profile docs-only

# Display in terminal
copytree --profile docs-only --stdout

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
  - 'src/**/*.{js,jsx,ts,tsx}'
  - 'lib/**/*.{js,ts}'
  - '*.{js,ts}'

exclude:
  - '**/*.test.{js,ts}'
  - '**/*.spec.{js,ts}'
  - '**/__tests__/**'
  - '**/*.config.{js,ts}'

always:
  - 'package.json'
  - 'tsconfig.json'
```

### Pattern 2: API Documentation

API endpoints and schemas:

```yaml
name: api-docs
description: API routes, controllers, and schemas

include:
  - 'src/routes/**/*'
  - 'src/controllers/**/*'
  - 'src/models/**/*'
  - 'src/middleware/**/*'
  - '**/*.swagger.{yml,yaml,json}'
  - '**/*.openapi.{yml,yaml,json}'

exclude:
  - '**/*.test.*'

always:
  - 'package.json'
  - 'README.md'
```

### Pattern 3: Frontend Components

React/Vue components:

```yaml
name: components
description: Frontend components and styles

include:
  - 'src/components/**/*'
  - 'src/pages/**/*'
  - 'src/styles/**/*'
  - '**/*.{jsx,tsx,vue}'
  - '**/*.{css,scss,sass}'

exclude:
  - '**/*.test.{jsx,tsx}'
  - '**/*.spec.{jsx,tsx}'
  - '**/*.stories.{jsx,tsx}'

always:
  - 'package.json'
  - 'tailwind.config.js'
```

## Advanced Features

### Transformers

There are none. CopyTree ships no transformer, so a profile's `transformers:`
block does nothing unless an embedder has registered one through
`copytree/experimental`.

Reading file content, classifying binaries and applying the binary policy all
happen in the pipeline itself. This section used to list `file-loader`, `binary`
and `streaming-file-loader` as built-ins; the first two duplicated work the
pipeline had already done, and the third buffered whole files despite its name.

To control how binaries are handled, use `--binary` or the `binaryPolicy`
configuration key — see [the CLI reference](../cli/copytree-reference.md).

### Sharing Settings Between Blocks

YAML anchors and merge keys work, so a setting can be written once and reused:

```yaml
name: my-docs

x-shared: &shared
  respectGitignore: true
  format: markdown

options:
  <<: *shared
  charLimit: 200000
```

Two things to know:

- **`x-` keys are yours.** Any top-level key beginning with `x-` is accepted and
  then ignored, which gives an anchor somewhere to live. Every other top-level
  key has a meaning, so defining an anchor on one would also be setting it.
- **The merging block wins.** `<<` supplies defaults; a key written alongside it
  overrides the anchor.

Scalars follow YAML 1.2 rules: `yes`, `no`, `on` and `off` are strings, not
booleans, and `012` is twelve. Write `true` and `false` when you mean booleans.

The same `x-` convention works in `config.yaml` — see
[the configuration reference](../reference/configuration.md).

> There is no `extends:` key, and no `external:` block. Earlier drafts of this
> guide described both; neither was ever implemented, and a profile using either
> is rejected with `Unknown profile key`. Anchors are how a profile shares
> settings, and `--scope` or a second run is how you reach files elsewhere.

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
  - 'src/**/*.js'

exclude:
  - 'src/legacy/**'

always:
  - 'src/legacy/important.js' # Included despite exclude rule
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
  - 'src/auth/**/*.{js,ts}'
  - 'src/auth/**/*.test.{js,ts}'

# Avoid - too broad, then exclude
include:
  - '**/*'
exclude:
  - 'everything/you/dont/want/**'
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

Always preview before copying:

```bash
# Preview selection
copytree plan . --profile myprofile

# View in terminal first
copytree --profile myprofile --stdout
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
# Check specific locations
ls .copytree/                    # Project profiles
ls ~/.copytree/profiles/         # User profiles
```

### "No files selected"

Rules might be too restrictive:

```bash
# Use dry-run mode to debug
copytree plan . --profile myprofile

# This shows:
# - Which rules matched
# - Which files were excluded
# - Final file count
```

### "Validation failed"

Check YAML syntax:

```bash
# Common issues:
# - Incorrect indentation (use spaces, not tabs)
# - Missing colons after keys
# - Quotes in wrong places
```

## Next Steps

Now that you can create custom profiles:

1. **[Configuration Reference](../reference/configuration.md)** - Project-wide and global settings

2. **[Basic Usage](../usage/basic-usage.md)** - Common workflows and patterns

3. **[CLI Reference](../cli/copytree-reference.md)** - All command-line options

## Quick Reference

```bash
# Profile usage
copytree plan . --profile <name>         # Preview file selection

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
