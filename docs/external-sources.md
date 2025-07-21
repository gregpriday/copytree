# External Sources Documentation

CopyTree supports including files from external sources like GitHub repositories and local directories. This feature allows you to combine code from multiple sources into a single output.

## Configuration

External sources are configured in profiles using the `external` key:

```yaml
external:
  - source: https://github.com/owner/repo
    destination: external/repo-name
    rules:
      - "**/*.js"
      - "!node_modules/**"
    optional: false
```

## Source Types

### GitHub Repositories

Include files from any public GitHub repository:

```yaml
external:
  - source: https://github.com/sindresorhus/is-plain-obj
    destination: libs/is-plain-obj
```

You can specify:
- Full repository: `https://github.com/owner/repo`
- Specific branch: `https://github.com/owner/repo/tree/main`
- Subdirectory: `https://github.com/owner/repo/tree/main/src`

### Local Directories

Include files from other directories on your system:

```yaml
external:
  - source: /path/to/other/project
    destination: external/other-project
    rules:
      - "src/**/*.js"
```

## Options

### `source` (required)
The URL or path to the external source.

### `destination` (optional)
Prefix path for included files. If not specified, files are included at the root level.

### `rules` (optional)
Array of glob patterns to filter which files to include from the external source.

### `optional` (optional)
If `true`, errors loading this source won't fail the entire operation.

## Examples

### Multiple External Sources

```yaml
name: Multi-Source Project
external:
  # Include a utility library
  - source: https://github.com/lodash/lodash
    destination: vendor/lodash
    rules:
      - "*.js"
      - "!test/**"
  
  # Include shared components
  - source: ../shared-components
    destination: components/shared
    rules:
      - "**/*.vue"
      - "**/*.js"
  
  # Include optional documentation
  - source: https://github.com/myorg/docs
    destination: docs/external
    optional: true
```

### Framework Integration

```yaml
name: Laravel with Packages
external:
  # Include a Laravel package
  - source: https://github.com/spatie/laravel-permission
    destination: packages/permission
    rules:
      - "src/**/*.php"
      - "config/*.php"
      - "README.md"
```

## Caching

GitHub repositories are cached locally at `~/.copytree/repos/` to improve performance:
- First run clones the repository
- Subsequent runs update with `git pull`
- Cache is keyed by repository URL and branch
- Clear cache with `copytree cache:clear`

## Command Line Usage

You can test external sources with:

```bash
# Use a profile with external sources
copytree copy . --profile my-external-profile

# Preview what will be included
copytree copy . --profile my-external-profile --dry-run

# Limit output for testing
copytree copy . --profile my-external-profile --head 20
```

## Best Practices

1. **Use specific rules** to avoid including unnecessary files
2. **Set destination paths** to organize external files clearly
3. **Mark optional sources** to prevent failures from missing repositories
4. **Test with --dry-run** before processing large external sources
5. **Clear cache periodically** to ensure fresh external content

## Troubleshooting

### "Repository already exists" Error
If you see this error, the cache may be corrupted. Clear it with:
```bash
rm -rf ~/.copytree/repos/
```

### Authentication Issues
Private repositories require authentication. Set up GitHub credentials:
```bash
git config --global credential.helper store
```

### Large Repositories
For large repositories, consider:
- Using specific subdirectory paths
- Applying strict filtering rules
- Increasing timeout limits in configuration

## Security Considerations

- Only include trusted external sources
- Review external code before processing
- Use specific commit hashes for reproducible builds
- Be cautious with private repository credentials