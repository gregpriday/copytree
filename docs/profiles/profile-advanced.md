# Advanced YAML Profiles for Copytree

This document focuses on advanced file selection techniques using the new simplified YAML format. These advanced techniques help you fine‑tune which files are copied, even when your project structure is complex or when multiple conditions must be considered.

## Compound and Multi‑Layered Pattern Matching

Advanced profiles often need to select files based on more than one condition. You can create multiple rule sets (using OR logic) or combine multiple glob patterns to handle complex scenarios. For example, you might want to include only files that are both in a specific subdirectory and have a certain extension:

```yaml
include:
  - "src/**/components/**/*.vue"
  - "src/**/widgets/**/*.vue"
```

Here, files are selected from two distinct sub‑directories using different glob patterns.

## Overriding Exclusions with the Always List

Even when using complex exclusion patterns, you can force the inclusion of critical files by listing them in the `always` section. This is particularly useful when essential configuration or documentation files reside in directories that are otherwise filtered out:

```yaml
always:
  - "config/global-settings.yaml"
  - "README.md"
```

## External Sources with Advanced Filters

When merging external files, you can apply specific filters that differ from your local rules. This lets you pull in documentation or additional resources from remote repositories while controlling exactly which files are imported:

```yaml
external:
  - source: "https://github.com/advanced-user/extra-docs/tree/main"
    destination: "ext-docs/"
    include:
      - "**/*.md"
```

## Advanced Transformations

Advanced profiles also support transforming file contents based on sophisticated selection criteria. You can chain multiple transformers for files that meet very specific conditions. For example, you might want to first summarize Markdown files and then further strip out links:

```yaml
transforms:
  - files: "**/*.md"
    type: Summarizers.FileSummary

  - files: "**/*.md"
    type: Markdown.MarkdownLinkStripper
```

This configuration ensures that every Markdown file is first summarized and then cleaned up for clarity.

## Combining Local and External Filtering

Advanced profiles can combine both local filtering rules and external source filters seamlessly. For example, you might include a broad set of files from your local project and then supplement these with additional files from an external repository:

```yaml
include:
  - "app/**/*.php"
  - "resources/**/*.blade.php"
  - "README.md"

exclude:
  - "**/*.log"
  - "storage/**"

always:
  - "config/app.php"
  - ".env.example"

external:
  - source: "https://github.com/user/repo/tree/master"
    destination: "ext/"
    include:
      - "**/*.md"
```

This profile demonstrates how to enforce critical file inclusion while allowing external documentation to be merged in under a separate destination.

## Best Practices for Advanced File Selection

- **Test Your Globs:**  
  Use tools or the `--display` option in Copytree to verify that your glob patterns are matching the intended files.

- **Keep It Maintainable:**  
  Document complex patterns and transformations within your YAML file comments or in separate documentation to ensure long‑term maintainability.

- **Use the Always Section Wisely:**  
  Reserve the `always` list for files that are mission‑critical. Avoid overusing it, as the goal is to let your include/exclude rules define most of the behavior. Always just makes sure that files that would be otherwise excluded are still included.

- **Leverage External Filters:**  
  If external sources contain a lot of noise, use their own include rules to narrow down the selection before merging.

## Conclusion

Advanced YAML profiles in Copytree empower you to precisely control file selection in large or complex projects. By combining compound glob patterns, dedicated always‑include lists, refined external source filters, and sequential file transformations, you can build robust profiles that meet even the most specific project needs. Use these techniques to ensure that your Copytree output is both comprehensive and tailored to your workflow.
