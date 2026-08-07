# Intentional Behaviour Changes

A record of behaviour that changed on purpose, so that a differential run against
an earlier release has something to check its differences against. Anything not
listed here that differs between versions is a regression until proven otherwise.

The rule this exists to enforce: **do not approve a changed golden file because
"a lot changed"**. Every difference is either in this ledger or is a bug.

---

## Unreleased (performance pass)

Mostly removal of duplicated work, which by definition changes nothing
observable. These are the exceptions.

### `-o/--output` no longer opens a file manager

Writing a file used to also reveal it in Finder/Explorer/`xdg-open`. Two
different requests, one of which was never made: on macOS it launches
`osascript`, wakes Finder and steals focus, which makes `-o` unusable in a loop
or a script — the place `-o` is most used. Opt in with `--reveal`.

### Markdown `sha256` describes the emitted content, not the file on disk

`MarkdownFormatter` hashed `file.absolutePath`, reopening and rereading the
entire selection that `FileLoadingStage` had already read. It also produced the
wrong answer: by that point the content in memory has been redacted by
`SecretsGuardStage` and rewritten by transformers, so a redacted file was
published beside the digest of its *unredacted* original — a hash that does not
describe the document carrying it, and one that lets a reader confirm a guess at
the bytes redaction removed. Hashes now come from the emitted content, falling
back to disk only when there is none (`--only-tree`).

### Programmatic results are no longer re-sorted after `SortFilesStage`

`scan()` ran a second full sort using a bare `new Intl.Collator()` — the
*system* locale, no numeric handling, ties unresolved — over a selection
`SortFilesStage` had already ordered with a collator pinned to `en`, numeric
aware, with a code-unit tie-break. So the second sort did not merely repeat
O(n log n) work, it replaced a deterministic order with a machine-dependent one:
the same command on the same tree produced different documents under different
`LANG` settings. `SortFilesStage`'s ordering is now canonical.

### `stage:complete` carries `memoryUsage: null` unless asked

Two `process.memoryUsage()` calls per stage per run, to fill a field only
`--profile`, `COPYTREE_PERFORMANCE=true` and the benchmark harness read. The key
is still always present; construct a `Pipeline` with `measureMemory: true` (as
`--profile` now does) to populate it.

### A clean Gitleaks result is final

Every clean file was scanned twice: Gitleaks, then the built-in regex scanner
over the same bytes, because the fallback triggered on *zero findings* rather
than on failure. On a repository of mostly clean files that is the common path.
The built-in scanner remains the fallback for Gitleaks being absent or failing.
A file that Gitleaks passes and the weaker scanner would have flagged is now
reported clean.

## Unreleased (CLI output pass)

One controller and one terminal reporter replaced the two copy implementations
(an Ink component for the default path, `commands/copy.js` for `--stream` and
`--profile`). Most of what changed is feedback on stderr, which no golden
covers. These four changed the documents themselves.

### Streamed output carries the same metadata as buffered output

**`<ct:profile>` / `"profile"` now appear in streamed XML and JSON.** The
streaming path passed the profile under a key nothing read (`profileConfig`,
where every stage reads `profile`), so a streamed document silently omitted a
field its buffered equivalent has always had. Parity fix, not a new field: both
`copytree-xml@1` and `copytree-json@1` already specified it.

**`<ct:format>` / `"format"` now appear in streamed XML, JSON and NDJSON.**
Buffered output has always carried the format version; streamed output did not,
so a consumer checking for a schema change read nothing from a streamed document
and concluded nothing had changed — the exact failure the version exists to
prevent. Additive within the existing major versions.

**A named folder profile is serialized by name.** `buildProfileFromCliOptions`
stored it only under `_folderProfile`, while the formatters read `profile.name`,
so every document said `default` regardless of which profile ran.

### `--dry-run` no longer writes anything

A dry run built the full pipeline and skipped only *delivery*, so `--dry-run
--stream` wrote the whole document to stdout and `--dry-run --stream -o
existing.xml` truncated that file — while reporting "No content was read and no
output was written". The pipeline now stops after selection, which also means a
preview no longer reads file contents, runs transformers or scans for secrets.
Its token count is an estimate rather than a measurement, as it was before the
output stage was reachable from this path.

## Unreleased (embedder feedback pass)

Reported against the pre-release by the embedding application, running the SDK
over a ~3,500 file repository. Everything here is a fix to something introduced
or left standing by the release-readiness pass below.

### Secret detection no longer corrupts source

