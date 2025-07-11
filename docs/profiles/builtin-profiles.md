# Built-in Profiles

Copytree ships with several pre-configured profiles for common project types. These profiles are carefully crafted to include relevant files while excluding build artifacts and dependencies.

## Available Built-in Profiles

### default

**Description**: General-purpose profile that excludes common build directories and dependencies.

**Key Features**:
- Excludes all major dependency directories (vendor, node_modules)
- Excludes build output directories (build, dist, out, target, bin)
- Excludes cache and temporary directories
- No specific include patterns (includes all non-excluded files)

**Best For**: 
- Projects that don't match other specific profiles
- Quick exploration of unfamiliar codebases
- General-purpose file copying

**Example Usage**:
```bash
copytree copy . --profile default
```

### laravel

**Description**: Optimized for Laravel PHP framework projects.

**Key Features**:
- Includes all PHP files in app/ directory
- Includes Blade templates
- Includes database migrations and factories
- Includes routes and tests
- Includes documentation (*.md files)
- Includes configuration files (*.js, *.json)

**Best For**:
- Laravel applications
- Laravel packages
- PHP projects with similar structure

**Example Usage**:
```bash
copytree copy . --profile laravel
```

### sveltekit

**Description**: Tailored for SvelteKit applications.

**Key Features**:
- Includes all source files (*.js, *.ts, *.svelte, *.css, *.html, *.json)
- Includes static assets
- Includes tests
- Includes documentation
- Excludes node_modules and build directories

**Best For**:
- SvelteKit applications
- Svelte component libraries
- Modern JavaScript/TypeScript projects

**Example Usage**:
```bash
copytree copy . --profile sveltekit
```

## Using Built-in Profiles

### Basic Usage

Built-in profiles can be used directly with the `--profile` flag:

```bash
copytree copy /path/to/project --profile laravel
```

### Extending Built-in Profiles

You can create custom profiles that extend built-in ones:

```yaml
# .ctree/my-laravel-api.yaml
extends: laravel

include:
  - "app/Http/Resources/**/*.php"
  - "app/JsonApi/**/*.php"

exclude:
  - "resources/views/**"
  - "public/css/**"
  - "public/js/**"
```

### Overriding Profile Selection

Copytree attempts to auto-detect the appropriate profile based on your project structure. To override this:

```bash
# Force a specific profile
copytree copy . --profile default

# Disable auto-detection
copytree copy . --no-profile
```

## Profile Auto-Detection

Copytree automatically selects profiles based on these indicators:

| Profile | Detection Criteria |
|---------|-------------------|
| laravel | Presence of `artisan` file and `composer.json` with laravel/framework dependency |
| sveltekit | Presence of `svelte.config.js` or `package.json` with @sveltejs/kit dependency |
| default | Used when no specific framework is detected |

## Creating Custom Profiles

While built-in profiles cover common use cases, you may need custom profiles for:

- Monorepo setups
- Microservice architectures
- Domain-specific projects
- Company-specific standards

See [Creating & Refining Profiles](profile-creation-guide.md) for a detailed guide.

## Best Practices

1. **Start with built-in**: Use built-in profiles as a starting point
2. **Extend rather than duplicate**: Use the `extends` key to build on existing profiles
3. **Test with dry-run**: Always test profile changes with `--dry-run` first
4. **Document customizations**: Add `name` and `description` to custom profiles

## See Also

- [Profile Overview](profile-overview.md)
- [Profile Examples](profile-examples.md)
- [Creating & Refining Profiles](profile-creation-guide.md)