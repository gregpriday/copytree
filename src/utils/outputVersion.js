/**
 * Output format versions.
 *
 * Agents are prompted against the shape CopyTree emits: the XML element names,
 * the Markdown begin/end markers, the JSON metadata keys. A silent change to
 * any of those is a silent regression in every downstream conversation, so each
 * format carries a version string in its header and the delimiters are treated
 * as a compatibility surface.
 *
 * **The identifier is a single integer: a major schema family, and nothing
 * else.** Additive changes — a new optional field, a new stats key — do not
 * change it, because a parser written against `copytree-xml@1` still works.
 * Bump the integer for anything that would break such a parser: renamed or
 * removed fields, changed delimiters, changed nesting.
 *
 * This used to say "bump the minor part for additive changes", which described
 * a `major.minor` scheme that no emitted identifier has ever used. A consumer
 * reading that and pinning `copytree-xml@1.0` would have been matching against
 * a string CopyTree does not produce.
 *
 * @readonly
 * @enum {string}
 */
export const OUTPUT_FORMAT_VERSIONS = Object.freeze({
  xml: 'copytree-xml@1',
  markdown: 'copytree-md@1',
  json: 'copytree-json@1',
  ndjson: 'copytree-ndjson@1',
  sarif: 'copytree-sarif@1',
  tree: 'copytree-tree@1',
});

/**
 * Get the version string for a format name.
 * @param {string} format - Format name ('xml', 'md', 'markdown', ...)
 * @returns {string|null} Version string, or null for an unknown format
 */
export function versionFor(format) {
  const lower = String(format || '').toLowerCase();
  const canonical = lower === 'md' ? 'markdown' : lower;
  return OUTPUT_FORMAT_VERSIONS[canonical] ?? null;
}

export default OUTPUT_FORMAT_VERSIONS;