**The generic rules match the credential, not the statement around it.**
`GENERIC_TOKEN` was `(api|secret|token|password)[\s:=]{1,4}[A-Za-z0-9._-]{12,}`,
which matched from the *keyword* onward and redacted everything it swallowed.
`const token = payload.token.trim();` became `const ***REDACTED***);`, and
`Token classification:` became `***REDACTED***`. On the reporting repository
this produced 130 detections across 72 files, every one a false positive, each
destroying a span of working code.

Each rule now names a capture group holding the credential, and only that span
is redacted, so `const apiKey = "sk_live_..."` becomes
`const apiKey = "***REDACTED:PROVIDER_TOKEN***"` and still parses. A match also
has to look like a credential rather than merely sit next to the word "token":
a quoted literal or an environment-style assignment, above a Shannon entropy
floor, not a placeholder and not an identifier path.

**New `PROVIDER_TOKEN` rule.** Published prefixes (GitHub, Stripe, GitLab,
Slack, Google, Anthropic, OpenAI, SendGrid, npm) are distinctive enough to match
with no surrounding context, which closes the case the keyword-anchored rules
miss: a real key assigned to a neutrally-named variable.

**`AWS_SECRET_KEY` no longer eats its own prefix.** `=` was in the value
charset, so the match ran back over `KEY=` and redacted it too. Base64 padding
only ever trails.

Overlapping matches are now resolved first-rule-wins, because two rules hitting
one credential meant two index-based replacements over the same span.

### Correctness

**`NEVER_BINARY` extensions survive content sniffing.**
`categorizeByExt()` correctly refused to call `.ts` binary, but returning `null`
only meant "no verdict" — the caller fell through to `classifySample()`, where a
single NUL byte was decisive. A `\0` in a template literal is valid source, and
a 2.8 KB TypeScript file was being replaced by a binary placeholder. These
extensions are now judged on the control-character ratio instead, so real binary
content carrying such an extension is still caught.

**A dry run selects what the real run selects.**
`SecretsGuardStage` was skipped entirely when `includeContent` was false, so its
secret-prone glob exclusions were missing from the preview: 3524 files planned
against 3522 actually copied. The stage now runs in plan mode for the exclusions
decidable from the manifest, and reports `scanner: 'none'`, `planOnly: true`.

**`stage:log` events are actually emitted.**
`Stage.log()` guards on `this.pipeline`, which the pipeline never set: both entry
points hand over already-constructed instances, so the constructor option never
reached them. The event was listed in the contract and had never fired.

### Programmatic API

**`copy()` forwards the whole progress object.**
The wrapper rebuilt it as `{ percent, message }`, discarding `stage` — so the
stable ids that `PIPELINE_STAGES` exists to publish were invisible on the
highest-level API.

**`copy()` no longer swallows a caller's `onSummary`.**
`...options` was spread into the scan options and then `onSummary` was
overwritten with the internal capture, so a caller-supplied callback never
fired. It is now chained. `copyStream()` was already correct.

**`stats` carries what the stages computed.**
`stats.secretsGuard` was declared in the types and never populated, and its
declared shape did not match what the stage wrote. `BudgetStage` and
`CharLimitStage` detail (`truncatedByCountBudget`, `truncatedBySizeBudget`,
`oversizedFirstFileRetained`, `totalCharacters`, `characterLimit`,
`truncatedFiles`, `skippedFiles`) was stranded in the pipeline result. All of it
now reaches `CopyResult.stats`, through one helper shared with `copyStream()`.

**`--secrets-report` writes a report.** It read
`stats.secretsGuard.report`, which nothing ever set. The stage now populates it,
carrying sanitized findings only.

**The SDK writes nothing to the terminal.**
Stage messages went through the central logger, so `SecretsGuardStage` printed a
warning into the host application's stdout. Pipelines built by `scan()` now run
`quiet`; `stage:log` still carries the message to any `onEvent` listener, and
`quiet: false` restores the old behaviour.

### Selection

**`scope` can reach config-excluded directories.**
Scoping into `node_modules` returned nothing with no way to override, because
config exclusions are not ignore-file rules and `scopeIgnoresIgnoreFiles` does
not touch them. The new `scopeIgnoresConfigExcludes` lifts the config-exclude
rules standing between the root and the selection. A path excluded by both
layers needs both flags, which scoping into `node_modules` usually does.

`.git` moved to its own `hard-exclude` layer that no option lifts.

**`always` no longer reaches into `.git`.**
Force-includes run through `fast-glob` with `ignore: []`, deliberately, because
`always` exists to override ignore rules. That made `--always '.git/**'` a route
into git metadata, bypassing every layer. Pre-existing, and found while testing
the claim above: adding a non-bypassable layer is worth nothing if one path
never consults the layers. `always` now overrides ignore rules, the size gate,
and config exclusions, but not the hard exclusions. Nested `.git` directories
(submodules) are covered, since the check is per path segment.

