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
10. [Custom Framework Profile](#custom-framework-profile)

## React Frontend Application

Modern React application with TypeScript and testing.

```yaml
name: react-frontend
description: React application with TypeScript, tests, and modern tooling

extends: default

rules:
  # Source code
  - include: "src/**/*.{js,jsx,ts,tsx}"
  - include: "src/**/*.css"
  - include: "src/**/*.module.css"
  
  # Public assets
  - include: "public/**/*"
  - exclude: "public/**/*.map"
  
  # Tests
  - include: "**/*.test.{js,jsx,ts,tsx}"
  - include: "**/*.spec.{js,jsx,ts,tsx}"
  - include: "__tests__/**/*"
  
  # Configuration
  - always: "package.json"
  - always: "package-lock.json"
  - always: "tsconfig.json"
  - always: "README.md"
  - always: ".env.example"
  
  # Build artifacts
  - exclude: "build/**"
  - exclude: "dist/**"
  - exclude: ".cache/**"
  
  # Dependencies
  - exclude: "node_modules/**"

options:
  respectGitignore: true
  maxFileSize: 2097152  # 2MB
  
transformers:
  # Optimize images
  image:
    enabled: true
    options:
      quality: 80
  
  # Process CSS
  css:
    enabled: true
    options:
      minify: false
```

## Node.js Backend with TypeScript

Backend API service with TypeScript and database migrations.

```yaml
name: nodejs-backend
description: Node.js backend service with TypeScript

extends: default

rules:
  # Source code
  - include: "src/**/*.{js,ts}"
  - exclude: "src/**/*.test.{js,ts}"
  - exclude: "src/**/*.spec.{js,ts}"
  
  # Database
  - include: "migrations/**/*.{js,ts}"
  - include: "seeds/**/*.{js,ts}"
  - include: "prisma/**/*.prisma"
  
  # API Documentation
  - include: "docs/api/**/*.{md,yaml,json}"
  - include: "**/swagger.{yaml,json}"
  
  # Scripts
  - include: "scripts/**/*.{js,ts,sh}"
  
  # Configuration
  - always: "package.json"
  - always: "tsconfig.json"
  - always: "ecosystem.config.js"
  - always: ".env.example"
  - always: "docker-compose.yml"
  
  # Exclude
  - exclude: "dist/**"
  - exclude: "coverage/**"
  - exclude: "logs/**"
  - exclude: ".tmp/**"

transformers:
  # Summarize large files
  ai-summary:
    enabled: true
    options:
      maxLength: 1000
      filesOver: 50000  # 50KB
```

## Documentation Website

Documentation-focused profile for technical writing projects.

```yaml
name: docs-site
description: Documentation website with MDX support

rules:
  # Documentation
  - include: "**/*.{md,mdx}"
  - include: "docs/**/*"
  - include: "content/**/*"
  
  # Examples
  - include: "examples/**/*.{js,jsx,ts,tsx}"
  - include: "snippets/**/*"
  
  # Images and assets
  - include: "**/*.{png,jpg,jpeg,svg,gif}"
  - include: "static/**/*"
  - include: "public/**/*"
  
  # Configuration
  - always: "docusaurus.config.js"
  - always: "mkdocs.yml"
  - always: "gatsby-config.js"
  - always: "_config.yml"
  - always: "package.json"
  
  # Exclude
  - exclude: ".docusaurus/**"
  - exclude: "_site/**"
  - exclude: ".cache/**"
  - exclude: "node_modules/**"

transformers:
  # Convert MDX to standard markdown
  mdx:
    enabled: true
    options:
      stripJsx: true
  
  # Optimize images
  image:
    enabled: true
    options:
      description: true
      
  # Extract code from markdown
  markdown:
    enabled: true
    options:
      extractCode: true
```

## Express REST API

Express.js API with middleware and database models.

```yaml
name: express-api
description: Express REST API with authentication and database

extends: default

rules:
  # API code
  - include: "routes/**/*.js"
  - include: "controllers/**/*.js"
  - include: "middleware/**/*.js"
  - include: "models/**/*.js"
  - include: "services/**/*.js"
  - include: "utils/**/*.js"
  
  # Database
  - include: "migrations/**/*.js"
  - include: "seeders/**/*.js"
  - include: "config/database.js"
  
  # API Documentation
  - include: "**/*.swagger.{yaml,json}"
  - include: "api-docs/**/*"
  
  # Tests
  - include: "test/**/*.js"
  - include: "**/*.test.js"
  
  # Configuration
  - always: "app.js"
  - always: "server.js"
  - always: "package.json"
  - always: ".env.example"
  - always: "nodemon.json"
  
  # Exclude
  - exclude: "uploads/**"
  - exclude: "temp/**"
  - exclude: "logs/**"

options:
  maxFileSize: 1048576  # 1MB
  
transformers:
  # Summarize route files
  route-summary:
    enabled: true
    pattern: "routes/**/*.js"
    options:
      extractEndpoints: true
```

## Component Library

React component library with Storybook and documentation.

```yaml
name: component-library
description: React component library with Storybook

extends: default

rules:
  # Components
  - include: "src/components/**/*.{jsx,tsx}"
  - include: "src/components/**/*.{css,scss}"
  - include: "src/components/**/*.stories.{js,jsx,ts,tsx}"
  - include: "src/components/**/*.test.{js,jsx,ts,tsx}"
  
  # Utilities and hooks
  - include: "src/hooks/**/*.{js,ts}"
  - include: "src/utils/**/*.{js,ts}"
  - include: "src/themes/**/*"
  
  # Documentation
  - include: "**/*.mdx"
  - include: "docs/**/*"
  - include: ".storybook/**/*"
  
  # Build output
  - include: "dist/index.d.ts"  # Type definitions
  
  # Examples
  - include: "examples/**/*"
  
  # Configuration
  - always: "package.json"
  - always: "tsconfig.json"
  - always: "rollup.config.js"
  - always: "webpack.config.js"
  - always: ".babelrc"
  
  # Exclude
  - exclude: "dist/**"
  - exclude: "storybook-static/**"
  - exclude: "coverage/**"

transformers:
  # Extract component props
  component-docs:
    enabled: true
    pattern: "**/*.tsx"
    options:
      extractProps: true
      extractExamples: true
```

## Monorepo Project

Lerna/Yarn workspaces monorepo structure.

```yaml
name: monorepo
description: Monorepo with multiple packages

extends: default

rules:
  # Package sources
  - include: "packages/*/src/**/*.{js,ts,jsx,tsx}"
  - include: "packages/*/lib/**/*.{js,ts}"
  
  # Package configs
  - include: "packages/*/package.json"
  - include: "packages/*/tsconfig.json"
  - include: "packages/*/README.md"
  
  # Shared code
  - include: "shared/**/*.{js,ts}"
  - include: "common/**/*.{js,ts}"
  
  # Apps
  - include: "apps/*/src/**/*.{js,ts,jsx,tsx}"
  - include: "apps/*/package.json"
  
  # Root configuration
  - always: "package.json"
  - always: "lerna.json"
  - always: "nx.json"
  - always: "pnpm-workspace.yaml"
  - always: "yarn.lock"
  - always: "tsconfig.base.json"
  
  # Exclude all node_modules
  - exclude: "**/node_modules/**"
  - exclude: "**/dist/**"
  - exclude: "**/build/**"
  - exclude: "**/.turbo/**"

options:
  respectGitignore: true
  followSymlinks: true  # For linked packages
  
external:
  # Include related repos
  - source: https://github.com/org/shared-types
    destination: external/types
    rules:
      - include: "src/**/*.ts"
```

## Microservices Architecture

Multiple services with Docker configuration.

```yaml
name: microservices
description: Microservices architecture with Docker

rules:
  # Service code
  - include: "services/*/src/**/*.{js,ts}"
  - include: "services/*/package.json"
  - include: "services/*/Dockerfile"
  - include: "services/*/.env.example"
  
  # API Gateway
  - include: "gateway/**/*.{js,ts}"
  - include: "gateway/nginx.conf"
  
  # Shared libraries
  - include: "libs/**/*.{js,ts}"
  
  # Infrastructure
  - include: "docker-compose*.yml"
  - include: "k8s/**/*.{yaml,yml}"
  - include: ".github/workflows/**/*.yml"
  
  # Documentation
  - include: "docs/**/*.md"
  - include: "services/*/README.md"
  - include: "services/*/api.yaml"
  
  # Scripts
  - include: "scripts/**/*.{sh,js}"
  
  # Root files
  - always: "Makefile"
  - always: ".env.example"
  - always: "README.md"
  
  # Exclude
  - exclude: "**/node_modules/**"
  - exclude: "**/logs/**"
  - exclude: "**/.cache/**"

transformers:
  # Summarize service endpoints
  service-summary:
    enabled: true
    pattern: "services/*/src/routes/**/*.js"
```

## Open Source Project

Profile for open source projects with examples and documentation.

```yaml
name: open-source
description: Open source project with comprehensive docs

extends: default

rules:
  # Source code
  - include: "src/**/*.{js,ts,jsx,tsx}"
  - include: "lib/**/*.{js,ts}"
  
  # Examples
  - include: "examples/**/*"
  - exclude: "examples/**/node_modules/**"
  - exclude: "examples/**/dist/**"
  
  # Documentation
  - include: "**/*.md"
  - include: "docs/**/*"
  - include: ".github/**/*.md"
  
  # Tests
  - include: "test/**/*"
  - include: "**/*.test.{js,ts}"
  - include: "**/*.spec.{js,ts}"
  
  # CI/CD
  - include: ".github/workflows/**/*"
  - include: ".circleci/**/*"
  - include: ".travis.yml"
  
  # Important files
  - always: "package.json"
  - always: "LICENSE"
  - always: "CONTRIBUTING.md"
  - always: "CODE_OF_CONDUCT.md"
  - always: "CHANGELOG.md"
  - always: ".npmignore"
  
  # Exclude
  - exclude: "coverage/**"
  - exclude: ".nyc_output/**"
  - exclude: "dist/**"

options:
  includeHidden: false
  respectGitignore: true
```

## Development vs Production

Different profiles for different environments.

### Development Profile

```yaml
name: dev-env
description: Development environment with tests and docs

extends: default

rules:
  # Everything for development
  - include: "src/**/*"
  - include: "test/**/*"
  - include: "docs/**/*"
  - include: "examples/**/*"
  - include: "scripts/**/*"
  
  # Config files
  - include: "*.config.js"
  - include: ".*rc*"
  - include: ".env.development"
  
  # Exclude production
  - exclude: "dist/**"
  - exclude: "build/**"
  
transformers:
  # Include all transformers
  all:
    enabled: true
```

### Production Profile

```yaml
name: prod-env
description: Production-ready files only

extends: default

rules:
  # Only source code
  - include: "src/**/*.{js,ts}"
  - exclude: "**/*.test.{js,ts}"
  - exclude: "**/*.spec.{js,ts}"
  - exclude: "**/*.stories.{js,ts}"
  
  # No examples or docs
  - exclude: "examples/**"
  - exclude: "docs/**"
  
  # Production configs only
  - always: "package.json"
  - always: "package-lock.json"
  - always: ".env.production"
  
  # Exclude dev files
  - exclude: "**/*.map"
  - exclude: ".env.development"
  - exclude: "nodemon.json"

options:
  maxFileSize: 524288  # 512KB - smaller for production
  
transformers:
  # Minimal transformers
  minimal:
    enabled: true
```

## Custom Framework Profile

Example of extending a built-in profile with custom rules.

```yaml
name: my-nextjs
description: Custom Next.js profile with our conventions

extends: react  # Start with React profile

rules:
  # Next.js specific
  - include: "pages/**/*.{js,jsx,ts,tsx}"
  - include: "app/**/*.{js,jsx,ts,tsx}"
  - include: "components/**/*.{js,jsx,ts,tsx}"
  - include: "styles/**/*.{css,scss}"
  - include: "public/**/*"
  
  # API routes
  - include: "pages/api/**/*.{js,ts}"
  - include: "app/api/**/*.{js,ts}"
  
  # Our conventions
  - include: "src/features/**/*"
  - include: "src/hooks/**/*.{js,ts}"
  - include: "src/services/**/*.{js,ts}"
  
  # Config files
  - always: "next.config.js"
  - always: "next-env.d.ts"
  - always: ".env.local.example"
  
  # Exclude Next.js build
  - exclude: ".next/**"
  - exclude: "out/**"
  
  # Our specific excludes
  - exclude: "**/*.generated.{js,ts}"
  - exclude: "**/temp/**"

# Add our external design system
external:
  - source: https://github.com/company/design-system
    destination: external/design
    rules:
      - include: "packages/react/src/**/*.{jsx,tsx}"

transformers:
  # Custom transformer config
  our-summarizer:
    enabled: true
    pattern: "src/features/**/*.{jsx,tsx}"
    options:
      style: "component-doc"
```

## Tips for Creating Profiles

### 1. Start with Inheritance

```yaml
# Don't reinvent the wheel
extends: react  # or laravel, vue, etc.

# Add your customizations
rules:
  - include: "src/custom/**"
```

### 2. Use Comments

```yaml
rules:
  # Core application code
  - include: "src/**/*.js"
  
  # Legacy code - exclude for now
  - exclude: "src/legacy/**"
  
  # But we need this one legacy file
  - always: "src/legacy/critical.js"
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

### 5. Use External Sources Wisely

```yaml
external:
  # Always mark optional for external deps
  - source: https://github.com/may/not-exist
    optional: true
    
  # Use specific branches/tags
  - source: https://github.com/stable/lib/tree/v1.2.3
```

## Next Steps

- [Profile Creation Guide](./profile-creation-guide.md) - Create your own profiles
- [Advanced Features](./profile-advanced.md) - Deep dive into advanced features
- [Transformer Reference](./transformer-reference.md) - Configure transformers