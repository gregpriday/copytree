import Stage from '../Stage.js';
import fs from '../../utils/fsx.js';
import path from 'path';
import { detect, detectFromBuffer, categorizeByExt } from '../../utils/BinaryDetector.js';
import { Minimatch } from 'minimatch';
import { getLimiterFor } from '../../utils/taskLimiter.js';

/**
 * Size below which a file of unknown type is read in one go rather than sniffed
 * and then read again.
 *
 * Above this, the two-step path is kept: an extensionless blob that turns out to
 * be binary should not be pulled into memory in full just to be replaced by a
 * placeholder. Below it, the second open costs more than the bytes saved.
 */
const SINGLE_READ_CEILING = 512 * 1024;

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
    const filesWithContent = await Promise.all(
      input.files.map((file) => limit(() => this.loadFileContent(file, settings))),
    );

    this.log(`Loaded file contents in ${this.getElapsedTime(startTime)}`, 'info');

    return {
      ...input,
      files: filesWithContent,
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

      // Handle non-convertible binaries
      if (det.isBinary) {
        return this.handleBinaryFile(file, det, policy, settings, buffer);
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
      this.log(`Error loading ${file.path}: ${error.message}`, 'warn');

      return {
        ...file,
        content: `[Error loading file: ${error.message}]`,
        error: error.message,
        isBinary: false,
      };
    }
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
        return this.loadBinaryAsBase64(file, det, buffer);

      case 'placeholder':
      default:
        return {
          ...file,
          content:
            settings?.placeholder ??
            this.config.get('copytree.binaryPlaceholderText', '[Binary file not included]'),
          isBinary: true,
          binaryCategory: det.category,
          binaryName: det.name,
        };
    }
  }

  async loadBinaryAsBase64(file, det, preloaded = null) {
    try {
      const buffer = preloaded ?? (await fs.readFile(file.absolutePath));
      const base64 = buffer.toString('base64');

      return {
        ...file,
        content: base64,
        isBinary: true,
        encoding: 'base64',
        binaryCategory: det?.category,
        binaryName: det?.name,
      };
    } catch (error) {
      return {
        ...file,
        content: `[Error loading binary file: ${error.message}]`,
        error: error.message,
        isBinary: true,
        binaryCategory: det?.category,
        binaryName: det?.name,
      };
    }
  }
}

export default FileLoadingStage;