### Found by review of the above

An adversarial pass over the fixes, most of which were wrong in the same
direction: a guarantee stated in a comment but not enforced by the code.

**`.git` is now genuinely unreachable.**
Putting it in a `hard-exclude` layer was not enough, because the layer stack is
last-match-wins: a `!.git/` negation in any `.copytreeignore` flipped the verdict
back. The check now runs after the layer loop, outside that resolution, in
`isHardExcluded()` (`src/utils/hardExclusions.js`), and is consulted by both
walkers and by the force-include path. Names are compared case-insensitively,
since `.GIT` reaches the same directory on macOS and Windows.

**A private key's body is redacted, not just its header.**
`PRIVATE_KEY` matched `-----BEGIN … PRIVATE KEY-----` alone, so redaction
replaced the label and emitted the base64 body and footer verbatim. It now
matches the whole PEM block, with the header-only rule kept as a fallback for a
truncated file.

**Secret-prone filenames are matched at any depth.**
`id_rsa`, `*.pem` and `.env` were tested without `matchBase`, so they only
matched at the repository root: `keys/id_rsa` was scanned rather than excluded.

**Credential names are matched as they are actually written.**
`\b` does not fall between `db_` and `password`, because `_` is a word
character. `db_password`, `stripe_api_key` and `service_client_secret` were all
invisible to the generic rules.

**A JWT is no longer discarded as a reference path.**
Three dot-separated runs of word characters is also the shape of
`process.env.DB_PASSWORD`, so the reference rejection silently dropped real
tokens. JWTs are now recognised first, and the reference pattern caps segment
length, which is what actually distinguishes the two.

**`pk_live_*` is no longer redacted.** The Stripe rule was `[sprk]k_`, which
covers publishable keys, designed to ship in frontend code, and a nonexistent
`kk_` prefix.

**A short source file with a NUL is not binary.**
The trusted-extension ratio reproduced the bug it was added to fix at small
sizes: `x="\0";` is one control byte in seven, which is 14%. A minimum absolute
control-byte count now applies before the ratio.

**Non-text content is excluded rather than crashing the run.**
A transformer that leaves content as a `Buffer` passed the truthy check, was
coerced to a string to scan, and then reached `content.split('\n')` in the
redactor. `SecretsGuardStage` is fatal, so that `TypeError` failed the whole run.

**Deduplication runs before redaction.**
Redaction destroys the distinction dedup hashes on: two config files differing
only in their credentials become byte-identical strings of the same marker, and
one was dropped as a duplicate of the other.

**A multi-line finding no longer over-redacts.**
`_findingToIndices` clamped the end column to the start column unconditionally,
so a span starting at column 17 and ending at column 6 of a later line deleted
through column 17 of that line — the closing quote, the semicolon, and whatever
followed. The clamp now applies only within a single line. Latent until
`PRIVATE_KEY` became multi-line.

**An oversized first file is no longer reported as truncated.**
`BudgetStage` set `truncated: true` alongside `budgetExceeded`, directly
contradicting the comment above it: nothing was dropped, and neither
`truncatedCount` nor `truncatedBy` had a meaningful value.

**Two quadratic paths in the scanner are linear.**
The environment rule put its keyword alternation between two unbounded
`[A-Z0-9_]*`, which backtracks quadratically over a long uppercase line that
never reaches an `=`; the key is now captured whole and tested in code. Overlap
detection scanned every prior finding; claimed spans are now kept sorted and
searched.

**`quiet` covers the pipeline, not just its stages.** The pipeline's own recovery
warnings went to the terminal regardless.

### Documentation-only corrections

- `FileResult.path` claimed it "may use platform-specific separators on
  Windows". It is normalized to POSIX at discovery time.
- `ScanOptions` was missing `secretsGuard`, `secretsRedactMode`,
  `failOnSecrets`, `profile` and `quiet`, so a TypeScript consumer could not
  reach the secrets escape hatch without a cast. `FormatOptions` was missing
  `config` and `allowEmpty`.
- The `ErrorCode` union omitted `ERR_SECRETS_DETECTED` and
  `ERR_SYMLINK_OUTSIDE_ROOT`, both of which `ERROR_CODES` exports.
- `estimatedOutputChars` on a dry run is biased high, by 10-15% in practice.
  Now stated, along with why every contributing factor pushes the same way.

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

### Documentation-only corrections (release-readiness pass)

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
