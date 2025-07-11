# Copytree YAML Profile Examples

## Table of Contents

- [Example 1: Frontend Files Profile](#example-1-frontend-files-profile)
- [Example 2: API and Backend Profile with External Documentation](#example-2-api-and-backend-profile-with-external-documentation)
- [Example 3: Profile for Transforming Markdown Files](#example-3-profile-for-transforming-markdown-files)
- [Example 4: Minimal Profile for a Node.js Express API](#example-4-minimal-profile-for-a-nodejs-express-api)

## Example 1: Frontend Files Profile

This profile includes JavaScript, CSS, and HTML files from the source directory while excluding log files and temporary folders. It also forces inclusion of critical files.

```yaml
include:
  - "src/**/*.{js,css,html}"
  - "README.md"

exclude:
  - "**/*.log"
  - "temp/**"

always:
  - "package.json"
  - "README.md"
```

[↑ Back to top](#table-of-contents) | [Profile Overview](profile-overview.md)

## Example 2: API and Backend Profile with External Documentation

This profile selects backend PHP files from the app directory, excludes vendor files and logs, forces inclusion of essential configuration files, and merges in external Markdown documentation from a remote GitHub repository.

```yaml
include:
  - "app/**/*.php"

exclude:
  - "vendor/**"
  - "**/*.log"

always:
  - "composer.json"
  - "README.md"

external:
  - source: "https://github.com/username/docs/tree/main"
    destination: "external-docs/"
    include:
      - "**/*.md"
```

[↑ Back to top](#table-of-contents) | [Profile Overview](profile-overview.md)

## Example 3: Profile for Transforming Markdown Files

This profile targets all Markdown files for transformation using a summarizer transformer.

```yaml
include:
  - "**/*.md"

exclude: []

always: []

transforms:
  - files: "**/*.md"
    type: Summarizers.FileSummary
```

[↑ Back to top](#table-of-contents) | [Profile Overview](profile-overview.md)

## Example 4: Minimal Profile for a Node.js Express API

This profile includes JavaScript and JSON files from API routes and middleware directories, excludes logs and node_modules, and forces inclusion of key configuration files.

```yaml
include:
  - "routes/**/*.js"
  - "middlewares/**/*.js"
  - "config/**/*.json"

exclude:
  - "**/*.log"
  - "node_modules/**"

always:
  - "package.json"
  - "app.js"
```

[↑ Back to top](#table-of-contents) | [Profile Overview](profile-overview.md)

## Example 5: Extending a Base Laravel Profile for Multi-tenant Projects

This example demonstrates profile inheritance for a multi-tenant Laravel SaaS application. It extends the built-in Laravel profile and adds tenant-specific customizations.

```yaml
# .ctree/laravel-multitenant.yaml
name: "Laravel Multi-tenant SaaS"
description: "Extended Laravel profile for multi-tenant architecture with separate tenant modules"

# Inherit from the built-in Laravel profile
extends: laravel

# Additional includes for multi-tenant structure
include:
  - "app/Tenant/**/*.php"              # Tenant-specific logic
  - "app/Http/Middleware/Tenant/**/*.php"  # Tenant middleware
  - "database/migrations/tenant/**/*.php"  # Tenant migrations
  - "config/tenants/**/*.php"          # Tenant configurations
  - "resources/views/tenants/**/*.blade.php"  # Tenant views

# Additional excludes for multi-tenant
exclude:
  - "storage/app/tenants/**"           # Tenant file storage
  - "public/tenants/**"                # Tenant public assets
  - "**/*-tenant-backup-*"             # Tenant backup files

# Always include critical multi-tenant files
always:
  - "config/tenancy.php"               # Main tenancy config
  - "database/migrations/landlord/"    # Landlord migrations directory
  - "app/Console/Commands/TenantCommand.php"  # Tenant CLI tools

# Tenant-specific transformations
transforms:
  - files: "app/Tenant/**/Contracts/**/*.php"
    type: Summarizers.InterfaceDoc     # Document tenant interfaces
  - files: "database/migrations/tenant/**/*.php"
    type: Summarizers.MigrationSummary  # Summarize tenant migrations
```

This inheritance example shows how to:
- Extend an existing profile with `extends: laravel`
- Add tenant-specific includes without repeating base Laravel patterns
- Apply specialized transformations to multi-tenant files
- Maintain the base profile's structure while adding domain-specific rules

[↑ Back to top](#table-of-contents) | [Profile Overview](profile-overview.md)
