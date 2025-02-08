# Default FileLoader Exclusions for Profile Creation

When creating your Copytree profile JSON files, you can keep your configuration focused solely on the files that matter to your project. The `FileLoader` class automatically filters out many files and directories that are generally not useful for analysis or sharing. This means you **do not** need to add exclusion rules for these items in your profile—these files are pre‑filtered before any profile rules are even evaluated.

## What Is Excluded by Default?

The `FileLoader` automatically ignores common types of files and folders, including:

### Global Excluded Directories
- **Version Control Directories:**  
  `.git`, `.svn`, `.hg`, `.bzr`, `CVS`
- **IDE/Editor Directories:**  
  `.idea`, `.vscode`, `.vs`, `.settings`, `nbproject`, `.Rproj.user`
- **Cache & Dependency Directories:**  
  `__pycache__`, `node_modules`, `bower_components`, `jspm_packages`, `web_modules`, `.npm`, `.yarn`
- **Virtual Environment Directories:**  
  `venv`, `env`, `.env`, `.venv`
- **Jupyter Notebook Checkpoints:**  
  `.ipynb_checkpoints`
- **Additional Cache Folders:**  
  `.pytest_cache`

### Base Path Excluded Directories
- **Directories Immediately Under the Project Root:**  
  `vendor`, `Pods`, `.github`, `.gitlab`, `.circleci`

### Global Excluded Files
- **Dependency Lock Files:**  
  `package-lock.json`, `yarn.lock`, `composer.lock`, `Pipfile.lock`, `Gemfile.lock`, `Cargo.lock`, `Packages.resolved`
- **Operating System Artifacts:**  
  `.DS_Store`
- **Environment and Log Files:**  
  `.env`, `.env.local`, `*.log`, `npm-debug.log`, `yarn-error.log`
- **Build Artifacts/Compiled Files:**  
  `*.pyc`, `*.pyo`, `*.class`, `*.o`, `*.obj`, `*.exe`, `*.dll`, `*.so`, `*.dylib`
- **Test Cache Files:**  
  `.phpunit.result.cache`

## Focus Your Profile on What Matters

Since the `FileLoader` pre‑filters these items, your profile JSON file can be much simpler. Instead of re‑creating these exclusion rules in your profile, you can concentrate on:

- **Defining Inclusion Rules:**  
  Specify rule sets that select only the files you need (e.g., source files, configuration files, or documentation).
  
- **Customizing Further Filtering:**  
  If necessary, add rules that further narrow down the selection based on file paths, names, or content—but you won't need to worry about standard noise files.

For example, a basic profile might look like this:

```json
{
  "rules": [
    [
      ["folder", "startsWith", "src"],
      ["extension", "oneOf", ["js", "ts", "jsx", "tsx"]]
    ]
  ],
  "globalExcludeRules": [],
  "always": {
    "include": ["README.md", "package.json"],
    "exclude": []
  }
}
```

Because the `FileLoader` has already removed directories like `node_modules`, version control folders, and common cache files, your profile only needs to define what you really care about.

## Summary

The default exclusions built into the `FileLoader` ensure that unnecessary files and directories—such as hidden files, version control directories, dependency folders, and build artifacts—are filtered out before your profile rules are applied. This pre‑filtering helps you create cleaner and more focused profile JSON files, letting you concentrate on the parts of your project that are most important.
