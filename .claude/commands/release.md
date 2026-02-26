# Release Command

Automates the complete GitFlow release process for CopyTree, including CI-driven NPM publishing.

## Usage

```
/release [version]
```

- `version` (optional): The release version (e.g., 0.15.0). If not provided, analyze changes and recommend a version.

## Workflow

### Phase 1: Pre-flight checks

1. Verify on `develop` branch with a clean working directory (`git status --porcelain` is empty)
2. Ensure develop is up to date with origin (`git fetch origin && git diff develop..origin/develop`)
3. Run full quality checks locally:
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
4. If any check fails, stop and fix before continuing

### Phase 2: Determine version

If no version argument was provided:

1. Compare develop to main: `git log --oneline main..develop`
2. Review CHANGELOG.md for unreleased entries
3. Apply semver rules:
   - **patch** (0.x.Y): bug fixes only, no new features
   - **minor** (0.X.0): new features, non-breaking changes
   - **major** (X.0.0): breaking changes
4. **Ask the user to confirm the version before proceeding**

### Phase 3: Create release branch and prepare

1. Create release branch: `git checkout -b release/{version} develop`
2. Update `package.json` version field to `{version}`
3. Update CHANGELOG.md:
   - Add `## [{version}] - {YYYY-MM-DD}` header
   - Populate with changes from `git log --oneline main..develop`
   - Organize into sections: Added, Changed, Fixed, Breaking Changes, Infrastructure
4. Commit: `chore(release): bump version to {version}`

### Phase 4: Merge and tag

1. Merge release branch into main: `git checkout main && git merge release/{version} --no-edit`
2. Create lightweight tag: `git tag v{version}`
3. Merge release branch back into develop: `git checkout develop && git merge release/{version} --no-edit`
4. Delete local release branch: `git branch -d release/{version}`

### Phase 5: Push and trigger publish

1. Push all branches and the tag: `git push origin main develop && git push origin v{version}`
2. The `publish.yml` workflow triggers automatically on the `v*` tag push
3. The workflow runs three jobs:
   - **Quality Checks**: lint, format, tests, coverage on CI
   - **Publish to NPM**: OIDC trusted publishing (no token needed)
   - **Create GitHub Release**: auto-generated from commit history

### Phase 6: Monitor CI

1. Find the workflow run: `gh run list --workflow=publish.yml --limit=1`
2. Watch it: `gh run watch {run_id} --exit-status` (use 5 minute timeout)
3. If the workflow **succeeds**: report the NPM and GitHub Release URLs
4. If the workflow **fails**:
   - Get failure logs: `gh run view {run_id} --log-failed`
   - Report the failure to the user with relevant log output
   - **Do NOT automatically retry or delete tags** — ask the user how to proceed

### Recovery (if needed)

If the publish workflow fails and the user wants to retry:

1. Delete remote tag: `git push origin :refs/tags/v{version}`
2. Delete local tag: `git tag -d v{version}`
3. Delete GitHub Release if created: `gh release delete v{version} --yes`
4. Fix the issue on develop
5. Re-merge and re-tag from Phase 4

## Important rules

- **Always confirm the version number with the user** before creating the release branch
- **Never skip local tests** — CI failures after tagging are expensive to fix
- **Never force-push** to main or develop
- **Monitor the workflow to completion** — the release is not done until NPM publish succeeds
- Use `/commit` for the version bump commit when available
