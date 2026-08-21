# Changelog

## [Unreleased]

## [1.0.0-rc.3] - 2026-08-21

A regression fix. `rc.2` moved to `js-yaml` 5, which loads with `CORE_SCHEMA`
and has no `!!merge` tag where 4.x's default schema had one — so YAML merge
keys stopped merging, and any profile or configuration that shared settings
through an anchor failed to load entirely. Reported by a downstream embedder
holding its upgrade on it.

### Fixed

- **YAML merge keys work again.** `loadYaml()` now loads with
  `CORE_SCHEMA.withTags([mergeTag])`, so `<<: *anchor` merges instead of
  surviving as a literal `"<<"` key. Both the folder-profile validator and the
  closed configuration schema rejected that key as an unknown setting, so a
  `.copytree.yml` or `config.yaml` using an anchor was rejected outright with
  an error naming a key its author never wrote.

  Deliberately not `YAML11_SCHEMA`, which restores merge and YAML 1.1 scalar
  rules together: `yes`/`no`/`on`/`off` would become booleans, `012` octal,
  `1e3` a string and a bare date a `Date`. That would change how every existing
  profile parses in order to fix anchors in the few that use them. The scalar
  contract is now pinned by tests that fail under either schema swap.

- **`config migrate` verifies its own output.** It validated the values it was
  about to write, but in memory — and a legacy `~/.copytree/*.js` file is
  executed, so it can export anything. A `Set` satisfies AJV's idea of an
  object, survives pruning, and serialises as `!!set`, a tag the loader does
  not accept. Migration could write a `config.yaml` the next run could not
  parse, from a command whose whole job is to leave a working configuration.
  The generated document is now read back and revalidated before it is offered
  or written.

### Added

- **Reserved `x-` keys**, in profiles and in `config.yaml`. Accepted, read by
  nothing, and dropped. YAML shares settings through an anchor and an anchor
  has to be defined on some key — but every other key names a setting and the
  configuration schema is closed, so there was nowhere to put one. The
  convention is docker-compose's and GitHub Actions'.

### Documentation

- The profile guide documented `extends:` and `external:`; neither was ever
  implemented, and a profile using either is rejected with
  `Unknown profile key` — the same failure this release fixes. Both are
  replaced with the anchor syntax that works, and `basic-usage.md`'s
  external-sources recipe with one that runs.

## [1.0.0-rc.2] - 2026-08-21

The second and, if nothing surfaces, final release candidate for 1.0. An
independent release audit of `rc.1` returned three P0 findings and a long tail
of contract defects; this closes all of them.

**This is a prerelease, published under the `next` dist-tag.** `npm install
copytree` still resolves to the stable `0.x` line; install it deliberately with
`npm install copytree@next`.

The theme is the same one `rc.1` started and did not finish: **a control that
disengages exactly when the code enforcing it is in an unexpected state is worse
than no control, because the caller believes it held.** Six of the defects below
are that shape, and each of them exited 0.

What stood between `rc.1` and `1.0.0` no longer does. Windows, Ubuntu and macOS
now run the end-to-end suite on every push, across Node 22.12.0 exactly, 22, 24
and 26; the publish workflow has performed a real release. What remains is a
soak: nothing in this candidate has been exercised by anyone but its tests.

Full upgrade notes:
[docs/reference/migrating-to-1.0.md](docs/reference/migrating-to-1.0.md).

### Security

- **The secrets guard never emits a file whose secrets it could not remove.**
  `secretsGuard.redactInline: false` is documented as "exclude the file rather
  than redact in place" and meant "detect, report, and emit unchanged": with
  `failOnSecrets` off, execution fell through to the untouched file while the
  run reported the finding. It now excludes.
- **A redaction that cannot be proven is not a redaction.** `SecretRedactor`
  skipped findings it could not locate and returned only a count, so the caller
  could not distinguish "nothing left to do" from "the credential is still
  there" — and stamped `redacted: true` on both. It now reports which spans it
  covered and which it could not, and the file is dropped unless every one is
  accounted for.
- **The redacted bytes go back through the scanner that found the secret.**
  Coordinates drift — CRLF, multi-byte characters, inclusive versus exclusive
  end columns — and a span one character off still counts as a replacement while
  leaving the credential legible. Anything the re-scan still finds, that is not
  the guard's own marker, excludes the file. A scanner downgrade mid-verification
  excludes it too: a weaker tool reporting "clean" is not a verification.
- **A masked Gitleaks `Match` can no longer relocate a redaction.** Gitleaks runs
  with `--redact`, so its match is a mask. Searching the file for it could find a
  literal mask in a documented example, redact that, and leave the real
  credential — reporting success. Match provenance is now passed explicitly and
  never inferred.
- **Gitleaks detecting a secret it cannot describe excludes the file.** "Secrets
  found, but the report could not be read" fell back to the built-in scanner, and
  a clean result from the weaker tool overruled the stronger one's positive
  verdict. Under `--secrets fail` it now fails the run.
- Overlapping findings merge before replacement; two findings over one credential
  used to garble each other's output. Secrets reports are written atomically at
  `0600`.

### Changed — breaking

- **`maxTotalSize` is a maximum.** A single file larger than the whole budget was
  kept regardless, so a caller who set the budget to protect a context window
  could be handed forty times it. It is now dropped like any other file that does
  not fit, and the selection can legitimately come back empty.
  `--retain-oversized-first-file` asks for the old behaviour by name.
- **Sixteen configuration keys were removed.** `app.defaultCommand`,
  `interactiveMode`, `chunkSize`, `defaultOutput`, `outputEncoding`,
  `exitOnError`, the six `app.*` metadata keys, `copytree.maxOutputSize`,
  `maxCharacterLimit`, `preserveEmptyDirs` and `treeIndent` had no runtime
  consumer between them. The schema is closed, so a configuration setting one is
  now rejected by name — and `config migrate` drops them for you, saying which.
- **`copytree/advanced` is now `copytree/experimental`.** A 1.0 package makes a
  SemVer promise about everything it exports, and this subpath's own
  documentation says a minor release may break it. It shipped in no stable
  release.
- **There are no built-in transformers.** `file-loader` and
  `streaming-file-loader` reloaded content the pipeline had already read; the
  latter buffered whole files despite its name. `binary` was registered for
  `.doc`, `.zip`, `.exe` and their kin while returning `null` for anything that
  is not an image — which fails validation, so **including a `.zip` was enough to
  make `copytree --strict` exit non-zero** for no reason a user could act on.
- **`copy()` no longer accepts `secretsReport`, `info` or `verbose`**, which were
  declared and never implemented, nor `basePath` and `allowEmpty`, which it
  overwrote. `FormatStreamOptions.onProgress` is gone; `formatStream()` never
  called it.
