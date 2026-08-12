/**
 * The canonical `copytree-sarif@1` serializer.
 *
 * SARIF v2.1.0, for GitHub code scanning, the VS Code SARIF viewer and other
 * consumers of https://docs.oasis-open.org/sarif/sarif/v2.1.0/.
 *
 * The tool version is CopyTree's real version. The streaming path used to
 * hard-code `0.0.0`, so the same run reported two different tool versions
 * depending on which destination it was written to.
 *
 * **This serializer emits one chunk.** Every other format streams; SARIF is a
 * single JSON object whose `runs[].results` array is an envelope member, so
 * there is no prefix a consumer could act on before the whole thing exists.
 * Chunking it would mean hand-rolling the envelope for no benefit — a SARIF
 * reader needs the complete document regardless. The parity guarantee is
 * unaffected: one chunk concatenates to itself.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION } from '../version.js';
import { calculateTotalSize } from './document.js';

const INFORMATION_URI = 'https://copytree.dev';

/**
 * Convert a filesystem path to a `file://` URI.
 * @param {string} fileSystemPath - Path
 * @returns {string|undefined} URI
 */
function toFileUri(fileSystemPath) {
  if (!fileSystemPath) return undefined;
  if (fileSystemPath.startsWith('file://')) return fileSystemPath;
  if (path.isAbsolute(fileSystemPath)) return pathToFileURL(fileSystemPath).href;
  return fileSystemPath.replace(/\\/g, '/');
}

/**
 * Convert one file into a SARIF result.
 * @param {Object} file - File entry
 * @param {import('./document.js').DocumentOptions} options - Resolved options
 * @returns {Object} SARIF result
 */
function fileToResult(file, options) {
  let totalLines = 0;
  if (typeof file.content === 'string' && !options.onlyTree && !file.isBinary) {
    totalLines = file.content.split('\n').length;
  }

  const result = {
    ruleId: 'file-discovered',
    level: 'note',
    message: { text: `File discovered: ${file.path}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file.path, uriBaseId: '%SRCROOT%' },
        },
      },
    ],
    properties: {
      size: file.size || 0,
      ...(options.includeMetadata && !options.reproducible
        ? { modified: file.modified || null }
        : {}),
      isBinary: Boolean(file.isBinary),
    },
  };

  if (totalLines > 0) {
    result.locations[0].physicalLocation.region = {
      startLine: 1,
      endLine: Math.max(1, totalLines),
    };
  }

  if (file.encoding) result.properties.encoding = file.encoding;
  if (file.binaryCategory && options.includeMetadata) {
    result.properties.binaryCategory = file.binaryCategory;
  }
  if (file.gitStatus) result.properties.gitStatus = file.gitStatus;
  if (file.truncated) {
    result.properties.truncated = true;
    if (file.originalLength !== undefined) {
      result.properties.originalLength = file.originalLength;
    }
  }

  return result;
}

/**
 * Serialize a document as SARIF.
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CopyTree',
            version: doc.version || VERSION,
            informationUri: INFORMATION_URI,
            rules: [
              {
                id: 'file-discovered',
                name: 'FileDiscovered',
                shortDescription: { text: 'A file was discovered by CopyTree.' },
                fullDescription: {
                  text: 'CopyTree enumerated this file in the selected scope based on the configured profile and filters.',
                },
                helpUri: INFORMATION_URI,
                defaultConfiguration: { level: 'note' },
                properties: {
                  category: 'file-discovery',
                  tags: ['discovery', 'enumeration'],
                },
              },
            ],
          },
        },
        results: files.map((file) => fileToResult(file, options)),
        invocations: [
          {
            executionSuccessful: true,
            ...(options.reproducible ? {} : { endTimeUtc: new Date().toISOString() }),
            workingDirectory: { uri: toFileUri(doc.basePath) },
          },
        ],
        properties: {
          profile: doc.profile?.name || 'default',
          fileCount: files.length,
          totalSize: calculateTotalSize(files),
          git: doc.gitMetadata
            ? {
                branch: doc.gitMetadata.branch || null,
                lastCommit: doc.gitMetadata.lastCommit
                  ? {
                      hash: doc.gitMetadata.lastCommit.hash,
                      message: doc.gitMetadata.lastCommit.message,
                    }
                  : null,
                hasUncommittedChanges: doc.gitMetadata.hasUncommittedChanges || false,
              }
            : null,
        },
      },
    ],
  };

  yield `${JSON.stringify(sarif, null, options.prettyPrint ? 2 : 0)}\n`;
}

export default chunks;
