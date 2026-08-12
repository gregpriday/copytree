# Migrating from 0.x to 1.0

CopyTree 1.0 is a contract release. Very little new capability, and a deliberate
narrowing of what the project promises so that the remaining promises can be
kept.

Most people will notice nothing: the CLI's default behaviour, the output
formats, and the selection rules are unchanged. The breaking changes are
concentrated in the JavaScript API and in two policies that were advertised but
not implemented.

## Command line

### `--binary convert` was removed

```bash
copytree --binary convert    # error, names the replacement
copytree --binary placeholder
```

`convert` advertised document conversion that did not exist. No converter was
ever registered, so the policy's only real effect was to load a PDF's raw bytes
and hand them to a transform stage with nothing to do — after which the secrets
guard could not scan them and dropped the file entirely. **Documents disappeared
from exports** rather than appearing as placeholders.

Documents are now `placeholder`, like every other binary: named in the tree,
with a placeholder body. If you set `binaryPolicy.document: convert` in
configuration, change it to `placeholder`; the schema will reject the old value
rather than ignore it.

Conversion may return as a real capability in a later minor release, with
capability detection and per-format tests. It will not return as a policy name
that means "nothing happens".

### Everything else still parses

Legacy spellings and colon-form commands (`config:validate`, `cache:clear`)
continue to work and name their replacement on stderr. Machine-readable output
is unaffected: deprecation notices never go to stdout.

## Configuration

### The schema is closed

An unknown key is now an error rather than being silently ignored:

```
[fail] schema: /copytree/maxFileSizze: must NOT have additional properties
```

If `copytree config validate` fails after upgrading, the reported key is either
a typo or a setting that never existed. Both were previously accepted and
discarded without a word.

### Values are no longer coerced

`maxFileSize: "10485760"` used to be quietly converted to a number. It is now
rejected. Write numbers as numbers.

### `ConfigManager.migrateConfig()` was removed

It printed `not implemented yet` and returned its input unchanged. The migration
that exists is `copytree config migrate`, which converts the legacy
`~/.copytree/*.js` directory to `config.yaml`.

## JavaScript API

### The root export is smaller

The package root exported 47 values, including pipeline and transformer
internals. Everything reachable from a `1.0.0` root is semver-stable whether or
not that was intended, so the surface is now deliberate.

Extension points moved to a subpath:

```js
// Before
import { Pipeline, Stage, TransformerRegistry, BaseTransformer } from 'copytree';

// After
import { Pipeline, Stage, TransformerRegistry, BaseTransformer } from 'copytree/advanced';
```

Also moved: `ProgressTracker`, `stageIdFor`, `ExclusionReport`, `resolveScope`,
`detectBinary`, `categorizeByExt`.

`copytree/advanced` is versioned less conservatively than the root — **a minor
release may change it**. If you depend on it, pin accordingly.

### `config()` and `configAsync()` were removed

Both were already documented as deprecated. They returned a process-wide mutable
singleton, which is the opposite of the isolation an embedded library has to
offer.

```js
// Before
import { config } from 'copytree';
const settings = config();

// After
import { ConfigManager } from 'copytree';
const settings = await ConfigManager.create();
```

### SDK calls are hermetic by default

**This is the change most likely to alter your output.**

An SDK call with no `config` now reads only the packaged defaults. It does not
read `~/.copytree`, and it does not execute `~/.copytree/*.js`.

```js
// Before: read the user's home directory, so results differed per machine
// and per user, invisibly.
const result = await copy(repoRoot);

// After: identical inputs produce identical output everywhere.
const result = await copy(repoRoot);
```

If you _want_ user configuration — because your tool is itself a CLI and the
person running it expects their settings to apply — ask for it:

```js
const config = await ConfigManager.create(); // reads user configuration
await copy(repoRoot, { config });
```

The CLI is unchanged: typing `copytree` still honours your configuration.

### `ProgressEvent` fields match what is emitted

The declared fields `filesProcessed`, `totalFiles`, `currentFile` and
`timestamp` were never set by any stage. The real event carries:

```ts
{ percent, message, stage?, phase?, completed?, total?, item? }
```

If you were reading `filesProcessed` / `totalFiles`, read `completed` / `total`.
They were `undefined` before, so a correct consumer was already handling their
absence.

### Stage identifiers

`alwaysInclude`, `filter` and `limit` were declared but named stages that no
longer exist. They have been removed from `PipelineStageId` and from
`PIPELINE_STAGES`. Nothing could ever emit them.

### `TransformerRegistry.get()` throws

It was declared as returning `BaseTransformer | undefined` and has always thrown
`TransformError` for an unknown name. The declaration now says so. If you wrote
a null check, it never ran; add a `catch` if you were relying on it.

`getAll()` never existed — the method is `getAllTransformers()`.

### Declarations no longer require `@types/node`

`content` is typed `string | Uint8Array | null` rather than `string | Buffer |
null`, and `NodeJS.MemoryUsage` is spelled out as `MemorySnapshot`. Every
`Buffer` is a `Uint8Array`, so runtime behaviour is unchanged — but the
published declarations now compile in a strict project that has not installed
Node's types.

## Behaviour that was wrong and is now right

These are not migrations. They are defects whose corrected behaviour you may
notice.

- **Streamed and buffered output are byte-identical.** They were three separate
  implementations per format. Streamed XML omitted the directory structure and
  the entire instructions block; streamed JSON emitted
  `metadata.directoryStructure` as a comma-joined string where the buffered path
  emitted a rendered tree, and invented a `profile` field; streamed SARIF
  reported the tool version as `0.0.0`. If you parse streamed output, re-check
  your assumptions against a current sample.
- **Gitleaks cannot fail open.** "Secrets found, but the report could not be
  parsed" used to produce an empty finding list — a clean verdict at the exact
  moment there was most reason for concern. It now falls back to the built-in
  scanner and records `stats.secretsGuard.degraded`.
- **Export output is atomic.** A failed or cancelled run no longer truncates an
  existing export or leaves half a document at the destination. This covers the
  copy itself — buffered, streamed and the temporary reference file — not
  ancillary writes such as `config migrate`.
- **Ctrl+C cancels rather than exits.** The first signal aborts the operation so
  writers, child processes and temporary files unwind; a second forces exit.

## Checking your upgrade

```bash
copytree config validate     # closed schema, no coercion
copytree doctor              # installation, clipboard, Git, effective policies
copytree plan .              # the exact selection, without reading contents
```

For the SDK, the fastest check is that your build still type-checks: most of the
breaking changes are visible to TypeScript.
