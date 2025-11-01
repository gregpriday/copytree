import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * SARIF (Static Analysis Results Interchange Format) Formatter
 *
 * Outputs SARIF v2.1.0 compliant results for integration with:
 * - GitHub Code Scanning / Security tab
 * - VSCode SARIF Viewer extension
 * - Azure DevOps, Visual Studio, and other CI/CD platforms
 *
 * Specification: https://docs.oasis-open.org/sarif/sarif/v2.1.0/
 * JSON Schema: https://json.schemastore.org/sarif-2.1.0.json
 */
class SARIFFormatter {
  constructor({ stage, addLineNumbers = false, onlyTree = false } = {}) {
    this.stage = stage;
    this.addLineNumbers = addLineNumbers;
    this.onlyTree = onlyTree;
  }

  /**
   * Format input as SARIF v2.1.0 output
   * @param {Object} input - Pipeline input with files array
   * @returns {Promise<string>} SARIF formatted JSON string
   */
  async format(input) {
    const toolName = 'CopyTree';
    const toolVersion = input.version || '0.0.0';
    const informationUri = 'https://copytree.dev';

    const files = (input.files || []).filter((f) => f !== null);
    const results = files.map((file) => this._fileToResult(file, input));

    const sarif = {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: toolName,
              version: toolVersion,
              informationUri,
              rules: [
                {
                  id: 'file-discovered',
                  name: 'FileDiscovered',
                  shortDescription: {
                    text: 'A file was discovered by CopyTree.',
                  },
                  fullDescription: {
                    text: 'CopyTree enumerated this file in the selected scope based on the configured profile and filters.',
                  },
                  helpUri: informationUri,
                  defaultConfiguration: {
                    level: 'note',
                  },
                  properties: {
                    category: 'file-discovery',
                    tags: ['discovery', 'enumeration'],
                  },
                },
              ],
            },
          },
          results,
          invocations: [
            {
              executionSuccessful: true,
              endTimeUtc: new Date().toISOString(),
              workingDirectory: {
                uri: this._toFileUri(input.basePath),
              },
            },
          ],
          properties: {
            profile: input.profile?.name || 'default',
            fileCount: files.length,
            totalSize: this.stage.calculateTotalSize(files),
            git: input.gitMetadata
              ? {
                  branch: input.gitMetadata.branch || null,
                  lastCommit: input.gitMetadata.lastCommit
                    ? {
                        hash: input.gitMetadata.lastCommit.hash,
                        message: input.gitMetadata.lastCommit.message,
                      }
                    : null,
                  hasUncommittedChanges: input.gitMetadata.hasUncommittedChanges || false,
                }
              : null,
          },
        },
      ],
    };

    // Pretty-print SARIF for readability
    const prettyPrint = this.stage.config.get('app.prettyPrint', true);
    return JSON.stringify(sarif, null, prettyPrint ? 2 : 0);
  }

  /**
   * Convert a file object to a SARIF result
   * @param {Object} file - File object from pipeline
   * @param {Object} input - Full pipeline input for context
   * @returns {Object} SARIF result object
   * @private
   */
  _fileToResult(file, input) {
    // Calculate line count from content
    let totalLines = 0;
    if (typeof file.content === 'string' && !this.onlyTree && !file.isBinary) {
      totalLines = file.content.split('\n').length;
    }

    const result = {
      ruleId: 'file-discovered',
      level: 'note',
      message: {
        text: `File discovered: ${file.path}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: file.path,
              uriBaseId: '%SRCROOT%',
            },
          },
        },
      ],
      properties: {
        size: file.size || 0,
        modified: file.modified || null,
        isBinary: !!file.isBinary,
      },
    };

    // Add region if we have content with line counts
    if (totalLines > 0) {
      result.locations[0].physicalLocation.region = {
        startLine: 1,
        endLine: Math.max(1, totalLines),
      };
    }

    // Add optional properties
    if (file.encoding) {
      result.properties.encoding = file.encoding;
    }

    if (file.binaryCategory) {
      result.properties.binaryCategory = file.binaryCategory;
    }

    if (file.gitStatus) {
      result.properties.gitStatus = file.gitStatus;
    }

    if (file.truncated) {
      result.properties.truncated = true;
      if (file.originalLength !== undefined) {
        result.properties.originalLength = file.originalLength;
      }
    }

    return result;
  }

  /**
   * Convert a file system path to a file:// URI
   * @param {string} path - File system path
   * @returns {string} file:// URI
   * @private
   */
  _toFileUri(fileSystemPath) {
    if (!fileSystemPath) {
      return undefined;
    }

    if (fileSystemPath.startsWith('file://')) {
      return fileSystemPath;
    }

    if (path.isAbsolute(fileSystemPath)) {
      return pathToFileURL(fileSystemPath).href;
    }

    // Normalize relative Windows-style paths for SARIF consumers
    return fileSystemPath.replace(/\\/g, '/');
  }
}

export default SARIFFormatter;
