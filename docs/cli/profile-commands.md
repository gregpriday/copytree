# Profile Commands Reference

CopyTree provides several commands for managing and working with profiles.

## profile:list

List all available profiles.

### Usage
```bash
copytree profile:list [path]
```

### Arguments
- `path` - Optional directory path to check for profiles (defaults to current directory)

### Description
The `profile:list` command displays all available profiles from multiple sources:

1. **Built-in profiles** - Pre-configured profiles shipped with CopyTree
2. **User profiles** - Custom profiles in `~/.copytree/profiles/`
3. **Project profiles** - Profiles in the current project's `.copytree/` directory

### Example Output
```
Available Profiles:

Name            Description                              Source
────────────────────────────────────────────────────────────────────
laravel         Laravel framework projects               built-in
react           React applications                       built-in
vue             Vue.js applications                      built-in
python          Python projects                          built-in
django          Django web framework                     built-in
nodejs          Node.js applications                     built-in
api             API documentation focus                  built-in
docs            Documentation files only                 built-in
minimal         Minimal code files only                  built-in
full            All files (excluding .gitignore)        built-in
my-api          Custom API profile                       ~/.copytree/profiles
project-config  Project specific configuration           .copytree/

Total: 12 profiles available
```

### Options
- `--verbose`, `-v` - Show detailed profile information including rules

### Examples
```bash
# List all available profiles
copytree profile:list

# Check profiles for specific project
copytree profile:list /path/to/project

# Show detailed profile information
copytree profile:list --verbose
```

## profile:validate

Validate profile YAML syntax and structure.

### Usage
```bash
copytree profile:validate <profile> [path]
```

### Arguments
- `profile` - Profile name or path to YAML file
- `path` - Optional directory context (defaults to current directory)

### Options
- `--strict` - Enable strict validation with additional checks

### Description
The `profile:validate` command checks profile files for:

1. **YAML Syntax** - Ensures valid YAML format
2. **Required Fields** - Verifies name and description are present
3. **Rule Structure** - Validates include/exclude patterns
4. **Transformer Configuration** - Checks transformer names and options
5. **External Sources** - Validates external source configurations
6. **Inheritance** - Verifies parent profile references

### Example Success Output
```
✓ Profile 'my-custom-profile' is valid

Details:
- Name: my-custom-profile
- Description: Custom profile for my project
- Rules: 5 include, 3 exclude
- Transformers: 2 configured
- External sources: 1 configured
- Parent profile: laravel (valid)
```

### Example Error Output
```
✗ Profile 'broken-profile' has validation errors:

Errors:
- Line 5: Invalid YAML syntax - expected mapping
- Line 12: Unknown transformer 'invalid-transformer'
- Line 18: Invalid pattern syntax in rule '**{unclosed'
- Missing required field: description

Warnings:
- Line 8: Duplicate include pattern 'src/**/*.js'
- Line 15: Transformer 'pdf' option 'max_pages' should be a number
```

### Examples
```bash
# Validate built-in profile
copytree profile:validate laravel

# Validate custom profile file
copytree profile:validate ./my-profile.yaml

# Validate with strict mode
copytree profile:validate my-api --strict

# Validate project profile
copytree profile:validate project-config /path/to/project
```

## profile:create

Create a new profile interactively.

### Usage
```bash
copytree profile:create [options]
```

### Options
- `--name` - Profile name (prompted if not provided)
- `--output` - Output directory (defaults to `.copytree/`)

### Description
The `profile:create` command provides an interactive wizard to create custom profiles:

1. **Profile Name** - Unique identifier for the profile
2. **Description** - Brief description of the profile's purpose
3. **Base Profile** - Optional parent profile to extend
4. **Include Rules** - Patterns for files to include
5. **Exclude Rules** - Patterns for files to exclude
6. **Transformers** - File transformation configurations
7. **External Sources** - Optional external file sources

### Interactive Example
```
$ copytree profile:create

? Profile name: my-api-docs
? Description: API documentation and endpoints
? Extend from base profile? (Use arrow keys)
❯ No base profile
  laravel
  nodejs
  api
  minimal

? Add include patterns (comma-separated): routes/**/*.js, controllers/**/*.js, docs/**/*.md
? Add exclude patterns (comma-separated): **/*.test.js, **/node_modules/**, **/.git/**
? Configure transformers? (y/N) y
? Select transformers: (Press <space> to select, <a> to toggle all)
 ◯ pdf - PDF to text conversion
 ◉ markdown - Markdown processing
 ◯ csv - CSV formatting
 ◉ ai-summary - AI-powered summaries

? Add external sources? (y/N) n

✓ Profile created successfully at .copytree/my-api-docs.yaml

You can now use it with: copytree --profile my-api-docs
```

### Generated Profile Example
```yaml
name: my-api-docs
description: API documentation and endpoints

rules:
  - include: "routes/**/*.js"
  - include: "controllers/**/*.js"
  - include: "docs/**/*.md"
  - exclude: "**/*.test.js"
  - exclude: "**/node_modules/**"
  - exclude: "**/.git/**"

transformers:
  markdown:
    enabled: true
    options:
      mode: strip
  ai-summary:
    enabled: true
    options:
      max_length: 500
```

### Examples
```bash
# Create profile interactively
copytree profile:create

# Create with predefined name
copytree profile:create --name my-custom

# Create in specific directory
copytree profile:create --output ~/my-profiles/
```

## Best Practices

1. **Profile Organization**
   - Keep project-specific profiles in `.copytree/` directory
   - Store reusable profiles in `~/.copytree/profiles/`
   - Use descriptive names and clear descriptions

2. **Profile Validation**
   - Always validate profiles after editing
   - Use `--strict` mode before sharing profiles
   - Test profiles with `--dry-run` before actual use

3. **Profile Creation**
   - Start with a base profile when possible
   - Be specific with include patterns
   - Use exclude patterns to filter noise
   - Document transformer configurations

## Related Documentation

- [Profile Overview](../profiles/profile-overview.md) - Understanding the profile system
- [Profile Creation Guide](../profiles/profile-creation-guide.md) - Detailed profile creation
- [Built-in Profiles](../profiles/builtin-profiles.md) - Available pre-configured profiles
- [Profile Examples](../profiles/profile-examples.md) - Sample profile configurations