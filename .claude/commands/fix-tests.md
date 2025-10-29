# Fix Tests Command

Diagnose and fix test failures:

1. Run `npm test` to identify failures
2. For each failing test:
   - Read the test file
   - Analyze the failure message
   - Check if related code was recently changed
   - Propose a fix with explanation
3. Verify fixes maintain 80% coverage threshold
4. Check if golden files need updating (use `UPDATE_GOLDEN=true` if appropriate)
5. Ensure all fixes follow ESM syntax and project patterns

Run `npm run test:coverage` after fixes to confirm.
