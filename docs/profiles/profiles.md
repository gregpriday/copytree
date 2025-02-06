# Writing Profiles for Copytree

Profiles are the heart of Copytree’s powerful file filtering, merging, and transformation capabilities. They allow you to precisely control which files and directories are included or excluded when copying a directory tree, while also letting you pull in files from external sources and apply content transformations. In previous versions these were called “rulesets,” but profiles now offer a broader feature set.

---

## Quick Start

To get started quickly, create a simple profile in JSON format. For example, if you want to include only JavaScript and TypeScript files, create a file (for example, `.ctree/profile.json`) with the following content:

```json
{
  "rules": [
    [
      ["extension", "oneOf", ["js", "ts"]]
    ]
  ]
}
```

This profile tells Copytree to include all files with the extension `.js` or `.ts`. You can specify which profile to use via the `--profile` option when running Copytree.

**Common use cases include:**

- **Filtering by file type:**  
  `["extension", "oneOf", ["php", "js"]]`
- **Filtering by directory:**  
  `["folder", "startsWith", "src"]`
- **Excluding unwanted files:**  
  `["basename", "startsWith", "."]`

**Related documentation:**

- [Profile Examples](./examples.md)
- [Fields and Operations Reference](./fields-and-operations.md)
- [Using Multiple Profiles](./multiple-rulesets.md) (previously “Using Multiple Rulesets”)

---

## Basic Structure

A Copytree profile is defined in JSON format and typically contains the following properties:

- **rules**:  
  An array of rule sets that specify the conditions for including files.

- **globalExcludeRules**:  
  An array of rule sets that, if matched, will always exclude a file—regardless of the other rules.

- **always**:  
  An object specifying files to explicitly always include or exclude.

- **external**:  
  An array of external source definitions. These let you merge files from remote repositories or local directories into your output.

- **transforms**:  
  An array of transformation configurations. These allow you to convert or summarize file contents for display or further processing.

### Example of a Complete Profile

```json
{
  "rules": [
    [
      ["folder", "startsWith", "src"],
      ["extension", "oneOf", ["js", "ts"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "node_modules"],
    ["basename", "startsWith", "."]
  ],
  "always": {
    "include": ["README.md", "package.json"],
    "exclude": [".env", "temp.log"]
  },
  "external": [
    {
      "source": "https://github.com/username/repo/tree/main/external",
      "destination": "external/",
      "rules": [
        [
          ["extension", "oneOf", ["md", "txt"]]
        ]
      ]
    }
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ],
      "transforms": [
        "FileSummary"
      ]
    }
  ]
}
```

In this example:

- Files under the `src` folder with `.js` or `.ts` extensions are included.
- Files in directories containing `"node_modules"` or whose basenames start with a dot are globally excluded.
- Specific files (e.g. `README.md` and `package.json`) are always included, whereas `.env` and `temp.log` are always excluded.
- An external source is defined to merge files from a remote GitHub repository (mapped under the `external/` directory) and only include Markdown or text files.
- Markdown files will be processed by a transformer (e.g. a file summarization transformer named `"FileSummary"`).

---

## Filtering Rules

### The `rules` Property

- **Purpose:**  
  Define which files should be included by listing one or more rule sets.

- **Structure:**  
  Each rule set is an array of rules. For a file to be included, it must satisfy **all** rules within at least one rule set.  
  Each rule is itself an array of three items:
    1. **Field:** A file attribute (e.g., `folder`, `basename`, `extension`).
    2. **Operator:** A comparison or pattern operator (e.g., `=`, `startsWith`, `oneOf`).
    3. **Value:** The value to compare against (can be a string, number, or array).

_Example:_
```json
[
  ["folder", "startsWith", "src"],
  ["extension", "oneOf", ["js", "ts"]]
]
```

### Rule Combinations and Evaluation

- **AND Logic:**  
  All rules in a rule set must match for that set to pass.

- **OR Logic:**  
  A file is included if it matches **any** one of the rule sets in the `rules` array.

- **Global Exclude Rules:**  
  Evaluated first. If a file matches any rule in `globalExcludeRules`, it is excluded.

- **Always Include/Exclude:**  
  The `always` section forces the inclusion or exclusion of specific files regardless of other rules.

_Example:_
```json
{
  "rules": [
    [
      ["folder", "startsWith", "src"],
      ["extension", "oneOf", ["js", "ts"]]
    ],
    [
      ["folder", "startsWith", "tests"],
      ["basename", "endsWith", "Test"]
    ]
  ]
}
```
Files must either be in the `src` folder with a `.js` or `.ts` extension **or** in the `tests` folder with a basename ending in `"Test"`.

---

## External Sources

The **external** property allows you to merge files from outside your local project into your Copytree output. This is useful for including shared documentation, configuration files, or even remote repositories.

Each external source object requires:
- **source:** A GitHub URL or local directory path.
- **destination:** A prefix to add to the paths of the imported files.
- **rules (optional):** Filtering rules that apply only to the external source.

_Example:_
```json
{
  "external": [
    {
      "source": "https://github.com/username/docs/tree/main",
      "destination": "external-docs/",
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ]
    }
  ]
}
```

---

## File Transformations

The **transforms** property enables you to apply content transformations to files that match certain criteria. This might include summarizing long text files, converting formats, or adding annotations.

