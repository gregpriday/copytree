# CopyTree CLI Reference

<!--
  Generated from src/cli/schema.js by scripts/generate-cli-docs.js.
  Do not edit by hand: run `node scripts/generate-cli-docs.js` instead.
-->

CopyTree packages a project as structured context for an AI agent.

```bash
copytree [path] [options]      # copy, using a file reference by default
copytree <command> [options]
```

With no destination option the export is written to a temporary file and a file
reference is copied to the clipboard, so pasting into an agent hands over a file
to read rather than inline context.

## Authoring a `.copytreeignore`

```bash
copytree ignore context .    # a content-free inventory and the active rules
# create or edit .copytreeignore
copytree ignore check .      # validate the rules and show what they remove
copytree plan .              # preview the exact final export
```

## Commands

| Command | Summary |
|---|---|
| `copytree ignore <subcommand>` | Author, validate and start a .copytreeignore |
| `copytree config <subcommand>` | Inspect or validate configuration |
| `copytree cache <subcommand>` | Inspect or manage caches |
| `copytree debug <subcommand>` | Developer diagnostics |
| `copytree copy` | Explicit form of the default copy operation |
| `copytree plan` | Preview selected files without reading contents |
| `copytree inspect` | Inspect structure, rules, profile and budgets |
| `copytree explain` | Explain why paths are included or excluded |
| `copytree ignore context` | Build context for authoring .copytreeignore |
| `copytree ignore check` | Validate ignore rules and show their effect |
| `copytree ignore init` | Print or write a conservative starter file |
| `copytree config show` | Inspect effective configuration with provenance |
| `copytree config validate` | Validate configuration against the schema |
| `copytree config migrate` | Convert legacy ~/.copytree configuration into a data file |
| `copytree cache status` | Report cache contents and location |
| `copytree cache clear` | Remove cached entries |
| `copytree cache gc` | Remove expired entries and stale reference files |
| `copytree doctor` | Check CopyTree, clipboard, Git and converters |
| `copytree completion` | Generate shell completion code |
| `copytree debug profile` | Capture CPU and/or heap profiles |
| `copytree help` | Show help for CopyTree or one of its commands |

## `copytree copy`

Explicit form of the default copy operation

Export a project as structured context. With no destination option the export is written to a temporary file and a file reference is copied to the clipboard, so pasting into an agent hands over a file to read rather than inline context.