- Pipeline lifecycle events carry counts, never file payloads. The declarations
  described the payload-carrying shape the runtime had removed for safety, so a
  consumer following them could not work.

### Fixed

- **A cancelled run no longer succeeds.** The signal was checked only inside the
  scan, so a run abandoned while formatting carried on, **wrote its output file**,
  and reported 100%.
- **A malformed budget is refused rather than ignored.** `--max-chars 1.5` was
  read as `1`, `'12abc'` as `12`, and a `maxTotalSize` of `'garbage'` in a
  profile silently became "no budget" — a typo produced a successful unbounded
  run. `CharLimitStage` is now fatal, like every other budget.
- **A profile's `charLimit` applies.** It reached the budget resolver, was
  reported by every command that reports budgets, and was dropped before the
  pipeline.
- **`plan` applies the character budget**, so a preview cannot select a different
  set from the run it previews — and reports `pathSelection` as
  `estimated-from-bytes` rather than claiming `exact` about a set it estimated.
- **`--instructions <name>` fails when the block is missing.** The stage threw
  for it deliberately; `continueOnError` swallowed the throw, so a typo produced
  a document with no instructions, no warning, and exit 0.
- **`schemaVersion` works.** A root-level scalar was merged into an object and
  became `{}`, so the only scalar the schema declares could never be set. It now
  refuses a configuration written for a newer major.
- **`cache.driver: none` disables the cache.** Every method guarded on `enabled`
  and then consulted an in-process map regardless of driver, so `none` disabled
  only the file half.
- **A remote whose default branch cannot be read reports why.** `ls-remote`
  failures were swallowed and `main` guessed, turning an authentication or
  network problem into "Branch 'main' not found" — and failing outright for
  repositories that use another name.
- Every observational callback is isolated, including `async` ones: a rejected
  promise from `onProgress` was unhandled, and Node's default for that is to
  terminate the process. An `onEvent` that threw failed the scan outright.
- Unexpected `scan()` failures stay typed, so `error.code` is always present.
- The completion line no longer warns that secrets "remain in the output". That
  count was detections minus replaced regions, so two findings on one credential
  reported a leak that never happened.
- `Pipeline.getStats()` before a run reported a duration of fifty-six years and a
  success rate of 1 for zero stages; recovered stages are now counted.

### Added

- **`copytree cache` covers the repository clones.** Copying a GitHub URL keeps
  the checkout under `~/.copytree/repos`, and nothing could see it — on one
  developer machine it had reached a gigabyte. `status`, `clear` and `gc` now
  report and reclaim it, `doctor` warns above 2 GB, and both destructive actions
  require `--repositories`.
- **The SDK accepts a transformer registry.** `transform` and `transformers`
  described a route that was not connected to anything.
- `DEGRADATION_CODES` and the `Degradation` type are public; degradations reach
  `onSummary`, which they never did.
- `COPYTREE_REPO_CACHE_PATH`, and one published allowlist of every environment
  variable CopyTree reads, reported by `doctor`.
- `--retain-oversized-first-file`, and `retainOversizedFirstFile` for profiles
  and the SDK.

### Changed

- Configuration provenance is tracked per leaf, so two files contributing
  different keys to one section are attributed individually rather than both to
  the later file. `set()` reports `runtime`.
- A validation failure names the offending key instead of "must NOT have
  additional properties".
- The repository cache is created `0700`; it holds complete checkouts of
  repositories that may be private.
- `validatePlan` no longer claims to check resources it cannot see. It reported
  "requires an API key but none is configured" without looking, and had an empty
  block where a network check would go.

### Documentation

- The architecture guide's fatal-stage list named four stages when there were
  eleven, and described both budget stages as degrading gracefully after they
  were made fatal precisely because degrading gracefully was the bug. It also
  listed a stage that does not exist. A test now reads that table and compares
  it against the code.
- Nothing streams. `FileLoadingStage` reads every file whole, and budgets are
  what bound memory; three documents said otherwise, and the Electron guide
  recommended `copyStream()` as a memory solution while giving three different
  minimum versions, none matching `engines`.
- The user guides no longer promise PDF conversion and OCR, and the installation
  guide no longer asks for Pandoc and Tesseract, which nothing uses.

### Infrastructure

- Contract tests that read the declarations and compare them against a real run:
  event payloads, option names, configuration keys and defaults, the environment
  allowlist, stage fatality, and the security support table.
- The Electron smoke suite runs on Electron 35 / Node 22, the version `engines`
  requires. It pinned Electron 28, which bundles Node 18.18, and its `scan()`
  test had been asserting on `undefined` since the API became streaming.
- `lint` and `format:check` cover `config/` and `scripts/`.

## [1.0.0-rc.1] - 2026-08-12

The first release candidate for 1.0. A contract-hardening pass: little new
capability, and a deliberate narrowing of what CopyTree promises, so that what
remains is true, tested and provable from the published tarball.

**This is a prerelease, published under the `next` dist-tag.** `npm install
copytree` still resolves to the current stable line; install it deliberately
with `npm install copytree@next`.

Two things stand between this and `1.0.0`, and neither is a code change:

- **Nothing here has run on Windows.** This candidate adds filesystem
  primitives whose behaviour is platform-specific — atomic rename over an
  existing file, exclusive `wx` creation, unlinking a file with an open
  handle, `mkdir`-based locks, Git worktrees. All of it was tested on macOS.
- **This is the first release the publish workflow has ever performed.** A
  release process that has not been rehearsed is a hypothesis, which is
  precisely why the rehearsal is happening on a prerelease tag.

Full upgrade notes: [docs/reference/migrating-to-1.0.md](docs/reference/migrating-to-1.0.md).

### Fixed

- **Streamed and buffered output are now byte-identical.** Each format had three
  independent implementations — the buffered formatters, `api/formatStream.js`,
  and the transform streams inside `StreamingOutputStage` — and they had
  drifted. Streamed XML omitted the directory structure and the entire
  instructions block. Streamed JSON emitted `metadata.directoryStructure` as a
  comma-joined string where the CLI emitted a rendered tree, and invented a
  `profile` field. Streamed SARIF reported the tool version as `0.0.0`. There is
  now one serializer per format, an async generator of chunks: buffered output
  is defined as the concatenation of the same chunks a streamed run writes.
- **Gitleaks can no longer fail open.** Exit code 1 means "secrets found"; if the
  report could not be parsed, the adapter returned an empty finding list — a
  clean verdict at the moment there was most reason for concern. It now falls
  back to the built-in scanner and records the downgrade in
  `stats.secretsGuard.degraded`. Unparseable output on a clean exit is likewise
  treated as a scanner malfunction, not as "no secrets".
