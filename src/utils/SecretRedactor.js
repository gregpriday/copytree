import crypto from 'crypto';

/**
 * Shortest match that may be redacted at every occurrence rather than only
 * where the scanner reported it.
 *
 * Every built-in rule matches something longer than this. The floor exists for
 * the pathological case — a rule, or a malformed external finding, whose match
 * is a couple of characters that appear all over the file.
 */
const MIN_ALL_OCCURRENCE_LENGTH = 8;

/**
 * @typedef {Object} RedactionResult
 * @property {string} content - Content with every located finding replaced
 * @property {number} count - Regions replaced. Two findings over one credential are one region.
 * @property {Array<{start: number, end: number, ruleIds: string[]}>} applied - Disjoint replaced regions, in the ORIGINAL content's offsets
 * @property {Array<{start: number, end: number}>} markers - Where the replacements landed in the REDACTED content
 * @property {Array<Object>} failed - Safe findings that could not be proven redacted, each with a `reason`
 * @property {boolean} covered - True only when every finding was proven redacted
 */

/**
 * Utility for redacting secrets from file content while preserving structure
 *
 * Implements span-based redaction that maintains line numbers, formatting,
 * and overall text structure. Supports multiple redaction modes.
 *
 * Accepts findings from both Gitleaks (GitleaksFinding) and built-in
 * detector (SecretFinding), automatically normalizing the format.
 */
class SecretRedactor {
  /**
   * Redact secrets from content based on findings.
   *
   * The return value is proof of work, not a summary of it. A redactor that
   * reports only "how many replacements happened" cannot tell its caller the
   * difference between "there was nothing more to do" and "a finding could not
   * be located, and its bytes are still in the content" — and the caller was
   * stamping `redacted: true` on both. Every finding therefore lands in exactly
   * one of `applied` or `failed`, and `covered` is the single question the
   * caller has to ask before emitting the result.
   *
   * Accepts findings in either format:
   * - GitleaksFinding: {RuleID, StartLine, EndLine, StartColumn, EndColumn, Match}
   * - SecretFinding: {type, lineStart, lineEnd, startColumn, endColumn, match, redactionLabel}
   *
   * @param {string} content - Original file content
   * @param {Array<GitleaksFinding|SecretFinding>} findings - Array of secret findings
   * @param {'typed'|'generic'|'hash'} mode - Redaction mode
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.rawMatch=false] - Whether `Match` holds the real
   *   matched bytes. The built-in scanner reports them; Gitleaks is run with
   *   `--redact`, so its `Match` is already masked. Defaulting to `false` means
   *   an unknown provenance is treated as masked, which only ever costs
   *   verification strength — never safety.
   * @returns {RedactionResult} Redacted content, and proof of what was covered
   */
  static redact(content, findings, mode = 'typed', options = {}) {
    const rawMatch = options.rawMatch === true;

    if (!findings || findings.length === 0) {
      return { content, count: 0, applied: [], markers: [], failed: [], covered: true };
    }

    if (typeof content !== 'string') {
      // Nothing can be located in content that is not text, and returning it
      // unchanged with `covered: true` is precisely the fail-open this contract
      // exists to close.
      return {
        content,
        count: 0,
        applied: [],
        markers: [],
        failed: findings.map((finding) => ({
          ...this.toSafeFinding(finding),
          reason: 'non-text-content',
        })),
        covered: false,
      };
    }

    const lines = content.split('\n');
    const lineOffsets = this._calculateLineOffsets(content);
    const contentLength = content.length;

    const resolved = [];
    const failed = [];
    const occurrenceCache = new Map();

    for (const finding of findings) {
      const normalized = this._normalizeFinding(finding);
      let span;

      try {
        span = this._findingToIndices(normalized, lines, lineOffsets);
      } catch {
        span = null;
      }

      const located = this._locate(
        span,
        normalized,
        content,
        contentLength,
        rawMatch,
        occurrenceCache,
      );

      if (located.length === 0) {
        failed.push({ ...this.toSafeFinding(normalized), reason: 'unmappable' });
        continue;
      }

      for (const range of located) {
        resolved.push({ ...range, finding: normalized });
      }
    }

    // Overlapping spans have to be merged before anything is replaced. Applying
    // them one at a time in reverse order is only index-safe while they are
    // disjoint: two findings over the same credential — the same secret matched
    // by two rules, or a key and the URL containing it — had the second
    // replacement computed against offsets the first had already invalidated,
    // so it cut into the marker and could leave part of the original behind.
    const groups = this._mergeSpans(resolved);

    // Built forward rather than spliced backwards, so the marker positions in
    // the *output* fall out of the construction. The verification re-scan needs
    // them: a marker like `password=***REDACTED:PASSWORD***` trips the very
    // pattern that produced it, and without knowing where the markers landed
    // the scanner reports the guard's own work as a residual secret.
    let redacted = '';
    let cursor = 0;
    const markers = [];

    for (const group of groups) {
      redacted += content.slice(cursor, group.start);
      const marker = this._markerForGroup(group, content, mode);
      markers.push({ start: redacted.length, end: redacted.length + marker.length });
      redacted += marker;
      cursor = group.end;
    }

    redacted += content.slice(cursor);

    // The last and strongest check: where the scanner handed us the raw bytes it
    // matched, no region we left alone may still contain them. Coordinates can
    // drift — CRLF, multi-byte characters, inclusive versus exclusive end
    // columns — and a span that lands one character off still counts as a
    // replacement while leaving the credential legible. Gitleaks is run with
    // `--redact`, so its `Match` is already masked and this check simply does
    // not apply to it; the built-in scanner reports the real bytes, and for
    // those this is a direct canary assertion rather than an inference.
    //
    // The survey covers the gaps between the replaced regions of the *original*
    // content, never the output. Searching the output would match the markers
    // themselves — a rule named `secret` renders as `***REDACTED:SECRET***`, so
    // a finding whose match was `SECRET` reported itself as residual every time.
    const untouched = this._gaps(groups, contentLength).map(([start, end]) =>
      content.slice(start, end),
    );

    if (rawMatch) {
      const seen = new Set();

      for (const entry of resolved) {
        const match = typeof entry.finding.Match === 'string' ? entry.finding.Match : '';
        if (match.length === 0 || seen.has(match)) continue;
        seen.add(match);

        if (untouched.some((region) => region.includes(match))) {
          failed.push({ ...this.toSafeFinding(entry.finding), reason: 'residual' });
        }
      }
    }

    return {
      content: redacted,
      // Regions actually replaced, not findings resolved. Two findings over the
      // same credential are one replacement, and reporting two overstated what
      // happened to the file — which is what the public type has always called
      // this number.
      count: groups.length,
      applied: groups.map(({ start, end, ruleIds }) => ({ start, end, ruleIds })),
      markers,
      failed,
      covered: failed.length === 0,
    };
  }

