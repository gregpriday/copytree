import fs from '../utils/fsx.js';
import path from 'path';
import { ProfileError } from '../utils/errors.js';

/**
 * Profile file extensions, in precedence order. The empty string is the
 * extensionless `.copytree`, parsed as an INI-style file.
 */
const EXTENSIONS = Object.freeze(['.yml', '.yaml', '.json', '']);

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
      entries = await fs.readdir(this.cwd);
    } catch {
      // An unreadable directory has no profile in it, which is the same answer
      // as an empty one for every caller here.
      return null;
    }

    const present = new Set(entries);
    for (const ext of EXTENSIONS) {
      const name = `${base}${ext}`;
      if (present.has(name)) return path.join(this.cwd, name);
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
    const filePath = await this._find(`.copytree-${name}`);
    if (filePath) return this.load(filePath);

    // A named profile that does not exist is a profile error, not a broken
    // configuration: the config is fine, the name is wrong. The distinction
    // decides which remediation the CLI offers.
    throw new ProfileError(`Profile not found: ${name}`, name, { searchPath: this.cwd });
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
        const { default: yaml } = await import('js-yaml');
        data = yaml.load(content);
        // YAML parsing empty file returns null/undefined, treat as empty object
        if (!data) {
          data = {};
        }
      } else {
        // Try to parse as INI-style format
        data = this.parseINI(content);
      }

      return this.validate(data, filePath);
    } catch (error) {
      throw new ProfileError(
        `Failed to load profile from ${filePath}: ${error.message}`,
        filePath,
        { filePath, originalError: error.message },
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

    // Normalize always patterns
    let always = [];
    if (data.always) {
      if (Array.isArray(data.always)) {
        always = data.always.filter((p) => typeof p === 'string' && p.trim().length > 0);
      } else if (typeof data.always === 'string' && data.always.trim().length > 0) {
        always = [data.always];
      }
    }

    // Normalize options
    const options = {};
    if (data.options && typeof data.options === 'object' && !Array.isArray(data.options)) {
      Object.assign(options, data.options);
    }

    return {
      name: data.name || path.basename(filePath, path.extname(filePath)),
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
    return (await this._find(name ? `.copytree-${name}` : '.copytree')) !== null;
  }
}

/**
 * @typedef {Object} FolderProfile
 * @property {string} [name] - Optional profile name
 * @property {string[]} include - Include patterns (globs)
 * @property {string[]} exclude - Exclude patterns (globs)
 */

export default FolderProfileLoader;
