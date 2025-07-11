---
title: Creating & Refining Profiles
nav: Profiles/Creating & Refining Profiles
---

# Creating & Refining Profiles with copytree --dry-run

> **Note**: This guide assumes `copytree` is installed globally and can be run with just the `copytree` command. If you have a local installation, adjust the commands accordingly.

## 1. Why use --dry-run?

The `--dry-run` flag provides:
- Zero-cost previews of file selection (AI filtering is skipped to avoid API calls)
- Safe validation in CI environments
- Quick iteration on profile refinement without generating full output

## 2. One-shot profile generation (review)

Copytree can automatically generate profiles using AI:

```bash
copytree profile:create <path> [--char-limit]
```

This analyzes your project structure and creates an initial YAML profile tailored to your codebase.

<details>
<summary>Example interactive session</summary>

```
copytree profile:create /path/to/project

Analyzing project structure...
✓ Found 1,245 files
✓ Detected framework: Laravel 10.x
✓ Identified main languages: PHP (89%), JavaScript (8%), Blade (3%)

? What is the primary purpose of this profile?
❯ Documentation generation
  Code review preparation  
  AI assistant context
  Testing/CI pipeline
  Custom

? Should test files be included? (Y/n) n

? Apply AI summarization to large files? (y/N) y

? Maximum file size to include without transformation? (default: 100KB) 50KB

Generating optimized profile...
✓ Profile created at .ctree/generated.yaml
✓ Estimated output size: 2.3 MB

Run 'copytree copy . --profile generated --dry-run' to preview file selection.
```
</details>

## 3. Iterative refinement workflow

### 3.0 Start with a clean slate (optional)

When creating a brand new profile, you may want to see what files are available without any profile filters applied. Use the `--no-profile` option:

```bash
copytree copy <path> --dry-run --no-profile
```

This shows all files that aren't excluded by `.gitignore` or `.ctreeignore`, giving you a complete picture of available files before applying any profile-specific filters.

### 3.1 Generate initial YAML

Either use AI generation or create a hand-written profile and save it to `.ctree/<name>.yaml`:

```yaml
include:
  - "src/**/*.php"
  - "config/**/*.php"
exclude:
  - "vendor/**"
  - "**/*.log"
always:
  - "composer.json"
```

### 3.2 Run preview

```bash
copytree copy <path> --dry-run --profile <name>
```

Output shows "Files that would be included" count:

```
Files that would be included:
src/Controller.php
src/Model.php
config/app.php
composer.json
...
Total files: 42
```

### 3.3 Inspect mismatches

- **Missing files?** → Add patterns to `include` or specific files to `always`
- **Extra noise?** → Tighten `exclude` patterns or remove overly broad `include` rules

### 3.4 Repeat until "Total files" meets expectations

Continue adjusting patterns and re-running with `--dry-run` until the file selection matches your requirements exactly.

### 3.5 Quick sanity-check with --validate

Before you run a full dry-run, you can verify that your YAML is syntactically sound by appending `--validate`:

```bash
copytree copy . --profile myapp --validate
```

You'll see a pass/fail table like:

```
Name   Path                 Status   Errors
myapp  .ctree/myapp.yaml    Valid
```

If errors are listed, fix them and re-run until the profile is clean. `--validate` exits immediately and **does not** run the copy pipeline, so it's ideal for CI hooks. For batch validation of *all* profiles, use `profile:validate`. See the *CLI reference* for full flag details.

## 4. Advanced dry-run options

Combine `--dry-run` with other flags to refine your selection:

- `--depth <n>`: Limit directory traversal depth
- `--order-by <field>`: Sort files by name, size, or modified date
- `--size-report`: Show size statistics for selected files
- `--filter "*.php"`: Apply additional runtime filters with profile rules
- `--no-profile`: Skip all profile loading (shows files without any profile filters)

Example:
```bash
copytree copy . --dry-run --profile laravel --depth 3 --filter "*.php" --size-report
```

<details>
<summary>Sample size-report output</summary>

```
Size Report:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File                                          Size      Lines   
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app/Http/Controllers/ApiController.php        15.2 KB   412     
app/Models/User.php                           8.7 KB    287     
app/Services/PaymentService.php               7.9 KB    234     
config/app.php                                6.4 KB    189     
app/Http/Middleware/Authenticate.php          3.2 KB    98      
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 78 files, 324.5 KB
```

This helps identify large files that might need transformation or exclusion.
</details>

## 5. Automation hints for agents

For AI agents or automated tools creating profiles:

1. **Parse dry-run output line-by-line**: Stop refinement when file count delta < N lines
2. **Maintain a refinement log**: Track iterations in JSON format:

```json
{
  "iterations": [
    {
      "version": 1,
      "total_files": 156,
      "missing": ["src/Utils/*.php"],
      "extra": ["tests/**"],
      "adjustment": "Added src/Utils/*.php to include"
    },
    {
      "version": 2,
      "total_files": 142,
      "missing": [],
      "extra": ["docs/internal/**"],
      "adjustment": "Added docs/internal/** to exclude"
    }
  ]
}
```

3. **Convergence criteria**: Stop when:
   - No missing critical files
   - Extra files < 5% of total
   - File count stable across 2 iterations

## 6. Example session (copy-paste block)

```bash
# Initial attempt
copytree copy . --dry-run --profile myapp
Files that would be included:
app/Controllers/UserController.php
app/Models/User.php
...
Total files: 89

# Profile too broad, refine excludes
cat .ctree/myapp.yaml
include:
  - "app/**/*.php"
exclude:
  - "vendor/**"
  - "storage/**"
  - "tests/**"  # Added this

# Try again
copytree copy . --dry-run --profile myapp
Files that would be included:
app/Controllers/UserController.php
app/Models/User.php
config/app.php  # Missing config files!
...
Total files: 67

# Add config to includes
cat .ctree/myapp.yaml
include:
  - "app/**/*.php"
  - "config/**/*.php"  # Added this
exclude:
  - "vendor/**"
  - "storage/**"
  - "tests/**"

# Final check
copytree copy . --dry-run --profile myapp
Total files: 78  # Perfect!
```

## 7. Troubleshooting table

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "No files would be included" | Glob patterns too strict or wrong path | Widen include patterns, verify path exists |
| "Too many files included" | Missing exclude patterns | Add common directories to exclude (vendor/, node_modules/, etc.) |
| "Critical file missing" | File doesn't match any include pattern | Add to `always` list or adjust include pattern |
| "AI filter skipped" message | Normal in dry-run mode | AI filters don't run in dry-run to save API calls |
| "Profile not found" | Wrong profile name or location | Check .ctree/ directory or profiles/ directory |
| "Want clean slate view" | Default profile being applied | Use `--no-profile` to skip all profile loading |

## 8. Next steps & related docs

- [Profiles – Overview](profile-overview.md): Basic profile concepts and structure
- [Advanced Profiles](profile-advanced.md): Complex glob patterns and techniques
- [Profile Examples](profile-examples.md): Ready-made templates for common frameworks

Remember: `--dry-run` is your best friend for perfecting profiles without wasting time or API calls!

[↑ Back to top](#creating--refining-profiles-with-copytree---dry-run)