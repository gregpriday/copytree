import fs from '../utils/fsx.js';
import path from 'path';
import { ProfileError } from '../utils/errors.js';

/**
 * Profile file extensions, in precedence order. The empty string is the
 * extensionless `.copytree`, parsed as an INI-style file.
 */
const EXTENSIONS = Object.freeze(['.yml', '.yaml', '.json', '']);

/**
 * Every key a profile may declare.
 *
 * Closed on purpose: an unknown key is almost always a typo or a setting from
 * a different tool, and silently ignoring it means the author believes a rule
 * is in force that is not.
 */
/**
 * Top-level keys reserved for the profile author, and ignored by CopyTree.
 *
 * A place to define a YAML anchor without claiming a setting name.
 */
const EXTENSION_KEY = /^x-/;

const KNOWN_PROFILE_KEYS = new Set([
  'version',
  'name',
  // Free text for the author's benefit; carried through so a profile can say
  // what it is for without being rejected for saying it.
  'description',
  'include',
  'exclude',
  'forceInclude',
  'always',
  'options',
  // The documented spelling for output settings, merged into `options`.
  'output',
  'transformers',
]);

/**
 * Option keys a profile may set.
 *
 * A misspelt option is a setting the author believes is in force, and the
 * quietest possible failure: the profile loads, the run succeeds, and the
 * setting does nothing.
 */
const KNOWN_PROFILE_OPTIONS = new Set([
  'format',
  'sizeGate',
  'maxFileSize',
  'maxTotalSize',
  'maxFileCount',
  'charLimit',
  'retainOversizedFirstFile',
  'maxDepth',
  'respectGitignore',
  'includeHidden',
  'followSymlinks',
  'addLineNumbers',
  'prettyPrint',
]);

/**
 * FolderProfileLoader - Lightweight profile loader for folder-level configuration
 *
 * Supports simple .copytree configuration files in current directory with:
 * - Auto-discovery of config files (.copytree.yml, .copytree.yaml, .copytree.json, .copytree)
 * - Named profiles (.copytree-<name>.yml, etc.)
 * - Multiple formats: YAML, JSON, INI-style
 * - Minimal schema: just include/exclude patterns
 */
class FolderProfileLoader {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Find the highest-priority `.copytree*` file matching a base name.
   *
   * One directory listing, rather than a `pathExists` probe per extension.
   * Discovery runs on every copy and almost always finds nothing, so the old
   * shape was four filesystem round trips to answer "no" — and `loadNamed()`
   * and `exists()` each did the same four again.
   *
   * @param {string} base - File stem, e.g. `.copytree` or `.copytree-api`
   * @returns {Promise<string|null>} Absolute path, or null when absent
   * @private
   */
  async _find(base) {
    let entries;
    try {
      entries = await fs.readdir(this.cwd, { withFileTypes: true });
    } catch {
      // An unreadable directory has no profile in it, which is the same answer
      // as an empty one for every caller here.
      return null;
    }

    // Files only. `EXTENSIONS` includes the empty string, so a bare `.copytree`
    // matched — and `.copytree/` is the documented *directory* for named
    // profiles (`.copytree/api.yml`). Every project using one had its
    // directory opened as a profile file, which failed with `EISDIR`. The
    // failure was invisible only because a broken discovered profile used to
    // be warned about and skipped.
    const present = new Set(
      entries
        .filter((entry) => entry.isFile() || entry.isSymbolicLink())
        .map((entry) => entry.name),
    );
    for (const ext of EXTENSIONS) {
      const name = `${base}${ext}`;
      if (present.has(name)) return path.join(this.cwd, name);
    }

    return null;
  }

  /**
   * Find a named profile inside a `.copytree/` directory.
   *
   * `README.md`, `docs/index.md` and `docs/usage/basic-usage.md` have all
   * documented `.copytree/my-profile.yml` with `--profile my-profile` since
   * before 1.0, and the loader only ever looked for `.copytree-my-profile.yml`
   * beside it. Anyone following the documentation got "Profile not found" for
   * a file that was exactly where they were told to put it.
   *
   * @param {string} name - Profile name
   * @returns {Promise<string|null>} Absolute path, or null when absent
   * @private
   */
  async _findInProfileDir(name) {
    const dir = path.join(this.cwd, '.copytree');

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    const present = new Set(
      entries.filter((entry) => entry.isFile() || entry.isSymbolicLink()).map((e) => e.name),
    );
    // The extensionless form is excluded here on purpose: inside a directory of
    // profiles, a bare `api` file is more likely to be something else.
    for (const ext of EXTENSIONS.filter(Boolean)) {
      if (present.has(`${name}${ext}`)) return path.join(dir, `${name}${ext}`);
    }

    return null;
  }

