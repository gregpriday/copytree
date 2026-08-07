/**
 * Built-in secret detection patterns and the heuristics that gate them.
 *
 * This is the fallback scanner, used when Gitleaks is not installed. It runs on
 * every file CopyTree emits, so its false-positive behaviour matters as much as
 * its detection rate: the output is source code handed to a model, and a rule
 * that eats a span of real code produces a context that is quietly wrong.
 *
 * Two properties keep that from happening:
 *
 * 1. **Only the value is redacted, never the keyword or the syntax around it.**
 *    Each pattern names a capture group holding the credential itself. A hit on
 *    `const token = "ghp_..."` replaces the literal's contents and leaves the
 *    declaration intact. The previous rules matched from the keyword onward, so
 *    `const token = payload.token.trim();` became `const ***REDACTED***);`.
 *
 * 2. **A value has to look like a credential, not merely sit next to the word
 *    "token".** Matches must be quoted literals or environment-style
 *    assignments, clear a Shannon entropy floor, and not be an obvious
 *    placeholder or identifier path.
 *
 * The residual false positive is now cheap: one string literal's contents are
 * replaced and the surrounding code still parses.
 */

/**
 * Words that make up placeholder values. A value composed *entirely* of these
 * is a template, not a credential.
 *
 * Matched against whole segments rather than substrings on purpose. A substring
 * test would suppress any real key containing `key` or `test` anywhere in its
 * random body, which is a silent failure of the thing this module exists to do.
 */
const PLACEHOLDER_WORDS = new Set([
  'a',
  'abc',
  'abcdef',
  'an',
  'api',
  'apikey',
  'bar',
  'baz',
  'change',
  'changeme',
  'dummy',
  'example',
  'examples',
  'fixme',
  'foo',
  'goes',
  'here',
  'insert',
  'key',
  'me',
  'my',
  'none',
  'null',
  'passwd',
  'password',
  'placeholder',
  'put',
  'redacted',
  'replace',
  'sample',
  'secret',
  'string',
  'test',
  'testing',
  'the',
  'todo',
  'token',
  'undefined',
  'value',
  'xxx',
  'xxxx',
  'your',
  'yours',
]);

/**
 * A dotted identifier path (`process.env.DB_PASSWORD`), which is a reference,
 * not a secret.
 *
 * Segments are length-capped because a JWT is also dot-separated word
 * characters: `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP...` matched an
 * unbounded version of this pattern and was silently discarded. Reference paths
 * have short segments; encoded credentials do not.
 */
const IDENTIFIER_PATH = /^[A-Za-z_$][\w$]{0,23}(?:\.[\w$]{1,24})+$/;

/**
 * A JSON Web Token: three base64url segments, the first of which decodes to
 * `{"`. Checked before the identifier rejection above, since a JWT is exactly
 * the dotted-word-characters shape that rejection is looking for.
 */
const JWT = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/**
 * Credential keyword, as it appears inside a name.
 *
 * Deliberately not `\b`-anchored. `_` is a word character, so `\bpassword\b`
 * does not match inside `db_password` — and `db_password`, `stripe_api_key`
 * and `service_client_secret` are how these are actually named. The surrounding
 * character class lets the keyword sit anywhere within an identifier while
 * still requiring an assignment and a credential-shaped value to follow.
 */
const NAME_CHAR = '[A-Za-z0-9_$-]';
const SECRET_KEYWORD =
  '(?:api[_-]?key|apikey|secret[_-]?(?:key|token)?|access[_-]?token|auth[_-]?token|token|password|passwd|client[_-]?secret)';
const SECRET_NAME = `${NAME_CHAR}{0,40}${SECRET_KEYWORD}${NAME_CHAR}{0,40}`;

/**
 * Environment-variable key, bounded.
 *
 * The keyword alternation used to sit between two unbounded `[A-Z0-9_]*`, which
 * backtracks quadratically over a long uppercase run that never reaches an `=`.
 * The key is captured whole and tested for a keyword in code instead, which is
 * linear and also easier to read.
 */
const ENV_KEY = '[A-Za-z_][A-Za-z0-9_]{0,63}';

/** Keyword an environment key must contain for the env rule to apply. */
const ENV_KEY_KEYWORD = /SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|CREDENTIAL|PRIVATE_KEY/i;

/**
 * Credential body: 16+ characters with no whitespace, quotes, or template
 * syntax. Excluding `$`, `{`, `}`, `<` and `>` is what keeps `"${process.env.TOKEN}"`,
 * `"{{ACCESS_TOKEN}}"` and `"<YOUR_API_KEY_HERE>"` from reading as secrets.
 */
