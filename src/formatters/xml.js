/**
 * The canonical `copytree-xml@1` serializer.
 *
 * One generator, consumed by both the buffered and the streamed paths. See
 * `document.js` for why there is only one.
 */

import {
  sanitizeForComment,
  sanitizeForXml,
  escapeXmlAttribute,
  escapeXmlText,
} from '../utils/helpers.js';
import { OUTPUT_FORMAT_VERSIONS } from '../utils/outputVersion.js';
import {
  calculateTotalSize,
  contentFor,
  directoryStructure,
  modifiedTimestamp,
  renderBinaryComment,
  rendersAsComment,
} from './document.js';

/**
 * Escape content for a CDATA section.
 *
 * Removes XML-invalid control characters, then splits any literal `]]>` so it
 * cannot terminate the section early.
 *
 * @param {string} content - Raw content
 * @returns {string} CDATA-safe content
 */
export function escapeCdata(content) {
  return sanitizeForXml(String(content)).replaceAll(']]>', ']]]]><![CDATA[>');
}

/**
 * Serialize a document as XML.
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;

  yield '<?xml version="1.0" encoding="UTF-8"?>\n';
  yield `<ct:directory xmlns:ct="urn:copytree" path="${escapeXmlAttribute(doc.basePath)}">\n`;

  yield '  <ct:metadata>\n';
  yield `    <ct:format>${OUTPUT_FORMAT_VERSIONS.xml}</ct:format>\n`;
  // A generation timestamp is the one field guaranteed to differ between two
  // runs over an identical tree, so `--reproducible` omits it.
  if (!options.reproducible) {
    yield `    <ct:generated>${new Date().toISOString()}</ct:generated>\n`;
  }
  yield `    <ct:fileCount>${files.length}</ct:fileCount>\n`;
  yield `    <ct:totalSize>${calculateTotalSize(files)}</ct:totalSize>\n`;

  if (doc.profile) {
    yield `    <ct:profile>${escapeXmlText(doc.profile.name || 'default')}</ct:profile>\n`;
  }

  if (doc.gitMetadata) {
    const git = doc.gitMetadata;
    yield '    <ct:git>\n';
    if (git.branch) {
      yield `      <ct:branch>${escapeXmlText(git.branch)}</ct:branch>\n`;
    }
    if (git.lastCommit) {
      const message = escapeCdata(git.lastCommit.message || '');
      yield `      <ct:lastCommit hash="${escapeXmlAttribute(git.lastCommit.hash)}"><![CDATA[${message}]]></ct:lastCommit>\n`;
    }
    if (git.filterType) {
      yield `      <ct:filterType>${escapeXmlText(git.filterType)}</ct:filterType>\n`;
    }
    yield `      <ct:hasUncommittedChanges>${git.hasUncommittedChanges ? 'true' : 'false'}</ct:hasUncommittedChanges>\n`;
    yield '    </ct:git>\n';
  }

  const structure = options.includeMetadata ? directoryStructure(doc) : '';
  if (structure) {
    yield `    <ct:directoryStructure>${escapeXmlText(structure)}</ct:directoryStructure>\n`;
  }

  if (doc.instructions) {
    const nameAttr = doc.instructionsName
      ? ` name="${escapeXmlAttribute(doc.instructionsName)}"`
      : '';
    yield `    <ct:instructions${nameAttr}><![CDATA[${escapeCdata(doc.instructions)}]]></ct:instructions>\n`;
  }

  yield '  </ct:metadata>\n';
  yield '  <ct:files>\n';

  for (const file of files) {
    let header = `    <ct:file path="@${escapeXmlAttribute(file.path)}" size="${escapeXmlAttribute(file.size)}"`;

    const modified = modifiedTimestamp(file, options);
    if (modified) header += ` modified="${modified}"`;

    if (file.isBinary) {
      header += ' binary="true"';
      if (file.encoding) header += ` encoding="${escapeXmlAttribute(file.encoding)}"`;
    }

    if (file.binaryCategory && options.includeMetadata) {
      header += ` binaryCategory="${escapeXmlAttribute(file.binaryCategory)}"`;
    }

    if (file.gitStatus) header += ` gitStatus="${escapeXmlAttribute(file.gitStatus)}"`;

    yield `${header}>`;

    if (!options.onlyTree) {
      if (rendersAsComment(file, options)) {
        yield renderBinaryComment(file, options.binaryCommentTemplates.xml, sanitizeForComment);
      } else {
        yield `<![CDATA[${escapeCdata(contentFor(file, options))}]]>`;
      }
    }

    yield '</ct:file>\n';
  }

  yield '  </ct:files>\n';
  yield '</ct:directory>\n';
}

export default chunks;