  /**
   * Every range that must be replaced to cover one finding.
   *
   * Returns a list rather than a single span because the two pieces of evidence
   * a finding carries — its coordinates and its matched bytes — can disagree,
   * and choosing between them is a guess. Covering both is not.
   *
   * The matched bytes are only evidence when they are the *real* bytes.
   * Gitleaks is run with `--redact`, so its `Match` is a mask: searching the
   * file for it finds nothing, or worse, finds a literal mask in a document
   * that shows a redacted example — and relocating onto that decoy would redact
   * the example, leave the real credential, and report success. Provenance
   * therefore has to be passed in; it cannot be inferred from the finding.
   *
   * @param {{startIndex: number, endIndex: number}|null} span - Coordinate-derived span
   * @param {Object} finding - Normalized finding
   * @param {string} content - Original content
   * @param {number} contentLength - Length of the content
   * @param {boolean} rawMatch - Whether `finding.Match` holds the real bytes
   * @param {Map<string, number[]>|null} [occurrenceCache=null] - Per-call memo of match offsets
   * @returns {Array<{start: number, end: number}>} Ranges to replace; empty when unmappable
   * @private
   */
  static _locate(span, finding, content, contentLength, rawMatch, occurrenceCache = null) {
    const ranges = [];

    if (
      span &&
      Number.isInteger(span.startIndex) &&
      Number.isInteger(span.endIndex) &&
      span.startIndex >= 0 &&
      span.startIndex < contentLength &&
      span.endIndex > span.startIndex &&
      span.endIndex <= contentLength
    ) {
      ranges.push({ start: span.startIndex, end: span.endIndex });
    }

    const match = rawMatch && typeof finding.Match === 'string' ? finding.Match : '';

    // Where the real bytes are known, every occurrence of them is the secret —
    // not merely the one the scanner happened to report. Covering all of them
    // makes the coordinates a hint rather than the proof, and turns a file the
    // guard would otherwise have had to drop into one it can safely emit.
    //
    // Below MIN_ALL_OCCURRENCE_LENGTH this stops being true. A short match is
    // as likely to be ordinary text as a credential, and replacing every
    // occurrence of it would eat the file; touching ranges merge, so a
    // two-character match repeated across a line collapses that whole line into
    // one marker. Short matches keep the coordinate span only, and the
    // verification re-scan remains the backstop for anything left behind.
    if (match.length >= MIN_ALL_OCCURRENCE_LENGTH) {
      for (const at of this._occurrences(content, match, occurrenceCache)) {
        ranges.push({ start: at, end: at + match.length });
      }
    }

    return ranges;
  }

