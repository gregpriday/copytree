import Stage from '../Stage.js';
import fs from '../../utils/fsx.js';
import path from 'path';
import { detect, detectFromBuffer, categorizeByExt } from '../../utils/BinaryDetector.js';
import { Minimatch } from 'minimatch';
import { getLimiterFor } from '../../utils/taskLimiter.js';
import { EXCLUSION_REASONS } from '../../utils/exclusionReport.js';
import { ERROR_CODES, FileSystemError, ValidationError, isAbortError } from '../../utils/errors.js';

/**
 * Size below which a file of unknown type is read in one go rather than sniffed
 * and then read again.
 *
 * Above this, the two-step path is kept: an extensionless blob that turns out to
 * be binary should not be pulled into memory in full just to be replaced by a
 * placeholder. Below it, the second open costs more than the bytes saved.
 */
const SINGLE_READ_CEILING = 512 * 1024;

/**
 * The binary policies this stage implements.
 *
 * Must equal the `binaryPolicyValue` enum in `config/schema.json`. A closed
 * schema promises that every accepted value means something precise, and the
 * enum used to accept `load` and `omit` while the switch below quietly treated
 * both as `placeholder`.
 */
export const IMPLEMENTED_BINARY_POLICIES = Object.freeze([
  'skip',
  'comment',
  'placeholder',
  'base64',
]);

class FileLoadingStage extends Stage {
  constructor(options = {}) {
    super(options);
    // Skipping this stage yields a document with every file's content missing,
    // which formats successfully and says nothing.
    this.fatal = true;
    this.encoding = options.encoding || 'utf8';
    // Config may not be available yet in constructor, but the proxy returns defaults
    this.binaryAction = this.config.get('copytree.binaryFileAction', 'placeholder');
  }

