# Review Command

Run comprehensive pre-submission checks:

1. Run tests with coverage: `npm run test:coverage`
2. Run linter: `npm run lint`
3. Check formatting: `npm run format:check`
4. Review the checklist from `@CLAUDE.md`:
   - ✅ ESM only (no `require()` or `module.exports`)
   - ✅ Tests pass, coverage ≥80%
   - ✅ Linting and formatting clean
   - ✅ No TODOs, mocks, stubs, or placeholders
   - ✅ Git Flow followed (correct branch type)
   - ✅ Docs updated if public API changed

Summarize any failures and suggest fixes.