  /**
   * Every index at which `match` occurs, memoized per distinct match.
   *
   * Scanners report one finding per occurrence, so a credential repeated K
   * times arrives as K findings that each scan the whole file and each return
   * the same K offsets — quadratic in K, and quadratic in file length too. The
   * offsets depend only on the content and the match, so they are computed once.
   *
   * @param {string} content - Content to search
   * @param {string} match - Bytes to find
   * @param {Map<string, number[]>|null} cache - Per-call memo, keyed by match
   * @returns {number[]} Ascending start offsets
   * @private
   */
  static _occurrences(content, match, cache) {
    const cached = cache?.get(match);
    if (cached) return cached;

    const found = [];
    for (let at = content.indexOf(match); at !== -1; at = content.indexOf(match, at + 1)) {
      found.push(at);
    }

    cache?.set(match, found);
    return found;
  }

  /**
   * Merge overlapping and touching spans into disjoint replacement regions.
   *
   * @param {Array<{start: number, end: number, finding: Object}>} resolved - Located spans
   * @returns {Array<{start: number, end: number, ruleIds: string[], findings: Object[]}>} Disjoint groups, ascending
   * @private
   */
  static _mergeSpans(resolved) {
    if (resolved.length === 0) return [];

    const sorted = [...resolved].sort((a, b) => a.start - b.start || a.end - b.end);
    const groups = [];

    for (const entry of sorted) {
      const current = groups[groups.length - 1];

      if (current && entry.start <= current.end) {
        current.end = Math.max(current.end, entry.end);
        current.findings.push(entry.finding);
        continue;
      }

      groups.push({ start: entry.start, end: entry.end, findings: [entry.finding] });
    }

    for (const group of groups) {
      group.ruleIds = [...new Set(group.findings.map((f) => f.RuleID || 'UNKNOWN'))].sort();
    }

    return groups;
  }

  /**
   * The regions of the original content that no replacement covered.
   *
   * @param {Array<{start: number, end: number}>} groups - Disjoint replaced regions, ascending
   * @param {number} contentLength - Length of the original content
   * @returns {Array<[number, number]>} Half-open ranges left untouched
   * @private
   */
  static _gaps(groups, contentLength) {
    const gaps = [];
    let cursor = 0;

    for (const group of groups) {
      if (group.start > cursor) gaps.push([cursor, group.start]);
      cursor = Math.max(cursor, group.end);
    }

    if (cursor < contentLength) gaps.push([cursor, contentLength]);

    return gaps;
  }

  /**
   * The marker that replaces one merged group.
   *
   * A group of one is the ordinary case and produces exactly what a single
   * finding always did. Where several rules matched the same bytes, naming all
   * of them is more useful than arbitrarily picking one.
   *
   * @param {{start: number, end: number, ruleIds: string[], findings: Object[]}} group - Merged group
   * @param {string} content - Original content, for hashing the replaced bytes
   * @param {'typed'|'generic'|'hash'} mode - Redaction mode
   * @returns {string} Replacement text
   * @private
   */
  static _markerForGroup(group, content, mode) {
    if (group.findings.length === 1) {
      return this.getMarker(group.findings[0], mode);
    }

    return this.getMarker(
      {
        RuleID: group.ruleIds.join('+'),
        // Hash the bytes actually being replaced: for a merged group no single
        // finding's `Match` describes the whole region.
        Match: content.slice(group.start, group.end),
      },
      mode,
    );
  }

  /**
   * Normalize finding to Gitleaks-like format for processing
   * @private
   * @param {GitleaksFinding|SecretFinding} finding - Finding in any format
   * @returns {Object} Normalized finding
   */
  static _normalizeFinding(finding) {
    // Any Gitleaks-cased coordinate is enough to identify the shape. Keying
    // only on `RuleID` misread a Gitleaks entry that happened to lack one as a
    // built-in finding, so its capitalised coordinates were invisible: the
    // lower-cased lookups all returned `undefined`, the span defaulted to the
    // first character of the file, and the credential the entry described was
    // left in place while the redaction was counted as applied.
    if (
      finding.RuleID !== undefined ||
      finding.StartLine !== undefined ||
      finding.StartColumn !== undefined
    ) {
      return finding;
    }

    // Convert SecretFinding to Gitleaks-like format
    return {
      RuleID: finding.redactionLabel || finding.type || 'UNKNOWN',
      StartLine: finding.lineStart,
      EndLine: finding.lineEnd,
      StartColumn: finding.startColumn,
      EndColumn: finding.endColumn,
      Match: finding.match,
      File: finding.file,
    };
  }

