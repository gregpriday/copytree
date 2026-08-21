/**
 * The YAML surface CopyTree uses, over `js-yaml`.
 *
 * Two things are worth centralising rather than repeating at each call site.
 *
 * **The import shape.** `js-yaml` 5 is a TypeScript rewrite with flat named
 * exports and no default export, so the `const { default: yaml } = await
 * import('js-yaml')` form that worked for years now yields `undefined` and
 * fails one line later, at the call. One module knows that; the rest import
 * from here.
 *
 * **Empty input.** `load()` in 4.x returned `undefined` for an empty document;
 * in 5.x it throws `expected a document, but the input is empty`. An empty
 * `.copytree.yml` or `config.yaml` is not a malformed file — it is a file
 * someone created and has not filled in yet — and turning it into a parse
 * failure would be a regression the parser upgrade has no business causing.
 * `loadYaml` restores the old answer for that one case, and leaves every other
 * `YAMLException` alone.
 *
 * The import stays dynamic and inside the functions on purpose: a YAML parser
 * is a real import, most runs have neither a data configuration nor a folder
 * profile, and pulling it in at module scope would charge every invocation —
 * `copytree --version` included — for a file it never reads.
 */

/**
 * Parse a YAML document, treating empty input as an absent document.
 *
 * @param {string} content - YAML source
 * @returns {Promise<any>} Parsed value, or `undefined` when the input is empty
 * @throws {Error} `YAMLException` for input that is present and malformed
 */
export async function loadYaml(content) {
  if (typeof content !== 'string' || content.trim() === '') return undefined;

  const { load } = await import('js-yaml');
  try {
    return load(content);
  } catch (error) {
    // A document consisting only of comments and whitespace is empty to the
    // parser but not to `trim()`, so the check above cannot catch it.
    if (/input is empty/i.test(error?.message ?? '')) return undefined;
    throw error;
  }
}

/**
 * Serialise a value as YAML.
 *
 * @param {any} value - Value to serialise
 * @param {Object} [options={}] - `js-yaml` dump options
 * @returns {Promise<string>} YAML document
 */
export async function dumpYaml(value, options = {}) {
  const { dump } = await import('js-yaml');
  return dump(value, options);
}

export default { loadYaml, dumpYaml };
