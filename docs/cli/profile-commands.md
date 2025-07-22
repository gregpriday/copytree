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

## Best Practices

1. **Profile Organization**
   - Keep project-specific profiles in `.copytree/` directory
   - Store reusable profiles in `~/.copytree/profiles/`
   - Use descriptive names and clear descriptions

2. **Profile Validation**
   - Always validate profiles after editing
   - Use `--strict` mode before sharing profiles
   - Test profiles with `--dry-run` before actual use


## Related Documentation

- [Profile Overview](../profiles/profile-overview.md) - Understanding the profile system
- [Profile Creation Guide](../profiles/profile-creation-guide.md) - Detailed profile creation
- [Built-in Profiles](../profiles/builtin-profiles.md) - Available pre-configured profiles
- [Profile Examples](../profiles/profile-examples.md) - Sample profile configurations