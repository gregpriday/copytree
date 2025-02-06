# Best Practices for Copytree Profiles

This guide outlines best practices for creating, maintaining, and organizing Copytree profiles. By following these recommendations, you can create profiles that are efficient, secure, and easy to maintain.

---

## Organization

### Directory Structure

It is recommended that you organize your profiles in a dedicated directory. For example, your project might have the following structure:

```
.ctree/
├── profiles/
│   ├── frontend.json
│   ├── backend.json
│   └── docs.json
├── workspaces.json
└── profile.json
```

- **Keep related profiles together:** Store profiles in the `.ctree/profiles/` directory.
- **Default profile:** Use `profile.json` as your default profile.
- **Modularity:** Split complex profiles into smaller, focused files. For example, you might have one profile for frontend files and another for backend files.
- **Descriptive filenames:** Name your profile files so that their purpose is immediately obvious (e.g. `frontend.json`, `api.json`).

### Profile Structure and New Features

A Copytree profile is defined in JSON and supports the following keys:
- **rules:** An array of rule sets that determine which files to include.
- **globalExcludeRules:** An array of rule sets that always exclude files.
- **always:** An object to explicitly include or exclude files by name.
- **external:** An array of external source definitions to merge files from remote or local sources.
- **transforms:** An array of transformation configurations to process file contents.

Group your filtering rules, external source settings, and transformations in a logical, well-documented manner.

---

## Performance

### Rule Ordering

1. **Prioritize fast checks first:**
    - Use path-based rules (e.g. `folder`, `extension`, `basename`) before content-based rules.
    - Use simple string operations (e.g. `startsWith`, `endsWith`) and array checks (e.g. `oneOf`) before resorting to regular expressions or content scanning.

   ```json
   {
     "rules": [
       [
         ["folder", "startsWith", "src"],  // Fast path check
         ["extension", "oneOf", ["js", "ts"]],  // Fast array check
         ["contents", "contains", "Copyright"]
       ]
     ]
   }
   ```

2. **Optimize Global Excludes:**
    - Place common exclusions (like `node_modules` or build folders) in `globalExcludeRules` to filter out unwanted files as early as possible.
    - Use operators that allow multiple values in a single rule (for example, `startsWithAny`) rather than several separate rules.

   ```json
   {
     "globalExcludeRules": [
       ["folder", "startsWithAny", ["temp", "tmp", ".git"]],
       ["extension", "oneOf", ["log", "tmp", "bak"]]
     ]
   }
   ```

### External Sources and Transforms

- **External sources:** If merging files from external sources, ensure that the external rules are as optimized as your local ones. Avoid unnecessary file processing on remote repositories.
- **Transforms:** Apply transformations only when necessary. For instance, if you need to summarize Markdown or convert Jupyter notebooks, scope the rules so that only the intended file types are processed.

---

## Security

### Sensitive File Exclusions

1. **Always exclude sensitive files:**  
   Place sensitive file patterns in `globalExcludeRules` so that files like `.env`, private keys, or secret configuration files are never processed.

   ```json
   {
     "globalExcludeRules": [
       ["basename", "oneOf", [".env", "secrets.json", "credentials.yml", "id_rsa", "private.key"]],
       ["extension", "oneOf", ["pem", "key", "pfx", "p12"]],
       ["folder", "contains", "secrets"]
     ]
   }
   ```

2. **Use pattern matching for variations:**  
   Regular expressions can be used to catch variations in sensitive filenames.

   ```json
   {
     "globalExcludeRules": [
       ["basename", "regex", "\\.(env|key|secret)(\\..*)?$"],
       ["basename", "regex", "^(dev|prod|staging)\\-secrets\\."]
     ]
   }
   ```

---

## Maintainability

### Documentation

- **Document each profile:**  
  Even though JSON cannot contain comments, maintain a separate documentation file (or inline documentation in your version control commit messages) explaining the rationale behind complex rule combinations.
- **Describe external and transformation settings:**  
  Clearly explain what each external source or transform is intended to do.

  _Example (in a README or markdown file):_
  > The `frontend.json` profile includes all JavaScript and CSS files from the `src` directory while merging in design system files from an external repository. Transformations are applied to minify CSS files for better readability.

### Version Control