- **Documents no longer vanish from exports.** The default document policy was
  `convert`, which loaded raw bytes for a converter that was never registered;
  the secrets guard then dropped the file as unscannable. Documents are now
  rendered as placeholders, like every other binary.
- **Export output is atomic.** Every path that writes a *copy* — buffered,
  streamed, and the temporary reference file — goes to a private (mode `0600`)
  sibling with an unpredictable name and is renamed over the destination, so a
  failed or cancelled run cannot truncate an existing export or leave half a
  document behind. Ancillary writes (`config migrate`, `ignore init`, profiler
  output) are unchanged and remain ordinary writes.
- **Ctrl+C cancels instead of exiting.** The first signal aborts through an
  `AbortSignal` so writers, child processes and temporary files unwind; a second
  forces exit. Exit code 130, no stack trace.
- `strip-ansi` was imported by runtime code but declared as a development
  dependency, so a production-only install shipped a package that could not
  start.
- The published declarations required `@types/node` without depending on it, so
  they did not compile in a strict consumer project.

- **A failure in a stage that decides what gets emitted now fails the run.**
  Budget enforcement, sorting and deduplication each answered an internal error
  by returning their input unchanged, so `--max-total-size 2MB` could exit 0
  having produced far more than 2MB, and `--sort modified --max-files 20` could
  return twenty arbitrary files instead of the twenty most recent. All three are
  fatal, and a requested transform that fails at the stage level no longer
  skips every conversion silently.
- **A file that cannot be read is no longer exported as its own error message.**
  `FileLoadingStage` wrote `[Error loading file: EACCES ...]` into the file's
  body, which no consumer can distinguish from source text that happens to
  contain that sentence: the path appeared in the tree, the run exited 0, and an
  agent read the failure as code. The read failure now propagates as
  `ERR_FILESYSTEM`. A failed *transform* keeps the original content rather than
  replacing it with an error string, and reports `stats.transformFailures`.
- **A stage's lifecycle hooks are enforced.** `onInit`, `beforeRun` and
  `validate` failures were logged as warnings — and after a failed `validate()`
  the pipeline still called `process()` with the input it had just declared
  invalid, which makes a validator a logging function. All three are now fatal
  regardless of `continueOnError`. `afterRun` remains non-fatal, because it runs
  after the output already exists, but records a structured degradation.
- **A malformed `.copytree.yml` stops the run.** A missing auto-discovered
  profile is optional by definition; one that is present and will not parse is
  not the same thing. Warning and continuing meant every user of a repository
  silently got a selection its author had not described.
- **A `.copytree/` directory is no longer opened as a profile file.** Profile
  discovery matched the bare name `.copytree` against directory entries without
  checking they were files, so every project using the documented
  `.copytree/<name>.yml` layout hit `EISDIR` on every run — invisible only
  because a broken discovered profile was warned about and skipped. Named
  profiles in `.copytree/<name>.yml` also now resolve, which README, the docs
  index and the usage guide had all documented and no code implemented.
- **`maxBase64Size` is enforced.** The `base64` binary policy read files of any
  size and inflated them by a third, despite the ceiling being a public,
  documented, schema-validated configuration key.
- **`secretsGuard.gitleaks.*` reaches the scanner.** `binaryPath`, `configPath`,
  `extraArgs` and `logLevel` are all declared in the schema and none of them
  were passed to the adapter, so a custom Gitleaks build or ruleset was
  accepted, validated, and ignored. `maxFileBytes: 0` also now means what it
  says instead of silently becoming the 5MB default.
- **Configuration validation cannot switch itself off.** A missing or
  uncompilable `config/schema.json` used to disable validation, turning a
  packaging defect into weaker correctness; under `strict` it now raises
  `ERR_CONFIG_SCHEMA_UNAVAILABLE`. Validation also ran in no test, because
  `NODE_ENV === 'test'` disabled it — so the suite proved that invalid
  configuration was accepted.
- **`--strict` sees degradations.** It is documented as "enable every
  applicable policy-failure check" and did not read the one signal that means
  "the output is not what you requested". A degraded run now exits 3. Two
  degradations that were invisible even to that list are now recorded: a
  Gitleaks downgrade, which sat only in `stats.secretsGuard.degraded`; and
  `--git-status` outside a Git repository, which was only logged.
- **A Git status failure is no longer indistinguishable from "nothing
  changed".** `GitUtils.getFileStatuses()` answered any Git failure with `{}`,
  which the annotation path reads as every file being unmodified — so
  `--git-status` produced a document that looked exactly like a clean tree.
- **Pipeline events no longer carry file content.** `stage:start` and
  `stage:complete` emitted the entire pipeline input and output, and `scan()`
  forwards every event to an embedder's `onEvent` — so an application that
  logged events wrote unredacted credentials to its own logs while CopyTree
  reported that the export had been redacted. The events carry counts and
  metrics; the raw values moved to an opt-in `stage:debug` channel. This was
  pinned in the test suite as a known gap and is now closed.
- **Cache entries cannot collide or be read back truncated.** Cache filenames
  were the key with every unsupported character replaced by `_`, which is not
  injective: `a/b`, `a:b` and `a b` shared one file, and for the transform cache
  that means emitting one file's converted content in place of another's.
  Filenames are now a full digest, entries are written atomically, a corrupt
  entry is discarded and recomputed, and `ttl: 0` means immediate expiry rather
  than 24 hours.
- **Backpressure no longer leaks stream listeners.** Waiting on `drain` or
  `error` with `once()` leaves whichever lost the race attached, so a large
  export to a slow pipe accumulated thousands of dead handlers. One `onceAny`
  helper detaches all of them and also watches for `close`, which an aborted
  stream emits instead of `drain`.
- A cancellation raised inside a retried filesystem operation was reported as an
  ordinary I/O failure with exit code 1: it carried `code: 'ABORT_ERR'` and no
  `name`, which `isAbortError()` does not recognise.
- `--scope` entries that are themselves symlinks were rejected even under
  `--follow-symlinks`, because the option never reached the scope resolver.
- `copytree --version > file` could write an empty file: the fast path called
  `process.exit()` without waiting for a redirected stdout to flush.

### Changed — breaking
- **Public error codes come from one registry.** `FileSystemError`, `GitError`,
  `ValidationError`, `ProfileError`, `TransformError`, `PipelineError`,
  `CommandError`, `ConfigurationError` and `InstructionsError` carried bare
  strings — `GIT_ERROR`, `FILESYSTEM_ERROR` — that appeared in no registry and
  in no TypeScript union, while the documentation told consumers to switch on
  `error.code`. They now use `ERR_GIT`, `ERR_FILESYSTEM`, `ERR_VALIDATION`,
  `ERR_PROFILE_INVALID`, `ERR_TRANSFORM`, `ERR_PIPELINE_STAGE`,
  `ERR_COMMAND_FAILED`, `ERR_CONFIG_INVALID` and `ERR_INSTRUCTIONS`, all
  declared in `ERROR_CODES` and in the `ErrorCode` union. New codes:
  `ERR_PERMISSION_DENIED`, `ERR_BUDGET_ENFORCEMENT`,
  `ERR_CONFIG_SCHEMA_UNAVAILABLE` and `ERR_OUTPUT_WRITE`.
