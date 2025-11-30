# CopyTree — Project Constitution for Claude Code

Rules and constraints for working with CopyTree. Keep this file lean; detailed docs live in `@docs/`.

## Stack & Boundaries

- **Node.js ≥20.0.0**, **ES Modules only** (no CommonJS)
- CopyTree: CLI for AI-ready project exports via event-driven pipeline
- Tech: Commander.js, Ink (React for terminal), Jest+Babel

<critical_notes>
**MUST:**
- Use ESM exclusively (`import`/`export`). Never `require()`/`module.exports`.
- Respect file/size limits; auto-stream files >10MB; avoid heavy transformers unless requested.
- Use custom error classes from `@src/utils/errors.js` and central logger service.
- Follow Git Flow: develop → feature/* → develop → release/* → main.
- Achieve 80% test coverage (global threshold).

**NEVER:**
- **COMMIT CODE WITHOUT EXPLICIT USER PERMISSION** - Always ask first, even if tests pass!
- Commit directly to `main` or `develop` without explicit user request.
- Auto-generate commits or CHANGELOG entries (except on release/* branch when asked).
- Leave TODOs, mocks, stubs, or partial implementations in final code.
- Touch generated/vendor/lock files or Git metadata.
- **Create documentation files in the project root** (README.md, *.md reports, etc.) - Use `@docs/` instead.
</critical_notes>

## Commands (Daily Use)

```bash
# Development
npm install              # Install dependencies
npm link                 # Link CLI locally
npm start               # Run CLI

# Testing (REQUIRED before commits)
npm test                # All tests
npm run test:coverage   # Coverage report (80% threshold)
npm run test:unit       # Unit tests only

# Code Quality (REQUIRED before commits)
npm run lint            # ESLint check
npm run format:check    # Prettier check
npm run format          # Auto-format code (use when formatting is requested)

# Debugging
DEBUG=copytree:* copytree        # Verbose logging
copytree config:validate         # Check config
```

<paved_path>
## Canonical Workflows (The Happy Path)

### Add a New Transformer
1. Create class in `@src/transforms/transformers/`, extend `BaseTransformer`
2. Define traits: `inputTypes`, `outputTypes`, `heavy`, `idempotent`
3. Implement `async transform(file)` method
4. Register in `@src/transforms/TransformerRegistry.js`
5. Add tests in `@tests/unit/transformers/`
6. Run `npm run test:coverage` (must pass 80%)

### Add a New Pipeline Stage
1. Create class in `@src/pipeline/stages/`, extend `Stage`
2. Implement `async process(input)` + lifecycle hooks (`onInit`, `beforeRun`, `afterRun`, `handleError`)
3. Emit events: `stage:start`, `stage:complete`, `stage:error`, `file:batch`
4. Insert in pipeline order (see `@docs/technical/architecture.md`)
5. Add tests in `@tests/unit/pipeline/stages/`
6. Update `@docs/technical/architecture.md`
7. Run `npm run test:coverage` (must pass 80%)

### Diagnose Slow/Large Runs
1. Use git filters first: `--modified`, `--changed <ref>`
2. Enable streaming: `--stream` or `-S`
3. Set limits: `--head N`
4. Check cache: `copytree cache:clear` if stale
5. Profile with: `DEBUG=copytree:* copytree --dry-run`
</paved_path>

## Review Checklist (Read Before Submitting)

Before finishing any code changes, verify:

1. ✅ **ESM only** - No `require()` or `module.exports`
2. ✅ **Tests pass** - `npm test` succeeds, coverage ≥80%
3. ✅ **Linting clean** - `npm run lint` and `npm run format:check` pass
4. ✅ **No partial code** - No TODOs, mocks, stubs, or placeholders
5. ✅ **Git Flow followed** - Correct branch type, no direct commits to main/develop
6. ✅ **Docs updated** - If public API changed, update relevant `@docs/` files

## Issue Prioritization

When creating or triaging issues, assign priority labels using `gh issue edit <number> --add-label "priority-X"`:

**Priority Labels:**
- `priority-0 🔥` - Production outage, security incident, data loss. **Immediate response required.**
- `priority-1 ⏱️` - High impact or blocks quality work. Flaky tests, critical test gaps, user-facing bugs with no workaround.
- `priority-2 ⚙️` - Planned work. Quality improvements, feature additions, security enhancements, code cleanup.
- `priority-3 🌿` - Low impact polish. Documentation improvements, UX enhancements, nice-to-have features.
- `untriaged ❓` - Needs review and prioritization.

**CopyTree-Specific Guidelines:**
- **Priority-1**: Test flakiness, missing E2E tests, user docs showing removed features, CI/CD reliability issues
- **Priority-2**: Performance infrastructure, transformer additions, profile system improvements, secrets detection
- **Priority-3**: CLI help parity, release workflow polish, UI formatting improvements
- **Always Priority-1**: Issues that block expanding test coverage or undermine existing tests

**Before Assigning:**
1. Consider impact on users vs developers
2. Check if it blocks other work (test infrastructure blocks quality improvements)
3. Identify relationships/dependencies between issues
4. Prioritize fixing broken things over adding new things

## Prompting Patterns (For Users)

Increase adherence by starting sessions with:
- "Review `@CLAUDE.md` before proceeding with this task."
- "Follow the paved path for [transformer/stage/etc.] and confirm each step."
- "Run through the Review Checklist and report pass/fail for each item."

## Key Architecture (Details in Docs)

- **Pipeline**: Event-driven stages, streaming >10MB (`@src/pipeline/Pipeline.js`, `@docs/technical/architecture.md`)
- **Configuration**: Hierarchical (CLI > env > project > user > default) (`@src/config/ConfigManager.js`, `@config/schema.json`)
- **Profiles**: YAML-based file selection (`@src/config/FolderProfileLoader.js`)
- **Transformers**: File processors with traits system (`@src/transforms/transformers/`)
- **Commands**: Core CLI commands (`@bin/copytree.js`): copy, config:validate, config:inspect, cache:clear

## Critical Files

- `bin/copytree.js` - CLI entry
- `src/pipeline/Pipeline.js` - Pipeline orchestration
- `src/pipeline/Stage.js` - Stage base class
- `src/config/ConfigManager.js` - Config system
- `src/config/FolderProfileLoader.js` - Profile loading
- `src/transforms/TransformerRegistry.js` - Transformer registry
- `src/utils/errors.js` - Custom errors

## Error Handling Rules

**Use Custom Errors** (`@src/utils/errors.js`):
`CommandError`, `FileSystemError`, `ConfigurationError`, `ValidationError`, `PipelineError`, `TransformError`, `GitError`, `ProfileError`

## Performance Constraints

- Process 10,000 files in <30s
- Memory usage <500MB for large projects
- Stream files >10MB automatically

## Module-Specific Context

**Note**: Due to Claude Code bug #2571, subdirectory CLAUDE.md files don't auto-load yet. When working on:
- **Pipeline code**: Read @src/pipeline/CLAUDE.md first
- **Transformers**: Read @src/transforms/CLAUDE.md first
- **Tests**: Read @tests/CLAUDE.md first

When bug #2571 is fixed, these will load automatically.

## Imports (Detailed Documentation)

@README.md
@docs/index.md
@docs/technical/architecture.md
@tests/README.md
