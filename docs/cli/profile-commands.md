# Profile Commands Reference

Copytree provides several commands for managing and validating profiles. These commands help you discover available profiles, validate profile syntax, and create new profiles interactively.

## profile:list

Lists all available profiles, both built-in and project-specific.

### Usage

```bash
copytree profile:list [<path>]
```

### Arguments

- `path` (optional): The directory to search for profiles. Defaults to the current directory.

### Description

This command searches for profiles in the following locations:
1. Built-in profiles in the Copytree installation
2. Project-specific profiles in `.ctree/` directory
3. Custom profiles directory (if configured)

### Example Output

```
Available profiles:
┌─────────────┬──────────────────────────────┬──────────┐
│ Name        │ Description                  │ Source   │
├─────────────┼──────────────────────────────┼──────────┤
│ default     │ Default profile for general  │ Built-in │
│             │ projects                     │          │
│ laravel     │ Laravel framework projects   │ Built-in │
│ sveltekit   │ SvelteKit applications       │ Built-in │
│ api-backend │ Custom API backend profile   │ Project  │
└─────────────┴──────────────────────────────┴──────────┘
```

### Use Cases

- **Discovery**: Find what profiles are available for your project
- **CI/CD**: List profiles as part of build pipeline documentation
- **Team onboarding**: Help new developers understand available configurations

## profile:validate

Validates the syntax and structure of a profile YAML file.

### Usage

```bash
copytree profile:validate <profile> [<path>]
```

### Arguments

- `profile`: The name of the profile to validate (without .yaml extension)
- `path` (optional): The directory containing the profile. Defaults to the current directory.

### Options

- `--strict`: Enable strict validation (check for unused patterns, performance warnings)

### Description

This command performs the following validations:
1. YAML syntax checking
2. Required fields validation
3. Pattern syntax validation
4. Transformer availability
5. External source accessibility (with `--strict`)
6. Profile inheritance chain validation

### Example Output

**Valid profile:**
```
✓ Profile 'laravel' is valid
  - Include patterns: 8
  - Exclude patterns: 12
  - Always files: 3
  - Transformations: 2
  - External sources: 0
```

**Invalid profile:**
```
✗ Profile 'custom' has errors:
  - Invalid YAML syntax at line 15
  - Unknown transformer: 'Invalid.Transformer'
  - Circular inheritance detected: custom -> base -> custom
```

### Use Cases

- **Pre-commit validation**: Ensure profile changes are valid before committing
- **CI/CD integration**: Validate profiles as part of automated testing
- **Debugging**: Identify issues in complex profile configurations

## profile:create

Interactively creates a new profile using AI assistance.

### Usage

```bash
copytree profile:create <path> [--char-limit=<limit>]
```

### Arguments

- `path`: The directory to analyze for creating the profile

### Options

- `--char-limit`: Maximum character limit for the generated profile (default: 150000)

### Description

This command uses AI to analyze your project structure and create an optimized profile. The process includes:

1. Analyzing directory structure and file types
2. Detecting framework or project type
3. Generating appropriate include/exclude patterns
4. Suggesting transformations for specific file types
5. Writing the profile to `.ctree/generated.yaml`

### Interactive Prompts

```
Analyzing project structure...
Detected: Laravel application

? What is the main purpose of this profile?
> Documentation generation
  Code review preparation
  AI assistant context
  Custom

? Include test files? (Y/n)

? Apply transformations to images? (y/N)

Profile created successfully at .ctree/generated.yaml
```

### Example Generated Profile

```yaml
name: "Laravel API Documentation"
description: "Profile for documenting Laravel API endpoints and models"

include:
  - "app/**/*.php"
  - "routes/**/*.php"
  - "config/**/*.php"
  - "database/migrations/**/*.php"

exclude:
  - "vendor/**"
  - "storage/**"
  - "**/*.log"
  - "node_modules/**"

always:
  - "composer.json"
  - "README.md"
  - ".env.example"

transforms:
  - files: "**/*.php"
    type: Summarizers.PhpDocBlock
```

### Use Cases

- **Quick start**: Generate initial profile for new projects
- **Framework detection**: Automatically configure for Laravel, SvelteKit, etc.
- **Learning tool**: See recommended patterns for your project type

## Best Practices

1. **Validate before use**: Always run `profile:validate` on custom profiles
2. **Start with built-in**: Use `profile:list` to find existing profiles before creating new ones
3. **Version control**: Commit validated profiles to your repository
4. **CI integration**: Add profile validation to your continuous integration pipeline
5. **Document custom profiles**: Add `name` and `description` fields to custom profiles
6. **Test from scratch**: Use `copytree copy . --dry-run --no-profile` to see all available files before creating a new profile

## See Also

- [Profiles Overview](../profiles/profile-overview.md)
- [Creating & Refining Profiles](../profiles/profile-creation-guide.md)
- [Profile Examples](../profiles/profile-examples.md)