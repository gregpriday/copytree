/**
 * Every user-facing string the copy run can print.
 *
 * Centralized because the wording used to be reimplemented per execution path,
 * and the paths drifted: the same run described itself as "copied as file
 * reference" through one and "Copied 47 files … to project-1738.xml" through
 * another. One catalogue means the terminology cannot fork again, and it gives
 * the docs a single place to be checked against.
 *
 * Grammar rules these strings follow:
 * - Sentence case, no terminal period on a single-line status.
 * - Past tense for what finished, present participle for what is running.
 * - The glyph carries success, so the text never says "successfully".
 * - No implementation class names, no internal reason keys.
 * - Basenames on success; full paths on errors and fallbacks.
 */

/**
 * User-facing phases.
 *
 * The pipeline has fourteen stages; a person watching a run has about eight
 * questions. Several stages collapse into one phase because "sorting files"
 * and "applying budgets" are the same answer to "what is it doing?" — deciding
 * which files to include.
 *
 * @readonly
 * @enum {string}
 */
export const PHASES = Object.freeze({
  PREPARE: 'prepare',
  DISCOVER: 'discover',
  SELECT: 'select',
  LOAD: 'load',
  TRANSFORM: 'transform',
  CONTEXT: 'context',
  SECRETS: 'secrets',
  FORMAT: 'format',
  DELIVER: 'deliver',
});

const PHASE_LABELS = Object.freeze({
  [PHASES.PREPARE]: 'Preparing',
  [PHASES.DISCOVER]: 'Scanning project',
  [PHASES.SELECT]: 'Selecting files',
  [PHASES.LOAD]: 'Reading files',
  [PHASES.TRANSFORM]: 'Converting files',
  [PHASES.CONTEXT]: 'Preparing context',
  [PHASES.SECRETS]: 'Checking for secrets',
  [PHASES.FORMAT]: 'Formatting output',
  [PHASES.DELIVER]: 'Writing output',
});

/**
 * Label for a phase, given what is known about the run.
 *
 * @param {string} phase - A {@link PHASES} value
 * @param {Object} [context] - Run context
 * @param {string} [context.format] - Output format, for the formatting phase
 * @param {string} [context.destination] - Destination, for the delivery phase
 * @returns {string} Human label
 */
export function phaseLabel(phase, context = {}) {
  if (phase === PHASES.FORMAT && context.format) {
    return `Formatting ${formatName(context.format)}`;
  }
  if (phase === PHASES.DELIVER) {
    return DELIVERY_LABELS[context.destination] ?? PHASE_LABELS[PHASES.DELIVER];
  }
  return PHASE_LABELS[phase] ?? PHASE_LABELS[PHASES.PREPARE];
}

const DELIVERY_LABELS = Object.freeze({
  reference: 'Copying file reference',
  clipboard: 'Copying output',
  file: 'Saving output',
  display: 'Writing output',
  stream: 'Streaming output',
});

/**
 * Render a format name the way it is written in prose.
 * @param {string} format - Canonical format name
 * @returns {string} Display name
 */
export function formatName(format) {
  const canonical = String(format || 'xml').toLowerCase();
  if (canonical === 'markdown') return 'Markdown';
  if (canonical === 'tree') return 'tree';
  return canonical.toUpperCase();
}

/**
 * Completion headline for a delivery.
 *
 * The headline states the *result*, not the fact of finishing: "File reference
 * copied" tells the reader what they can do next, where "Complete" makes them
 * infer it.
 *
 * @param {Object} delivery - Delivery result
 * @param {string} delivery.actual - Where the output actually went
 * @param {string} [delivery.path] - Path written, when there is one
 * @param {number} [delivery.files] - File count, for the display headline
 * @returns {string} Headline without a glyph
 */
export function completionHeadline({ actual, path: outPath, files = 0 } = {}) {
  switch (actual) {
    case 'reference':
      return 'File reference copied';
    case 'clipboard':
      return 'Output copied';
    case 'file':
      return `Saved ${basename(outPath)}`;
    case 'display':
      return `Displayed ${plural(files, 'file')}`;
    case 'stream':
      return outPath ? `Streamed output to ${basename(outPath)}` : 'Stream complete';
    default:
      return 'Copy complete';
  }
}

/**
 * Stable exclusion reason keys, rendered for people.
 *
 * The keys stay in the API — `stats.excluded.byReason` is something callers
 * switch on — but `4102 gitignore` is a debug dump, not a sentence.
 */
export const EXCLUSION_LABELS = Object.freeze({
  gitignore: 'ignored by Git rules',
  copytreeignore: 'ignored by CopyTree rules',
  globalGitignore: 'ignored by your global gitignore',
  gitInfoExclude: 'ignored by .git/info/exclude',
  binaryExtension: 'binary files',
  binaryPolicy: 'binary files dropped by policy',
  scopeFilter: 'outside the requested scope',
  configExclude: 'excluded by default configuration',
  optionExclude: 'excluded by --exclude',
  filterPattern: 'did not match the selected filters',
  testExclude: 'test files omitted',
  sizeGate: 'exceeded the per-file size gate',
  totalSizeBudget: 'omitted by the total size budget',
  fileCountBudget: 'omitted by the file count budget',
  charBudget: 'shortened by the character limit',
  gitFilter: 'not changed in the selected Git range',
  duplicate: 'duplicate content removed',
  unreadable: 'could not be read',
  secretFile: 'excluded as a secret-prone file',
  secretUnscannable: 'could not be scanned for secrets',
  symlinkEscape: 'symlink points outside the project',
});

