# Quickstart Guide

Get started with CopyTree in under 10 minutes. This guide takes you from installation to your first successful copy operation.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20.0+** ([Download here](https://nodejs.org/))
- **npm 10.0+** (comes with Node.js)
- **Git** (for Git integration features)

Verify your setup:

```bash
node --version  # Should show v20.0.0 or higher
npm --version   # Should show 10.0.0 or higher
```

> **Important**: CopyTree requires Node.js 20+ and uses ES Modules (ESM) only.

## Step 1: Install CopyTree

Install CopyTree globally to use it from any directory:

```bash
npm install -g copytree
```

Verify the installation:

```bash
copytree --version
```

You should see the version number displayed (e.g., `0.13.1`).

## Step 2: Your First Copy

Navigate to any project directory and run:

```bash
# Copy your project structure to clipboard
copytree
```

**What just happened?**

1. CopyTree scanned your directory
2. Applied the default profile (excludes `node_modules`, `.git`, build artifacts, etc.)
3. Generated XML output with file structure and contents
4. Copied the result to your clipboard

**Now you can paste the output into:**
- ChatGPT, Claude, or any AI assistant
- Documentation tools
- Code review platforms

## Step 3: View the Output

To see what was generated instead of copying to clipboard:

```bash
# Display output in terminal
copytree --display
```

**Expected output format** (XML):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project>
  <metadata>
    <name>your-project</name>
    <total_files>42</total_files>
  </metadata>

  <files>
    <file path="package.json">
      <content><![CDATA[{
  "name": "your-project",
  ...
}]]></content>
    </file>

    <file path="src/index.js">
      <content><![CDATA[// Your code here]]></content>
    </file>
  </files>
</project>
```

## Step 4: Try Different Output Formats

CopyTree supports multiple output formats:

```bash
# JSON format
copytree --format json --display

# Markdown format
copytree --format markdown --display

# Tree view only (no file contents)
copytree --format tree --display
```

## Step 5: Save to a File

Instead of clipboard, save the output to a file:

```bash
# Save as XML
copytree --output project.xml

# Save as JSON
copytree --format json --output project.json

# Save as Markdown
copytree --format markdown --output project.md
```

## Step 6: Copy Only Recent Changes

If you're working in a Git repository, you can copy only modified or changed files:

```bash
# Only files modified in working directory
copytree --modified

# Files changed since last commit
copytree --changed HEAD~1

# Files changed compared to main branch
copytree --changed main
```

This is perfect for code reviews or sharing specific changes with AI assistants.

## Common Scenarios

### Scenario 1: Share Code with AI

```bash
# Copy entire project
copytree

# Paste into ChatGPT/Claude
# Ask: "Review this code and suggest improvements"
```

### Scenario 2: Code Review

```bash
# Copy only changed files since last release
copytree --changed v1.0.0

# Paste into review tool or share with team
```

### Scenario 3: Documentation Generation

```bash
# Generate markdown documentation
copytree --format markdown --output docs/project-structure.md
```

### Scenario 4: Focus on Specific Files

```bash
# Only JavaScript files
copytree --filter "**/*.js" --filter "**/*.jsx"

# Only docs
copytree --filter "docs/**/*.md"
```

## Understanding the Default Profile

When you run `copytree` without options, it uses the built-in default profile which:

**Includes**:
- All source code files
- Configuration files
- Documentation (README, docs, etc.)
- Package manifests

**Excludes**:
- Dependencies (`node_modules`, `vendor`, etc.)
- Build outputs (`dist`, `build`, `.next`, etc.)
- Version control (`.git`, `.svn`)
- IDE files (`.vscode`, `.idea`)
- Cache and temp files
- Lock files

This provides a clean, AI-friendly copy of your project without noise.

## Next Steps

Now that you've completed your first copy operation:

1. **[Create a Custom Profile](./first-profile.md)** - Learn to customize file selection for your specific needs

2. **[Explore Transformers](../profiles/transformer-reference.md)** - Extract text from PDFs, images, and more

3. **[Advanced Usage](../usage/basic-usage.md)** - Master powerful features like external sources and streaming

4. **[Configure CopyTree](../reference/configuration.md)** - Set up project-wide or global configurations

## Quick Reference

```bash
# Basic copy
copytree                                    # Copy to clipboard
copytree --display                          # Show in terminal
copytree --output file.xml                  # Save to file

# Output formats
copytree --format xml                       # Default
copytree --format json                      # JSON format
copytree --format markdown                  # Markdown format
copytree --format tree                      # Tree only, no contents

# File selection
copytree --modified                         # Git modified files
copytree --changed main                     # Changed vs branch
copytree --filter "*.js"                    # Specific patterns

# Custom profiles
copytree --profile myprofile                # Use custom profile
copytree profile:list                       # Show available profiles
copytree profile:validate myprofile         # Validate profile

# Configuration
copytree config:validate                    # Check configuration
copytree config:inspect                     # View active config
copytree cache:clear                        # Clear caches
```

## Troubleshooting

**"copytree: command not found"**

The global npm bin directory may not be in your PATH. Fix:

```bash
# Add to ~/.bashrc or ~/.zshrc
export PATH="$(npm bin -g):$PATH"
```

**"No files selected"**

The default profile might be too restrictive for your project. Try:

```bash
# See what would be selected
copytree --dry-run

# Or create a custom profile (see the Profile Creation Guide)
# https://github.com/gregpriday/copytree/blob/main/docs/profiles/first-profile.md
```

**Output too large**

Limit the output size:

```bash
# Limit to first N files
copytree --head 100

# Use character limit per file
copytree --char-limit 1000

# Use streaming for large projects
copytree --stream --output large-project.xml
```

For more help, see the [Troubleshooting Guide](../usage/troubleshooting.md).

## Get Help

- **CLI Help**: `copytree --help`
- **Command Help**: `copytree profile:list --help`
- **Documentation**: Browse the `docs/` folder for detailed guides
- **Issues**: Report problems at [GitHub Issues](https://github.com/gregpriday/copytree/issues)

---

**Congratulations!** You've completed the CopyTree quickstart. You're now ready to streamline your workflow with intelligent code copying.
