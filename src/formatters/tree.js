/**
 * The canonical `copytree-tree@1` serializer.
 *
 * The tree view is the one format whose payload is its structure, so
 * `--only-tree` changes nothing here.
 */

import { buildTreeStructure, calculateTotalSize, formatBytes, renderTree } from './document.js';

/**
 * Serialize a document as a tree view.
 * @param {import('./document.js').CopyTreeDocument} doc - Document
 * @yields {string} Output chunks
 */
export async function* chunks(doc) {
  const { options, files } = doc;

  yield `${doc.basePath}\n\n`;

  const lines = renderTree(
    buildTreeStructure(files),
    [],
    '',
    options.showSize,
    options.treeConnectors,
  );

  for (const line of lines) yield `${line}\n`;

  yield `\n${files.length} files, ${formatBytes(calculateTotalSize(files))}\n`;
}

export default chunks;
