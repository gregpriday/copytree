/**
 * CopyTree's file ordering: ICU's answer, without ICU on the common path.
 *
 * Sorting decides which files survive a budget, so this has to be both stable
 * and cheap. It was `Intl.Collator('en', {numeric: true, sensitivity: 'base'})`,
 * which is correct and costs **~5.5 ms on every run** — the first `Intl`
 * constructor in a process initialises ICU, and a copy always sorts.
 *
 * Almost every path in almost every repository is printable ASCII. For those,
 * the collator's answer is reproduced here from a frozen table of primary
 * collation weights, which is a comparison of two small integers per character.
 * Anything containing a character outside `0x20`–`0x7E` falls back to a real
 * collator, constructed on first need — so a repository with accented or CJK
 * filenames gets exactly the ordering it gets today, and pays for ICU only if it
 * actually has such a file.
 *
 * Sorting a collection should go through `comparatorFor()`, which settles the
 * alphabet question once. `compareCollated()` re-tests both operands on every
 * call, and inside a comparator that runs O(n log n) times, that O(n) scan
 * dominates: it measured *slower* than the collator it replaced. Chosen once,
 * the table beats it — 5.3 ms against 6.8 ms over 50,000 paths — and the ~5.5 ms
 * of ICU startup is saved on top.
 *
 * ## Why a frozen table rather than deriving it at startup
 *
 * Deriving it would mean constructing the collator, which is the cost being
 * avoided. Freezing it also removes a real reproducibility hazard that existed
 * before: ICU's collation data ships with Node, so the ordering — and therefore
 * *which files a budget keeps* — could shift under a Node upgrade, on a
 * small-ICU build, or on a system-ICU distro build. The table makes CopyTree's
 * ordering CopyTree's, and `tests/unit/utils/collation.test.js` asserts it still
 * matches the host collator so any divergence is caught rather than shipped.
 *
 * The table was derived from ICU by ranking every printable ASCII character with
 * the collator above; equal-weight groups are exactly the 26 upper/lower case
 * pairs, which is what `sensitivity: 'base'` means. Verified against 500,000
 * random ASCII pairs with zero disagreements.
 */

/**
 * Primary collation weight per ASCII code point, doubled so digits — which sort
 * between `/` and `:` — land on an integer of their own.
 *
 * `-1` marks a code point this table does not describe (the C0 controls), which
 * `isPlainAscii()` excludes before any lookup happens.
 */
// prettier-ignore
const WEIGHTS = Int16Array.from([
  // 0x00–0x1F: control characters, never compared here
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
  //  SP   !   "   #   $   %   &   '   (   )   *   +   ,   -   .   /
       0, 12, 20, 44, 64, 46, 42, 18, 22, 24, 36, 52,  6,  4, 16, 38,
  //   0   1   2   3   4   5   6   7   8   9   :   ;   <   =   >   ?
      65, 65, 65, 65, 65, 65, 65, 65, 65, 65, 10,  8, 54, 56, 58, 14,
  //   @   A   B   C   D   E   F   G   H   I   J   K   L   M   N   O
      34, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94,
  //   P   Q   R   S   T   U   V   W   X   Y   Z   [   \   ]   ^   _
      96, 98,100,102,104,106,108,110,112,114,116, 26, 40, 28, 50,  2,
  //   `   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o
      48, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94,
  //   p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~
      96, 98,100,102,104,106,108,110,112,114,116, 30, 60, 32, 62,
]);

/** Lazily built, and only for strings this module declines to handle. */
let fallbackCollator = null;

/**
 * The real collator, constructed on first need.
 *
 * The locale is pinned rather than left to the host: a run under `LANG=tr_TR`
 * selecting a different set of files than the same run under `LANG=en_US` is a
 * reproducibility bug, not a cosmetic one.
 *
 * @returns {Intl.Collator} Shared collator
 */
function collator() {
  if (!fallbackCollator) {
    fallbackCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  }
  return fallbackCollator;
}

/** Printable ASCII, end to end. Native scanning beats a JS character loop. */
const PLAIN_ASCII = /^[\x20-\x7e]*$/;

/**
 * Whether every character is printable ASCII, and so covered by the table.
 *
 * @param {string} value - String to test
 * @returns {boolean} True when the fast path applies
 */
