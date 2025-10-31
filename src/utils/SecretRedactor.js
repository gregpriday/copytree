import crypto from 'crypto';

/**
 * Utility for redacting secrets from file content while preserving structure
 *
 * Implements span-based redaction that maintains line numbers, formatting,
 * and overall text structure. Supports multiple redaction modes.
 */
class SecretRedactor {
  /**
   * Redact secrets from content based on findings
   *
   * @param {string} content - Original file content
   * @param {Array<GitleaksFinding>} findings - Array of secret findings
   * @param {'typed'|'generic'|'hash'} mode - Redaction mode
   * @returns {{content: string, count: number}} Redacted content and redaction count
   */
  static redact(content, findings, mode = 'typed') {
    if (!findings || findings.length === 0) {
      return { content, count: 0 };
    }

    // Convert content to line array for precise indexing
    const lines = content.split('\n');
    const lineOffsets = this._calculateLineOffsets(content);

    // Sort findings in reverse order (bottom to top) to maintain indices
    const sorted = [...findings].sort((a, b) => {
      // Sort by line first, then by column
      if (b.StartLine !== a.StartLine) {
        return b.StartLine - a.StartLine;
      }
      return b.StartColumn - a.StartColumn;
    });

    let redactedContent = content;
    let redactionCount = 0;

    // Apply redactions in reverse order
    for (const finding of sorted) {
      try {
        const replacement = this.getMarker(finding, mode);
        const { startIndex, endIndex } = this._findingToIndices(finding, lines, lineOffsets);

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          redactedContent =
            redactedContent.slice(0, startIndex) + replacement + redactedContent.slice(endIndex);
          redactionCount++;
        }
      } catch (error) {
        // Skip findings that can't be mapped (edge case)
        continue;
      }
    }

    return { content: redactedContent, count: redactionCount };
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
    const startLine = finding.StartLine - 1; // Convert to 0-indexed
    const endLine = finding.EndLine - 1;
    const startCol = finding.StartColumn - 1; // Convert to 0-indexed
    const endCol = finding.EndColumn - 1;

    // Validate line indices
    if (startLine < 0 || startLine >= lines.length) {
      return { startIndex: -1, endIndex: -1 };
    }

    if (endLine < 0 || endLine >= lines.length) {
      return { startIndex: -1, endIndex: -1 };
    }

    // Calculate absolute indices
    const startIndex = lineOffsets[startLine] + startCol;

    // For end index, we need to account for potential multi-line secrets
    let endIndex;
    if (startLine === endLine) {
      // Single line secret
      endIndex = lineOffsets[startLine] + endCol;
    } else {
      // Multi-line secret
      endIndex = lineOffsets[endLine] + endCol;
    }

    return { startIndex, endIndex };
  }

  /**
   * Calculate absolute character offsets for each line
   * @private
   * @param {string} content - File content
   * @returns {number[]} Array of line start offsets
   */
  static _calculateLineOffsets(content) {
    const offsets = [0]; // First line starts at 0
    let offset = 0;

    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        offsets.push(i + 1);
      }
    }

    return offsets;
  }

  /**
   * Apply redactions to a batch of files
   *
   * @param {Array<{content: string, findings: Array}>} files - Files with findings
   * @param {'typed'|'generic'|'hash'} mode - Redaction mode
   * @returns {Array<{content: string, redactionCount: number}>} Redacted files
   */
  static redactBatch(files, mode = 'typed') {
    return files.map((file) => {
      const { content, count } = this.redact(file.content, file.findings, mode);
      return {
        ...file,
        content,
        redactionCount: count,
      };
    });
  }
}

export default SecretRedactor;
