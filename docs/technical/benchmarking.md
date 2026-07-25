# Benchmarking Guide

CopyTree's benchmark suite lives in `tests/performance/`. It exists to answer a
narrower question than "is CopyTree faster?": **which phase changed, under what
workload, by how much, at what memory cost, and without changing what CopyTree
produced.**

## Quick start

```bash
npm run benchmark              # the pull-request scorecard (11 scenarios)
npm run benchmark:all          # every scenario
npm run benchmark:fixtures     # generate fixtures only, then exit

node tests/performance/bench.js --filter DISC          # one domain
node tests/performance/bench.js --all --out after.json # save results
node tests/performance/bench.js --compare before.json after.json
```

Fixtures are cached under `$TMPDIR/copytree-bench-fixtures` (override with
`COPYTREE_BENCH_FIXTURES`). First run generates roughly 130 MB across eight
fixtures in under ten seconds; later runs reuse them. `--clean` removes them.

## Design decisions that matter

### Every scenario runs in its own process

Sharing one process across scenarios looked cheaper and was not. A scenario that
holds 50,000 file objects leaves the heap large and fragmented, and every
scenario after it pays for that in collection time. Measured end to end, the
full-copy scenario reported **1.4 s alone and 7.4 s when it ran last** in a
shared process. Process isolation is what makes a scenario's number a property
of the scenario rather than of its position in the list.

Use `--in-process` when debugging a single scenario, never for real numbers.

### Fixtures are seeded, not random

Every fixture is a pure function of its spec and a fixed seed, so a baseline run
and a candidate run measure byte-identical trees. Fixtures are keyed by a hash
of their spec: change the spec and it regenerates, re-run the same spec and it is
reused.

### Correctness is checked, not assumed

Every scenario returns a fingerprint alongside its timing: the ordered manifest
hash, selected file count, selected bytes, and where output is produced, a
normalized output hash. `--compare` flags any scenario whose fingerprint moved
and refuses to present it as a speedup.

This is the guard that matters. The easiest way to make a benchmark faster is to
make it do less work, and a wall-clock number alone cannot tell the difference.

A scenario whose own fingerprint varies between identical runs is reported as
`unstable` rather than quietly averaged.

### Memory is reported as growth, not as peak

RSS is a process high-water mark that never falls back, so the absolute peak of a
late scenario is really the peak of everything that ran before it. The harness
records RSS at scenario start and reports growth above that line. Peak heap and
GC pause time are collected alongside, because an allocation-driven slowdown and
an algorithmic one look identical in a wall-clock number.

### Profiling is not wired into timing runs

CPU profiles, heap snapshots, and filesystem tracing all perturb the run they
measure. The ordinary benchmark establishes *where* something changed;
`npm run profile:cpu` is used afterwards to explain *why*.

## The performance model

Scenarios are grouped by the domain they isolate:

| Domain | IDs | What it answers |
| --- | --- | --- |
| Startup | `START-*` | How long before CopyTree can begin useful work? |
| Discovery | `DISC-*` | How does traversal scale with files, depth, ignore rules, and scope? |
| Selection | `SELECT-*` | What do sorting and budgets cost as the selection grows? |
| Loading | `LOAD-*` | How many reads and bytes does content loading actually require? |
| Formatting | `FMT-*` | How does each formatter scale with file count and content size? |
| Streaming | `STRM-*` | How quickly does the first byte arrive, and is memory bounded? |
| End-to-end | `E2E-*` | What does a representative real operation cost? |

Formatter scenarios load their files during setup, so the measured region
contains no disk I/O. A formatter that looks fast because discovery was slow is
not a useful measurement.

## Fixtures

| Fixture | Shape | Exercises |
| --- | --- | --- |
| `empty` | Empty directory | Startup and configuration with no traversal to hide behind |
| `tiny-100` | 100 × 1 KB | The common interactive case, latency-dominated |
| `flat-10k` | 10,000 files, one directory | `readdir` and entry sorting |
| `balanced-10k` | 10,000 files, realistic tree | The general discovery baseline |
| `deep-10k` | 10,000 files, depth 20, `.gitignore` per level | Ignore-layer stack scaling |
| `pruned-50k` | 50,000 files, 90% under ignored subtrees | Directory pruning |
| `scope-50k` | 50,000 files, 100-file target subtree | Scoped traversal |
| `text-50mb` | 500 × 100 KB | Bytes rather than entries |

## Statistics

Results report median, p95, min, max, median absolute deviation, and coefficient
of variation. Median rather than mean: one scheduling hiccup moves a mean and
leaves a median alone.

Outliers are reported, never dropped. A scenario whose CV sits above roughly 10%
is too noisy to gate on and should be fixed or demoted rather than filtered until
it passes.

## Comparing revisions

Run the baseline and the candidate **on the same machine**:

```bash
git checkout main
node tests/performance/bench.js --all --label base --out base.json

git checkout my-branch
node tests/performance/bench.js --all --label head --out head.json

node tests/performance/bench.js --compare base.json head.json
```

`compare` refuses to treat a run as comparable when the CPU model or Node version
differ, and says so at the top of its output.

## Results format

Each run is a versioned JSON document (`copytree-bench@1`) recording the
environment, the fixture descriptor, every raw sample, the summary statistics,
and the correctness fingerprint. Raw samples are kept so a distribution can be
re-examined without re-running the suite.

## Related

- [Architecture Guide](./architecture.md) — the pipeline these scenarios measure
- [Testing Strategy](./testing-strategy.md) — correctness testing
