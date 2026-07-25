# Intentional Behaviour Changes

A record of behaviour that changed on purpose, so that a differential run against
an earlier release has something to check its differences against. Anything not
listed here that differs between versions is a regression until proven otherwise.

The rule this exists to enforce: **do not approve a changed golden file because
"a lot changed"**. Every difference is either in this ledger or is a bug.

---

## Unreleased (release-readiness pass)

### Security

**Secret scanning now runs on every entry point.**
`scan()`, and therefore `copy()` and `copyStream()`, previously ran no
`SecretsGuardStage` at all: only the CLI redacted credentials. The same policy
now applies to every public entry point. Programmatic callers that relied on
receiving raw file content will now see redacted spans, and can opt out with
`secretsGuard: false`.

**Secret scanning moved after transformation.**
It ran before `TransformStage`, so a transformer that converts a document to
text could surface a credential the scanner never saw. What is scanned is now
what is emitted.

**Files too large to scan are excluded rather than emitted unscanned.**
Files above `secretsGuard.maxFileBytes` used to pass through unscanned while the
run still reported secrets protection as enabled. The default is now to exclude
them, recorded as `secretUnscannable` in the exclusion report. Set
`secretsGuard.oversizePolicy` to `scan` or `fail` for the other behaviours.

**Findings no longer carry the matched secret.**
Findings appear in `stats`, in events, and on thrown errors, all of which an
embedder is liable to log. They now carry `ruleId`, position, `matchLength`, a
redacted `preview`, and a truncated SHA-256 `fingerprint`. The raw `Match` field
is gone from every public surface.

**Symlinks are contained when following is enabled.**
`followSymlinks: true` previously followed any link anywhere. A followed link
must now resolve inside the real repository root, and directories reached
through links are tracked by device and inode so cycles terminate. Escaping
links are recorded as `symlinkEscape`. The default (`false`) is unchanged.

### Selection

**Sort order is a total order under a pinned locale.**
The collator used the host locale and `sensitivity: 'base'`, which reports
`README.md` and `readme.md` as equal and left the winner to array position,
tracing back to filesystem enumeration. The locale is now pinned to `en` and
ties are broken by UTF-16 code unit. Only pairs the collator called equal are
affected. This matters beyond ordering: budgets truncate from the tail, so the
tie-break decides which files survive.

**Sorting by size or modified time reads the documented fields.**
`compareBySize` and `compareByModified` read only `stats.size` / `stats.mtime`,
so files arriving from the SDK (which carry `size` and `modified` but no raw
`fs.Stats`) all sorted as zero. They now prefer the documented field.

**`charLimit: 0` is a real budget.**
`options.limit || 2000000` promoted a zero limit to the 2M default. Zero now
means zero.

**Deduplication uses SHA-256 and ignores placeholders.**
MD5 was the content identity, and a collision silently deletes a file. Binary
placeholders and structure-only notices are also no longer hashed as content:
every binary shares the same placeholder text, so `--dedupe` was deleting all
but the first. `keepFirst: false` now works, keeping the last occurrence in the
earlier one's position.

**The total-size budget policy is named.**
Unchanged in behaviour, but now documented as **greedy fitting**: a file that
does not fit is skipped and later, smaller files are still considered. Sizes
6, 6, 1 under a 7-byte budget yield the first and third. An oversized first file
is still retained, now reported as `stats.oversizedFirstFileRetained`.

### Failure semantics

**Some stages are fatal.**
`continueOnError: true` is set by every production pipeline, so a stage that
threw was logged, skipped, and the run reported success. Discovery, file
loading, secret scanning, and output formatting are now `fatal` and propagate
regardless. A caller who previously received a successful-looking partial result
now receives an error.

**Output formatting no longer downgrades format on failure.**
A failed XML format returned a JSON blob containing the raw file array: wrong
format, formatter policies bypassed, and content serialised that the requested
format might have omitted. Formatting failures now propagate.

**An unknown `--format` exits non-zero.**
Previously the CLI could accept an unrecognised format and produce output.

### CLI defaults

**Reference output is now the default; clipboard text is opt-in.**
`copytree` with no flags used to copy the whole formatted document to the
clipboard. It now writes a temp file and copies that path, which is what `-r`
did. Pasting into an agent hands over a file to read rather than several hundred
kilobytes of inline context.

- `--clipboard` / `-y` restores the old behaviour of copying the text itself.
- `-r` / `--as-reference` is accepted and does nothing, since it now selects the
  default.
