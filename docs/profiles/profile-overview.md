# Profiles in Copytree: Overview & Best Practices

Profiles in Copytree allow you to precisely control which files are copied and how they are processed. The new YAML format is simple and intuitive, mirroring familiar gitignore-style patterns. It supports standard glob syntax—including wildcards, recursive matching with double asterisks, and brace expansion (e.g. `{foo,bar}`)—just like standard gitignore files.

## Profile Structure

A profile in Copytree is defined in a YAML file (e.g. `.ctree.yaml`) with the following top-level keys:

- **include**  
  A list of glob patterns that specify which files should be included.  
  Example:
  ```yaml
  include:
    - "app/**/*.php"
    - "resources/**/*.blade.php"
    - "README.md"
  ```

- **exclude**  
  A list of glob patterns for files and directories to be excluded. These follow standard gitignore rules.  
  Example:
  ```yaml
  exclude:
    - "**/*.log"
    - "storage/**"
  ```

- **always**  
  A list of specific filenames (relative paths) that must always be included—even if they fall under an excluded directory. This key overrides the include/exclude logic.  
  Example:
  ```yaml
  always:
    - "config/app.php"
    - ".env.example"
  ```

- **transforms**  
  Defines file transformations. Each entry specifies a glob pattern under `files` and a transformer identifier under `type`. Transformer identifiers use dot‑notation to reference the corresponding transformer class.  
  Example:
  ```yaml
  transforms:
    - files: "**/*.md"
      type: Summarizers.FileSummary
  ```

- **external**  
  Allows merging files from external sources. Each external entry defines a `source` (a GitHub URL or local directory), a `destination` prefix to remap file paths, and an optional `include` list for filtering external files.  
  Example:
  ```yaml
  external:
    - source: "https://github.com/user/repo/tree/master"
      destination: "ext/"
      include:
        - "**/*.md"
  ```

## Optional Keys

In addition to the core configuration keys, profiles support these optional metadata and inheritance features:

- **name**  
  A human-readable name for the profile (metadata only).  
  Example:
  ```yaml
  name: "Laravel API Project"
  ```

- **description**  
  A longer description explaining the profile's purpose (metadata only).  
  Example:
  ```yaml
  description: "Profile for Laravel projects focusing on API endpoints and models"
  ```

- **extends**  
  Inherit configuration from another profile. The child profile's rules will be merged with the parent, with child rules taking precedence.  
  Example:
  ```yaml
  extends: "base.yaml"
  include:
    - "app/Http/Resources/**/*.php"  # Added to parent's includes
  ```

## Order of Execution

When processing files, Copytree applies the filtering rules in the following order:

1. **Exclude Patterns**:  
   Files matching any pattern in the **exclude** list are rejected immediately.

2. **Include Patterns**:  
   If one or more **include** patterns are specified, a file must match at least one of these patterns to be accepted. If no include patterns are provided, files not excluded are accepted by default.

3. **Always-Include**:  
   Finally, any file listed under **always** is forcibly included, overriding any previous exclusions. This ensures that critical files are always part of the output regardless of other filtering rules.

This filtering mechanism is based on standard gitignore behavior, ensuring intuitive and familiar file selection using gitignore-style syntax.

For detailed information on advanced glob patterns, complex transformations, and external source configuration, see [Advanced Profiles](profile-advanced.md).

## Best Practices

- **Keep It Simple:**  
  Use straightforward glob patterns and avoid overly complex rules.

- **Explicit Always-Include:**  
  Use the **always** key to ensure critical files are never omitted.

- **Organize Your Patterns:**  
  Group related patterns logically to mirror your project's structure.

- **Separate Test Profiles:**  
  Keep test profiles in the `tests/Fixtures/profiles/` directory and project-type profiles in the main `profiles/` directory. This separation helps maintain a clear distinction between production and test configurations.

- **Test Your Profile:**  
  Run Copytree with the `--display` option to verify that your profile selects the intended files.

- **Version Control:**  
  Keep your profile YAML files under version control for better tracking and collaboration.

## Summary

The new YAML profile format in Copytree streamlines configuration by using simple keys: **include**, **exclude**, **always**, **transforms**, and **external**. This approach lets you easily specify file selection and processing rules while maintaining clarity and simplicity in your configuration.