- **`error.toJSON()` no longer includes the stack.** It is what a logging
  integration and `JSON.stringify(error)` both reach for, and a stack names
  absolute paths on the machine that ran the command. `toDebugJSON()` supplies
  it on request. A configuration validation failure also no longer carries the
  entire effective configuration in `details`.
- **`config/schema.json` accepts only the values that are implemented.** The
  binary policy enum drops `load` and `omit`, which validated cleanly and then
  behaved as `placeholder`; `secretsGuard.oversizePolicy` becomes
  `exclude | scan | fail`, which is what the implementation has always branched
  on and what `SECURITY.md` has always documented — the previous
  `exclude | include | warn` meant following the security guide produced a
  config the validator rejected. An unrecognised binary policy is now reported
  rather than reinterpreted, and an unknown `--sort` key is refused rather than
  silently sorted by path.
- A `Pipeline` is immutable once it has run; `through()` throws rather than
  accepting stages it would never instantiate.

- **The package root exports 35 values instead of 47.** Extension points moved to
  `copytree/advanced`: `Pipeline`, `Stage`, `TransformerRegistry`,
  `BaseTransformer`, `ProgressTracker`, `stageIdFor`, `ExclusionReport`,
  `resolveScope`, `detectBinary`, `categorizeByExt`.
- **SDK calls are hermetic by default.** `copy()`, `scan()` and `copyStream()`
  with no `config` read only the packaged defaults — no home directory, and no
  executing `~/.copytree/*.js` inside the host process. Pass a `ConfigManager`
  to opt in. The CLI is unchanged.
- **`config()` and `configAsync()` are no longer exported.** Both were already
  deprecated.
- **`--binary convert` and the `convert` policy value were removed.** The CLI
  names the replacement.
- **The configuration schema is closed and no longer coerces types.** An unknown
  key or a wrong type is reported instead of being silently discarded.
- `ConfigManager.migrateConfig()` — a public stub that printed "not implemented
  yet" — was removed.
- `ProgressEvent` declares the fields the runtime actually emits (`phase`,
  `completed`, `total`, `item`) rather than four that were never set.
- The `alwaysInclude`, `filter` and `limit` stage identifiers were removed; they
  named stages that no longer exist.

### Added

- `npm run verify:release` — one gate covering lint, formatting, generated-document
  drift, documentation links, types, dead code, the full suite with coverage, and
  the packed tarball. `prepublishOnly` runs it.
- `npm run test:package` — packs the tarball, installs it into an empty project
  with production dependencies only, and exercises it as a consumer: ESM import,
  strict TypeScript, and CLI smoke tests. Nothing here imports by relative path.
- A buffered/chunked parity matrix across every format and option combination,
  including hostile content and non-ASCII paths.
- `docs/reference/environment.md`, replacing a `.env.example` that advertised a
  Gemini API key and an AI cache, none of which any shipped code reads.
- `docs/reference/migrating-to-1.0.md`.
- `scripts/dist-tag.js`, replacing `sort -V` in the publish workflow. GNU
  version sort is not SemVer and ranks `1.0.0-beta.1` above `1.0.0`, so the
  first stable release would have gone out under `hotfix` while a beta kept
  `latest`. Unit-tested against the cases the two disagree on.
- The npm used to publish is pinned rather than `@latest`, the publish workflow
  takes a concurrency group, and CI tests the exact declared minimum Node
  (22.12.0) alongside 22 and 24.

### Security

- Reference and output files are created with mode `0600` and unpredictable
  temporary names, rather than a fixed `<target>.partial` in a shared directory.
- Gitleaks child processes are bounded (output size, timeout, SIGTERM then
  SIGKILL) and accept an `AbortSignal`. Scanner stdout — which can contain the
  matched secret — is never interpolated into an error message.

## [0.17.0] - 2026-08-07

A performance and terminal-output release. Nothing in the selection logic or the
output formats changed: the same command over the same tree produces the same
bytes. What changed is how much a run costs before it does any work, and how much
it says about itself while doing it.

Every behaviour change here, including the ones too small to list, is recorded
with its rationale in
[docs/technical/behavior-ledger.md](docs/technical/behavior-ledger.md).

### Changed

- **A normal run now prints a progress line and a completion line, nothing
  else.** The per-stage log stream and the run summary box are behind
  `-v, --verbose`. Anything that scraped stderr for stage names or the summary
  table will find less there.
- **One reporter draws every copy run.** The Ink copy UI — which ran its own
  pipeline, resolved its own destination and wrote its own completion text — is
  gone; `src/ui/feedback` replaces it with a status vocabulary that has an ASCII
  fallback, a single message catalogue, structured completion/warning/failure
  models, and a renderer that honours `--no-color`, `--quiet` and NDJSON. Ink
  remains only for `config:validate` and `config:inspect`, which draw real
  tables.
- **stdout carries the requested document and nothing else**; everything said to
  a person goes to stderr. `--display --format json | jq` stays valid while a
  run reports progress. Pipeline stages no longer write to the terminal at all.
- **Progress names what a stage is doing, not its class** — `Discovering files`
  rather than `FileDiscoveryStage`. An unrecognised stage is de-PascalCased, so
  no class name reaches a user.
- **A successful redaction is a note naming the files, not a warning.** A warning
  is now reserved for a finding the guard could not redact, or a file it could
  not scan.
- **`-o/--output` no longer reveals the file in Finder/Explorer.** On macOS that
  launched `osascript`, woke Finder and stole focus, which makes `-o` unusable
  in a loop. Opt in with `--reveal`.
- **`--dry-run` writes nothing at all.** It previously still produced the output
  file in some paths.
- **Markdown `sha256` describes the emitted content, not the file on disk.** In
  streamed output this was a disclosure: by the time a file is streamed its
  content has been redacted, so hashing the path published the digest of the
  unredacted original next to the redacted document — enough to confirm a guess
  at the removed bytes. Buffered output was fixed alongside it. Digests for
  unredacted, untransformed files are unchanged.
- **Streamed output carries the format version** that buffered output has always
  carried. A streamed document was previously indistinguishable from an
  unversioned one.
- **File ordering is pinned rather than taken from the host's ICU.** Ordering
  decides which files survive a budget, so the same command could select
  differently across Node versions or on a small-ICU build. Printable-ASCII
  paths now compare against a frozen weight table derived from
  `Intl.Collator`, verified against it for every character pair and 500,000
  random strings; non-ASCII paths still defer to a real collator. No ordering
  changes on a full-ICU platform — it simply can no longer drift underneath a
  release.
