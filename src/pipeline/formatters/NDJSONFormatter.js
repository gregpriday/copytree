/**
 * NDJSON (Newline Delimited JSON) Formatter
 *
 * Outputs one JSON object per line, enabling:
 * - Streaming and incremental processing
 * - Line-by-line consumption with standard Unix tools (jq, grep, etc.)
 * - Efficient memory usage for large outputs
 * - Log aggregation system compatibility
 *
 * Specification: http://ndjson.org/
 * Each line is a valid, self-contained JSON value separated by \n
 */
class NDJSONFormatter {
  constructor({ stage, addLineNumbers = false, onlyTree = false } = {}) {
    this.stage = stage;
    this.addLineNumbers = addLineNumbers;
    this.onlyTree = onlyTree;
  }

  /**
   * Format input as buffered NDJSON output
   * @param {Object} input - Pipeline input with files array
   * @returns {Promise<string>} NDJSON formatted string
   */
  async format(input) {
    const lines = [];
    await this._produce(input, (line) => lines.push(line));
    return lines.join('\n') + '\n';
  }

  /**
   * Stream NDJSON output line-by-line to a writer
   * @param {Object} input - Pipeline input with files array
   * @param {Function} writer - Function to write each line
   * @returns {Promise<void>}
   */
  async stream(input, writer) {
    if (!writer || typeof writer !== 'function') {
      throw new Error('NDJSONFormatter.stream requires a writer function');
    }
    await this._produce(input, (line) => writer(line + '\n'));
  }

  /**
   * Internal method to produce NDJSON records
   * @param {Object} input - Pipeline input
   * @param {Function} write - Function to write each JSON line
   * @returns {Promise<void>}
   * @private
   */
  async _produce(input, write) {
    const files = (input.files || []).filter((f) => f !== null);
    const totalSize = this.stage.calculateTotalSize(files);
    const profileName = input.profile?.name || 'default';

    // Metadata record
    const metadata = {
      type: 'metadata',
      directory: input.basePath,
      generated: new Date().toISOString(),
      fileCount: files.length,
      totalSize,
      profile: profileName,
    };

    // Add git metadata if present
    if (input.gitMetadata) {
      metadata.git = {
        branch: input.gitMetadata.branch || null,
        lastCommit: input.gitMetadata.lastCommit
          ? {
              hash: input.gitMetadata.lastCommit.hash,
              message: input.gitMetadata.lastCommit.message,
            }
          : null,
        filterType: input.gitMetadata.filterType || null,
        hasUncommittedChanges: input.gitMetadata.hasUncommittedChanges || false,
      };
    }

    // Add instructions if present
    if (input.instructions) {
      metadata.instructions = {
        name: input.instructionsName || 'default',
        content: input.instructions,
      };
    }

    write(JSON.stringify(metadata));

    // File records
    for (const file of files) {
      const record = {
        type: 'file',
        path: file.path,
        size: file.size,
        modified: file.modified,
        isBinary: !!file.isBinary,
      };

      // Add optional fields
      if (file.encoding) {
        record.encoding = file.encoding;
      }

      if (file.binaryCategory) {
        record.binaryCategory = file.binaryCategory;
      }

      if (file.gitStatus) {
        record.gitStatus = file.gitStatus;
      }

      if (file.truncated) {
        record.truncated = true;
        if (file.originalLength !== undefined) {
          record.originalLength = file.originalLength;
        }
      }

      // Add content unless --only-tree or file is excluded
      if (!this.onlyTree && !file.excluded) {
        const binaryAction = this.stage.config.get('copytree.binaryFileAction', 'placeholder');
        const policy =
          this.stage.config.get('copytree.binaryPolicy', {})[file.binaryCategory] || binaryAction;

        // Skip files that should be rendered as comments or excluded
        if (file.isBinary && policy === 'comment') {
          record.excluded = true;
          record.excludeReason = 'binary-comment-policy';
        } else if (typeof file.content === 'string') {
          let content = file.content;

          // Add line numbers if requested
          if (this.addLineNumbers && !file.isBinary) {
            content = this.stage.addLineNumbersToContent(content);
          }

          record.content = content;
        }
      }

      write(JSON.stringify(record));
    }

    // Summary record
    const summary = {
      type: 'summary',
      fileCount: files.length,
      totalSize,
      processedAt: new Date().toISOString(),
    };

    write(JSON.stringify(summary));
  }
}

export default NDJSONFormatter;
