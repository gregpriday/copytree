/**
 * One constructor for every Git-ignore matcher in CopyTree.
 *
 * The `ignore` package defaults to case-insensitive matching. `micromatch`,
 * which evaluates the inclusion globs, defaults to case-sensitive. Left as
 * they came, the two halves of the selection disagreed: `*.log` would exclude
 * `ERROR.LOG` on Linux, while `**\/*.md` would not include `README.MD` on
 * Windows — the opposite of what each platform's filesystem would lead you to
 * expect, and different from each other on the same machine.
 *
 * Section 13.1 of the CLI specification settles it: ordinary matching is
 * case-sensitive on all platforms. This module is how that stays true, and the
 * reason no call site constructs `ignore()` directly.
 *
 * The one deliberate exception is the hard `.git` exclusion in
 * `hardExclusions.js`, which compares case-insensitively on purpose: `.GIT`
 * reaches the same directory on macOS and Windows, so a case-sensitive test
 * there would be a bypass rather than a nicety.
 */

import ignore from 'ignore';

/**
 * Create a Git-ignore matcher with CopyTree's matching semantics.
 *
 * @param {string|string[]} [rules] - Rules to add immediately
 * @returns {import('ignore').Ignore} Matcher
 */
export function createMatcher(rules) {
  const matcher = ignore({ ignorecase: false });
  return rules === undefined ? matcher : matcher.add(rules);
}

export default createMatcher;
