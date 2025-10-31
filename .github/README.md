# GitHub Configuration

This directory contains GitHub-specific configuration files for CI/CD workflows, issue templates, and automated dependency updates.

## Workflows

### CI Workflow (`workflows/ci.yml`)

Runs on every push and pull request to main branches:

- **Test Suite**: Runs unit, integration, and e2e tests across Node.js 20 and 22
- **Linting**: Validates code with ESLint
- **Format Checking**: Ensures code follows Prettier formatting rules
- **Coverage**: Generates coverage reports and enforces 80% threshold
- **Security**: Runs npm audit for vulnerability detection

**Triggers:**
- Push to `main`, `develop`, `feature/*`, `release/*`
- Pull requests to `main`, `develop`

**Required for PR merge:**
- ✅ All tests pass
- ✅ Coverage ≥ 80%
- ✅ Linting passes
- ✅ Formatting is correct

---

### Auto Format Workflow (`workflows/format.yml`)

Automatically formats code and commits changes:

- Runs Prettier on all JavaScript files
- Commits formatting changes automatically
- Only triggers on code file changes

**Triggers:**
- Push to `develop`, `feature/*`, `release/*` branches
- Only when `.js` or `.jsx` files change

**Behavior:**
- Automatically commits formatting fixes
- Uses `github-actions[bot]` as committer
- Skips if no formatting changes needed

---

### Release Workflow (`workflows/release.yml`)

Handles package publishing and GitHub releases:

- **Quality Checks**: Runs full test suite before release
- **NPM Publishing**: Publishes to npm on version tags
- **GitHub Releases**: Creates release notes from git history

**Triggers:**
- Push to `main` branch
- Version tags (`v*`)

**Requirements:**
- `NPM_TOKEN` secret must be configured
- Must pass all quality checks
- Must be on a version tag for publishing

---

## Dependabot

Automated dependency updates configured in `dependabot.yml`:

- **NPM Dependencies**: Weekly updates every Monday at 9 AM
- **GitHub Actions**: Weekly updates for workflow dependencies
- Groups minor and patch updates to reduce PR noise
- Separate groups for development and production dependencies

**Configuration:**
- Max 10 open PRs at a time
- Labeled with `dependencies` and package ecosystem
- Conventional commit format: `chore(deps): update dependencies`

---

## Local Development

### Run Format Locally

```bash
# Check formatting
npm run format:check

# Auto-format all files
npm run format
```

### Run CI Checks Locally

```bash
# Linting
npm run lint

# All tests
npm test

# Coverage report
npm run test:coverage
```

### Bypass Auto-Formatting

If you need to commit without triggering auto-format (use sparingly):

```bash
git commit -m "your message [skip ci]"
```

---

## Workflow Configuration

### Required Secrets

Configure these in GitHub Settings > Secrets:

- `NPM_TOKEN` - NPM authentication token for publishing
- `CODECOV_TOKEN` - (Optional) Codecov integration token

### Branch Protection

Recommended branch protection rules for `main` and `develop`:

- ✅ Require pull request reviews (1+ approvers)
- ✅ Require status checks to pass before merging:
  - `Test (Node 20)`
  - `Test (Node 22)`
  - `Lint & Format Check`
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Include administrators

### Status Badges

Add these badges to your README:

```markdown
[![CI](https://github.com/gregpriday/copytree/workflows/CI/badge.svg)](https://github.com/gregpriday/copytree/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/gregpriday/copytree/branch/main/graph/badge.svg)](https://codecov.io/gh/gregpriday/copytree)
[![npm version](https://img.shields.io/npm/v/copytree)](https://www.npmjs.com/package/copytree)
```

---

## Troubleshooting

### Format Workflow Not Running

Check that:
1. Workflow file is in `.github/workflows/format.yml`
2. Pushing to correct branches (`develop`, `feature/*`, `release/*`)
3. Changes include `.js` or `.jsx` files

### CI Tests Failing

Common issues:
- **Coverage below 80%**: Add tests for uncovered code
- **Linting errors**: Run `npm run lint:fix` locally
- **Format check fails**: Run `npm run format` locally
- **Test failures**: Run `npm test` locally to debug

### Release Not Publishing

Verify:
1. Tag follows `vX.Y.Z` format (e.g., `v1.0.0`)
2. `NPM_TOKEN` secret is configured
3. All quality checks pass
4. Version in `package.json` matches tag

---

## Maintenance

### Updating Workflows

When modifying workflows:

1. Test changes on a feature branch first
2. Verify workflow runs successfully in Actions tab
3. Document changes in this README
4. Update branch protection rules if needed

### Dependabot PRs

- Review and merge promptly to avoid conflicts
- Check CHANGELOG for breaking changes
- Run full test suite locally for major updates
- Group updates are automatically batched weekly

---

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Dependabot Configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
- [Project Testing Guide](../tests/README.md)
- [Contributing Guidelines](../CONTRIBUTING.md) (if exists)