- **`colorize: 'always'` into a pipe now actually colours.** Chalk's own
  detection ran before the logger's policy could ask, so an explicit request
  for colour into a pipe or a file produced none.
- **`stats.secretsGuard.scanner` reports `none` when nothing was scanned.** It
  reported `builtin` even for runs where no file ever reached a scanner, which
  named a scanner for protection applied to nothing.
- **Gitleaks stops after an operational failure.** A missing config or an
  incompatible binary fails identically for every file; CopyTree retried per
  file and logged a warning each time. It is now reported once and the run
  finishes on the built-in scanner. Findings are unchanged.
- **`stage:complete` carries `memoryUsage: null`** unless `--profile` asked for
  it.
- **Programmatic results are no longer re-sorted after `SortFilesStage`**, which
  had been quietly overriding the stage that owns the order.
- **`InstructionsStage.validate()` is a no-op**; a named instructions set that
  cannot be loaded now fails from `process()`. The user-visible result is
  unchanged — `--instructions nope` still fails — but `validate()` and
  `process()` used to disagree for this case and only `validate()`'s answer ever
  reached anyone.

### Fixed

- **Progress never reached the UI.** `usePipeline` registered its listeners in a
  `useEffect` that read `pipelineRef.current` on the render where it was still
  null, and setting a ref triggers no re-render, so nothing was ever attached.
- **UI chrome interleaved with the document under `--display`** once those
  listeners worked. The display destination now renders only the trailing
  completion line.
- **A streamed `--output` to a bad path** produced an uncaught error, or a file
  truncated during stage assembly. The file is opened in the stage that writes
  it, after the format is validated and with its error listener attached.
- **`--changed <bad-ref>` returned the whole repository unfiltered and exited
  0.** A stage that failed and carried on is now reported.
- **A denied clipboard permission reported a copy that never happened.**
  `osascript`'s exit status is checked, and a failure falls back to text.
- **Branch names containing slashes broke GitHub URLs** — `feature/x/y` was cut
  to `feature`. URL parsing moved to the `URL` class, the branch/subpath split
  is resolved against real refs by longest match, and `.git` suffixes, trailing
  slashes, query strings and percent-encoded paths are handled. Git invocations
  use `execFileSync` with argv arrays so nothing from a URL reaches a shell,
  paths are checked for traversal and symlinked-root escape before any disk
  access, tag refs work, `/blob/` URLs are rejected with an actionable message,
  and the cache updates via fetch+reset so a force-pushed remote cannot leave a
  stale "up to date" cache.
- **The GitHub cache-key separator was a literal NUL byte in the source**, which
  made git treat the file as binary and cost diffs, blame and merges. Written as
  `'\0'` the hash input is byte-identical, so cache keys are unchanged.
- Resolved the `brace-expansion` (GHSA-rgw5-rvv9-x895), `fast-uri`
  (GHSA-7p8r-x3mc-p8w7) and `js-yaml` (GHSA-5p4m-2wfm-xmqj) advisories.

### Performance

Interactive runs are 18–22% faster end to end — `--version` 51→33 ms, 100 files
119→93 ms, this repository 143→118 ms — with 1,000 files 12% faster and 10,000
files 4%. Output was compared byte-for-byte against the previous release across
36 format and flag combinations, all six sort keys, six selection modes, and
1,000- and 10,000-file projects.

- **Four dependencies left the invocation path.** lodash (6.8 ms), fs-extra
  (6.3 ms) and chalk (4.7 ms) are replaced by `config/objectUtils.js`,
  `src/utils/fsx.js` and `src/utils/ansi.js`, each covering only what CopyTree
  uses and each pinned to the original by an equivalence test suite. `fsx`
  promisifies the callback `fs` API rather than using `node:fs/promises`, which
  is roughly twice as slow on `stat`.
- **ICU stays off the startup path** via `src/utils/collation.js`, which also
  produces the ordering guarantee described above.
- **Feature-only modules load only when a run needs them**: js-yaml, the GitHub
  handler, the clipboard, the profiler, the parallel walker, and the three
  unselected formatters. `--version` is answered before Commander is built.
- **The pipeline stopped rebuilding what it was handed.** It was constructing a
  second `ConfigManager` and repeating the whole load — schema compile, default
  module imports, deep clones, merge, validate — on every run.
- **The transformer registry is built only when the selection needs it**, so an
  ordinary source copy never imports the transformation subsystem or hashes a
  cache key per file for a no-op transformer.
- **Schema validation is skipped entirely when no user config file or env
  override contributed**; ajv and ajv-formats load lazily.
- **Repeated probing is gone**: one `readdir` for folder profiles instead of
  twelve `pathExists` calls, one instructions load instead of four probes, three
  integers passed to the walker instead of a deep clone of all configuration,
  Gitleaks arguments resolved once per adapter instead of once per file, one
  `package.json` read, and discovery's include matchers compiled once instead of
  reparsed per file.

### Removed

- `xmlbuilder2` and `ink-spinner` are no longer dependencies; nothing imported
  either. A production install goes from 135 packages to 128.
- Dead modules `src/utils/performance.js` and `src/ui/hooks/useInk.js`, both
  published in the tarball and reached by nothing.
- The unreachable `profile:validate` path in `ValidationView`, which
  dynamically imported a module that does not exist.

### Infrastructure

- `npm run knip` reports anything the module graph never arrives at, so an
  unused dependency is a failed check rather than something noticed later.
- `npm run benchmark:latency` measures cold CLI latency — shell to prompt,
  including Node startup — across six scenarios against per-scenario budgets,
  reporting median and MAD and labelling deltas below the noise floor as such.
- `npm run benchmark:latency-ab` compares two checkouts in interleaved pairs, so
  load shared by both cancels out of the difference. The single-checkout harness
  cannot produce a trustworthy number on a busy machine.

## [0.16.0] - 2026-07-25

Skips 0.15.0, which was published to npm in error on 2026-02-26 and cannot be
reused. Nothing in this release relates to that version.

Breaking changes are listed first. Every behaviour change here, including the
ones too small to list, is recorded with its rationale in
[docs/technical/behavior-ledger.md](docs/technical/behavior-ledger.md).

### Breaking

- **Node.js 22.12 or newer is required** (`engines.node`). An install-time break
  for Node 20 hosts and for Electron builds on older runtimes.
- **The CLI writes a file reference by default.** `copytree` with no flags used
  to copy the whole formatted document to the clipboard; it now writes a temp
  file and copies that path. Use `-y` / `--clipboard` for the old behaviour.
  `-r` / `--as-reference` is accepted and now does nothing.