```bash
copytree copy [path] [options]
copytree [path] [options]   # the command name is optional
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Directory, file, or GitHub URL | `.` |

#### Destination

| Option | Meaning | Notes |
|---|---|---|
| `-o, --output <file>` | Write the export to a file (- means stdout) | conflicts: `--stdout`, `--clipboard`, `--reference` |
| `--stdout` | Write the export to stdout | conflicts: `--output`, `--clipboard`, `--reference` |
| `-y, --clipboard` | Copy the export text itself, not a file reference | conflicts: `--output`, `--stdout`, `--reference` |
| `--reference` | Copy a file reference to the clipboard (this is the default) | conflicts: `--output`, `--stdout`, `--clipboard` |
| `--reveal` | Reveal the written file in the OS file manager | advanced; requires: `--output` or `--reference` |

#### Content

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Output format: xml, markdown, json, ndjson, sarif, tree | default: `xml` |
| `--no-content` | Include structure and metadata, but not file bodies |  |
| `--line-numbers` | Add line numbers to text bodies | advanced |
| `--binary <policy>` | Binary/document policy: default, omit, comment, placeholder, base64, convert | advanced; default: `default` |
| `--git-status` | Attach Git status to selected files | advanced |
| `--metadata` | Include optional rich metadata where the format supports it | advanced |
| `--no-metadata` | Omit optional metadata; required schema metadata is kept | advanced |
| `--instructions <name>` | Include a named instruction block | advanced |
| `--no-instructions` | Omit instruction blocks | advanced |
| `--reproducible` | Omit timestamps and normalise volatile metadata | advanced |

#### Selection

| Option | Meaning | Notes |
|---|---|---|
| `--profile <name>` | Use a file-selection profile (.copytree-<name>.yml) |  |
| `--no-profile` | Skip automatic project-profile discovery |  |
| `--scope <path>` | Traverse only this literal path | repeatable |
| `--include <glob>` | Include only matching paths; narrows the profile include set | repeatable |
| `-x, --exclude <pattern>` | Add a Git-style exclusion rule | repeatable |
| `--force-include <glob>` | Override ordinary excludes and the size gate | repeatable |
| `--ext <extension>` | Keep only this extension (ts or .ts) | advanced; repeatable |
| `--max-depth <n>` | Limit traversal depth from the project root | advanced |
| `--no-tests` | Exclude conventional test paths | advanced |
| `-m, --modified` | Select working-tree changes | advanced; conflicts: `--staged`, `--changed` |
| `--staged` | Select staged changes | advanced; conflicts: `--modified`, `--changed` |
| `-c, --changed <ref>` | Select files changed since a Git reference | advanced; conflicts: `--modified`, `--staged` |
| `--dedupe` | Remove content-identical files after loading | advanced |
| `--scope-include-ignored` | Let --scope entries override the ignore rules that would exclude them | advanced |
| `--scope-include-default-excluded` | Let --scope entries override built-in exclusions (node_modules). .git never | advanced |

#### Budgets and ordering

| Option | Meaning | Notes |
|---|---|---|
| `--size-gate <size>` | Per-file gate decided from stat() before opening | advanced; default: `256KB` |
| `--no-size-gate` | Disable the context size gate (not the hard safety ceiling) | advanced |
| `--max-total-size <size>` | Limit selected file bytes |  |
| `--max-files <count>` | Limit selected file count, applied after sorting |  |
| `--max-chars <count>` | Limit emitted content characters, cut at line boundaries |  |
| `--sort <by>` | Selection order: path, size, modified, name, extension, depth | advanced; default: `path` |
| `--order <direction>` | Sort direction: asc or desc | advanced; default: `asc` |

#### Security and failure policy

| Option | Meaning | Notes |
|---|---|---|
| `--secrets <policy>` | Secret policy: redact, fail, off | advanced; default: `redact` |
| `--redaction <style>` | Redaction marker style: typed, generic, hash | advanced; default: `typed` |
| `--secrets-report <file>` | Write a structured findings report (- for stdout) | advanced |
| `--fail-empty` | Fail when no files are selected | advanced |
| `--fail-on-truncation` | Fail when a budget omits or truncates requested content | advanced |
| `--fail-on-fs-errors` | Fail when filesystem work degrades after retries | advanced |
| `--strict` | Enable every applicable policy-failure check | advanced |
| `--no-transform-cache` | Bypass the transformation cache | advanced |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Conflicts**

- Exactly one destination: --reference, --clipboard, --stdout or --output.
- Exactly one Git mode: --modified, --staged or --changed.
- --reveal requires --output or --reference.
- --quiet and --verbose cannot be combined.

**Examples**

```bash
copytree
copytree src --stdout --format markdown
copytree . --include "**/*.ts" --exclude "docs/" --max-total-size 2MB
copytree . -o context.md
```

**Machine output**: `copytree-feedback@1`

## `copytree plan`

Preview selected files without reading contents

The side-effect-free answer to "what will CopyTree select, in what order, and which budgets will bind". Reads directory entries, file metadata, and the ignore, profile and configuration files needed to decide. Never reads candidate file contents.

```bash
copytree plan [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Plan report format: text, json, ndjson | default: `text` |
| `--explain` | Include excluded entries and decision provenance |  |
| `--all` | Include every candidate entry, not only selected ones | conflicts: `--summary` |
| `--summary` | Emit the summary only | conflicts: `--all` |
| `-o, --output <file>` | Save the plan report |  |
| `--fail-empty` | Exit with a policy failure on an empty plan | advanced |
| `--fail-on-truncation` | Exit with a policy failure when stat-based budgets omit files | advanced |
| `--reproducible` | Omit timestamps so the report can be compared byte for byte | advanced |

#### Selection

| Option | Meaning | Notes |
|---|---|---|
| `--profile <name>` | Use a file-selection profile (.copytree-<name>.yml) |  |
| `--no-profile` | Skip automatic project-profile discovery |  |
| `--scope <path>` | Traverse only this literal path | repeatable |
| `--include <glob>` | Include only matching paths; narrows the profile include set | repeatable |
| `-x, --exclude <pattern>` | Add a Git-style exclusion rule | repeatable |
| `--force-include <glob>` | Override ordinary excludes and the size gate | repeatable |
| `--ext <extension>` | Keep only this extension (ts or .ts) | advanced; repeatable |
| `--max-depth <n>` | Limit traversal depth from the project root | advanced |
| `--no-tests` | Exclude conventional test paths | advanced |
| `-m, --modified` | Select working-tree changes | advanced; conflicts: `--staged`, `--changed` |
| `--staged` | Select staged changes | advanced; conflicts: `--modified`, `--changed` |
| `-c, --changed <ref>` | Select files changed since a Git reference | advanced; conflicts: `--modified`, `--staged` |
| `--scope-include-ignored` | Let --scope entries override the ignore rules that would exclude them | advanced |
| `--scope-include-default-excluded` | Let --scope entries override built-in exclusions (node_modules). .git never | advanced |

#### Budgets and ordering

| Option | Meaning | Notes |
|---|---|---|
| `--size-gate <size>` | Per-file gate decided from stat() before opening | advanced; default: `256KB` |
| `--no-size-gate` | Disable the context size gate (not the hard safety ceiling) | advanced |
| `--max-total-size <size>` | Limit selected file bytes |  |
| `--max-files <count>` | Limit selected file count, applied after sorting |  |
| `--max-chars <count>` | Limit emitted content characters, cut at line boundaries |  |
| `--sort <by>` | Selection order: path, size, modified, name, extension, depth | advanced; default: `path` |
| `--order <direction>` | Sort direction: asc or desc | advanced; default: `asc` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Conflicts**

- --summary and --all cannot be combined.

**Examples**

```bash
copytree plan .
copytree plan . --explain
copytree plan . --format json
```

**Machine output**: `copytree-plan@1`

## `copytree inspect`

Inspect structure, rules, profile and budgets

Understand a project and the CopyTree environment. Reads no ordinary file contents; configuration, profile and ignore files are read because they are the subject.

```bash
copytree inspect [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--view <name>` | summary, tree, extensions, rules, profile, budgets or all | default: `summary` |
| `--depth <n>` | Limit rendered tree depth | default: `4` |
| `--all-paths` | List all candidate paths rather than aggregates |  |
| `--format <type>` | Report format: text, markdown, json | default: `text` |
| `-o, --output <file>` | Save the report |  |
| `--without-copytreeignore` | Show the candidate state before .copytreeignore is applied | advanced |

#### Selection

| Option | Meaning | Notes |
|---|---|---|
| `--profile <name>` | Use a file-selection profile (.copytree-<name>.yml) |  |
| `--no-profile` | Skip automatic project-profile discovery |  |
| `--scope <path>` | Traverse only this literal path | repeatable |
| `--include <glob>` | Include only matching paths; narrows the profile include set | repeatable |
| `-x, --exclude <pattern>` | Add a Git-style exclusion rule | repeatable |
| `--force-include <glob>` | Override ordinary excludes and the size gate | repeatable |
| `--ext <extension>` | Keep only this extension (ts or .ts) | advanced; repeatable |
| `--max-depth <n>` | Limit traversal depth from the project root | advanced |
| `--no-tests` | Exclude conventional test paths | advanced |
| `-m, --modified` | Select working-tree changes | advanced; conflicts: `--staged`, `--changed` |
| `--staged` | Select staged changes | advanced; conflicts: `--modified`, `--changed` |
| `-c, --changed <ref>` | Select files changed since a Git reference | advanced; conflicts: `--modified`, `--staged` |
| `--scope-include-ignored` | Let --scope entries override the ignore rules that would exclude them | advanced |
| `--scope-include-default-excluded` | Let --scope entries override built-in exclusions (node_modules). .git never | advanced |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree inspect .
copytree inspect . --view rules
copytree inspect . --format json
```

**Machine output**: `copytree-inspect@1`

## `copytree explain`

Explain why paths are included or excluded

A complete decision trace for one or more root-relative paths, naming the rule, its source file and its line wherever a file-based rule decided the outcome.

```bash
copytree explain <entry...> [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `entry` | Root-relative paths to trace | — |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--root <path>` | Project root | default: `.` |
| `--format <type>` | Report format: text, json | default: `text` |
| `-o, --output <file>` | Save the report | advanced |

#### Selection

| Option | Meaning | Notes |
|---|---|---|
| `--profile <name>` | Use a file-selection profile (.copytree-<name>.yml) |  |
| `--no-profile` | Skip automatic project-profile discovery |  |
| `--scope <path>` | Traverse only this literal path | repeatable |
| `--include <glob>` | Include only matching paths; narrows the profile include set | repeatable |
| `-x, --exclude <pattern>` | Add a Git-style exclusion rule | repeatable |
| `--force-include <glob>` | Override ordinary excludes and the size gate | repeatable |
| `--ext <extension>` | Keep only this extension (ts or .ts) | advanced; repeatable |
| `--max-depth <n>` | Limit traversal depth from the project root | advanced |
| `--no-tests` | Exclude conventional test paths | advanced |
| `-m, --modified` | Select working-tree changes | advanced; conflicts: `--staged`, `--changed` |
| `--staged` | Select staged changes | advanced; conflicts: `--modified`, `--changed` |
| `-c, --changed <ref>` | Select files changed since a Git reference | advanced; conflicts: `--modified`, `--staged` |
| `--scope-include-ignored` | Let --scope entries override the ignore rules that would exclude them | advanced |
| `--scope-include-default-excluded` | Let --scope entries override built-in exclusions (node_modules). .git never | advanced |

#### Budgets and ordering

| Option | Meaning | Notes |
|---|---|---|
| `--size-gate <size>` | Per-file gate decided from stat() before opening | advanced; default: `256KB` |
| `--no-size-gate` | Disable the context size gate (not the hard safety ceiling) | advanced |
| `--max-total-size <size>` | Limit selected file bytes |  |
| `--max-files <count>` | Limit selected file count, applied after sorting |  |
| `--max-chars <count>` | Limit emitted content characters, cut at line boundaries |  |
| `--sort <by>` | Selection order: path, size, modified, name, extension, depth | advanced; default: `path` |
| `--order <direction>` | Sort direction: asc or desc | advanced; default: `asc` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree explain docs/README.md --root .
copytree explain src/index.ts tests/index.test.ts --root .
```

**Machine output**: `copytree-explain@1`

## `copytree ignore context`

Build context for authoring .copytreeignore

A safe, compact, content-free project inventory an agent can use to author .copytreeignore. The candidate baseline deliberately excludes .copytreeignore itself, so the areas you might want to exclude — docs, tests, examples, fixtures — are all visible.

```bash
copytree ignore context [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Report format: markdown, text, json | default: `markdown` |
| `--depth <n>` | Tree expansion depth | default: `4` |
| `--all-paths` | Include every candidate path |  |
| `--scope <path>` | Limit context to a literal subtree | repeatable |
| `-o, --output <file>` | Save the report | conflicts: `--reference` |
| `--reference` | Write a temporary report and copy its file reference | conflicts: `--output` |
| `--include-current-rules` | Include full current .copytreeignore decision detail | advanced |
| `--no-hints` | Disable deterministic role hints | advanced |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree ignore context .
copytree ignore context . --format json
```

**Machine output**: `copytree-ignore-context@1`

## `copytree ignore check`

Validate ignore rules and show their effect

Validate .copytreeignore syntax and semantics, then show exactly what it removes. Read-only: the file is never rewritten.

```bash
copytree ignore check [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Report format: text, json | default: `text` |
| `--strict` | Treat warnings as a policy failure |  |
| `--show-removed` | List every removed path |  |
| `--show-kept` | List every retained path |  |
| `--rule <lineOrPattern>` | Focus on one rule, by line number or pattern |  |
| `-o, --output <file>` | Save the report |  |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree ignore check .
copytree ignore check . --strict
```

**Machine output**: `copytree-ignore-check@1`

## `copytree ignore init`

Print or write a conservative starter file

Generate a starting point for .copytreeignore. Prints to stdout by default; writing requires --write, and replacing an existing file additionally requires --force.

```bash
copytree ignore init [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Template

| Option | Meaning | Notes |
|---|---|---|
| `--template <name>` | empty or source | default: `empty` |
| `--write` | Write <root>/.copytreeignore |  |
| `--force` | Permit replacing an existing file | requires: `--write` |
| `--format <type>` | gitignore (plain rules) or annotated (with comments) | default: `annotated` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Conflicts**

- --force requires --write.

**Examples**

```bash
copytree ignore init .
copytree ignore init . --template source --write
```

## `copytree config show`

Inspect effective configuration with provenance

```bash
copytree config show [options]
```

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--section <name>` | Show one section only |  |
| `--format <type>` | Report format: text, json | default: `text` |
| `--sources` | Show where each effective value came from |  |
| `--show-secrets` | Reveal security-sensitive values; requires a TTY, or --force | advanced |
| `--force` | Permit --show-secrets when stdout is redirected | advanced |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree config show
copytree config show --format json --sources
```

**Machine output**: `copytree-config@1`

## `copytree config validate`

Validate configuration against the schema

```bash
copytree config validate [options]
```

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--strict` | Treat warnings as failures |  |
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree config validate
copytree config validate --format json
```

**Machine output**: `copytree-config-validation@1`

## `copytree config migrate`

Convert legacy ~/.copytree configuration into a data file

Reads the legacy `~/.copytree/*.{js,json}` configuration and writes the equivalent `config.yaml` in the platform configuration directory. Prints the result by default; writing requires --write. The legacy directory is never modified.

```bash
copytree config migrate [options]
```

#### Migration

| Option | Meaning | Notes |
|---|---|---|
| `--write` | Write the data configuration file |  |
| `--force` | Permit replacing an existing data configuration file | requires: `--write` |
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Conflicts**

- --force requires --write.

**Examples**

```bash
copytree config migrate
copytree config migrate --write
```

**Machine output**: `copytree-config-migration@1`

## `copytree cache status`

Report cache contents and location

```bash
copytree cache status [options]
```

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree cache status
```

**Machine output**: `copytree-cache@1`

## `copytree cache clear`

Remove cached entries

```bash
copytree cache clear [options]
```

#### Categories

| Option | Meaning | Notes |
|---|---|---|
| `--transformations` | Only the transformation cache |  |
| `--references` | Only the temporary reference files (clear needs this explicitly) |  |
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree cache clear
copytree cache clear --transformations
```

**Machine output**: `copytree-cache@1`

## `copytree cache gc`

Remove expired entries and stale reference files

```bash
copytree cache gc [options]
```

#### Categories

| Option | Meaning | Notes |
|---|---|---|
| `--transformations` | Only the transformation cache |  |
| `--references` | Only the temporary reference files (clear needs this explicitly) |  |
| `--retention-days <n>` | Reference-file retention window | advanced; default: `7` |
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree cache gc
```

**Machine output**: `copytree-cache@1`

## `copytree doctor`

Check CopyTree, clipboard, Git and converters

Diagnostic only: doctor reports, and repairs nothing. Every check names what it looked at and what to do when it fails.

```bash
copytree doctor [options]
```

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | Report format: text, json | default: `text` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree doctor
copytree doctor --format json
```

**Machine output**: `copytree-doctor@1`

## `copytree completion`

Generate shell completion code

Completions are generated from the same command schema as the parser and the help.

```bash
copytree completion <shell> [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `shell` | bash, zsh, fish, powershell | — |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree completion zsh
copytree completion bash > /etc/bash_completion.d/copytree
```

## `copytree debug profile`

Capture CPU and/or heap profiles

A developer diagnostic. Performance profiling is deliberately absent from copy help: "profile" everywhere else in CopyTree means a file-selection profile.

```bash
copytree debug profile [path] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `path` | Project root | `.` |

#### Profiling

| Option | Meaning | Notes |
|---|---|---|
| `--type <kind>` | cpu, heap or all | default: `cpu` |
| `--output-dir <dir>` | Where to write profiles and the report | default: `.profiles` |

#### Feedback

| Option | Meaning | Notes |
|---|---|---|
| `-q, --quiet` | Suppress progress and successful completion feedback | conflicts: `--verbose` |
| `-v, --verbose` | Show selection counts, limits, destination, size and duration | conflicts: `--quiet` |
| `--debug` | Alias for --log-level debug | advanced |
| `--log-level <level>` | Severity floor: error, warn, info, debug | advanced; default: `info` |
| `--log-format <format>` | Feedback rendering: text, or newline-delimited json | advanced; default: `text` |
| `--no-color` | Disable ANSI colour | advanced |

**Examples**

```bash
copytree debug profile . --type cpu
copytree debug profile . --type all
```

## `copytree help`

Show help for CopyTree or one of its commands

```bash
copytree help [command...] [options]
```

| Argument | Meaning | Default |
|---|---|---|
| `command` | Command path | — |

#### Report

| Option | Meaning | Notes |
|---|---|---|
| `--format <type>` | text, or the versioned machine-readable command schema as json | default: `text` |
| `--all` | Include advanced options |  |

**Examples**

```bash
copytree help plan
copytree help --format json
```

**Machine output**: `copytree-command-schema@1`

## Migration

Deprecated spellings still parse, and each one names its replacement on stderr.

| Deprecated | Replacement |
|---|---|
| `--folder-profile` (copy) | `--profile` |
| `--no-folder-profile` (copy) | `--no-profile` |
| `--profile-dir` (copy) | `copytree debug profile --output-dir` |
| `--filter` (copy) | `--include` |
| `--display` (copy) | `--stdout` |
| `--stream` (copy) | `--stdout` |
| `--dry-run` (copy) | `copytree plan` |
| `--head` (copy) | `--max-files` |
| `--char-limit` (copy) | `--max-chars` |
| `--include-binary` (copy) | `--binary base64` |
| `--with-line-numbers` (copy) | `--line-numbers` |
| `--only-tree` (copy) | `--no-content` |
| `--with-git-status` (copy) | `--git-status` |
| `--as-reference` (copy) | `--reference` |
| `--sort-order` (copy) | `--order` |
| `--always` (copy) | `--force-include` |
| `--scope-include-config-excluded` (copy) | `--scope-include-default-excluded` |
| `--explain` (copy) | `copytree plan --explain` |
| `--secrets-guard` (copy) | `--secrets redact` |
| `--no-secrets-guard` (copy) | `--secrets off` |
| `--secrets-redact-mode` (copy) | `--redaction` |
| `--fail-on-secrets` (copy) | `--secrets fail` |

### Removed

| Removed | Replacement | Why |
|---|---|---|
| `--info` | `--metadata` | Optional metadata is included by default; --no-metadata omits it. |
| `--show-size` | `--metadata` | Sizes are part of the optional metadata, included by default. |
| `--min-size <size>` | — | Filter by size with a plan report, or use --size-gate for the per-file gate. |
| `--max-size <size>` | `--size-gate` | The per-file gate is --size-gate; the whole-run budget is --max-total-size. |
| `--no-cache` | `--no-transform-cache` | Cache control is now scoped to the subsystem it affects. |
| `--no-validate` | `copytree config validate` | Configuration validation is owned by the config command. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, including a valid empty selection |
| `1` | Operational failure: I/O, formatting, Git, converters |
| `2` | Usage or configuration error |
| `3` | A requested policy check failed |
| `130` | Cancelled by SIGINT |

Machine output and JSON feedback carry a stable symbolic code alongside the exit code.
