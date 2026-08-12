/**
 * The canonical `copytree-ndjson@1` serializer.
 *
 * One JSON value per line, per http://ndjson.org/: a metadata record, one
 * record per file, then a summary record.
 */

import { OUTPUT_FORMAT_VERSIONS } from '../utils/outputVersion.js';
import { binaryPolicyFor, calculateTotalSize, contentFor } from './document.js';

/**
 * Serialize a document as NDJSON.
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;
  const totalSize = calculateTotalSize(files);

  const metadata = {
    type: 'metadata',
    format: OUTPUT_FORMAT_VERSIONS.ndjson,
    directory: doc.basePath,
    ...(options.reproducible ? {} : { generated: new Date().toISOString() }),
    fileCount: files.length,
    totalSize,
    profile: doc.profile?.name || 'default',
  };

  if (doc.gitMetadata) {
    metadata.git = {
      branch: doc.gitMetadata.branch || null,
      lastCommit: doc.gitMetadata.lastCommit
        ? {
            hash: doc.gitMetadata.lastCommit.hash,
            message: doc.gitMetadata.lastCommit.message,
          }
        : null,
      filterType: doc.gitMetadata.filterType || null,
      hasUncommittedChanges: doc.gitMetadata.hasUncommittedChanges || false,
    };
  }

  if (doc.instructions) {
    metadata.instructions = {
      name: doc.instructionsName || 'default',
      content: doc.instructions,
    };
  }

  yield `${JSON.stringify(metadata)}\n`;

  for (const file of files) {
    const record = {
      type: 'file',
      path: file.path,
      size: file.size,
      ...(options.includeMetadata && !options.reproducible ? { modified: file.modified } : {}),
      isBinary: Boolean(file.isBinary),
    };

    if (file.encoding) record.encoding = file.encoding;
    if (file.binaryCategory && options.includeMetadata) record.binaryCategory = file.binaryCategory;
    if (file.gitStatus) record.gitStatus = file.gitStatus;
    if (file.truncated) {
      record.truncated = true;
      if (file.originalLength !== undefined) record.originalLength = file.originalLength;
    }

    if (!options.onlyTree && !file.excluded) {
      if (file.isBinary && binaryPolicyFor(file, options) === 'comment') {
        record.excluded = true;
        record.excludeReason = 'binary-comment-policy';
      } else if (typeof file.content === 'string') {
        record.content = contentFor(file, options);
      }
    }

    yield `${JSON.stringify(record)}\n`;
  }

  const summary = {
    type: 'summary',
    fileCount: files.length,
    totalSize,
    ...(options.reproducible ? {} : { processedAt: new Date().toISOString() }),
  };

  yield `${JSON.stringify(summary)}\n`;
}

export default chunks;
