/**
 * Knip configuration.
 *
 * Knip answers one question this project cares about: is anything shipping that
 * nothing reaches? A dependency in `package.json` is downloaded by every user
 * whether or not a single line imports it, and this codebase has just spent a
 * release removing load-time cost, so a dependency nobody imports is the same
 * bug in a cheaper disguise.
 *
 * Run it with `npm run knip`.
 *
 * **Why `config/*.js` are entry points.** `ConfigManager` loads the defaults by
 * reading the `config/` directory at runtime and importing whatever `.js` it
 * finds (see `_loadDefaults`). No static import exists, so knip cannot see the
 * edge and would report every one of those files as dead. They are not.
 *
 * **Why the `exports` rule is off.** Most modules here deliberately export both
 * named members and a default aggregate object, so the unused-export report is
 * dominated by the halves that happen to be unused today. That signal is real
 * but low value, and drowning the file and dependency findings — which are the
 * ones worth failing on — makes the whole check get ignored.
 */
export default {
  // `bin/copytree.js` and `src/index.js` are not listed: knip already derives
  // them from `bin` and `exports` in package.json, and repeating them here is
  // reported as redundant.
  entry: ['config/*.js', 'scripts/*.js'],

  // `tests/electron` is a separate npm package with its own lockfile and
  // `node_modules`; analysing it here reports its dependencies against ours.
  ignore: ['tests/electron/**', 'tests/fixtures/**'],

  // Platform clipboard helpers, shelled out to by `src/utils/clipboard.js`.
  // They are OS-provided and correctly absent from `package.json`.
  ignoreBinaries: ['osascript', 'explorer', 'xdg-open'],

  rules: {
    exports: 'off',
    types: 'off',
    enumMembers: 'off',
    duplicates: 'off',
  },
};