  async process(input) {
    this.log(`Loading content for ${input.files.length} files`, 'debug');
    const startTime = Date.now();

    const settings = this.resolveSettings();

    // `Promise.all` over the whole selection issued one open per file at once,
    // so a large selection went straight at the descriptor limit. A bounded
    // limiter keeps peak descriptors flat and, because the disk is not helped by
    // 10,000 simultaneous reads, is no slower.
    const limit = getLimiterFor('load', 64);
    const loaded = await Promise.all(
      input.files.map((file) => limit(() => this.loadFileContent(file, settings))),
    );

    // The `skip` policy returns null, and those nulls used to travel the rest of
    // the pipeline: every later stage and both formatters had to remember to
    // step around them, and the ones that forgot dereferenced null. A file that
    // was dropped is dropped here, and recorded as an exclusion so it can still
    // be accounted for.
    const files = [];
    const report = input.exclusionReport;
    for (let i = 0; i < loaded.length; i++) {
      if (loaded[i] !== null) {
        files.push(loaded[i]);
        continue;
      }
      const skipped = input.files[i];
      report?.add({
        path: skipped.path,
        size: skipped.size || 0,
        reason: EXCLUSION_REASONS.BINARY_POLICY,
        rule: 'copytree.binaryFileAction:skip',
      });
    }

    this.log(`Loaded file contents in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      files,
    };
  }

  /**
   * Resolve the per-run settings that used to be looked up per file.
   *
   * Config lookups walk a dotted path and compiling a glob is not free; doing
   * either 10,000 times to reach 10,000 identical answers is pure overhead. The
   * work is done once per run and handed to each file.
   *
   * @returns {Object} Hoisted settings
   */
  resolveSettings() {
    return {
      structureOnly: (this.config.get('copytree.structureOnlyPatterns', []) || []).map(
        (pattern) => new Minimatch(pattern, { dot: true, nocase: process.platform === 'win32' }),
      ),
      detectOptions: {
        sampleBytes: this.config.get('copytree.binaryDetect.sampleBytes', 8192),
        nonPrintableThreshold: this.config.get('copytree.binaryDetect.nonPrintableThreshold', 0.3),
        extensions: this.config.get('copytree.binaryExtensions', undefined),
      },
      binaryPolicy: this.config.get('copytree.binaryPolicy', {}) || {},
      binaryAction: this.config.get('copytree.binaryFileAction', this.binaryAction),
      placeholder: this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
      maxBase64Size: this.config.get('copytree.maxBase64Size', 1024 * 1024),
    };
  }

  /**
   * Load one file's content.
   *
   * @param {Object} file - Discovered file entry
   * @param {Object} [settings] - Hoisted settings; resolved on demand when this
   *   method is called directly rather than through `process()`
   * @returns {Promise<Object|null>} File with content, or null when skipped
   */
  async loadFileContent(file, settings = this.resolveSettings()) {
    try {
      // 1. Check for Structure Only patterns (Token saving)
      const isStructureOnly = settings.structureOnly.some((matcher) => matcher.match(file.path));

      if (isStructureOnly) {
        return {
          ...file,
          content: '[Content skipped for AI context optimization]', // Token-efficient placeholder
          isBinary: true, // Treat as binary to skip line numbering/processing
          binaryCategory: 'structure-only',
        };
      }

      // 2. Classify. Extension first: a known-binary extension is decided from
      //    the path with no open/read, so a multi-gigabyte video costs one stat.
      const ext = path.extname(file.absolutePath);
      const knownCategory = categorizeByExt(ext, settings.detectOptions.extensions);

      let det;
      let buffer = null;

      if (knownCategory) {
        det = { isBinary: true, category: knownCategory, reason: 'extension', ext };
      } else if ((file.size ?? 0) <= SINGLE_READ_CEILING) {
        // Unknown extension and small: read once and classify from those bytes,
        // rather than reading a prefix to decide and then reading it all again.
        buffer = await fs.readFile(file.absolutePath);
        det = detectFromBuffer(file.absolutePath, buffer, settings.detectOptions);
      } else {
        det = await detect(file.absolutePath, settings.detectOptions);
      }

      // Get policy for this file's category
      const policy = settings.binaryPolicy[det.category] || settings.binaryAction;

      // Handle non-convertible binaries.
      //
      // `await`, not a bare `return`. Returning a promise from inside a `try`
      // does not route its rejection through the `catch` below, so a missing
      // file under the `base64` policy escaped as a raw `ENOENT` instead of the
      // typed `FileSystemError` this method promises.
      if (det.isBinary) {
        return await this.handleBinaryFile(file, det, policy, settings, buffer);
      }

      // Regular text file. One pass over the content rather than two: `\r\n?`
      // covers CRLF and a lone CR in a single scan.
      const raw = buffer
        ? buffer.toString(this.encoding)
        : await fs.readFile(file.absolutePath, this.encoding);
      const content = raw.includes('\r') ? raw.replace(/\r\n?/g, '\n') : raw;

      return {
        ...file,
        content,
        isBinary: false,
        encoding: this.encoding,
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      // A rejected *policy* is a configuration mistake, not an I/O failure.
      // Wrapping it as `Failed to read <path>` would blame the file for the
      // configuration, and send the reader to check permissions on a file that
      // is perfectly readable.
      if (error instanceof ValidationError) throw error;

      // Not encoded into the content. `[Error loading file: EACCES ...]` is
      // indistinguishable, to every consumer, from a source file that happens
      // to contain that sentence: the path appears in the tree, the body looks
      // like text, the run exits 0, and an agent reads the failure as source.
      // A file that could not be read is an operational failure, and this stage
      // is fatal, so it propagates.
      throw new FileSystemError(
        `Failed to read ${file.path}: ${error.message}`,
        file.absolutePath,
        'read',
        { cause: error, code: ERROR_CODES.FILESYSTEM, errno: error.code },
      );
    }
  }

  /**
   * The placeholder emitted in place of a binary too large to inline.
   *
   * @param {Object} file - File entry
   * @param {Object} det - Binary classification
   * @param {number} size - Size in bytes
   * @param {number} ceiling - The configured ceiling
   * @returns {Object} File with a placeholder body
   * @private
   */
  _tooLargeToInline(file, det, size, ceiling) {
    this.log(
      `${file.path} is ${size} bytes, over the ${ceiling}-byte base64 ceiling; ` +
        `emitting a placeholder instead`,
      'warn',
    );

    return {
      ...file,
      content: `[Binary file too large to inline: ${size} bytes]`,
      isBinary: true,
      binaryCategory: det?.category,
      binaryName: det?.name,
    };
  }

  handleBinaryFile(file, det, policy, settings = null, buffer = null) {
    switch (policy) {
      case 'skip':
        return null;

      case 'comment':
        // Return stub for formatters to emit comments
        return {
          ...file,
          content: '',
          isBinary: true,
          excluded: true,
          excludedReason: det.category || 'binary',
          binaryCategory: det.category,
          binaryName: det.name,
        };

      case 'base64':
        return this.loadBinaryAsBase64(file, det, buffer, settings?.maxBase64Size ?? Infinity);

      case 'placeholder':
        return {
          ...file,
          content:
            settings?.placeholder ??
            this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
          isBinary: true,
          binaryCategory: det.category,
          binaryName: det.name,
        };

      default:
        // The `default` case used to be `placeholder`, which made the schema's
        // closed enum a lie: `load` and `omit` validated cleanly and then did
        // something else entirely. Both are gone from the schema now, and an
        // unrecognised value is reported rather than reinterpreted.
        throw new ValidationError(
          `Unknown binary policy: ${JSON.stringify(policy)}. ` +
            `Expected one of ${IMPLEMENTED_BINARY_POLICIES.join(', ')}`,
          'copytree.binaryFileAction',
          policy,
        );
    }
  }

  /**
   * Read a binary file as base64, subject to a hard size ceiling.
   *
   * @param {Object} file - File entry
   * @param {Object} det - Binary classification
   * @param {Buffer|null} [preloaded] - Bytes already read during classification
   * @param {number} [maxBase64Size] - Hard ceiling on the source file's size
   * @returns {Promise<Object>} File with base64 content, or a placeholder when over the ceiling
   */
  async loadBinaryAsBase64(file, det, preloaded = null, maxBase64Size = Infinity) {
    // Checked from the already-known size, before any open. Base64 inflates by
    // a third on top of the raw bytes, so an unbounded `base64` policy turns one
    // large video into a multi-gigabyte string — and it was unbounded, despite
    // `copytree.maxBase64Size` being a public, documented configuration key.
    const bounded = Number.isFinite(maxBase64Size);
    const declared = file.size ?? preloaded?.length ?? 0;
    if (bounded && declared > maxBase64Size) {
      return this._tooLargeToInline(file, det, declared, maxBase64Size);
    }

    // No catch. A read failure here is the same operational failure as any
    // other unreadable file, and encoding it as content was how it used to
    // reach the export looking like data.
    const buffer = preloaded ?? (await fs.readFile(file.absolutePath));

    // Checked again against the bytes actually read. `file.size` comes from a
    // stat taken at discovery: it is absent for a file classified by extension
    // alone, and stale for one that grew between discovery and now. The
    // pre-read check is the cheap guard that avoids the read; this is the one
    // that actually holds.
    if (bounded && buffer.length > maxBase64Size) {
      return this._tooLargeToInline(file, det, buffer.length, maxBase64Size);
    }

    return {
      ...file,
      content: buffer.toString('base64'),
      isBinary: true,
      encoding: 'base64',
      binaryCategory: det?.category,
      binaryName: det?.name,
    };
  }
}

export default FileLoadingStage;
