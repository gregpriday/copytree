/**
 * The YAML surface CopyTree uses, over `js-yaml`.
 *
 * Three things are worth centralising rather than repeating at each call site,
 * and all three are ways `js-yaml` 5 differs from the 4.x this used to be.
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
 * **Merge keys.** 5.x loads with `CORE_SCHEMA` (YAML 1.2), which has no
 * `!!merge` tag; 4.x's default schema had one. So a `<<: *anchor` silently
 * stopped merging and stayed in the mapping as a literal `"<<"` key — which
 * every profile and configuration validator then rejected as an unknown
 * setting. `loadYaml` adds `mergeTag` back, and *only* `mergeTag`.
 *
 * `YAML11_SCHEMA` would also restore merge, and is the wrong instrument: it
 * brings back YAML 1.1 scalar rules with it, so `yes`/`no`/`on`/`off` become
 * booleans, `012` is read as octal, and a bare date becomes a `Date`. That
 * would change how every existing profile parses in order to fix anchors in
 * the few that use them.
 *
 * The import stays dynamic and inside the functions on purpose: a YAML parser
 * is a real import, most runs have neither a data configuration nor a folder
 * profile, and pulling it in at module scope would charge every invocation —
 * `copytree --version` included — for a file it never reads.
 */

/**
 * `CORE_SCHEMA` plus the merge tag, built on first use and kept.
 *
 * Module-scoped rather than per call, and deliberately not built at import
 * time: the whole reason the `js-yaml` import is dynamic is that most runs
 * never parse YAML at all.
 *
 * @type {import('js-yaml').Schema | undefined}
 */
let mergeSchema;

/**
 * Parse a YAML document, treating empty input as an absent document.
 *
 * @param {string} content - YAML source
 * @returns {Promise<any>} Parsed value, or `undefined` when the input is empty
 * @throws {Error} `YAMLException` for input that is present and malformed
 */
export async function loadYaml(content) {
  if (typeof content !== 'string' || content.trim() === '') return undefined;

  const { load, CORE_SCHEMA, mergeTag } = await import('js-yaml');
  // Built once. `withTags()` constructs a fresh `Schema` on every call, and
  // `loadYaml` runs per configuration file and per profile.
  mergeSchema ??= CORE_SCHEMA.withTags([mergeTag]);

  try {
    return load(content, { schema: mergeSchema });
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
