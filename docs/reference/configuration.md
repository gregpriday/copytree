# Configuration Reference

Where CopyTree's settings come from, which ones exist, and how to see what is
actually in effect.

Most people never need this page. Selection belongs in a profile or an ignore
file, and one-off changes belong on the command line. Configuration is for the
handful of preferences that should apply to every run on your machine.

## Precedence

Later wins:

1. **Packaged defaults** — `config/*.js` inside the installed package
2. **User data configuration** — `config.yaml` in your platform's configuration
   directory
3. **Legacy user configuration** — `~/.copytree/*.js` or `*.json`, still read,
   with a warning
4. **Project profile** — `.copytree.yml`, or a named profile
5. **Command-line options**

`copytree config show --sources` prints the effective value of every key
alongside the file it came from, which is the fastest way to answer "why is it
doing that".

## Where the file lives

| Platform | Path                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| Linux    | `$XDG_CONFIG_HOME/copytree/config.yaml`, or `~/.config/copytree/config.yaml` |
| macOS    | `~/Library/Application Support/CopyTree/config.yaml`                         |
| Windows  | `%APPDATA%\CopyTree\config.yaml`                                             |

Override the directory with `COPYTREE_DATA_CONFIG_PATH`.

```yaml
# config.yaml
copytree:
  maxFileSize: 10485760
  includeHidden: false
  sizeGate: 262144
logging:
  level: info
```

### The legacy directory

`~/.copytree/*.js` and `~/.copytree/*.json` are still read, and CopyTree warns
when it finds them. Prefer the data file.

The reason is not tidiness. A `.js` configuration file is **executed**, in
whatever process loaded CopyTree. For a CLI that is merely unusual; for an
application that embeds CopyTree it means arbitrary code from a home directory
running with the host application's privileges, and it means the same inputs
produce different output on different machines with nothing in the project to
explain why.

`copytree config migrate --write` converts an existing setup and leaves the
legacy directory in place, so you can roll back by deleting the new file.

## The schema is closed

Every public key is declared in `config/schema.json`, and **an unknown key is an
error**:

```
[fail] schema: /copytree/maxFileSizze: must NOT have additional properties
```

That is deliberate. An unrecognised key is almost always a typo or a setting
from an older version, and accepting it silently discards what you asked for
without a word. Types, ranges and enumerations are validated too, and values are
never coerced: `maxFileSize: "10MB"` is rejected rather than quietly read as
the number 10.

Check a file before relying on it:

```bash
copytree config validate
copytree config show --sources
```

## Keys

### `schemaVersion`

| Key             | Type   | Default | Meaning                                   |
| --------------- | ------ | ------- | ----------------------------------------- |
| `schemaVersion` | string | —       | The schema major this file is written for |

Optional, and checked before anything else. A file declaring a **newer major**
than this build understands is refused by name, because a future major is
exactly the release that may have changed what an existing key means — reading
it anyway and guessing is how a budget or an exclusion list quietly comes to
mean something else. The same or an older major is accepted; the closed schema
below still rejects any key that has since been removed, naming it.

```yaml
schemaVersion: '1.0.0'
copytree:
  includeHidden: true
```

### `copytree`

Selection, budgets and rendering.