  /**
   * Generate redaction marker based on mode
   *
   * @param {GitleaksFinding} finding - Secret finding
   * @param {'typed'|'generic'|'hash'} mode - Redaction mode
   * @returns {string} Redaction marker
   */
  static getMarker(finding, mode) {
    const ruleId = (finding.RuleID || 'UNKNOWN').toUpperCase();

    switch (mode) {
      case 'typed':
        return `***REDACTED:${ruleId}***`;

      case 'generic':
        return '***REDACTED***';

      case 'hash': {
        // Generate short hash for debugging (never log the actual secret)
        // Use Match if available (which might be redacted by gitleaks),
        // otherwise generate a stable hash from metadata
        const hashInput =
          finding.Match || `${finding.File}:${finding.StartLine}:${finding.StartColumn}`;
        const hash = crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 8);
        return `***REDACTED:${ruleId}:${hash}***`;
      }

      default:
        return '***REDACTED***';
    }
  }

  /**
   * Convert line/column finding to absolute string indices
   * @private
   * @param {GitleaksFinding} finding - Finding with line/column info
   * @param {string[]} lines - Array of content lines
   * @param {number[]} lineOffsets - Absolute offsets for each line
   * @returns {{startIndex: number, endIndex: number}} Absolute indices
   */
  static _findingToIndices(finding, lines, lineOffsets) {
    const startLine = Math.max(0, (finding.StartLine ?? 1) - 1);
    const endLine = Math.max(startLine, (finding.EndLine ?? finding.StartLine ?? 1) - 1);
    const startCol = Math.max(0, (finding.StartColumn ?? 1) - 1);

    // The end column is only bounded below by the start column when both are on
    // the same line. Clamping unconditionally meant a multi-line finding ending
    // at an earlier column than it started — a PEM block beginning at column 17
    // and ending at column 6 of a later line — deleted through column 17 of its
    // final line, taking the closing quote, the semicolon, and whatever
    // followed.
    const rawEndCol = (finding.EndColumn ?? finding.StartColumn ?? 1) - 1;
    const endCol = endLine === startLine ? Math.max(startCol, rawEndCol) : Math.max(0, rawEndCol);

    // Validate line indices
    if (startLine >= lines.length || endLine >= lines.length) {
      return { startIndex: -1, endIndex: -1 };
    }

    // Calculate content length
    const lastLineIndex = Math.max(lines.length - 1, 0);
    const lastLineOffset = lineOffsets[lastLineIndex] ?? 0;
    const lastLineLength = lines[lastLineIndex]?.length ?? 0;
    const contentLength = lastLineOffset + lastLineLength;

    // Calculate absolute indices
    const startIndex = lineOffsets[startLine] + startCol;

    // For end index, add 1 because column positions are inclusive (point to the last char)
    let endIndex =
      startLine === endLine
        ? lineOffsets[startLine] + (endCol + 1)
        : lineOffsets[endLine] + (endCol + 1);

    // Handle edge case: if end == start (single char or calculation error), use Match length
    if (finding.Match && endIndex === startIndex) {
      endIndex = startIndex + finding.Match.length;
    }

    return {
      startIndex,
      endIndex: Math.max(startIndex, Math.min(endIndex, contentLength)),
    };
  }

  /**
   * Calculate absolute character offsets for each line
   * @private
   * @param {string} content - File content
   * @returns {number[]} Array of line start offsets
   */
  static _calculateLineOffsets(content) {
    const offsets = [0]; // First line starts at 0

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        offsets.push(i + 1);
      }
    }

    return offsets;
  }

  /**
   * Which of a re-scan's findings are real residue rather than the markers.
   *
   * A redaction marker names the rule it replaced — `***REDACTED:PASSWORD***` —
   * which is enough to satisfy the pattern that matched the original. Scanning
   * redacted content therefore rediscovers the guard's own work, and a
   * verification pass that cannot tell the two apart condemns every file it
   * successfully protected.
   *
   * A finding is the guard's own marker only when every range it resolves to
   * sits wholly inside one. Anything else — including a finding that cannot be
   * resolved at all — is treated as residue, because the purpose here is proof.
   *
   * @param {string} content - The redacted content that was re-scanned
   * @param {Array} findings - Findings from the re-scan
   * @param {Array<{start: number, end: number}>} markers - Marker regions in that content
   * @param {Object} [options={}] - Options
   * @param {boolean} [options.rawMatch=false] - Whether `Match` holds real bytes
   * @returns {Array} Findings that are not accounted for by a marker
   */
  static residualFindings(content, findings, markers, options = {}) {
    if (!Array.isArray(findings) || findings.length === 0) return [];
    if (typeof content !== 'string') return findings;

    const rawMatch = options.rawMatch === true;
    const lines = content.split('\n');
    const lineOffsets = this._calculateLineOffsets(content);
    const occurrenceCache = new Map();
    const residue = [];

    for (const finding of findings) {
      const normalized = this._normalizeFinding(finding);

      // Dismissing a finding as "just the marker" needs coordinates good enough
      // to believe. A finding carrying nothing but `StartLine: 1` normalizes to
      // the first character of the file, which sits inside a marker whenever one
      // starts at offset zero — so a genuine residual elsewhere on that line
      // would be explained away by a span it never described. Anything less than
      // a complete, in-bounds set of coordinates stays residue.
      if (!this._hasExactCoordinates(normalized, lines)) {
        residue.push(normalized);
        continue;
      }

      let span;

      try {
        span = this._findingToIndices(normalized, lines, lineOffsets);
      } catch {
        span = null;
      }

      const ranges = this._locate(
        span,
        normalized,
        content,
        content.length,
        rawMatch,
        occurrenceCache,
      );

      const explained =
        ranges.length > 0 &&
        ranges.every((range) =>
          markers.some((marker) => range.start >= marker.start && range.end <= marker.end),
        );

      if (!explained) residue.push(normalized);
    }

    return residue;
  }

  /**
   * Whether a finding's coordinates fully and plausibly describe a span.
   *
   * Every coordinate must be present, a positive integer, within the content's
   * lines, and within the length of the line it names. `_findingToIndices`
   * deliberately repairs what it can — defaulting an absent column to 1,
   * clamping a reversed range — which is right when the goal is to redact
   * something, and wrong when the goal is to prove that a span is accounted for.
   *
   * @param {Object} finding - Normalized finding
   * @param {string[]} lines - Lines of the content the finding refers to
   * @returns {boolean} True when the coordinates can be trusted as exact
   * @private
   */
  static _hasExactCoordinates(finding, lines) {
    const positive = (value) => Number.isInteger(value) && value >= 1;

    const { StartLine, EndLine, StartColumn, EndColumn } = finding;

    if (!positive(StartLine) || !positive(EndLine)) return false;
    if (!positive(StartColumn) || !positive(EndColumn)) return false;
    if (EndLine < StartLine) return false;
    if (StartLine > lines.length || EndLine > lines.length) return false;

    // Columns are 1-based and inclusive, so a column may sit one past the last
    // character of its line but no further.
    if (StartColumn > lines[StartLine - 1].length + 1) return false;
    if (EndColumn > lines[EndLine - 1].length + 1) return false;
    if (StartLine === EndLine && EndColumn < StartColumn) return false;

    return true;
  }

  /**
   * Strip the matched secret out of a finding, leaving only metadata.
   *
   * Findings travel further than the file content does: into `stats`, into
   * thrown errors, into events an embedder may log or ship to a crash reporter.
   * A finding that carries `Match` carries the secret to all of those places,
   * which defeats the point of redacting the file.
   *
   * The fingerprint is a truncated SHA-256 of the matched bytes. It is stable
   * enough to correlate the same secret across runs and not reversible for
   * anything with real entropy.
   *
   * @param {GitleaksFinding|SecretFinding} finding - Finding in any format
   * @returns {Object} Safe finding, free of raw secret material
   */
  static toSafeFinding(finding) {
    const normalized = this._normalizeFinding(finding);
    const match = typeof normalized.Match === 'string' ? normalized.Match : '';

    return {
      file: normalized.File ?? null,
      ruleId: normalized.RuleID || 'UNKNOWN',
      startLine: normalized.StartLine ?? null,
      endLine: normalized.EndLine ?? normalized.StartLine ?? null,
      startColumn: normalized.StartColumn ?? null,
      endColumn: normalized.EndColumn ?? null,
      matchLength: match.length,
      preview: this.getMarker(normalized, 'typed'),
      fingerprint: match
        ? crypto.createHash('sha256').update(match).digest('hex').slice(0, 16)
        : null,
    };
  }

  /**
   * Map a list of findings through {@link SecretRedactor.toSafeFinding}.
   * @param {Array} findings - Findings in any supported format
   * @returns {Object[]} Safe findings
   */
  static toSafeFindings(findings) {
    if (!Array.isArray(findings)) return [];
    return findings.map((finding) => this.toSafeFinding(finding));
  }
}

export default SecretRedactor;
