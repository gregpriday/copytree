# Profile Commands Reference

CopyTree provides several commands for managing and working with profiles.

## profile:list

List all available profiles.

### Usage
```bash
copytree profile:list
```

### Description
The `profile:list` command displays all available profiles from multiple sources:

1. **Default profile** - The built-in default profile
2. **User profiles** - Custom profiles in `~/.copytree/profiles/`
3. **Project profiles** - Profiles in the current project's `.copytree/` directory

### Example Output
```
Available Profiles:

Name            Description                              Source
────────────────────────────────────────────────────────────────────
default         Default CopyTree profile                 built-in
my-api          Custom API profile                       ~/.copytree/profiles
project-config  Project specific configuration           .copytree/

Total: 3 profiles available
```

### Options
- `--json` - Output as JSON format

### Examples
```bash
# List all available profiles
copytree profile:list

# Output as JSON
copytree profile:list --json
```

## profile:validate

Validate profile YAML syntax and structure.

### Usage
```bash
copytree profile:validate [profile]
```

### Arguments
- `profile` - Optional profile name or path to YAML file (validates current profile if omitted)

### Options
- `--all` - Validate all available profiles

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
# Validate default profile
copytree profile:validate

# Validate custom profile
copytree profile:validate myprofile

# Validate custom profile file
copytree profile:validate ./my-profile.yaml

# Validate all profiles
copytree profile:validate --all
```

## Best Practices

1. **Profile Organization**
   - Keep project-specific profiles in `.copytree/` directory
   - Store reusable profiles in `~/.copytree/profiles/`
   - Use descriptive names and clear descriptions

2. **Profile Validation**
   - Always validate profiles after editing
   - Use `--all` to check all profiles at once
   - Test profiles with `--dry-run` before actual use


## Related Documentation

- [Profile Overview](../profiles/profile-overview.md) - Understanding the profile system
- [Profile Creation Guide](../profiles/profile-creation-guide.md) - Detailed profile creation
- [Profile Examples](../profiles/profile-examples.md) - Sample profile configurations