- `-o`, `--display`, and `--stream` are unaffected and still take precedence.

**Folder-profile discovery is no longer tied to `-r`.**
Auto-discovery of a `.copytree.yml` used to happen only when `-r` was passed.
Leaving that coupling in place would have made discovery unconditional as a side
effect of the default change, so it is now stated directly: a project profile
applies unless `--no-folder-profile` is passed, and `-p <name>` overrides it.

### Correctness

**`ConfigManager.reload()` reloads.**
It cleared `config` while leaving `_initialized` true, so `loadConfiguration()`
returned immediately and the instance was emptied rather than reloaded.

**Formatting honours the operation's configuration.**
`format()` consulted the process-wide singleton while selection used the
caller's `ConfigManager`, so two concurrent operations could format each other's
files under the wrong settings. `format()` now accepts `config`, and `copy()`
passes its instance through.

**Version resolves from CopyTree's own package.**
`config/app.js` read `package.json` from `process.cwd()`. Since CopyTree is
normally run from inside another project, it reported *that* project's version,
falling back to a hard-coded `0.13.1` otherwise.

**XML attributes are escaped.**
Paths, branch names, encodings, and profile names were interpolated into
attributes raw, so a file named `a&b.js` produced a document no strict parser
would accept. All three XML emitters (buffered, streaming stage, `formatStream`)
now escape attributes and text nodes.

**`userConfigLoaded` reflects whether anything loaded.**
It was set as soon as `~/.copytree` existed, before reading any file.

### Documentation-only corrections

These describe what the code already did; no behaviour changed.

- `SECURITY.md` claimed symlinks were followed by default. They are not.
- `SECURITY.md` and `CLAUDE.md` claimed Node 20. `engines` requires 22.12.
- The testing strategy documented an enforced 80% coverage threshold that did
  not exist in `jest.config.js`. Real thresholds now exist, set at the measured
  baseline.
- `copyStream()` claimed "only one file's content in memory at a time". It is
  chunked *output*; selection and loading complete first. See the types.
- `scan()` claimed bounded memory. The async-iterable shape is for consumption
  convenience; sorting and exact budgets both need the full candidate set.

### Tooling

**`npm run test:integration` runs integration tests.**
A root-level `testMatch` does not narrow a multi-project Jest config, so the
command ran the whole suite (unit, e2e, real) under the name "integration".

---

## Known gaps, deliberately not closed here

These are pinned by tests that assert the *current* behaviour, so the fix has
something to flip rather than being discovered again from scratch.

**Pipeline event payloads are unbounded.**
`stage:start` carries the full pipeline input and `stage:complete` the full
output, so an `onEvent` listener sees file content from every stage, including
stages that run *before* redaction. Two consequences: an embedder that logs
events logs unredacted credentials, and the payload cannot cross an Electron IPC
boundary at all, because it carries the `ConfigManager` whose AJV instance is
circular.

Bounding these to counts, paths, and durations is a public event-contract
change, and `tests/unit/pipeline/events.contract.test.js` deliberately asserts
that `data.output.context` is present. Pinned by
`tests/real/api/secretsParity.test.js` under "raw pipeline events still carry
pre-redaction content".

**No differential harness against the previous release.**
Nothing here compares candidate output against a published baseline over a
fixture corpus. The ledger above is the input that harness needs; the harness
itself does not exist yet.

**Streaming is chunked output, not bounded memory.**
Documented accurately rather than implemented. True input streaming needs a
two-phase design (plan, then load a bounded window), because sorting and exact
budgets both need the full candidate set before any file can be declared a
survivor.

**`--clipboard` completes silently.**
The copy succeeds and the clipboard receives the content, but Ink writes no
frame, so nothing is printed. Pre-existing: it reproduces on the commit before
reference output became the default, where clipboard *was* the default and the
same silence applied. Not a render-throttle race — waiting 500ms after the state
update changes nothing, so the frame is never queued rather than never flushed.
Marked in `src/ui/components/CopyView.js`.

**The benchmark suite is not a CI gate.**
It runs on request and verifies fingerprints when it does. Nothing runs it
automatically, so nothing catches a regression between releases.

---

## How to use this file with a differential run

1. Run the previous release and the candidate over identical fixtures.
2. Classify every difference as: intended (listed here), a bug fix (add it
   here), new optional metadata, or an unexplained regression.
3. An unexplained regression blocks the release. Nothing else does.
