import Stage from '../Stage.js';
import { assertFormat, buildDocument, serialize } from '../../formatters/index.js';
import { openAtomicWriteStream } from '../../utils/atomicWrite.js';

/**
 * Write the document to its destination as it is produced.
 *
 * Streaming is how a document is written, not a different document. This stage
 * owns no serialization: it renders through the same `src/formatters` chunks
 * the buffered stage joins, so the two cannot drift. What it owns is the
 * destination — opening it late, respecting backpressure, and replacing a file
 * atomically so a failed or cancelled run cannot leave half an export where a
 * complete one used to be.
 */
class StreamingOutputStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Fatal for the same reason OutputFormattingStage is: recovering past a
    // failure to produce the document means reporting success with no document,
    // or with a different one than was asked for.
    this.fatal = true;
    // Validated in the constructor: an unknown format must fail before
    // discovery has read anything.
    this.format = assertFormat(options.format ?? 'xml');
    // A destination *path* rather than an open stream. Opening it during stage
    // assembly meant the file was created — and an existing one truncated —
    // before discovery had even run, and minutes before this stage attached an
    // error listener, so a bad path surfaced as an uncaught EventEmitter error
    // instead of a reported failure.
    this.outputPath = options.outputPath || null;
    this.outputStream = options.outputStream || null;
    this.signal = options.signal ?? null;
    this.renderOptions = {
      format: this.format,
      addLineNumbers: options.addLineNumbers ?? options.withLineNumbers,
      onlyTree: options.onlyTree || false,
      includeMetadata: options.includeMetadata !== false,
      reproducible: options.reproducible === true,
      prettyPrint: options.prettyPrint,
      withGitStatus: options.withGitStatus,
      showSize: options.showSize,
    };
  }

  /**
   * Streaming failures are fatal, exactly as buffered formatting failures are.
   * @param {Error} error - The failure
   * @param {*} _input - Unused
   * @throws {Error} Always
   */
  async handleError(error, _input) {
    this.log(`Streaming output failed: ${error.message}`, 'debug');
    throw error;
  }

  async process(input) {
    this.log(`Streaming output as ${this.format}`, 'debug');
    const startTime = Date.now();

    const document = buildDocument(input, this.renderOptions, this.config);

    if (this.outputPath) {
      await this.streamToFile(document);
    } else {
      await this.streamToWritable(document, this.outputStream || process.stdout);
    }

    this.log(`Streamed output in ${this.getElapsedTime(startTime)}`, 'info');

    return { ...input, streamed: true, outputFormat: this.format };
  }

  /**
   * Write to a file, replacing it only once the document is complete.
   * @param {Object} document - Canonical document
   * @returns {Promise<void>} Resolves once the destination is replaced
   */
  async streamToFile(document) {
    const handle = await openAtomicWriteStream(this.outputPath, { signal: this.signal });

    try {
      for await (const chunk of serialize(document)) {
        this.signal?.throwIfAborted();
        await handle.write(chunk);
      }
      await handle.commit();
    } catch (error) {
      await handle.abort();
      throw error;
    }
  }

  /**
   * Write to a writable this stage does not own.
   *
   * stdout and a caller-supplied stream outlive the run, so they are never
   * closed here — only written to, with backpressure honoured.
   *
   * @param {Object} document - Canonical document
   * @param {NodeJS.WritableStream} destination - Where to write
   * @returns {Promise<void>} Resolves once every chunk is accepted
   */
  async streamToWritable(document, destination) {
    for await (const chunk of serialize(document)) {
      this.signal?.throwIfAborted();
      if (destination.write(chunk)) continue;
      await new Promise((resolve, reject) => {
        destination.once('drain', resolve);
        destination.once('error', reject);
      });
    }
  }
}

export default StreamingOutputStage;
