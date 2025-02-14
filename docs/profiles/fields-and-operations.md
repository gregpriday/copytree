# Copytree Fields and Operations Reference

This page documents all available fields and operations that can be used in Copytree profiles to filter files and directories. These building blocks let you specify exactly which files to include, exclude, or process with transformations. All available string‐related operations are built on top of Laravel’s powerful `Str` class methods. For a complete guide on writing profiles, see the [Writing Profiles for Copytree](./profiles.md) documentation.

---

## Fields

Copytree profiles let you match against various file attributes. These fields can be used in any filtering rule.

### Path-based Fields

- **`folder`**  
  The directory path relative to the base directory.
    - **Examples:** `"src/components"`, `"tests/unit"`
    - **Usage:** Useful for filtering entire directories.

- **`path`**  
  The complete file path relative to the base directory.
    - **Examples:** `"src/components/Button.js"`, `"tests/unit/ButtonTest.php"`
    - **Usage:** Best for exact file matching or for applying complex patterns.

- **`dirname`**  
  The immediate parent directory name.
    - **Examples:** `"components"`, `"unit"`
    - **Usage:** Good for matching files in a specific parent directory regardless of depth.

- **`basename`**  
  The file name including extension.
    - **Examples:** `"Button.js"`, `"UserTest.php"`
    - **Usage:** Ideal for filtering by full filename.

- **`extension`**  
  The file extension without the dot.
    - **Examples:** `"js"`, `"php"`, `"md"`
    - **Usage:** Perfect for filtering by file type.

- **`filename`**  
  The file name without extension.
    - **Examples:** `"Button"`, `"UserTest"`
    - **Usage:** Useful when you want to match the name regardless of its extension.

### Content-based Fields

- **`contents`**  
  The complete file contents.
    - **Usage:** Enables full‑text search and pattern matching.
    - **Note:** This can be slow for very large files.
    - **Example:**
      ```json
      ["contents", "contains", "Copyright (c)"]
      ```

- **`contents_slice`**  
  The first 256 characters of the file contents.
    - **Usage:** Ideal for quick checks (e.g. header inspection or file type detection) without reading the entire file.
    - **Example:**
      ```json
      ["contents_slice", "isAscii"]
      ```

### Metadata Fields

- **`size`**  
  The file size in bytes.
    - **Usage:** Supports numeric comparisons and human‑readable formats.
    - **Examples:**
      ```json
      ["size", "<", "1 MB"]
      ["size", ">", "500 KB"]
      ["size", "<=", "2.5 GB"]
      ```
    - **Supported units:** B, KB, MB, GB, TB (also KiB, MiB, GiB, TiB for binary units).

- **`mtime`**  
  The file modification time as a Unix timestamp.
    - **Usage:** Supports numeric comparisons and human‑readable date strings.
    - **Examples:**
      ```json
      ["mtime", ">", "1 week ago"]
      ["mtime", "<", "2024-01-01"]
      ["mtime", ">=", "last month"]
      ```
    - **Note:** Uses Laravel’s Carbon library for date parsing.

- **`mimeType`**  
  The file’s MIME type as detected from its content.
    - **Examples:**
      ```json
      ["mimeType", "startsWith", "text/"]
      ["mimeType", "=", "application/json"]
      ["mimeType", "notStartsWith", "image/"]
      ```

---

## Operations

Operations are used to compare field values and build complex filtering rules. In Copytree profiles, most string operations are powered by Laravel’s `Str` class, which provides a rich set of methods for manipulating and comparing strings.

### Comparison Operations

- **Basic Comparisons:**
    - `=`: Exact equality.
    - `!=`: Inequality.
    - `>`: Greater than.
    - `>=`: Greater than or equal to.
    - `<`: Less than.
    - `<=`: Less than or equal to.

