# Copytree YAML Profile Examples

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
