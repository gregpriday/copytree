/**
 * Output size and token estimation.
 *
 * Every consumer of CopyTree is feeding a model with a fixed budget. Bytes on
 * disk are the wrong unit for that decision: what governs whether a context
 * fits is output characters, and what the user actually reads is a token count.
 *
 * Deliberately heuristic. No tokenizer dependency, no per-model accuracy claim.
 * Treat the numbers as ±20% and size your margins accordingly.
 */

/**
 * Average characters per token across code and prose.
 *
 * Real tokenizers land between roughly 3.3 (dense minified code) and 4.5
 * (English prose) characters per token. 4 is the usual working number.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Per-file structural overhead by output format, in characters.
 *
 * Covers the delimiters wrapped around each file: XML element and CDATA
 * wrapper, Markdown begin/end markers plus fence, JSON object punctuation and
 * key names. Measured from the formatters, rounded up.
 */
const PER_FILE_OVERHEAD = {
  xml: 160,
  markdown: 220,
  json: 180,
  ndjson: 140,
  sarif: 260,
  tree: 0,
};

/** Fixed document overhead by format, in characters (header, metadata block). */
const DOCUMENT_OVERHEAD = {
  xml: 400,
  markdown: 600,
  json: 300,
  ndjson: 120,
  sarif: 800,
  tree: 80,
};

/**
 * Estimate the token count for a character count.
 *
 * @param {number} chars - Number of characters
 * @returns {number} Estimated tokens (±20%)
 */
export function estimateTokens(chars) {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Estimate the character count of the formatted output for a set of files.
 *
 * Used by dry runs, where content has not been read: file sizes stand in for
 * content length, which is near-exact for the UTF-8 text that actually gets
 * included and irrelevant for binaries (whose content is replaced by a
 * one-line placeholder).
 *
 * When content IS available the real length is used, so a full run reports a
 * measured number rather than an estimate.
 *
 * **The dry-run estimate runs high, and does so by design.** Three things push
 * the same way: per-file overhead is rounded up from the formatters, `size` is
 * bytes where the output is counted in characters (identical for ASCII, larger
 * for anything multi-byte), and structure-only placeholders shrink files the
 * plan counted in full. Around 10-15% over is normal on a real repository.
 * Erring high is the useful direction for a budget check: a plan that fits is
 * a run that fits.
 *
 * @param {Array<Object>} files - File entries with `path`, `size`, optional `content`
 * @param {Object} [options={}] - Estimation options
 * @param {string} [options.format='xml'] - Output format
 * @param {boolean} [options.onlyTree=false] - Tree-only output (no content)
 * @param {boolean} [options.addLineNumbers=false] - Line numbers add ~6 chars per line
 * @returns {number} Estimated output characters
 */
export function estimateOutputChars(files, options = {}) {
  const format = normalizeFormat(options.format);
  const onlyTree = options.onlyTree === true || format === 'tree';

  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) return DOCUMENT_OVERHEAD[format] ?? 0;

  const perFile = onlyTree ? 0 : (PER_FILE_OVERHEAD[format] ?? PER_FILE_OVERHEAD.xml);
  let total = DOCUMENT_OVERHEAD[format] ?? DOCUMENT_OVERHEAD.xml;

  for (const file of list) {
    // The tree section repeats every path once, whatever the format.
    total += (file.path?.length ?? 0) + 8;

    if (onlyTree) continue;

    total += perFile;

    if (typeof file.content === 'string') {
      total += file.content.length;
      if (options.addLineNumbers) {
        total += countLines(file.content) * 6;
      }
    } else if (!file.isBinary) {
      // `plannedLength` when a plan has already decided this file will be cut
      // short. Without it, a 1 MB file the character budget projects down to
      // 100 characters still contributed a megabyte to the estimate, so the
      // plan reported a document far larger than the run it was previewing.
      const size = file.plannedLength ?? file.size ?? 0;
      total += size;
      if (options.addLineNumbers) {
        // ~40 characters per line is a reasonable average for source files
        total += Math.ceil(size / 40) * 6;
      }
    }
  }

  return total;
}

/**
 * Build the estimate block attached to `result.stats`.
 *
 * @param {Array<Object>} files - File entries
 * @param {Object} [options={}] - Same options as {@link estimateOutputChars}
 * @param {number} [options.actualChars] - Measured output length, when known
 * @returns {{estimatedOutputChars: number, estimatedTokens: number}} Estimates
 */
export function buildEstimates(files, options = {}) {
  const chars =
    typeof options.actualChars === 'number'
      ? options.actualChars
      : estimateOutputChars(files, options);

  return {
    estimatedOutputChars: chars,
    estimatedTokens: estimateTokens(chars),
  };
}

/**
 * Count lines in a string without allocating an array.
 * @param {string} text - Input text
 * @returns {number} Line count
 */
function countLines(text) {
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

/**
 * Normalize a format name to a known key.
 * @param {string} [format='xml'] - Requested format
 * @returns {string} Normalized format key
 */
function normalizeFormat(format = 'xml') {
  const lower = String(format).toLowerCase();
  const canonical = lower === 'md' ? 'markdown' : lower;
  return canonical in PER_FILE_OVERHEAD ? canonical : 'xml';
}