  /**
   * Auto-discover profile in current directory
   * Searches for .copytree* files in priority order
   * @returns {Promise<FolderProfile|null>}
   */
  async discover() {
    const filePath = await this._find('.copytree');
    return filePath ? this.load(filePath) : null;
  }

  /**
   * Load named profile from current directory
   * Searches for .copytree-<name>* files in priority order
   * @param {string} name - Profile name
   * @returns {Promise<FolderProfile>}
   * @throws {ProfileError} If profile not found
   */
  async loadNamed(name) {
    const filePath =
      (await this._find(`.copytree-${name}`)) ?? (await this._findInProfileDir(name));
    if (filePath) return this.load(filePath);

    // A named profile that does not exist is a profile error, not a broken
    // configuration: the config is fine, the name is wrong. The distinction
    // decides which remediation the CLI offers.
    throw new ProfileError(`Profile not found: ${name}`, name, {
      searchPath: this.cwd,
      notFound: true,
    });
  }

  /**
   * Load profile from specific file
   * @param {string} filePath - Path to profile file
   * @returns {Promise<FolderProfile>}
   * @throws {ProfileError} If file cannot be parsed
   */
  async load(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const ext = path.extname(filePath);

      let data;
      if (ext === '.json') {
        data = JSON.parse(content);
      } else if (ext === '.yml' || ext === '.yaml') {
        // Loaded here rather than at module scope: `js-yaml` is a parser most
        // runs never need, because most projects have no folder profile and a
        // JSON or INI-style one needs no YAML support at all.
        const { loadYaml } = await import('../utils/yaml.js');
        data = await loadYaml(content);
        // An empty profile file is an empty profile, not a parse failure.
        if (!data) {
          data = {};
        }
      } else {
        // Try to parse as INI-style format
        data = this.parseINI(content);
      }

      return this.validate(data, filePath);
    } catch (error) {
      // A profile that exists and does not parse is a different failure from
      // one that is missing, and only the second is fixed by checking the name.
      throw new ProfileError(
        `Failed to load profile from ${filePath}: ${error.message}`,
        filePath,
        {
          filePath,
          notFound: false,
          originalError: error.message,
        },
      );
    }
  }

  /**
   * Validate and normalize profile data
   * Ensures minimal schema compliance
   * @param {Object} data - Raw profile data
   * @param {string} filePath - Source file path for error messages
   * @returns {FolderProfile}
   */
  validate(data, filePath) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ProfileError(`Invalid profile data: must be an object`, filePath, {
        filePath,
        data,
      });
    }

    // A key nobody reads is a setting the author believes is in effect. Naming
    // the file and the field is the difference between a one-line fix and an
    // afternoon wondering why the profile "does nothing".
    //
    // `x-` keys are the one exception, and exist so a merge key has somewhere
    // to point. YAML shares settings through an anchor, and an anchor has to be
    // defined on *some* key — so without a reserved prefix the only anchorable
    // keys are the ones that already mean something, and `x-defaults: &d` is
    // rejected before the merge that reads it is ever evaluated. docker-compose
    // and GitHub Actions reserve `x-` for exactly this. They are read by
    // nothing: the profile below is built from named fields, so an `x-` block
    // is dropped once the anchors in it have been resolved.
    const unknown = Object.keys(data).filter(
      (key) => !KNOWN_PROFILE_KEYS.has(key) && !EXTENSION_KEY.test(key),
    );
    if (unknown.length > 0) {
      throw new ProfileError(
        `Unknown profile ${unknown.length === 1 ? 'key' : 'keys'} in ${filePath}: ${unknown.join(', ')}`,
        filePath,
        { filePath, unknownKeys: unknown, knownKeys: [...KNOWN_PROFILE_KEYS] },
      );
    }

    // Normalize include patterns
    let include = [];
    if (data.include) {
      if (Array.isArray(data.include)) {
        include = data.include.filter((p) => typeof p === 'string' && p.trim().length > 0);
      } else if (typeof data.include === 'string' && data.include.trim().length > 0) {
        include = [data.include];
      }
    }

    // Normalize exclude patterns
    let exclude = [];
    if (data.exclude) {
      if (Array.isArray(data.exclude)) {
        exclude = data.exclude.filter((p) => typeof p === 'string' && p.trim().length > 0);
      } else if (typeof data.exclude === 'string' && data.exclude.trim().length > 0) {
        exclude = [data.exclude];
      }
    }

    // Force-include patterns. `forceInclude` is the canonical spelling;
    // `always` is the original one, still read so existing profiles keep
    // working, and merged rather than chosen between so a profile carrying both
    // does not silently lose half of them.
    const always = [...normalizeList(data.forceInclude), ...normalizeList(data.always)];

    // `options` and the documented `output` block are the same thing; merged
    // so a profile using either spelling works, and neither is silently
    // discarded when both are present.
    const options = {};
    for (const block of [data.output, data.options]) {
      if (block && typeof block === 'object' && !Array.isArray(block))
        Object.assign(options, block);
    }

    const unknownOptions = Object.keys(options).filter((key) => !KNOWN_PROFILE_OPTIONS.has(key));
    if (unknownOptions.length > 0) {
      throw new ProfileError(
        `Unknown profile ${unknownOptions.length === 1 ? 'option' : 'options'} in ${filePath}: ${unknownOptions.join(', ')}`,
        filePath,
        { filePath, notFound: false, unknownOptions, knownOptions: [...KNOWN_PROFILE_OPTIONS] },
      );
    }

    return {
      name: data.name || path.basename(filePath, path.extname(filePath)),
      ...(typeof data.description === 'string' ? { description: data.description } : {}),
      transformers:
        data.transformers && typeof data.transformers === 'object' ? data.transformers : {},
      // Where it came from, because "which profile is in effect" is a question
      // both `inspect --view profile` and a confused user need answered by a
      // path, not by a name that several files could have produced.
      source: filePath,
      include,
      exclude,
      always,
      options,
    };
  }

  /**
   * Parse INI-style format
   * Supports simple INI syntax with [section] headers and key=value pairs
   * @param {string} content - File content
   * @returns {Object} Parsed profile data
   */
  parseINI(content) {
    const profile = { include: [], exclude: [], always: [], options: {} };
    let currentSection = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Section headers
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1).toLowerCase();
        continue;
      }

      // Section content
      if (currentSection === 'include') {
        profile.include.push(trimmed);
      } else if (currentSection === 'exclude') {
        profile.exclude.push(trimmed);
      } else if (currentSection === 'always') {
        profile.always.push(trimmed);
      } else if (currentSection === 'options' && trimmed.includes('=')) {
        const [key, value] = trimmed.split('=').map((s) => s.trim());
        if (key) {
          // Try to parse boolean/number values
          if (value === 'true') profile.options[key] = true;
          else if (value === 'false') profile.options[key] = false;
          else if (!isNaN(Number(value))) profile.options[key] = Number(value);
          else profile.options[key] = value;
        }
      } else if (currentSection === 'profile' && trimmed.includes('=')) {
        const [key, value] = trimmed.split('=').map((s) => s.trim());
        if (key === 'name') {
          profile.name = value;
        }
      }
    }

    return profile;
  }

  /**
   * List all available profiles in current directory
   * Finds all .copytree-* files
   * @returns {Promise<string[]>} Array of profile names
   */
  async listProfiles() {
    const profiles = [];
    const files = await fs.readdir(this.cwd);

    const pattern = /^\.copytree-([^.]+)(\.(yml|yaml|json))?$/;

    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        const profileName = match[1];
        if (!profiles.includes(profileName)) {
          profiles.push(profileName);
        }
      }
    }

    return profiles.sort();
  }

  /**
   * Check if a profile exists (either auto-discovered or named)
   * @param {string|null} name - Profile name, or null for auto-discovery
   * @returns {Promise<boolean>}
   */
  async exists(name = null) {
    if (!name) return (await this._find('.copytree')) !== null;
    return (
      (await this._find(`.copytree-${name}`)) !== null ||
      (await this._findInProfileDir(name)) !== null
    );
  }
}

/**
 * Normalize a string-or-array profile field into a clean array.
 * @param {*} value - Raw field value
 * @returns {string[]} Non-empty strings
 */
function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) return [value];
  return [];
}

/**
 * @typedef {Object} FolderProfile
 * @property {string} [name] - Optional profile name
 * @property {string[]} include - Include patterns (globs)
 * @property {string[]} exclude - Exclude patterns (globs)
 */

export default FolderProfileLoader;