- **Secret scanning runs on the programmatic API.** `scan()`, `copy()` and
  `copyStream()` previously did no redaction at all. Callers that relied on raw
  file content will see redacted spans; opt out with `secretsGuard: false`.
- **Some pipeline stages are fatal.** Discovery, file loading, secret scanning
  and output formatting now propagate errors instead of being skipped, so a run
  that previously returned a successful-looking partial result now throws.
- **Output formatting no longer downgrades on failure.** A failed XML format
  used to return a JSON blob of raw files.
- **The programmatic API no longer writes to the terminal.** Stage messages are
  delivered as `stage:log` events via `onEvent`. Pass `quiet: false` to restore.
- **`stats.secretsGuard` changed shape** and is now actually populated. It was
  declared as `{ detected, redacted, report }` and never set.
- **Deduplication uses SHA-256** rather than MD5, and no longer treats binary
  placeholders as content, so `--dedupe` stops collapsing all binaries into one.
- **Sort order is a total order under a pinned locale**, which changes which
  files survive a budget for names differing only by case.

### Added

- **Scoped copy** - `--scope <path...>` / `scope` copies only the named paths,
  using literal paths rather than globs, with ignore rules still resolving from
  the repository root and output paths still root-relative. Traversal starts at
  the selection, so cost scales with what was asked for. `--scope-include-ignored`
  lifts the ignore rules blocking a selection.
- **Budgets that bind** - `--max-total-size`, `--max-files` and `--size-gate`,
  applied after sorting in a defined order, with truncation always reported
  (`stats.truncated`, `truncatedBy`, `truncatedCount`) rather than silent.
- **Exclusion accounting** - `stats.excluded` answers "what didn't make it, and
  why" by stable reason key. `--explain` adds the matched rule and the ignore
  file and line it came from.
- **Manifest** - `result.manifest` gives a lightweight per-file view carrying
  `path`, `size`, `modified` and an `outcome`, never content, so it is safe to
  retain in a long-lived process and to drive a preview from.
- **Output format versioning** - `result.outputFormatVersion`
  (e.g. `copytree-xml@1`), so a downstream prompt can detect a format change.
- **Token and size estimates** - `stats.estimatedTokens` and
  `estimatedOutputChars`, measured on a real run and estimated on a dry run.
- `--scope-include-config-excluded` / `scopeIgnoresConfigExcludes`, to let a
  `--scope` entry reach a config-excluded directory such as `node_modules`.
  `.git` is excluded by a layer no option lifts.
- `PROVIDER_TOKEN` detection for published credential prefixes (GitHub, Stripe,
  GitLab, Slack, Google, Anthropic, OpenAI, SendGrid, npm).
- `secretsGuard.oversizePolicy`, choosing between excluding, scanning, or
  failing on a file too large to scan.
- Exclusion accounting reasons `secretFile`, `secretUnscannable` and
  `symlinkEscape`.

### Changed

- **Startup and hot-path performance** - `Intl.Collator` instances are hoisted
  rather than built per comparison, binaries are classified from a single read
  instead of a separate `stat` and `read`, file-loading concurrency is bounded,
  per-file config lookups are lifted out of formatter loops, `ConfigManager.get`
  has a fast path, and the CLI loads its Ink UI only when it renders.
- **Security: `simple-git` 3.31.1 to 3.36.0**, clearing a critical RCE advisory
  (GHSA-hffm-xvc3-vprc and two related). `npm audit --omit=dev` reports zero
  vulnerabilities; remaining findings are dev-only.

### Fixed

- **Secret redaction no longer destroys source code.** The generic rules matched
  from the keyword onward, so `const token = payload.token.trim();` became
  `const ***REDACTED***);`. Detection now reports the credential's own span, and
  a match has to look like a credential rather than sit next to the word
  "token".
- **A `.ts` file containing a literal NUL byte is no longer treated as binary.**
  `NEVER_BINARY` protected the extension lookup but not the content sniffer.
- **A dry run selects exactly what the real run selects.** The secrets guard was
  skipped without content, so its exclusions were missing from the preview.
- `copy()` no longer drops `stage` from progress callbacks, and no longer
  swallows a caller-supplied `onSummary`.
- `--secrets-report` writes a report. It read a field nothing ever set.
- `stage:log` events are emitted. The pipeline never set the back-reference
  `Stage.log()` guards on, so the event had never fired.
- Budget and character-limit detail reaches `CopyResult.stats`.
- Symlinks are contained within the real repository root when following is
  enabled, and directory cycles terminate.
- `ConfigManager.reload()` reloads instead of emptying the instance.
- XML attributes and text nodes are escaped, so a file named `a&b.js` no longer
  produces a document a strict parser rejects.
- `format()` honours the operation's own configuration rather than the
  process-wide singleton.
- The version reported by `--version` comes from CopyTree's own `package.json`
  rather than the current working directory's.
- `charLimit: 0` is honoured as a budget instead of being promoted to the 2M
  default.
- `npm run test:integration` runs integration tests rather than the whole suite.
- Caller `--exclude` patterns now win over gitignore negations, so an explicit
  exclusion cannot be re-included by a rule in the repository.
- `.git` is unreachable by any option, including a `!.git/` negation in an ignore
  file and an `--always '.git/**'` force-include.
- A private key's body is redacted, not just its `-----BEGIN-----` header.
- Secret-prone filenames (`id_rsa`, `*.pem`, `.env`) are excluded at any depth,
  not only at the repository root.
- Credentials named `db_password`, `stripe_api_key` and similar are detected;
  `_` is a word character, so the previous word-boundary anchoring missed them.
- JWTs are no longer discarded as reference paths, and Stripe publishable keys
  (`pk_live_*`) are no longer redacted.
- A short source file containing a NUL byte is not misclassified as binary.
- Non-text content is excluded rather than crashing the run with a `TypeError`.
- `--dedupe` no longer drops files that differ only in their redacted secrets.

### Infrastructure

- Migrate to ESLint 10 and TypeScript 7. ESLint 10's recommended set enabled
  `no-useless-assignment` and `preserve-caught-error`, which surfaced eight real
  findings; the dead `.eslintrc.json` is removed, and `tests/types/tsconfig.json`
  resolves its path mapping relative to itself now that `baseUrl` is gone.
- Rework the benchmark harness into a modular suite (`tests/performance/bench.js`
  plus `lib/` modules and declared scenarios), documented in
  `docs/technical/benchmarking.md`, with `benchmark:all`, `benchmark:fixtures`
  and `benchmark:compare` scripts.
- Upgrade dependencies, drop the unused `inquirer`, and bump GitHub Actions to
  current majors.
- Add real, unit and e2e coverage for the new stages and utilities; the suite is
  1554 tests across 98 suites with coverage thresholds enforced.
