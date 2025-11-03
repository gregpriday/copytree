# Profile Examples

This guide provides real-world examples of CopyTree profiles for various project types and use cases.

## Table of Contents

1. [React Frontend Application](#react-frontend-application)
2. [Node.js Backend with TypeScript](#nodejs-backend-with-typescript)
3. [Documentation Website](#documentation-website)
4. [Express REST API](#express-rest-api)
5. [Component Library](#component-library)
6. [Monorepo Project](#monorepo-project)
7. [Microservices Architecture](#microservices-architecture)
8. [Open Source Project](#open-source-project)
9. [Development vs Production](#development-vs-production)
10. [Custom Project Profile](#custom-project-profile)

## React Frontend Application

Modern React application with TypeScript and testing.

```yaml
name: react-frontend
description: React application with TypeScript, tests, and modern tooling

extends: default

# Source code
include:
  - "src/**/*.{js,jsx,ts,tsx}"
  - "src/**/*.css"
  - "src/**/*.module.css"
  - "public/**/*"
  - "**/*.test.{js,jsx,ts,tsx}"
  - "**/*.spec.{js,jsx,ts,tsx}"
  - "__tests__/**/*"

# Build artifacts and dependencies
exclude:
  - "public/**/*.map"
  - "build/**"
  - "dist/**"
  - ".cache/**"
  - "node_modules/**"

# Configuration files
always:
  - "package.json"
  - "package-lock.json"
  - "tsconfig.json"
  - "README.md"
  - "config.example.js"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  # Extract text from images
  image:
    enabled: true
    options:
      enableOCR: true
      language: eng
      includeMetadata: true

  # Process markdown files
  markdown:
    enabled: true
    options:
      mode: strip
```

## Node.js Backend with TypeScript

Backend API service with TypeScript and database migrations.

```yaml
name: nodejs-backend
description: Node.js backend service with TypeScript

extends: default

include:
  - "src/**/*.{js,ts}"
  - "migrations/**/*.{js,ts}"
  - "seeds/**/*.{js,ts}"
  - "prisma/**/*.prisma"
  - "docs/api/**/*.{md,yaml,json}"
  - "**/swagger.{yaml,json}"
  - "scripts/**/*.{js,ts,sh}"

exclude:
  - "src/**/*.test.{js,ts}"
  - "src/**/*.spec.{js,ts}"
  - "dist/**"
  - "coverage/**"
  - "logs/**"
  - ".tmp/**"

always:
  - "package.json"
  - "tsconfig.json"
  - "ecosystem.config.js"
  - "config.example.js"
  - "docker-compose.yml"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
```

## Documentation Website

Documentation-focused profile for technical writing projects.

```yaml
name: docs-site
description: Documentation website with markdown and images

include:
  - "**/*.{md,mdx}"
  - "docs/**/*"
  - "content/**/*"
  - "examples/**/*.{js,jsx,ts,tsx}"
  - "snippets/**/*"
  - "**/*.{png,jpg,jpeg,svg,gif}"
  - "static/**/*"
  - "public/**/*"

exclude:
  - ".docusaurus/**"
  - "_site/**"
  - ".cache/**"
  - "node_modules/**"

always:
  - "docusaurus.config.js"
  - "mkdocs.yml"
  - "gatsby-config.js"
  - "_config.yml"
  - "package.json"

options:
  respectGitignore: true
  maxFileSize: 5242880  # 5MB for images

transformers:
  # Extract text from images
  image:
    enabled: true
    options:
      enableOCR: true
      language: eng
      includeMetadata: true

  # Process markdown files
  markdown:
    enabled: true
    options:
      mode: strip

  # Extract text from PDFs
  pdf:
    enabled: true
    options:
      maxPages: 100
```

## Express REST API

Express.js API with middleware and database models.

```yaml
name: express-api
description: Express REST API with authentication and database

extends: default

include:
  - "routes/**/*.js"
  - "controllers/**/*.js"
  - "middleware/**/*.js"
  - "models/**/*.js"
  - "services/**/*.js"
  - "utils/**/*.js"
  - "migrations/**/*.js"
  - "seeders/**/*.js"
  - "config/database.js"
  - "**/*.swagger.{yaml,json}"
  - "api-docs/**/*"
  - "test/**/*.js"
  - "**/*.test.js"

exclude:
  - "uploads/**"
  - "temp/**"
  - "logs/**"

always:
  - "app.js"
  - "server.js"
  - "package.json"
  - "config.example.js"
  - "nodemon.json"

options:
  respectGitignore: true
  maxFileSize: 1048576  # 1MB

transformers:
  file-loader:
    enabled: true
  csv:
    enabled: true
    options:
      maxRows: 20
```

## Component Library

React component library with Storybook and documentation.

```yaml
name: component-library
description: React component library with Storybook

extends: default

include:
  - "src/components/**/*.{jsx,tsx}"
  - "src/components/**/*.{css,scss}"
  - "src/components/**/*.stories.{js,jsx,ts,tsx}"
  - "src/components/**/*.test.{js,jsx,ts,tsx}"
  - "src/hooks/**/*.{js,ts}"
  - "src/utils/**/*.{js,ts}"
  - "src/themes/**/*"
  - "**/*.mdx"
  - "docs/**/*"
  - ".storybook/**/*"
  - "dist/index.d.ts"  # Type definitions
  - "examples/**/*"

exclude:
  - "dist/**"
  - "storybook-static/**"
  - "coverage/**"

always:
  - "package.json"
  - "tsconfig.json"
  - "rollup.config.js"
  - "webpack.config.js"
  - ".babelrc"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
```

## Monorepo Project

Lerna/Yarn workspaces monorepo structure.

```yaml
name: monorepo
description: Monorepo with multiple packages

extends: default

include:
  - "packages/*/src/**/*.{js,ts,jsx,tsx}"
  - "packages/*/lib/**/*.{js,ts}"
  - "packages/*/package.json"
  - "packages/*/tsconfig.json"
  - "packages/*/README.md"
  - "shared/**/*.{js,ts}"
  - "common/**/*.{js,ts}"
  - "apps/*/src/**/*.{js,ts,jsx,tsx}"
  - "apps/*/package.json"

exclude:
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/build/**"
  - "**/.turbo/**"

always:
  - "package.json"
  - "lerna.json"
  - "nx.json"
  - "pnpm-workspace.yaml"
  - "yarn.lock"
  - "tsconfig.base.json"

options:
  respectGitignore: true
  followSymlinks: true  # For linked packages
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
```

## Microservices Architecture

Multiple services with Docker configuration.

```yaml
name: microservices
description: Microservices architecture with Docker

include:
  - "services/*/src/**/*.{js,ts}"
  - "services/*/package.json"
  - "services/*/Dockerfile"
  - "services/*/config.example.js"
  - "gateway/**/*.{js,ts}"
  - "gateway/nginx.conf"
  - "libs/**/*.{js,ts}"
  - "docker-compose*.yml"
  - "k8s/**/*.{yaml,yml}"
  - ".github/workflows/**/*.yml"
  - "docs/**/*.md"
  - "services/*/README.md"
  - "services/*/api.yaml"
  - "scripts/**/*.{sh,js}"

exclude:
  - "**/node_modules/**"
  - "**/logs/**"
  - "**/.cache/**"

always:
  - "Makefile"
  - "config.example.js"
  - "README.md"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
```

## Open Source Project

Profile for open source projects with examples and documentation.

```yaml
name: open-source
description: Open source project with comprehensive docs

extends: default

include:
  - "src/**/*.{js,ts,jsx,tsx}"
  - "lib/**/*.{js,ts}"
  - "examples/**/*"
  - "**/*.md"
  - "docs/**/*"
  - ".github/**/*.md"
  - "test/**/*"
  - "**/*.test.{js,ts}"
  - "**/*.spec.{js,ts}"
  - ".github/workflows/**/*"
  - ".circleci/**/*"
  - ".travis.yml"

exclude:
  - "examples/**/node_modules/**"
  - "examples/**/dist/**"
  - "coverage/**"
  - ".nyc_output/**"
  - "dist/**"

always:
  - "package.json"
  - "LICENSE"
  - "CONTRIBUTING.md"
  - "CODE_OF_CONDUCT.md"
  - "CHANGELOG.md"
  - ".npmignore"

options:
  includeHidden: false
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
```

## Development vs Production

Different profiles for different environments.

### Development Profile

```yaml
name: dev-env
description: Development environment with tests and docs

extends: default

include:
  - "src/**/*"
  - "test/**/*"
  - "docs/**/*"
  - "examples/**/*"
  - "scripts/**/*"
  - "*.config.js"
  - ".*rc*"
  - ".env.development"

exclude:
  - "dist/**"
  - "build/**"

options:
  respectGitignore: true
  maxFileSize: 10485760  # 10MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
  csv:
    enabled: true
    options:
      maxRows: 20
  pdf:
    enabled: true
    options:
      maxPages: 50
  image:
    enabled: true
    options:
      enableOCR: true
      language: eng
```

### Production Profile

```yaml
name: prod-env
description: Production-ready files only

extends: default

include:
  - "src/**/*.{js,ts}"

exclude:
  - "**/*.test.{js,ts}"
  - "**/*.spec.{js,ts}"
  - "**/*.stories.{js,ts}"
  - "examples/**"
  - "docs/**"
  - "**/*.map"
  - ".env.development"
  - "nodemon.json"

always:
  - "package.json"
  - "package-lock.json"
  - ".env.production"

options:
  respectGitignore: true
  maxFileSize: 524288  # 512KB - smaller for production

transformers:
  file-loader:
    enabled: true
  binary:
    enabled: true
```

## Custom Project Profile

Example of extending the default profile with custom rules.

```yaml
name: my-project
description: Custom project profile with our conventions

extends: default  # Start with default profile

include:
  - "pages/**/*.{js,jsx,ts,tsx}"
  - "app/**/*.{js,jsx,ts,tsx}"
  - "components/**/*.{js,jsx,ts,tsx}"
  - "styles/**/*.{css,scss}"
  - "public/**/*"
  - "pages/api/**/*.{js,ts}"
  - "app/api/**/*.{js,ts}"
  - "src/features/**/*"
  - "src/hooks/**/*.{js,ts}"
  - "src/services/**/*.{js,ts}"

exclude:
  - ".next/**"
  - "out/**"
  - "**/*.generated.{js,ts}"
  - "**/temp/**"

always:
  - "next.config.js"
  - "next-env.d.ts"
  - ".env.local.example"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB

transformers:
  file-loader:
    enabled: true
  markdown:
    enabled: true
    options:
      mode: strip
  image:
    enabled: true
    options:
      enableOCR: true
      language: eng
```

## Tips for Creating Profiles

### 1. Start with Inheritance

```yaml
# Start with the default profile
extends: default

# Add your customizations
include:
  - "src/custom/**"
```

### 2. Use Comments

```yaml
# Core application code
include:
  - "src/**/*.js"

# Legacy code - exclude for now
exclude:
  - "src/legacy/**"

# But we need this one legacy file
always:
  - "src/legacy/critical.js"
```

### 3. Test Incrementally

```bash
# Start simple
copytree --profile my-profile --dry-run

# Add verbosity
copytree --profile my-profile --dry-run --verbose

# Check specific patterns
copytree --filter "src/**/*.js" --dry-run
```

### 4. Consider File Sizes

```yaml
options:
  # Development: more generous
  maxFileSize: 10485760  # 10MB
  
  # Production: more restrictive
  maxFileSize: 1048576   # 1MB
```

### 5. Document Your Choices

```yaml
# Document why you made specific choices
name: my-project
description: Explain what this profile is for

# Be explicit about what's included
include:
  - "src/**/*"  # All source code
  - "docs/**/*"  # Documentation

# Be specific with exclusions
exclude:
  - "**/*.generated.*"  # Auto-generated files change frequently
  - "temp/**"  # Temporary working directory
```

## Next Steps

- [Profile Creation Guide](./profile-creation-guide.md) - Create your own profiles
- [Advanced Features](./profile-advanced.md) - Deep dive into advanced features
- [Transformer Reference](./transformer-reference.md) - Configure transformers