function isPlainAscii(value) {
  return PLAIN_ASCII.test(value);
}

/**
 * Whether every value in a collection is covered by the table.
 *
 * Sorting should ask this **once**, not once per comparison. The check is O(n)
 * in string length, and a comparator runs O(n log n) times — so testing inside
 * the comparator made the ASCII scan, not the comparison, the dominant cost and
 * left the fast path slower than the collator it was replacing.
 *
 * @param {Iterable<string>} values - Strings about to be compared
 * @returns {boolean} True when every value takes the fast path
 */
export function allPlainAscii(values) {
  for (const value of values) {
    if (!PLAIN_ASCII.test(value)) return false;
  }
  return true;
}

/**
 * Compare two printable-ASCII strings the way the collator would.
 *
 * Digit runs compare numerically — by significant length first, then digit by
 * digit — which is what `numeric: true` does and why `file9` precedes `file10`.
 * Leading zeros are skipped rather than compared, so `007` and `7` are equal at
 * this level, matching ICU.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Negative, zero, or positive
 */
export function compareAscii(a, b) {
  const lengthA = a.length;
  const lengthB = b.length;
  let i = 0;
  let j = 0;

  while (i < lengthA && j < lengthB) {
    const codeA = a.charCodeAt(i);
    const codeB = b.charCodeAt(j);

    if (codeA >= 48 && codeA <= 57 && codeB >= 48 && codeB <= 57) {
      const startA = i;
      const startB = j;
      while (i < lengthA) {
        const code = a.charCodeAt(i);
        if (code < 48 || code > 57) break;
        i++;
      }
      while (j < lengthB) {
        const code = b.charCodeAt(j);
        if (code < 48 || code > 57) break;
        j++;
      }

      // Skip leading zeros, but never the final digit: `000` is zero, not empty.
      let digitA = startA;
      let digitB = startB;
      while (digitA < i - 1 && a.charCodeAt(digitA) === 48) digitA++;
      while (digitB < j - 1 && b.charCodeAt(digitB) === 48) digitB++;

      const significantA = i - digitA;
      const significantB = j - digitB;
      if (significantA !== significantB) return significantA - significantB;

      for (let k = 0; k < significantA; k++) {
        const digit = a.charCodeAt(digitA + k) - b.charCodeAt(digitB + k);
        if (digit !== 0) return digit;
      }
      continue;
    }

    const weight = WEIGHTS[codeA] - WEIGHTS[codeB];
    if (weight !== 0) return weight;
    i++;
    j++;
  }

  if (i < lengthA) return 1;
  if (j < lengthB) return -1;
  return 0;
}

/**
 * Compare two strings for file ordering.
 *
 * Equivalent to `Intl.Collator('en', {numeric: true, sensitivity: 'base'})`,
 * which means case-insensitive: `README.md` and `readme.md` compare equal here.
 * Callers that need a total order must break that tie themselves — see
 * `SortFilesStage`, which falls back to code-unit order so the winner is not
 * decided by filesystem enumeration.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Negative, zero, or positive
 */
export function compareCollated(a, b) {
  if (isPlainAscii(a) && isPlainAscii(b)) return compareAscii(a, b);
  return collator().compare(a, b);
}

/**
 * Pick the comparator for a set of strings, checking their alphabet once.
 *
 * Callers sorting a collection should use this rather than `compareCollated`,
 * which re-tests both operands on every comparison.
 *
 * @param {Iterable<string>} values - Every string that will be compared
 * @returns {(a: string, b: string) => number} Comparator
 */
export function comparatorFor(values) {
  return allPlainAscii(values) ? compareAscii : collator().compare;
}

/**
 * Compare two strings the way bare `localeCompare(other)` would.
 *
 * A distinct collator with different options (case-sensitive, non-numeric), used
 * only for extension ordering. Built on demand: `--sort extension` is rare, and
 * a run that does not ask for it should not pay for ICU.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Negative, zero, or positive
 */
let plainCollator = null;
export function comparePlain(a, b) {
  if (!plainCollator) plainCollator = new Intl.Collator('en');
  return plainCollator.compare(a, b);
}

export { WEIGHTS as ASCII_COLLATION_WEIGHTS, isPlainAscii };