- Record every intentional behaviour change, with rationale, in
  `docs/technical/behavior-ledger.md`.

## [0.14.2] - 2026-02-27

### Infrastructure
- Add `ignore` package as explicit dependency
- Remove website webhook notification from publish workflow

## [0.14.1] - 2026-02-26

### Fixed
- Expose `formatBytes` utility to all format helpers (XML, JSON, Markdown, tree) so formatters can render human-readable file sizes

### Infrastructure
- Add release command and update CLAUDE.md release docs

## [0.14.0] - 2026-02-26

### Major Changes
- **Programmatic Node.js API** - New `copy()` and `scan()` functions for library usage, with `onProgress` callbacks and `manifest` field on results
- **Streaming Copy API** - `copyStream()` for memory-efficient processing of large outputs
- **Electron Integration** - CopyTree now works in Electron ≥28 main processes for desktop apps
- **Folder-Level Profiles** - New `.copytree.yml`/`.copytree.json` profile configuration system replacing legacy profiles
- **NDJSON & SARIF Output Formats** - Two new output formats for CI integration and static analysis tooling
- **Built-in Secret Detection** - Multi-engine secret detection and redaction with comprehensive pattern coverage
- **Structured Logging** - Configurable log levels and formats for better debugging and observability
- **Convenience Filter Flags** - New `--ext`, `--max-depth`, `--min-size`, `--max-size` CLI flags for quick filtering

### Added
- **Parallel File Discovery** - Bounded concurrency for faster file discovery on large codebases
- **Resilient Filesystem I/O** - Automatic retry logic for transient filesystem errors
- **CPU/Heap Profiling Harness** - Built-in `--profile` flag for performance diagnostics
- **Performance Budget Enforcement** - Nightly CI benchmarks with regression detection
- **Layered `.copytreeignore`** - Gitignore-semantics ignore files with directory-level scoping
- **Token Optimization** - Config lazy-loading and reduced overhead for faster startup
- **Improved Temp File Naming** - Project directory context in temporary file names for easier debugging

### Breaking Changes
- **Removed environment variable support** - `.env` files and `COPYTREE_*` env vars are no longer read for configuration
- **Removed legacy profile system** - Framework-specific profiles and auto-detection removed; use folder-level `.copytree.yml` instead
- **Removed singleton ConfigManager** - ConfigManager is now instantiated per-operation for safe concurrent usage
- **Removed `install:copytree` command** - Deprecated command has been removed
- **Removed remaining AI feature remnants** - All AI provider infrastructure fully purged from codebase

### Fixed
- **Security: ReDoS vulnerability** - Updated minimatch to 10.2.4 to resolve Regular Expression Denial of Service
- **Security: Shell injection** - Fixed clipboard operations on macOS/Linux that were vulnerable to shell injection
- **Windows Compatibility** - Case-insensitive glob matching, CRLF normalization, proper `SIGKILL` handling, JSON streaming path escaping
- **POSIX Path Normalization** - All `file.path` values now consistently use forward slashes across the entire pipeline
- **Stale Ignore Rule Cache** - Fixed default rule cache that caused stale rules in long-running processes
- **XML Control Characters** - Sanitize invalid control characters in XML output
- **Clipboard Windows Escaping** - Fixed clipboard copy failures on Windows due to improper escaping

### Infrastructure
- **OIDC Trusted Publishing** - NPM publishing now uses OIDC tokens via `publish.yml` workflow (no secrets)
- **Comprehensive E2E Golden File Tests** - 21 test cases covering all output formats, flags, streaming, and error handling
- **Major Dependency Upgrades** - React 19, Ink 6, Chalk 5, Ora 9, Inquirer 13, actions/checkout v6

### Technical Improvements
- **1105 passing tests** across 74 test suites with cross-platform determinism
- **Documentation overhaul** - Comprehensive docs rewrite for accuracy and consistency
- **Memory optimization** - Reduced memory usage in formatters and utilities
- **Simplified codebase** - Removed advanced/unused features for maintainability

## [0.13.1] - 2025-10-29

### Fixed
- **Critical**: Remove remaining AIProviderError import in TransformStage.js that caused runtime error
- Remove AIProviderError from recoverable error types list

## [0.13.0] - 2025-10-29

### Major Changes
- **Removed AI Provider Integration** - Simplified codebase by removing AI provider infrastructure and dependencies
- **Enhanced Binary File Handling** - Implemented magic number detection for accurate binary file identification
- **Comprehensive Force-Include System** - Added `.copytreeinclude` file support for forcing inclusion of specific files
- **Improved Testing Infrastructure** - Established comprehensive test suites with helpers and utilities

### Added
- **Structured Documentation System** - New task-based documentation with groups and sections for better organization
- **Binary File Detection** - Magic number-based detection for accurate binary file identification
- **Force-Include Mechanism** - `.copytreeinclude` file support with highest precedence in file selection
- **Testing Infrastructure** - Comprehensive test helpers including determinism utilities, fixtures management, and pipeline testing utilities
- **Golden File Testing** - Regression testing infrastructure with normalized output comparison

### Removed
- **AI Provider System** - Removed BaseProvider.js and all AI provider infrastructure
- **AI Configuration** - Removed AI-specific configuration sections and validation
- **AI Error Handling** - Removed AIProviderError and ProviderError classes from error system

### Enhanced
- **Documentation Structure** - Refactored documentation for improved clarity and accuracy across all guides
- **README Simplification** - Streamlined README by removing AI-specific sections and focusing on core features
- **Installation Guide** - Simplified setup process by removing AI provider configuration steps
- **Troubleshooting Guide** - Removed AI-related error sections and focused on core functionality issues
- **Pipeline Event Tests** - Improved pipeline event contract validation and testing infrastructure

### Fixed
- **File Count Accuracy** - Corrected file count calculation by excluding null placeholders
- **Code Quality Issues** - Resolved linting and formatting issues across the codebase
- **Pipeline Event Contracts** - Fixed event emission validation in pipeline tests
- **Binary File Exclusion** - Improved binary file detection and exclusion logic

### Technical Improvements
- **Dependency Updates** - Upgraded project dependencies to latest stable versions
- **Test Coverage** - Added comprehensive unit, integration, and e2e test suites
- **Documentation Organization** - Restructured documentation with better grouping and navigation
- **Code Consistency** - Applied consistent formatting and linting across entire codebase

## [0.12.0] - 2025-08-29

### Major Changes
- **Markdown Output Format** - Set markdown as the new default output format with comprehensive formatting support
- **Enhanced Output Formatting** - Improved markdown and XML output formatting with proper namespace and CDATA wrapping
- **Comprehensive Testing** - Added extensive unit tests for GitUtils and UnitTestSummaryTransformer