- **Array Operations:**
    - `oneOf`: The field’s value matches any element in the provided array.
      ```json
      ["extension", "oneOf", ["js", "ts", "jsx", "tsx"]]
      ```
    - `notOneOf`: The field’s value does not match any element in the provided array.
      ```json
      ["extension", "notOneOf", ["exe", "dll", "so"]]
      ```

### String Operations

- **Basic String Matching (based on Laravel `Str` methods):**
    - `startsWith`: Field starts with the specified prefix.
    - `endsWith`: Field ends with the specified suffix.
    - `contains`: Field contains the given substring.
    - `notStartsWith`: Field does not start with the specified prefix.
    - `notEndsWith`: Field does not end with the specified suffix.
    - `notContains`: Field does not contain the given substring.

- **Pattern Matching:**
    - `regex`: Field matches a regular expression.
      ```json
      ["basename", "regex", "^test.*\\.js$"]
      ```
    - `notRegex`: Field does not match the regular expression.
    - `glob`: Field matches a glob (shell‑style wildcard) pattern.
      ```json
      ["path", "glob", "src/**/*.{js,ts}"]
      ```
    - `fnmatch`: Uses shell‑style pattern matching.

- **Multiple Value Variants (using Any/All suffixes):**
    - **Suffix `Any`:**  
      When appended to an operator (e.g. `startsWithAny`, `endsWithAny`, `containsAny`), it indicates that the field should satisfy the condition for *at least one* of the values provided in an array.
      ```json
      ["folder", "startsWithAny", ["src/", "tests/", "docs/"]]
      ```
    - **Suffix `All`:**  
      When appended (e.g. `containsAll`), it indicates that the field must satisfy the condition for *all* of the values in the array.
      ```json
      ["basename", "containsAll", [".min", ".js"]]
      ```

### File Type and Content Checks

- **Content Validation:**
    - `isAscii`: Checks whether the file (or its `contents_slice`) contains only ASCII characters.
    - `isJson`: Checks if the file’s content is valid JSON.
    - `isUrl`: Validates whether a string is a URL.
    - `isUuid`: Checks for a valid UUID.
    - `isUlid`: Checks for a valid ULID.

### Compound Operations

- **AND Logic (within a single rule set):**  
  All rules in a rule set must be true for the file to be included.
  ```json
  [
    ["folder", "startsWith", "src"],
    ["extension", "oneOf", ["js", "ts"]],
    ["size", "<", "1 MB"]
  ]
  ```

- **OR Logic (across multiple rule sets):**  
  A file is included if it satisfies at least one complete rule set.
  ```json
  {
    "rules": [
      [
        ["extension", "=", "js"]
      ],
      [
        ["extension", "=", "ts"]
      ]
    ]
  }
  ```

### Operator Modifiers

- **Negation (using the `not` prefix):**  
  Any operator can be negated by prefixing it with `not` (e.g. `notStartsWith`, `notContains`, `notRegex`). This modifier inverts the result of the base operation.

- **Any/All Suffixes:**  
  Many string operations support the suffixes `Any` and `All`:
    - **`Any` Suffix:** The condition passes if **at least one** element in the provided array satisfies the operator.
    - **`All` Suffix:** The condition passes only if **all** elements in the provided array satisfy the operator.

  These modifiers allow for flexible, compound string checks using Laravel's `Str` methods.

---

## Integration with Copytree Profiles

These fields and operations are the building blocks for all filtering rules in Copytree profiles. They are used in the following sections of a profile:

- **Local File Filtering:**  
  Within the `rules` and `globalExcludeRules` sections, you define which files should be included or excluded.

- **External Source Filtering:**  
  In the `external` array, each external source can have its own set of rules to filter which files to merge into your output.

- **Transformation Triggers:**  
  In the `transforms` array, you specify rules that determine which files will be processed by content transformers.

For additional details on writing profiles and examples of complete profiles, refer to [Writing Profiles for Copytree](./profiles.md).

For a complete list of string operations supported by Laravel’s `Str` class, please see the [Laravel String documentation](https://laravel.com/docs/11.x/strings#strings-method-list).