| Key                                            | Type     | Default                      | Meaning                                     |
| ---------------------------------------------- | -------- | ---------------------------- | ------------------------------------------- |
| `globalExcludedDirectories`                    | string[] | dependency and cache dirs    | Never traversed                             |
| `basePathExcludedDirectories`                  | string[] | —                            | Excluded only at the root                   |
| `globalExcludedFiles`                          | string[] | junk files                   | Never selected                              |
| `structureOnlyPatterns`                        | string[] | lockfiles                    | Listed in the tree, body replaced           |
| `forceIncludeDotfiles`                         | string[] | —                            | Dotfiles selected despite the hidden rule   |
| `maxFileSize`                                  | integer  | 10485760                     | Largest file that will be read              |
| `maxTotalSize`                                 | integer  | 104857600                    | Total bytes across the selection            |
| `maxFileCount`                                 | integer  | 10000                        | Files in the selection                      |
| `sizeGate`                                     | integer  | 262144                       | Per-file gate, applied before opening       |
| `maxBase64Size`                                | integer  | 1048576                      | Largest binary inlined under `--binary base64` |
| `followSymlinks`                               | boolean  | false                        | Follow links that stay inside the root      |
| `includeHidden`                                | boolean  | false                        | Include dotfiles                            |
| `respectGitignore`                             | boolean  | true                         | Honour gitignore files                      |
| `gitignore.nested`                             | boolean  | true                         | Read `.gitignore` at every depth            |
| `gitignore.infoExclude`                        | boolean  | true                         | Read `.git/info/exclude`                    |
| `gitignore.globalExcludesFile`                 | boolean  | true                         | Read the user's global gitignore            |
| `exclusionReport.topN`                         | integer  | 50                           | Largest exclusions retained under `top`     |
| `exclusionReport.maxEntries`                   | integer  | 100000                       | Cap on retained detail under `all`          |
| `binaryFileAction`                             | enum     | `placeholder`                | Default binary policy                       |
| `binaryPolicy`                                 | object   | per category                 | Overrides keyed by binary category          |
| `binaryPlaceholderText`                        | string   | `[Binary file not included]` | Placeholder body                            |
| `binaryCommentTemplates.xml` / `.markdown`     | string   | see defaults                 | Comment templates                           |
| `binaryDetect.sampleBytes`                     | integer  | 8192                         | Bytes sniffed when the extension is unknown |
| `binaryDetect.nonPrintableThreshold`           | number   | 0.3                          | Ratio above which content is binary         |
| `binaryExtensions`                             | object   | per category                 | Extension lists per binary category         |
| `addLineNumbers`                               | boolean  | false                        | Prefix text content with line numbers       |
| `lineNumberFormat`                             | string   | `%4d: `                      | Line-number template                        |
| `treeConnectors.*`                             | string   | box drawing                  | Tree rendering characters                   |
| `fs.retryAttempts` / `retryDelay` / `maxDelay` | integer  | 3 / 100 / 2000               | Transient I/O retry                         |
| `discovery.parallelEnabled`                    | boolean  | false                        | Parallel directory traversal                |
| `discovery.maxConcurrency`                     | integer  | null                         | Concurrent directory reads; null follows `app.maxConcurrency` |
| `discovery.highWaterMark`                      | integer  | null                         | Backpressure threshold; null is twice the concurrency |

Binary policies are `skip`, `comment`, `placeholder` and `base64`.

> **`load` and `omit` were removed from the schema.** Both validated cleanly and
> then behaved as `placeholder`, which makes a closed enum a promise the code
> did not keep. The CLI's `--binary omit` is unchanged and still maps to `skip`.

> **`convert` was removed.** It advertised document conversion that did not
> exist — no converter was ever registered — and its only effect was to load a
> PDF's raw bytes, which the secrets guard then dropped as unscannable, so
> documents vanished from the export instead of appearing as placeholders.
> Documents are now `placeholder`, like every other binary. Use
> `--binary placeholder`; the CLI names the replacement if you pass `convert`.

### `app`

| Key                   | Type    | Default     | Meaning                        |
| --------------------- | ------- | ----------- | ------------------------------ |
| `debug`               | boolean | false       | Extra internal logging         |
| `maxConcurrency`      | integer | 5           | Concurrent file operations     |
| `prettyPrint`         | boolean | true        | Indent JSON and SARIF          |
| `defaultInstructions` | string  | `default`   | Instructions block to load     |
| `verboseErrors`       | boolean | false       | Include stack traces in errors |

### `cache`

| Key                                | Type              | Default             | Meaning                      |
| ---------------------------------- | ----------------- | ------------------- | ---------------------------- |
| `enabled`                          | boolean           | true                | Master switch                |
| `driver`                           | enum              | `file`              | `file`, `memory` or `none`   |
| `defaultTtl`                       | integer           | 3600                | Seconds                      |
| `prefix`                           | string            | `copytree_`         | Cache key prefix             |
| `file.path`                        | string            | `~/.copytree/cache` | Cache directory              |
| `file.extension`                   | string            | `.cache`            | Cache file extension         |
| `file.gcProbability`               | number            | 0.01                | Chance a run collects garbage |
| `file.maxAge`                      | integer           | 604800000           | Milliseconds before eviction |
| `transformations.enabled` / `.ttl` | boolean / integer | true / 86400        | Transformation cache         |

### `logging`

| Key           | Type    | Default  | Meaning                          |
| ------------- | ------- | -------- | -------------------------------- |
| `level`       | enum    | `info`   | `error`, `warn`, `info`, `debug` |
| `format`      | enum    | `text`   | `text`, `json`, `silent`         |
| `colorize`    | enum    | `auto`   | `auto`, `always`, `never`        |
| `timestamp`   | boolean | true     | ISO timestamp in JSON entries    |
| `destination` | enum    | `stderr` | `stderr` or `stdout`             |

### `secretsGuard`

Secret detection and redaction. A top-level section rather than part of
`copytree`, because it is a policy rather than a selection setting.

