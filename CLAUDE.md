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
- Commit directly to `main` or `develop` without explicit user request.
- Auto-generate commits or CHANGELOG entries (except on release/* branch when asked).
- Leave TODOs, mocks, stubs, or partial implementations in final code.
- Touch generated/vendor/lock files or Git metadata.
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
npm run format          # Auto-format

# Debugging
DEBUG=copytree:* copytree        # Verbose logging
copytree config:validate         # Check config
copytree profile:validate NAME   # Check profile
```

<paved_path>
## Canonical Workflows (The Happy Path)

### Add a New Transformer
1. Create class in `@src/transforms/transformers/`, extend `BaseTransformer`
2. Define traits: `inputTypes`, `outputTypes`, `heavy`, `idempotent`
3. Implement `async transform(file)` method
4. Register in `@src/transforms/TransformerRegistry.js`
5. Add tests in `@tests/unit/transformers/`
6. Document in `@docs/profiles/transformer-reference.md`
7. Run `npm run test:coverage` (must pass 80%)

### Add a New Pipeline Stage
1. Create class in `@src/pipeline/stages/`, extend `Stage`
2. Implement `async process(input)` + lifecycle hooks (`onInit`, `beforeRun`, `afterRun`, `handleError`)
3. Emit events: `stage:start`, `stage:complete`, `stage:error`, `file:batch`
4. Insert in pipeline order (see `@docs/technical/architecture.md`)
5. Add tests in `@tests/unit/pipeline/stages/`
6. Update `@docs/technical/architecture.md`
7. Run `npm run test:coverage` (must pass 80%)

### Diagnose Slow/Large Runs
1. Use git filters first: `--git-modified`, `--changed <ref>`
2. Enable streaming: `--stream` or `-S`
3. Set limits: `--limit N`, `--max-file-size`, `--max-total-size`
4. Check cache: `copytree cache:clear` if stale
5. Profile with: `DEBUG=copytree:* copytree --dry-run`
</paved_path>

### Using Git Worktrees

**Only use worktrees when user explicitly requests.** Enables parallel work on multiple branches without stashing.

**Branch Naming (Git Flow):**
- `feature/<description>` - New features (from `develop`)
- `bugfix/<description>` - Bug fixes (from `develop`)
- `hotfix/<description>` - Critical production fixes (from `main`, merge to both)
- `release/<version>` - Release preparation (from `develop`, merge to both)
- `chore/<description>` - Maintenance tasks
- `test/<description>` - Test improvements

**Workflow:**
1. Create worktree: `git worktree add -b feature/pdf-extract ../copytree-feature-pdf develop`
2. Switch to worktree: `cd ../copytree-feature-pdf`
3. Install dependencies: `npm install`
4. Make changes and test as normal
5. Commit only when user requests (use `/commit`)
6. Push branch and create PR: `git push -u origin feature/pdf-extract` then `gh pr create --base develop`
7. Clean up after merge: `git worktree remove ../copytree-feature-pdf` and `git branch -d feature/pdf-extract`

## Review Checklist (Read Before Submitting)

Before finishing any code changes, verify:

1. ✅ **ESM only** - No `require()` or `module.exports`
2. ✅ **Tests pass** - `npm test` succeeds, coverage ≥80%
3. ✅ **Linting clean** - `npm run lint` and `npm run format:check` pass
4. ✅ **No partial code** - No TODOs, mocks, stubs, or placeholders
5. ✅ **Git Flow followed** - Correct branch type, no direct commits to main/develop
6. ✅ **Docs updated** - If public API changed, update relevant `@docs/` files

## Prompting Patterns (For Users)

Increase adherence by starting sessions with:
- "Review `@CLAUDE.md` before proceeding with this task."
- "Follow the paved path for [transformer/stage/etc.] and confirm each step."
- "Run through the Review Checklist and report pass/fail for each item."

## Key Architecture (Details in Docs)

- **Pipeline**: Event-driven stages, streaming >10MB (`@src/pipeline/Pipeline.js`, `@docs/technical/architecture.md`)
- **Configuration**: Hierarchical (CLI > env > project > user > default) (`@src/config/ConfigManager.js`, `@config/schema.json`)
- **Profiles**: YAML-based file selection + transformers (`@src/profiles/ProfileLoader.js`, `@profiles/default.yml`)
- **Transformers**: Multiple file processors with traits system (`@src/transforms/transformers/`, `@docs/profiles/transformer-reference.md`)
- **Commands**: 8 CLI commands (`@bin/copytree.js`): copy, profile:list, profile:validate, copy:docs, config:validate, config:inspect, cache:clear, install:copytree

## Critical Files

- `bin/copytree.js` - CLI entry
- `src/pipeline/Pipeline.js` - Pipeline orchestration
- `src/pipeline/Stage.js` - Stage base class
- `src/config/ConfigManager.js` - Config system
- `src/profiles/ProfileLoader.js` - Profile loading
- `src/transforms/TransformerRegistry.js` - Transformer registry
- `src/utils/errors.js` - Custom errors

## Error Handling Rules

**Use Custom Errors** (`@src/utils/errors.js`):
`CommandError`, `FileSystemError`, `ConfigurationError`, `ValidationError`, `PipelineError`, `AIProviderError`, `TransformError`, `GitError`, `ProfileError`

**Retry Logic**:
- Retryable: `RATE_LIMIT`, `TIMEOUT`, `SERVICE_UNAVAILABLE`, network errors (max 3 attempts, exponential backoff)
- Non-retryable: `INVALID_API_KEY`, `SAFETY_FILTER`, `QUOTA_EXCEEDED`, validation errors

## Performance Constraints

- Process 10,000 files in <30s
- Memory usage <500MB for large projects
- Stream files >10MB automatically
- Heavy transformers (PDF, Image, AI) only when requested

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
@docs/profiles/transformer-reference.md
@tests/README.md