Each transform configuration object includes:
- **rules:** The conditions under which the transformation should be applied.
- **transforms:** An array of transformer identifiers (typically class names) that will process the file content.

_Example:_
```json
{
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ],
      "transforms": [
        "FileSummary"
      ]
    }
  ]
}
```

This configuration will run the `"FileSummary"` transformer on all Markdown files.

---

## Best Practices

### Organization

- **Keep Profiles Modular:**  
  Split complex profiles into separate files (e.g. `.ctree/frontend.json`, `.ctree/backend.json`) for clarity.
- **Descriptive File Names:**  
  Name your profile files so that they clearly reflect their purpose.
- **Accompany with Documentation:**  
  While JSON itself cannot include comments, maintain separate documentation for complex profiles.

### Performance

- **Prioritize Fast Checks:**  
  Use path-based fields (like `folder` and `extension`) before content-based rules.
- **Efficient Global Excludes:**  
  Place common, high-frequency exclusions (e.g. `node_modules`, hidden files) in `globalExcludeRules`.
- **Avoid Overly Complex Patterns:**  
  Prefer simple string operations over complex regular expressions when possible.

### Maintainability

- **Version Control Profiles:**  
  Keep your profiles in version control alongside your code.
- **Consistent Formatting:**  
  Use a consistent style for JSON formatting.
- **Document Rule Rationale:**  
  Maintain a changelog or supplementary documentation for non-obvious rule combinations.

---

## Troubleshooting

**Common Issues:**

1. **Files Not Being Included:**
    - Verify that path separators are forward slashes (`/`).
    - Check for case sensitivity conflicts.
    - Ensure there are no unintended conflicts in `globalExcludeRules`.

2. **Performance Problems:**
    - Reduce reliance on content-based rules.
    - Test individual rules for performance.
    - Use the `--display` option to inspect which files are being processed.

3. **Cross-Platform Considerations:**
    - Always use relative paths with forward slashes.
    - Explicitly handle case sensitivity.

---

## Global Exclude Rules and Always Include/Exclude

### Global Exclude Rules

The `globalExcludeRules` property specifies rules that will always cause a file to be omitted. This is ideal for excluding unwanted directories (like `node_modules`) or files (such as temporary files).

_Example:_
```json
{
  "globalExcludeRules": [
    ["folder", "startsWith", "node_modules"],
    ["basename", "startsWith", "."]
  ]
}
```

### Always Include/Exclude

The `always` property overrides other rules by explicitly specifying files to include or exclude.

_Example:_
```json
{
  "always": {
    "include": [".gitignore", "README.md"],
    "exclude": ["temp.log"]
  }
}
```

---

## Operators and Fields

Profiles support a wide range of operators and file fields. For details, refer to the [Fields and Operations Reference](./fields-and-operations.md).

### Examples of Operators

- **Comparison:** `=`, `!=`, `>`, `>=`, `<`, `<=`
- **String Operations:** `startsWith`, `endsWith`, `contains` (and their negated forms, e.g. `notStartsWith`)
- **Array Checks:** `oneOf`, `notOneOf`
- **Pattern Matching:** `regex`, `glob`, `fnmatch`
- **Metadata Checks:** `size`, `mtime`, `mimeType`

---

## Numeric and Directory Filtering

For numeric fields such as `size` or `mtime`, you may use either raw numbers or human-readable strings with units:

```json
["size", "<", "5 MB"]
```

For filtering based on directory paths, use the `folder` field:

```json
[
  ["folder", "startsWith", "src"],
  ["folder", "notStartsWith", "src/tests"]
]
```

---

## Examples

### Example 1: Frontend Files Profile

```json
{
  "rules": [
    [
      ["folder", "startsWith", "src"],
      ["extension", "oneOf", ["js", "jsx", "css", "html"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "contains", "node_modules"],
    ["basename", "startsWith", "."]
  ],
  "always": {
    "include": ["package.json", "README.md"]
  }
}
```

### Example 2: API and Backend Profile with External Documentation

```json
{
  "rules": [
    [
      ["folder", "startsWith", "app"],
      ["extension", "oneOf", ["php", "js"]]
    ]
  ],
  "globalExcludeRules": [
    ["folder", "startsWith", "vendor"],
    ["extension", "oneOf", ["log", "tmp"]]
  ],
  "always": {
    "include": ["composer.json", "README.md"]
  },
  "external": [
    {
      "source": "https://github.com/username/docs/tree/main",
      "destination": "external-docs/",
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ]
    }
  ]
}
```

### Example 3: Profile for Transforming Markdown Files

```json
{
  "rules": [
    [
      ["extension", "=", "md"]
    ]
  ],
  "transforms": [
    {
      "rules": [
        [
          ["extension", "=", "md"]
        ]
      ],
      "transforms": [
        "FileSummary"
      ]
    }
  ]
}
```

---

## Conclusion

Profiles in Copytree provide a powerful, flexible method for defining exactly which files to copy, how to process them, and how to merge in external resources. By combining filtering rules, global exclusions, explicit always‑include/exclude directives, external sources, and file transformations, profiles let you tailor Copytree’s behavior to your project’s precise needs. Experiment with different profile configurations, and refer to the related documentation for additional details on fields, operators, and best practices.
