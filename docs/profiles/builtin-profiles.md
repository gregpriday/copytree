# Built-in Profiles

CopyTree includes several pre-configured profiles for common frameworks and use cases. These profiles are carefully crafted to include relevant files while excluding unnecessary ones.

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

### laravel

Optimized for Laravel PHP framework projects.

**Key Features:**
- Extends default profile
- Includes PHP files, Blade templates, migrations, routes
- Includes configuration and resource files
- Excludes Laravel-specific build and cache directories

**Includes:**
- `app/**/*.php` - Application code
- `resources/**/*.blade.php` - View templates
- `routes/**/*.php` - Route definitions
- `database/**/*.php` - Migrations and seeders
- `config/**/*.php` - Configuration files
- Essential files: `composer.json`, `artisan`, `.env.example`

**Use When:**
- Working with Laravel applications
- Sharing Laravel code for review
- Documenting Laravel projects

```bash
copytree --profile laravel
```

### sveltekit

Tailored for SvelteKit JavaScript framework projects.

**Key Features:**
- Extends default profile
- Includes Svelte components, routes, and static assets
- Includes test files and documentation
- Excludes SvelteKit build artifacts

**Includes:**
- `src/**/*` - Source files
- `static/**/*` - Static assets
- `tests/**/*` - Test files
- Configuration files: `svelte.config.js`, `vite.config.js`, `tsconfig.json`

**Excludes:**
- `.svelte-kit/` - Build cache
- `build/` - Build output
- Deployment directories

**Use When:**
- Developing SvelteKit applications
- Sharing Svelte components
- Analyzing SvelteKit project structure

```bash
copytree --profile sveltekit
```

## Framework Auto-Detection

CopyTree can automatically detect your project type and select the appropriate profile:

```bash
# Auto-detect profile
copytree

# Override auto-detection
copytree --profile laravel
```

### Detection Priority

1. **Laravel**: Presence of `artisan` file and `composer.json`
2. **SvelteKit**: Presence of `svelte.config.js`
3. **React**: `react` in package.json dependencies
4. **Vue**: `vue` in package.json dependencies
5. **Default**: Fallback for unrecognized projects

## Profile Comparison

| Profile | Best For | File Limit | Size Limit | Key Focus |
|---------|----------|------------|------------|-----------|
| default | General projects | 10,000 | 100MB | Comprehensive |
| laravel | Laravel apps | 5,000 | 50MB | PHP & Blade files |
| sveltekit | SvelteKit apps | 5,000 | 50MB | Svelte components |

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

### For Web Applications
- **Laravel**: PHP/Laravel projects
- **SvelteKit**: Svelte-based apps
- **Default**: Other frameworks (React, Vue, Angular)

### For Libraries
- **Default**: Most library projects
- Create custom profile for specific needs

### For Documentation
- Consider creating a custom docs-focused profile
- Default profile includes markdown files

## Customizing Built-in Profiles

You can't modify built-in profiles directly, but you can:

1. **Extend them**: Create a new profile that inherits
2. **Override settings**: Change options in your custom profile
3. **Add rules**: Include additional patterns

Example:
```yaml
# .copytree/custom.yaml
extends: laravel

options:
  maxFileSize: 10485760  # Increase to 10MB

rules:
  - include: "packages/**/*.php"  # Add packages directory
```

## Profile Testing

### Development Workflow

```bash
# 1. Test what files are selected
copytree --profile laravel --dry-run

# 2. Check file count
copytree --profile laravel --dry-run | grep "Total files:"

# 3. Verify specific files
copytree --profile laravel --dry-run | grep "routes/web.php"
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

**Wrong profile selected?**
- Override auto-detection with `--profile`
- Check detection criteria
- Create project-specific profile

## Next Steps

- [Create Custom Profiles](./profile-creation-guide.md) - Build your own profiles
- [Profile Examples](./profile-examples.md) - See more configurations
- [Advanced Features](./profile-advanced.md) - External sources and inheritance