# Built-in Profiles

CopyTree includes a default profile with sensible defaults for most projects. Custom profiles can be created for specific use cases.

## Available Built-in Profiles

### default

The general-purpose profile with sensible defaults for most projects.

**Key Features:**
- Includes all files by default
- Excludes common build artifacts, dependencies, and system files
- Respects `.gitignore` files
- Enables basic transformers

**Use When:**
- Starting with a new project type
- Need comprehensive file coverage
- Working with unknown project structures

**Settings:**
- Max file size: 10MB
- Max total size: 100MB
- Max file count: 10,000

```bash
copytree --profile default
```


## No Auto-Detection

CopyTree always uses the default profile. Framework-specific exclusions should be handled via `.gitignore` and `.copytreeignore` files.

```bash
# Always uses default profile
copytree

# Explicitly specify default
copytree --profile default
```

## Profile Details

| Profile | Best For | File Limit | Size Limit | Key Focus |
|---------|----------|------------|------------|-----------|
| default | All projects | 10,000 | 100MB | Comprehensive with .gitignore support |

## Common Patterns

### Exclusions in All Profiles

All built-in profiles exclude:
- Version control: `.git/`, `.svn/`
- Dependencies: `node_modules/`, `vendor/`
- Build outputs: `dist/`, `build/`, `out/`
- IDE files: `.idea/`, `.vscode/`
- OS files: `.DS_Store`, `Thumbs.db`
- Logs: `*.log`, `logs/`
- Environment files: `.env` (but include `.env.example`)

### Transformers

Built-in profiles enable these transformers:
- **file-loader**: Basic file reading
- **markdown**: Strip markdown formatting
- **csv**: Limit to first 10 rows
- **binary**: Placeholder for binary files

## Using Built-in Profiles

### View Profile Details

```bash
# List all profiles
copytree profile:list

# Validate a profile
copytree profile:validate laravel
```

### Test Profile Output

```bash
# Dry run to see what files would be included
copytree --profile laravel --dry-run

# See file count and size
copytree --profile laravel --verbose
```

### Extend Built-in Profiles

Create custom profiles that build on built-in ones:

```yaml
# .copytree/my-laravel.yaml
extends: laravel

rules:
  # Add custom rules
  - include: "custom/**/*.php"
  - exclude: "legacy/**"
```

## Profile Options

### File Limits

Built-in profiles set reasonable limits:

```yaml
options:
  maxFileSize: 5242880    # 5MB per file
  maxTotalSize: 52428800  # 50MB total
  maxFileCount: 5000      # Max 5000 files
```

### Processing Options

```yaml
options:
  respectGitignore: true  # Honor .gitignore
  includeHidden: false    # Skip hidden files
  followSymlinks: false   # Don't follow symlinks
```

## Choosing the Right Profile

### For All Projects
- **Default**: Works well for all project types
- Create custom profiles for specific needs
- Use `.copytreeignore` for project-specific exclusions

## Customizing Built-in Profiles

You can't modify built-in profiles directly, but you can:

1. **Extend them**: Create a new profile that inherits
2. **Override settings**: Change options in your custom profile
3. **Add rules**: Include additional patterns

Example:
```yaml
# .copytree/custom.yaml
extends: default

options:
  maxFileSize: 10485760  # Increase to 10MB

rules:
  - include: "src/**/*.js"  # Add specific includes
```

## Profile Testing

### Development Workflow

```bash
# 1. Test what files are selected
copytree --profile default --dry-run

# 2. Check file count
copytree --profile default --dry-run | grep "Total files:"

# 3. Verify specific files
copytree --profile default --dry-run | grep "package.json"
```

### Troubleshooting

**Too many files?**
- Profile might be too broad
- Check exclude patterns
- Consider creating custom profile

**Missing files?**
- Check include patterns
- Verify file extensions match
- Test with `--no-profile` to confirm

**Need framework-specific exclusions?**
- Use `.copytreeignore` file
- Follow `.gitignore` syntax
- Create project-specific profile

## Next Steps

- [Create Custom Profiles](./profile-creation-guide.md) - Build your own profiles
- [Profile Examples](./profile-examples.md) - See more configurations
- [Advanced Features](./profile-advanced.md) - External sources and inheritance