### Added
- **Markdown Formatter** - New MarkdownFormatter with comprehensive file structure and content formatting
- **Enhanced File Extension Handling** - Improved detection and handling of various file types in markdown output
- **GitUtils Unit Tests** - Complete test coverage for Git utility functions
- **UnitTestSummaryTransformer Tests** - Comprehensive testing for unit test summary generation
- **Claude Code Release Command** - Added automated release process command for GitFlow workflows

### Enhanced
- **XML Output Formatting** - Improved XML output with proper namespace declarations and CDATA section handling
- **Markdown Output Structure** - Better organization and readability of markdown formatted output
- **File Extension Detection** - More accurate file type identification for appropriate formatting
- **Release Process** - Streamlined GitFlow release workflow with automated version management

### Fixed
- **Path Validation** - Removed overly restrictive path validation that blocked directories with hyphens
- **XML Formatting Issues** - Resolved XML output formatting problems with proper escaping and structure
- **Code Formatting** - Applied consistent code formatting across the entire codebase

### Technical Improvements
- **Output Pipeline Refactoring** - Significant improvements to output formatting pipeline architecture
- **Formatter Abstraction** - Better separation of concerns between XML and Markdown formatters  
- **Test Coverage Expansion** - Increased test coverage for critical utility functions and transformers
- **GitFlow Integration** - Enhanced release management with proper GitFlow branching strategies

## [0.11.0] - 2025-08-05

### Major Changes
- **Comprehensive Architecture Improvements** - Enhanced pipeline system with improved validation and error handling
- **JSON Schema Validation System** - Added robust configuration validation with detailed error reporting
- **Performance Monitoring & Budgets** - Implemented performance tracking, budgets, and telemetry system
- **Enhanced Error Handling** - New custom error classes with detailed context and recovery mechanisms

### Added
- **JSON Schema Configuration** - Complete schema validation for all configuration options
- **Performance Budget System** - Automatic performance monitoring with grade calculations (A-F)
- **Performance Telemetry** - Session recording and insights for optimization recommendations
- **Enhanced Pipeline Architecture** - 16+ specialized processing stages with lifecycle hooks
- **Advanced Transformer Registry** - Trait-based system with conflict detection and optimization
- **Config Inspector UI** - New UI component for configuration debugging and validation
- **Memory Usage Monitoring** - Real-time memory tracking and optimization suggestions
- **Stage-Level Performance Tracking** - Detailed timing and resource usage per pipeline stage

### Enhanced
- **AIService Architecture** - Improved singleton pattern with better error handling and caching
- **Pipeline Stage System** - Enhanced event emission and error recovery capabilities
- **Configuration Management** - Hierarchical configuration with environment variable support
- **Test Suite Coverage** - Complete ES module conversion with 496+ passing tests
- **Documentation System** - New technical architecture documentation and transformer guides

### Fixed
- **Pipeline Error Recovery** - Improved graceful degradation and error boundary handling
- **Memory Leak Prevention** - Better resource cleanup and garbage collection
- **Configuration Validation** - Comprehensive validation with clear error messages
- **Transform Stage Optimization** - Enhanced file processing efficiency and memory usage

### Technical Improvements
- **Transformer Traits System** - Advanced transformer compatibility and ordering
- **Event-Driven Pipeline** - Enhanced event emission throughout processing lifecycle
- **Performance Optimization** - Throughput calculations and bottleneck identification
- **Error Context Enrichment** - Detailed error information with recovery suggestions

## [0.10.0] - 2025-08-04

### Major Changes
- **Complete ESM Migration** - Migrated entire codebase from CommonJS to ECMAScript Modules
- **Node.js 18+ Support** - Updated minimum requirement to Node.js >=18.0.0 with compatibility for versions 18-24
- **Enhanced Cross-Platform Support** - Improved Windows and Linux clipboard and file operations

### Breaking Changes
- Converted all modules from CommonJS `require/module.exports` to ESM `import/export` syntax
- Added `.js` extensions to all relative imports for ESM compliance
- Updated package.json to use `"type": "module"`

### Added
- Dynamic ESM import compatibility for UI components
- PowerShell integration for Windows file operations
- ESM-compatible test configurations

### Fixed
- **Critical**: Resolved copy command hanging issues on Node.js 18-22
- **Critical**: Fixed React/Ink component loading timing problems
- ESLint v9 compatibility with 2950+ auto-fixed formatting issues
- Clipboardy ESM compatibility with dynamic imports

### Removed
- Deprecated ESM loader that caused `globalPreload` warnings
- Legacy CommonJS compatibility shims

## [0.9.1] - 2025-08-01

### Added
- **Custom instructions system** for AI analysis with `--instructions` and `--no-instructions` CLI options
- **InstructionsStage** pipeline stage to load instructions from user or app directories
- **InstructionsLoader** service with caching and validation
- **@ prefix** for all file paths in XML output for improved clarity
- **ct:instructions** metadata in XML/JSON output with usage guidance
- Default instructions template with enhanced guidance for AI consumption

### Changed
- **Simplified profile system** - Removed framework-specific profile auto-detection
- **ProfileGuesser** now always returns default profile instead of detecting project types
- **Default profile only** - All projects now use the default profile unless explicitly specified
- Updated CLI help text to reflect default profile behavior
- Improved instructions template with directory pattern guidance

### Removed
- **Framework auto-detection** logic for Laravel, React, SvelteKit profiles
- **Laravel and SvelteKit profile YAML files** and related documentation
- **builtin-profiles.md** documentation for removed framework profiles

### Technical
- Restructured instructions template in `src/templates/` directory
- Enhanced integration tests for simplified profile system
- Updated documentation to reflect single default profile approach
- Added `jest.integration.config.js` for improved test configuration

## [0.9.0] - 2025-07-29

### Initial Release

CopyTree is a sophisticated CLI tool for intelligently copying and transforming project structures for AI consumption.

#### Features

- **Intelligent file selection** using profiles with auto-detection for 14+ project types
- **15+ file transformers** for PDFs, images, code, and documents
- **Deep Git integration** for tracking changes and modifications
- **External sources** support (GitHub repositories)
- **AI-powered transformations** with Google Gemini integration
- **Event-driven pipeline** with 16 specialized processing stages
- **Memory-efficient streaming** for large files
- **Comprehensive CLI** with intuitive commands and options
- **Multiple output formats** (XML, JSON, clipboard, file)
- **Default profile only** - Framework auto-detection removed, uses default profile for all projects
- **Caching system** for AI responses and transformations
- **Error recovery** and graceful degradation

#### Technical Highlights

- CommonJS modules with async/await patterns
- Comprehensive test suite with unit and integration tests
- Performance optimized for projects with 10,000+ files
- Memory usage under 500MB for large projects
- Support for projects up to 100MB total size