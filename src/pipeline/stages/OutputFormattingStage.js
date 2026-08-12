import Stage from '../Stage.js';
import { assertFormat, buildDocument, render } from '../../formatters/index.js';

/**
 * Render the selection into the requested document.
 *
 * The stage owns no serialization of its own. It builds the canonical document
 * and asks `src/formatters` to render it, which is the same call the streaming
 * stage and both SDK entry points make — so a buffered copy and a streamed copy
 * cannot produce different bytes.
 */
class OutputFormattingStage extends Stage {
  constructor(options = {}) {
    super(options);
    // A caller that asked for XML must not silently receive something else.
    this.fatal = true;
    // Validated in the constructor: an unknown format must fail before
    // discovery has read anything, not after the whole selection is in memory.
    this.format = assertFormat(options.format ?? 'xml');
    this.renderOptions = {
      format: this.format,
      addLineNumbers: options.addLineNumbers ?? options.withLineNumbers,
      onlyTree: options.onlyTree || false,
      // Optional per-entry metadata: modification times, binary categories, the
      // rendered directory structure. On by default; `--no-metadata` strips it
      // while leaving the schema and version fields every consumer parses.
      includeMetadata: options.includeMetadata !== false,
      // `--reproducible` removes the fields that differ between two runs over an
      // identical tree, so a golden file can be compared byte for byte.
      reproducible: options.reproducible === true,
      withGitStatus: options.withGitStatus,
      showSize: options.showSize,
    };
  }

  /**
   * Formatting failures are fatal; there is no safe fallback.
   *
   * This used to answer a failed format request with a JSON blob containing the
   * raw file array. Three things were wrong with that. The caller asked for XML
   * and received JSON, so their parser fails on output that reported success.
   * The raw array bypasses every formatter policy, so binary placeholders and
   * comment templates do not apply. And it serialises file content that the
   * chosen format may have been about to omit entirely.
   *
   * @param {Error} error - The formatting failure
   * @param {*} _input - Unused
   * @throws {Error} Always
   */
  async handleError(error, _input) {
    // Debug, not error: this stage is fatal, so the error is rethrown and
    // reported once by the run reporter with a remediation attached. Logging it
    // here as well printed the same failure twice in two different formats.
    this.log(`Output formatting failed: ${error.message}`, 'debug');
    throw error;
  }

  async process(input) {
    this.log(`Formatting output as ${this.format}`, 'debug');
    const startTime = Date.now();

    const output = await render(buildDocument(input, this.renderOptions, this.config));

    this.log(`Formatted output in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      output,
      outputFormat: this.format,
      outputSize: Buffer.byteLength(output, 'utf8'),
    };
  }
}

export default OutputFormattingStage;