const SECRET_VALUE = '[^\\s\'"\\x60\\x24{}<>]{16,}';

/**
 * Published token prefixes, one alternative each.
 *
 * Distinctive enough to match without any surrounding context, which is what
 * separates them from the generic rules below.
 */
const PROVIDER_TOKEN_ALTERNATIVES = [
  '(?:gh[pousr]_[A-Za-z0-9]{36,})', // GitHub personal / OAuth / server
  '(?:github_pat_[A-Za-z0-9_]{60,})', // GitHub fine-grained PAT
  // Stripe secret and restricted keys only. `pk_live_*` is a *publishable* key,
  // designed to ship in frontend code, and redacting it corrupts source to
  // protect something that is public by definition.
  '(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,})',
  '(?:glpat-[A-Za-z0-9_-]{20,})', // GitLab
  '(?:xox[baprs]-[A-Za-z0-9-]{10,})', // Slack
  '(?:AIza[A-Za-z0-9_-]{35})', // Google API
  '(?:sk-ant-[A-Za-z0-9_-]{20,})', // Anthropic
  '(?:sk-proj-[A-Za-z0-9_-]{20,})', // OpenAI project
  '(?:SG\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,})', // SendGrid
  '(?:npm_[A-Za-z0-9]{36})', // npm
];

/**
 * Detection rules.
 *
 * Every pattern is written as `(prefix)(…)(credential)`, so the credential's
 * absolute offset is `match.index + match[prefixGroup].length`. The `d` flag
 * would give the same offsets directly, but the configured parser rejects it,
 * and an explicit prefix group costs one capture and no tooling argument.
 *
 * `minEntropy` is the Shannon entropy floor for the credential, in bits per
 * character.
 *
 * @type {Array<{
 *   id: string,
 *   regex: RegExp,
 *   prefixGroup: number,
 *   valueGroup: number,
 *   minEntropy?: number,
 * }>}
 */
