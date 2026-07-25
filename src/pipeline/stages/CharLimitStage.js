import Stage from '../Stage.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';

/**
 * CharLimitStage - Enforces a character budget across loaded file content.
 *
 * Truncation rules:
 * - Cuts at a line boundary. Cutting mid-line hands the agent a syntax error to
 *   reason about; cutting mid-code-point hands it a lone surrogate.
 * - Marks the cut inline (`… [truncated N of M lines]`) so the agent cannot
 *   conclude the file simply ends there.
 * - Never emits an unpaired UTF-16 surrogate, so downstream consumers can chunk
 *   the output at arbitrary offsets.
 */
class CharLimitStage extends Stage {
  constructor(options = {}) {
    super(options);
    this.limit = options.limit || 2000000; // 2M chars default
    // Planning mode: content has not been loaded (dry run), so byte size stands
    // in for character length. Near-exact for the UTF-8 text that gets included,
    // which is what keeps a dry run a strict prefix of the real run.
    this.plan = options.plan === true;
  }

  async process(input) {
    this.log(`Applying character limit of ${this.limit.toLocaleString()} characters`, 'debug');
    const startTime = Date.now();

    const report = input.exclusionReport;
    let totalChars = 0;
    const limitedFiles = [];
    let truncatedFiles = 0;
    let skippedFiles = 0;
    let budgetExhausted = false;

    for (const file of input.files) {
      const hasContent = typeof file?.content === 'string';

      if (!file || (!hasContent && !this.plan)) {
        limitedFiles.push(file);
        continue;
      }

      const contentLength = hasContent ? file.content.length : file.size || 0;

      if (budgetExhausted) {
        skippedFiles++;
        report?.add({
          path: file.path,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.CHAR_BUDGET,
          rule: `charLimit:${this.limit}`,
        });
        continue;
      }

      if (totalChars + contentLength <= this.limit) {
        // File fits entirely
        limitedFiles.push(file);
        totalChars += contentLength;
        continue;
      }

      const remaining = this.limit - totalChars;

      if (!hasContent) {
        // Planning mode: record the decision without materializing content.
        if (remaining <= 0) {
          skippedFiles++;
          budgetExhausted = true;
          report?.add({
            path: file.path,
            size: file.size || 0,
            reason: EXCLUSION_REASONS.CHAR_BUDGET,
            rule: `charLimit:${this.limit}`,
          });
          continue;
        }

        limitedFiles.push({ ...file, originalLength: contentLength, truncated: true });
        totalChars += remaining;
        truncatedFiles++;
        budgetExhausted = true;
        continue;
      }

      const truncated = truncateAtLineBoundary(file.content, remaining);

      if (truncated === null) {
        // Not even one line fits; drop the file rather than emit a stub.
        skippedFiles++;
        budgetExhausted = true;
        report?.add({
          path: file.path,
          size: file.size || 0,
          reason: EXCLUSION_REASONS.CHAR_BUDGET,
          rule: `charLimit:${this.limit}`,
        });
        continue;
      }

      limitedFiles.push({
        ...file,
        content: truncated.content,
        originalLength: contentLength,
        truncated: true,
        truncatedLines: truncated.droppedLines,
        totalLines: truncated.totalLines,
      });

      totalChars += truncated.content.length;
      truncatedFiles++;
      budgetExhausted = true;
    }

    this.log(
      `Character limit applied: ${totalChars.toLocaleString()} chars used, ${truncatedFiles} truncated, ${skippedFiles} skipped in ${this.getElapsedTime(startTime)}`,
      'info',
    );

    return {
      ...input,
      files: limitedFiles,
      stats: {
        ...input.stats,
        totalCharacters: totalChars,
        characterLimit: this.limit,
        truncatedFiles,
        skippedFiles,
        ...(truncatedFiles > 0 || skippedFiles > 0
          ? {
              truncated: true,
              truncatedCount: (input.stats?.truncatedCount || 0) + truncatedFiles + skippedFiles,
              truncatedBy: input.stats?.truncatedBy ?? 'charLimit',
            }
          : {}),
      },
    };
  }
}

/**
 * Truncate content to at most `budget` characters, preferring a line boundary.
 *
 * Falls back to a hard character cut when not even the first line fits — a
 * minified bundle is one enormous line, and returning nothing at all would be a
 * worse answer than returning its first few hundred characters. The cut is
 * always code-point safe and always marked.
 *
 * @param {string} content - Full file content
 * @param {number} budget - Characters available
 * @returns {{content: string, droppedLines: number, totalLines: number}|null}
 *   Truncated content with its marker, or null when the budget is too small for
 *   even a marker
 */
export function truncateAtLineBoundary(content, budget) {
  if (budget <= 0) return null;

  const lines = content.split('\n');
  const totalLines = lines.length;

  // Reserve room for the marker so the result still fits the budget.
  const markerFor = (dropped, partial) =>
    partial
      ? `\n… [truncated mid-line, ${dropped} of ${totalLines} lines omitted]`
      : `\n… [truncated ${dropped} of ${totalLines} lines]`;
  const maxMarkerLength = markerFor(totalLines, true).length;
  const usable = budget - maxMarkerLength;

  if (usable <= 0) return null;

  let used = 0;
  let keptLines = 0;

  for (const line of lines) {
    // +1 for the newline that rejoins this line to the previous one
    const cost = keptLines === 0 ? line.length : line.length + 1;
    if (used + cost > usable) break;
    used += cost;
    keptLines++;
  }

  if (keptLines === 0) {
    const body = stripLoneSurrogate(content.slice(0, usable));
    return {
      content: body + markerFor(totalLines, true),
      droppedLines: totalLines,
      totalLines,
    };
  }

  const droppedLines = totalLines - keptLines;
  const body = lines.slice(0, keptLines).join('\n');

  return {
    content: stripLoneSurrogate(body) + markerFor(droppedLines, false),
    droppedLines,
    totalLines,
  };
}

/**
 * Drop a trailing unpaired high surrogate.
 *
 * Line boundaries are code-point safe on their own, but content that already
 * contained a lone surrogate would otherwise leak one to consumers that chunk
 * the output at arbitrary offsets.
 *
 * @param {string} text - Text to sanitize
 * @returns {string} Text without a trailing unpaired surrogate
 */
function stripLoneSurrogate(text) {
  if (text.length === 0) return text;
  const last = text.charCodeAt(text.length - 1);
  // High surrogate with nothing following it to pair with
  if (last >= 0xd800 && last <= 0xdbff) {
    return text.slice(0, -1);
  }
  return text;
}

export default CharLimitStage;
