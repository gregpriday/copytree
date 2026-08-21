# Environment variables

CopyTree does not read a `.env` file. There is no `dotenv` dependency, and
nothing loads one — a repository `.env.example` used to suggest otherwise, and
advertised a Gemini API key, an AI cache and half a dozen `CACHE_*` settings,
none of which any shipped code reads.

These are the variables CopyTree actually consults. Everything else belongs in
[configuration](./configuration.md) or on the command line, where it is
discoverable and validated.

## Diagnostics

| Variable               | Effect                                                |
| ---------------------- | ----------------------------------------------------- |
| `COPYTREE_LOG_LEVEL`   | Minimum log level: `error`, `warn`, `info`, `debug`   |
| `COPYTREE_LOG_FORMAT`  | `text`, `json` or `silent`                            |
| `COPYTREE_DEBUG`       | `1` prints a stack trace alongside a reported failure |
| `COPYTREE_PERFORMANCE` | `1` records per-stage timings                         |
| `NO_COLOR`             | Any value disables colour, per <https://no-color.org> |
| `FORCE_COLOR`          | Forces colour on, overriding TTY detection            |
| `COPYTREE_ASCII`       | `1` uses ASCII glyphs instead of Unicode              |

`copytree doctor --format json` reports the effective value of every variable on
this page, so an operational surprise is diagnosable without reading it.

## Paths

| Variable                      | Effect                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| `COPYTREE_DATA_CONFIG_PATH`   | Override the data-configuration directory holding `config.yaml` |
| `COPYTREE_LEGACY_CONFIG_PATH` | Override the legacy `~/.copytree` directory                     |
| `COPYTREE_REFERENCE_PATH`     | Override where temporary reference files are written            |
| `COPYTREE_REPO_CACHE_PATH`    | Override where cloned repositories are cached                   |
| `XDG_CONFIG_HOME`             | Linux: the base for `copytree/config.yaml`                      |
| `APPDATA`                     | Windows: the base for `CopyTree\config.yaml`                    |

## Clipboard

| Variable                        | Effect                                            |
| ------------------------------- | ------------------------------------------------- |
| `COPYTREE_CLIPBOARD_TIMEOUT_MS` | How long to wait for the platform clipboard helper |

## File discovery

These exist to make a performance change measurable without a release. They are
not a supported configuration surface and may be removed in a minor version.

| Variable                             | Effect                                             |
| ------------------------------------ | -------------------------------------------------- |
| `COPYTREE_DISCOVERY_PARALLEL`        | `1` or `true` enables parallel directory traversal |
| `COPYTREE_DISCOVERY_CONCURRENCY`     | Maximum concurrent directory operations            |
| `COPYTREE_DISCOVERY_HIGH_WATER_MARK` | Traversal queue depth                              |

## Testing

| Variable               | Effect                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `COPYTREE_NO_VALIDATE` | `true` skips configuration schema validation                         |
| `NODE_ENV`             | `test` suppresses deprecation warnings and process exits             |

## What is deliberately absent

There is no environment variable for file-size limits, budgets, output format,
or cache behaviour. Those are configuration keys and CLI options:

```bash
copytree --max-total-size 2MB --format markdown
copytree config show --sources    # where each effective value came from
```

A budget set through the environment is invisible in the command that produced
the export, which makes an unexpected result impossible to explain from the
command line alone.