const BASIC_PATTERNS = [
  {
    id: 'AWS_ACCESS_KEY',
    regex: /()(AKIA[0-9A-Z]{16})/g,
    prefixGroup: 1,
    valueGroup: 2,
  },
  {
    id: 'AWS_SECRET_KEY',
    // `=` is base64 padding and only ever trails. Allowing it anywhere let the
    // value swallow its own `KEY=` prefix, so the redaction ate the assignment.
    regex: /(aws.{0,20}?(?:secret|access).{0,5}?['"`]?)([A-Za-z0-9/+]{32,40}={0,2})/gi,
    prefixGroup: 1,
    valueGroup: 2,
    minEntropy: 3.0,
  },
  {
    // The whole PEM block, header through footer.
    //
    // Matching the header alone redacted the marker and emitted the base64 body
    // and footer verbatim — that is, it redacted the label and published the
    // key. Declared before the header-only fallback so overlap resolution
    // prefers it.
    id: 'PRIVATE_KEY',
    regex:
      /()(-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----)/g,
    prefixGroup: 1,
    valueGroup: 2,
  },
  {
    // A header with no matching footer: a truncated file, or a key spliced into
    // a larger document. Still worth reporting, and the body that follows is
    // caught by nothing else.
    id: 'PRIVATE_KEY',
    regex: /()(-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----)/g,
    prefixGroup: 1,
    valueGroup: 2,
  },
  {
    // Provider-issued tokens, matched on their published prefix.
    //
    // The generic rules below are anchored on a credential-shaped *name*, so
    // they miss `const a = "sk_live_..."`. These prefixes are distinctive
    // enough to stand on their own, which is what makes a keyword-free match
    // safe here and nowhere else.
    id: 'PROVIDER_TOKEN',
    regex: new RegExp(`()(${PROVIDER_TOKEN_ALTERNATIVES.join('|')})`, 'g'),
    prefixGroup: 1,
    valueGroup: 2,
  },
  {
    // A quoted literal assigned to a credential-shaped name.
    id: 'GENERIC_TOKEN',
    regex: new RegExp(
      `((?:^|[^A-Za-z0-9_$-])${SECRET_NAME}\\s*[:=]\\s*(['"\`]))(${SECRET_VALUE})\\2`,
      'gi',
    ),
    prefixGroup: 1,
    valueGroup: 3,
    minEntropy: 3.0,
  },
  {
    // Environment-style assignment: `API_TOKEN=...` on a line of its own.
    id: 'GENERIC_TOKEN',
    regex: new RegExp(
      `(^[ \\t]*(?:export[ \\t]+)?(${ENV_KEY})[ \\t]*=[ \\t]*(['"]?))(${SECRET_VALUE})\\3[ \\t]*$`,
      'gm',
    ),
    prefixGroup: 1,
    valueGroup: 4,
    minEntropy: 3.0,
    // Checked in code rather than in the pattern: see ENV_KEY.
    keyGroup: 2,
    keyPattern: ENV_KEY_KEYWORD,
  },
];

/**
 * Cheap pre-check: could this content possibly match any rule above?
 *
 * Every rule in `BASIC_PATTERNS` requires one of a small set of literal
 * substrings to be present — a provider's published prefix, a PEM header, or a
 * credential keyword in the assigned name. This tests for those directly, which
 * is a handful of scans by a native `indexOf`-class routine, instead of running
 * seven backtracking regexes over a file that cannot match any of them.
 *
 * **This must never be stricter than the rules it guards.** A false positive
 * here costs one wasted scan of one file. A false negative publishes a
 * credential. Whenever a rule is added to or widened in `BASIC_PATTERNS`, its
 * required literal has to be added here too — `tests/unit/utils/` asserts the
 * two agree by scanning a corpus of positives with and without the prefilter.
 *
 * Written as two alternations rather than a chain of `includes` because the
 * keyword and prefix sets both need case-insensitivity or several literals; a
 * single pass by the regex engine over a rejected file beats twenty passes.
 */

/**
 * Published token prefixes, and the PEM header, as plain literals.
 *
 * Loosened deliberately relative to the full rules: `AKIA` without its 16
 * trailing characters, `gh` followed by any of the type letters and an
 * underscore. Matching more than the rule does is the safe direction.
 */
const SECRET_PREFIX_HINT =
  /AKIA|-----BEGIN|gh[pousr]_|github_pat_|[sr]k_(?:live|test)_|glpat-|xox[baprs]-|AIza|sk-ant-|sk-proj-|SG\.|npm_/;

/**
 * Credential keywords, matching the `SECRET_KEYWORD` and `ENV_KEY_KEYWORD`
 * alternations that gate the two generic rules.
 *
 * `aws` is included on its own account: the AWS secret-key rule keys off it
 * rather than off a generic keyword.
 */
const SECRET_KEYWORD_HINT =
  /api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|token|password|passwd|client[_-]?secret|credential|private[_-]?key|aws/i;

/**
 * Whether content is worth running the full rule set over.
 *
 * @param {string} content - File content
 * @returns {boolean} True when a rule could conceivably match
 */
export function couldContainSecret(content) {
  return SECRET_PREFIX_HINT.test(content) || SECRET_KEYWORD_HINT.test(content);
}

/**
 * Shannon entropy of a string, in bits per character.
 *
 * Distinguishes a random credential (typically above 3.5) from a repeated or
 * dictionary-shaped value like `abcdefabcdefabcdef` (2.6).
 *
 * @param {string} value - String to measure
 * @returns {number} Entropy in bits per character
 */
export function shannonEntropy(value) {
  if (!value) return 0;

  const frequencies = new Map();
  for (const char of value) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Whether a value is built entirely from placeholder words.
 *
 * @param {string} value - Candidate credential
 * @returns {boolean} True when every alphabetic segment is a placeholder word
 */
export function isPlaceholderValue(value) {
  const words = value
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  return words.every((word) => PLACEHOLDER_WORDS.has(word));
}

/**
 * Whether a matched value is credential-shaped enough to redact.
 *
 * @param {string} value - Candidate credential
 * @param {number} [minEntropy=0] - Entropy floor in bits per character
 * @returns {boolean} True when the value should be treated as a secret
 */
export function looksLikeSecret(value, minEntropy = 0) {
  if (!value) return false;

  // A JWT is a credential that happens to be shaped like a reference path, so
  // it has to be recognised before the reference rejection below.
  if (JWT.test(value)) return true;

  if (minEntropy > 0 && shannonEntropy(value) < minEntropy) return false;
  if (isPlaceholderValue(value)) return false;
  if (IDENTIFIER_PATH.test(value)) return false;
  return true;
}

/**
 * Index of the first claimed span that starts at or after `start`.
 *
 * @param {Array<[number, number]>} claimed - Spans sorted by start offset
 * @param {number} start - Offset to search for
 * @returns {number} Insertion index
 */
function lowerBound(claimed, start) {
  let low = 0;
  let high = claimed.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (claimed[mid][0] < start) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Whether a span overlaps one already claimed.
 *
 * Spans are kept sorted so this is a binary search plus two neighbour checks,
 * rather than a scan of every prior finding. The linear version was quadratic in
 * the number of findings, which showed up as seconds on a file carrying tens of
 * thousands of them.
 *
 * @param {Array<[number, number]>} claimed - Spans sorted by start offset
 * @param {number} start - Candidate start offset
 * @param {number} end - Candidate end offset, exclusive
 * @returns {boolean} True when the candidate overlaps a claimed span
 */
function overlapsClaimed(claimed, start, end) {
  const at = lowerBound(claimed, start);

  // The span starting at or after `start` can only overlap by beginning before
  // `end`.
  if (at < claimed.length && claimed[at][0] < end) return true;

  // The span before it can only overlap by ending after `start`. Spans never
  // nest, so one neighbour on each side is sufficient.
  if (at > 0 && claimed[at - 1][1] > start) return true;

  return false;
}

/**
 * Insert a span, keeping the array sorted by start offset.
 *
 * @param {Array<[number, number]>} claimed - Spans sorted by start offset
 * @param {number} start - Span start offset
 * @param {number} end - Span end offset, exclusive
 * @returns {void}
 */
function insertClaimed(claimed, start, end) {
  claimed.splice(lowerBound(claimed, start), 0, [start, end]);
}

/**
 * Convert an absolute string index into a 1-based line and column.
 *
 * @param {number[]} lineStarts - Absolute offset of each line start
 * @param {number} index - Absolute character index
 * @returns {{line: number, column: number}} 1-based position
 */
function positionAt(lineStarts, index) {
  // Binary search for the last line start at or before `index`. A linear scan
  // from the top of the file is O(n) per match, which is O(n*m) over a file
  // with many matches.
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { line: low + 1, column: index - lineStarts[low] + 1 };
}

/**
 * Scan content with the built-in patterns.
 *
 * Findings are reported against the credential span alone, so redaction
 * replaces the value and leaves the surrounding syntax intact.
 *
 * @param {string} content - File content to scan
 * @param {string} [filePath] - Path recorded on each finding
 * @returns {Array<Object>} Gitleaks-shaped findings
 */
export function scanContent(content, filePath) {
  if (!content) return [];
  if (!couldContainSecret(content)) return [];

  // Line starts are built on demand, because the overwhelming majority of files
  // produce no findings and this index exists only to turn an offset into a
  // line and column for one. Building it eagerly walked every byte of every
  // clean file in the repository for nothing.
  let lineStarts = null;
  const lineIndex = () => {
    if (lineStarts === null) {
      lineStarts = [0];
      for (let i = 0; i < content.length; i++) {
        if (content.charCodeAt(i) === 10) lineStarts.push(i + 1);
      }
    }
    return lineStarts;
  };

  // Spans, not findings: two rules can match the same credential (a Stripe key
  // assigned to a name called `api_key` matches both PROVIDER_TOKEN and
  // GENERIC_TOKEN). Redaction rewrites content by index, so a second
  // replacement over an already-replaced span writes garbage. First rule wins,
  // which is why the provider rules are declared before the generic ones.
  const claimed = [];
  const results = [];

  for (const pattern of BASIC_PATTERNS) {
    // Patterns are module-level and `g`/`gm` regexes carry `lastIndex` between
    // calls, so it is reset rather than the whole expression recompiled. A fresh
    // `new RegExp` per pattern per file also threw away V8's compiled form and
    // its internal caches every time.
    const regex = pattern.regex;
    regex.lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Zero-length matches would spin forever.
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      const prefix = match[pattern.prefixGroup];
      const value = match[pattern.valueGroup];
      if (typeof prefix !== 'string' || !value) continue;

      // A rule may defer part of its condition to code, where expressing it in
      // the pattern would mean an ambiguous alternation and quadratic
      // backtracking.
      if (pattern.keyPattern && !pattern.keyPattern.test(match[pattern.keyGroup] ?? '')) {
        continue;
      }

      if (!looksLikeSecret(value, pattern.minEntropy ?? 0)) continue;

      const startIndex = match.index + prefix.length;
      const endIndex = startIndex + value.length;

      if (overlapsClaimed(claimed, startIndex, endIndex)) continue;
      insertClaimed(claimed, startIndex, endIndex);

      const start = positionAt(lineIndex(), startIndex);
      const end = positionAt(lineIndex(), endIndex - 1);

      results.push({
        RuleID: pattern.id,
        StartLine: start.line,
        EndLine: end.line,
        StartColumn: start.column,
        // EndColumn is inclusive, matching the Gitleaks convention the redactor
        // reads.
        EndColumn: end.column,
        Match: value,
        File: filePath,
      });
    }
  }

  return results;
}

export { BASIC_PATTERNS, PLACEHOLDER_WORDS };