/**
 * Reasons that change whether the output can be trusted or used.
 *
 * Ignoring `node_modules` is the tool working; dropping nine files because they
 * exceeded the size gate is the tool changing the answer. Only the second kind
 * earns a warning on a successful run.
 */
export const MATERIAL_REASONS = Object.freeze([
  'sizeGate',
  'totalSizeBudget',
  'fileCountBudget',
  'charBudget',
  'unreadable',
  'secretFile',
  'secretUnscannable',
  'symlinkEscape',
]);

/**
 * Human phrase for an exclusion reason key.
 * @param {string} reason - Stable reason key
 * @returns {string} Human phrase
 */
export function exclusionLabel(reason) {
  return EXCLUSION_LABELS[reason] ?? reason;
}

/**
 * Format a count with a unit, pluralized.
 * @param {number} count - Count
 * @param {string} noun - Singular noun
 * @returns {string} e.g. "1 file", "47 files"
 */
export function plural(count, noun) {
  return `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Insert thousands separators into a run of digits.
 *
 * This was `Intl.NumberFormat`, and it was **the most expensive thing in this
 * module by an order of magnitude**: the first `Intl` constructor in a process
 * initialises ICU, which measured at ~9 ms. Hoisting it to module scope — as an
 * earlier pass did, to stop `toLocaleString()` rebuilding it per call — moved
 * that cost to *import* time, so every run paid it, including `--only-tree`
 * runs that never format a count at all.
 *
 * ICU buys nothing here. The output is pinned to `en-US` on purpose (a count
 * whose separator style changes with `LANG` is a diff in every log that captures
 * it), the input is always a non-negative integer, and anything large enough for
 * grouping to be interesting has already taken the `k` / `M` branch below — so
 * the widest string this ever groups is `9,999`.
 *
 * @param {number} n - Non-negative integer
 * @returns {string} The number with `,` every three digits
 */
function group(n) {
  return String(n).replace(/\B(?=(?:\d{3})+$)/g, ',');
}

/**
 * Format a count, abbreviating past a thousand.
 * @param {number} value - Count
 * @returns {string} Human-readable count
 */
export function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  return group(n);
}

/**
 * Format an estimated token count.
 *
 * Token count is the number that decides whether the output can be pasted, so
 * it appears on every successful completion. The `~` is load-bearing: this is
 * an estimate and should never read as an exact figure.
 *
 * @param {number} tokens - Estimated tokens
 * @returns {string} e.g. "~78k tokens"
 */
export function formatTokens(tokens) {
  const n = Number(tokens) || 0;
  if (n >= 1_000_000) return `~${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1_000) return `~${Math.round(n / 1_000)}k tokens`;
  return `~${n} tokens`;
}

/**
 * Last path segment, for the success case.
 * @param {string} [p] - Path
 * @returns {string} Basename
 */
export function basename(p) {
  if (!p) return 'output';
  const parts = String(p).split(/[/\\]/);
  return parts[parts.length - 1] || String(p);
}

/**
 * Name the files a message is about, in as little space as possible.
 *
 * "1 secret-prone file left out" says something happened without saying whether
 * it mattered; "left out .env" ends the question. Basenames, because the reader
 * is identifying a file rather than navigating to it, and a trailing "and N
 * more" when the list was capped.
 *
 * @param {string[]} [paths=[]] - Paths to name
 * @param {number} total - How many there were in total
 * @param {number} [limit=3] - How many to name before summarizing
 * @returns {string} e.g. "\`.env\`, \`id_rsa\` and 2 more", or '' when nothing is known
 */
export function nameFiles(paths = [], total = 0, limit = 3) {
  if (!paths.length) return '';

  const named = paths.slice(0, limit).map((p) => basename(p));
  const unnamed = Math.max(0, total - named.length);

  if (unnamed > 0) return `${named.join(', ')} and ${formatCount(unnamed)} more`;
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/**
 * Shorten a path from the middle so both ends stay readable.
 *
 * The head says which project and the tail says which file; a plain truncation
 * from the right throws away the half that identifies it.
 *
 * @param {string} p - Path
 * @param {number} max - Maximum length
 * @returns {string} Possibly elided path
 */
export function truncatePath(p, max) {
  const str = String(p ?? '');
  if (max <= 0 || str.length <= max) return str;
  if (max <= 3) return str.slice(0, max);
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${str.slice(0, head)}…${tail > 0 ? str.slice(str.length - tail) : ''}`;
}

export default { PHASES, phaseLabel, completionHeadline, exclusionLabel };