- **Track profiles in version control:**  
  Make sure that the entire `.ctree` folder is not ignored by Git so that your profiles remain versioned with your codebase.

  ```gitignore
  # .gitignore
  !.ctree/
  !.ctree/**
  ```

- **Semantic versioning:**  
  Use versioning or changelog comments when making significant changes to your profiles.

### Cross-Platform Compatibility

- **Path Formatting:**  
  Always use forward slashes (`/`) in your paths. Avoid Windows-specific backslashes.

  ```json
  {
    "rules": [
      ["folder", "startsWith", "src/components"]
    ]
  }
  ```

- **Case Sensitivity:**  
  Use a consistent case (preferably lowercase) for file extensions and directory names when possible.

  ```json
  {
    "rules": [
      ["extension", "oneOf", ["js", "ts", "jsx", "tsx"]]
    ]
  }
  ```

---

## Testing

### Profile Validation

1. **Test with sample directories:**  
   Run Copytree on various test directories to ensure your profiles work as expected.

   ```bash
   copytree path/to/test/dir --profile=frontend
   copytree another/test/dir --profile=frontend
   ```

2. **Verify exclusions and transforms:**  
   Use the `--display` option to check that sensitive or unwanted files are properly excluded and that transformations are applied correctly.

   ```bash
   copytree . --profile=backend --display
   ```

### Edge Case Testing

- **Edge Cases:**  
  Test profiles on empty directories, deeply nested folder structures, files with special characters, very large files, and binary files.
- **Platform Differences:**  
  Check behavior across different operating systems (if applicable) for path separators, case sensitivity, line endings, and file permissions.

---

## Rule Composition

### Reusable Patterns

1. **Common Global Exclusions:**

   ```json
   {
     "globalExcludeRules": [
       ["folder", "containsAny", ["node_modules", "vendor", "dist", "build"]],
       ["extension", "oneOf", ["log", "tmp", "bak"]]
     ]
   }
   ```

2. **Focused Rule Sets for Specific File Types:**

   ```json
   {
     "rules": [
       // JavaScript files
       [
         ["folder", "startsWith", "src"],
         ["extension", "oneOf", ["js", "jsx"]]
       ],
       // TypeScript files
       [
         ["folder", "startsWith", "src"],
         ["extension", "oneOf", ["ts", "tsx"]]
       ],
       // Style files
       [
         ["folder", "startsWith", "src/styles"],
         ["extension", "oneOf", ["css", "scss", "less"]]
       ]
     ]
   }
   ```

### Combining Filters with External Sources and Transforms

- When using **external** sources, ensure that the filtering rules in the external block are optimized just like your local rules.
- When defining **transforms**, scope the rules precisely so that only the intended file types are processed by the transformers.

---

## Error Handling

### Common Pitfalls

1. **Overlapping or Conflicting Rules:**  
   Avoid rules that might conflict. For example, if one rule excludes files in a directory while another rule includes them, the global exclusion takes precedence.

2. **Complex Patterns:**  
   Use complex regular expressions only when necessary. Test them individually before integrating them into your profile.

3. **Unintended Exclusions:**  
   Verify that your `globalExcludeRules` are not too aggressive by testing with a sample output using the `--display` option.

### Debugging Tips

1. **Verbose Output:**  
   Run Copytree with verbose or display options to see which files are being processed and why.

   ```bash
   copytree --profile=frontend --display
   ```

2. **Test Rules Individually:**  
   Use a smaller, focused profile to test individual rules or transformations before integrating them into your full profile.

3. **Log Changes:**  
   When modifying profiles, keep a changelog to document why changes were made and what behavior was intended.

---

## Conclusion

By following these best practices for Copytree profiles, you can create configurations that are well organized, performant, secure, and easy to maintain. The key recommendations include:

- Organizing profiles into a modular directory structure.
- Prioritizing efficient rule checks and global exclusions.
- Excluding sensitive files using robust patterns.
- Documenting profiles and version controlling them alongside your code.
- Thoroughly testing your profiles, including external source merges and transformations.
- Composing reusable patterns for common filtering tasks.
- Handling errors gracefully with verbose output and iterative testing.

This guide is designed to help you build reliable profiles that meet your project’s specific requirements while taking full advantage of Copytree’s extended functionality.