| Key                  | Type    | Default             | Meaning                                             |
| -------------------- | ------- | ------------------- | --------------------------------------------------- |
| `enabled`            | boolean | true                | Run the guard at all                                |
| `exclude`            | array   | `.env`, `*.pem`, …  | Filename globs excluded outright as secret-prone    |
| `redactInline`       | boolean | true                | Redact in place; `false` excludes the whole file    |
| `redactionMode`      | enum    | `typed`             | `typed`, `generic` or `hash`                        |
| `maxFileBytes`       | integer | 5000000             | Largest file handed to a scanner                    |
| `failOnSecrets`      | boolean | false               | Exit non-zero on the first finding                  |
| `oversizePolicy`     | enum    | `exclude`           | `exclude`, `scan` or `fail`, for an unscannable file |
| `gitleaks.binaryPath` | string | `gitleaks`          | External scanner, resolved on `PATH`                |
| `gitleaks.configPath` | string | —                   | Custom Gitleaks ruleset                             |
| `gitleaks.extraArgs`  | array  | `[]`                | Extra arguments for the scanner                     |
| `gitleaks.logLevel`   | string | `fatal`             | Gitleaks log level                                  |

The guard never emits a file whose secrets it could not remove. `redactInline:
false` excludes the file; so does a finding that cannot be proven redacted, and
so does a Gitleaks detection whose findings it could not read. See
[the secrets guard](../usage/secrets-guard.md).

## Environment variables

CopyTree does **not** read a `.env` file. See
[environment.md](./environment.md) for the variables it does consult — they
cover diagnostics and paths, not budgets or formats.

A budget set through the environment is invisible in the command that produced
the export, which makes a surprising result impossible to explain from the
command line alone. That is why there is no `COPYTREE_MAX_FILE_SIZE`.

## Embedding: hermetic by default

An SDK call with no configuration reads **only** the packaged defaults:

```js
import { copy } from 'copytree';

// No home directory, no legacy JavaScript, same result on every machine.
const result = await copy(repoRoot);
```

The CLI is the opposite, and deliberately so: when someone types `copytree`,
their personal configuration is a feature.

To opt an embedded caller in to user configuration, construct it and pass it:

```js
import { copy, ConfigManager } from 'copytree';

const config = await ConfigManager.create(); // reads user configuration
await copy(repoRoot, { config });
```

Create the manager once per process and reuse it. Loading parses every file and
compiles the schema; a loaded instance is immutable in practice and safe to
share across concurrent operations.

```js
// Two operations, two configurations, no interference.
const [strict, loose] = await Promise.all([
  ConfigManager.create({ userConfig: false, strict: true }),
  ConfigManager.create({ userConfig: false }),
]);

await Promise.all([copy(a, { config: strict }), copy(b, { config: loose })]);
```

### Options

| Option           | Default          | Meaning                                                                     |
| ---------------- | ---------------- | --------------------------------------------------------------------------- |
| `userConfig`     | `true`           | Read the user directory. SDK entry points default this to `false`.          |
| `configSources`  | —                | Explicit list, e.g. `['defaults']`. Beats `userConfig`.                     |
| `strict`         | `false`          | Throw `ERR_CONFIG_INVALID` when a source fails to load                      |
| `noValidate`     | `false`          | Skip schema validation                                                      |
| `dataConfigPath` | platform default | Override the `config.yaml` directory                                        |
| `userConfigPath` | `~/.copytree`    | Override the legacy directory                                               |
| `onWarning`      | stderr           | Where load warnings go, so a desktop app is not writing to the host console |

`strict` matters more than it looks. Without it, a configuration file that fails
to load leaves the instance empty — and an empty configuration has no exclusion
lists at all, so the run copies `node_modules` and reports success.

## Profiles are not configuration

Project-specific _selection_ belongs in a profile or an ignore file, not in user
configuration:

```yaml
# .copytree.yml
name: my-profile
include: ['src/**/*.js', 'README.md']
exclude: ['**/*.test.js']
```

```bash
copytree --profile my-profile
copytree --no-profile            # skip auto-discovery
copytree inspect . --view profile
```

The distinction is about who the setting belongs to. A profile is checked in and
applies to everyone working on the project; user configuration is yours and
applies to every project you open.

## Troubleshooting

```bash
copytree config show --sources    # effective values, and where each came from
copytree config validate          # types, ranges, unknown keys
copytree config migrate --write   # legacy ~/.copytree -> config.yaml
copytree doctor                   # installation, clipboard, Git, policies
```

**"must NOT have additional properties"** — an unknown key. Check the spelling
against the tables above; the schema is closed on purpose.

**A setting appears to be ignored** — `config show --sources` names the file each
value came from. A CLI option or a profile beats user configuration.

**Warning about legacy configuration** — you have `~/.copytree/*.js`. Run
`copytree config migrate --write`.

## Related

- [Environment variables](./environment.md)
- [CLI reference](../cli/copytree-reference.md)
- [Secrets guard](../usage/secrets-guard.md)
