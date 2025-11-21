import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { ConfigurationError } from '../utils/errors.js';

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
   * Auto-discover profile in current directory
   * Searches for .copytree* files in priority order
   * @returns {Promise<FolderProfile|null>}
   */
  async discover() {
    const extensions = ['.yml', '.yaml', '.json', ''];

    for (const ext of extensions) {
      const filePath = path.join(this.cwd, `.copytree${ext}`);
      if (await fs.pathExists(filePath)) {
        return await this.load(filePath);
      }
    }

    return null;
  }

  /**
   * Load named profile from current directory
   * Searches for .copytree-<name>* files in priority order
   * @param {string} name - Profile name
   * @returns {Promise<FolderProfile>}
   * @throws {ConfigurationError} If profile not found
   */
  async loadNamed(name) {
    const extensions = ['.yml', '.yaml', '.json', ''];

    for (const ext of extensions) {
      const filePath = path.join(this.cwd, `.copytree-${name}${ext}`);
      if (await fs.pathExists(filePath)) {
        return await this.load(filePath);
      }
    }

    throw new ConfigurationError(`Profile not found: ${name}`, 'FolderProfileLoader', {
      name,
      searchPath: this.cwd,
    });
  }

  /**
   * Load profile from specific file
   * @param {string} filePath - Path to profile file
   * @returns {Promise<FolderProfile>}
   * @throws {ConfigurationError} If file cannot be parsed
   */
  async load(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const ext = path.extname(filePath);

      let data;
      if (ext === '.json') {
        data = JSON.parse(content);
      } else if (ext === '.yml' || ext === '.yaml') {
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
      throw new ConfigurationError(
        `Failed to load profile from ${filePath}: ${error.message}`,
        'FolderProfileLoader',
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
      throw new ConfigurationError(
        `Invalid profile data: must be an object`,
        'FolderProfileLoader',
        { filePath, data },
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

    return {
      name: data.name || path.basename(filePath, path.extname(filePath)),
      include,
      exclude,
    };
  }

  /**
   * Parse INI-style format
   * Supports simple INI syntax with [section] headers and key=value pairs
   * @param {string} content - File content
   * @returns {Object} Parsed profile data
   */
  parseINI(content) {
    const profile = { include: [], exclude: [] };
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
    if (name) {
      const extensions = ['.yml', '.yaml', '.json', ''];
      for (const ext of extensions) {
        const filePath = path.join(this.cwd, `.copytree-${name}${ext}`);
        if (await fs.pathExists(filePath)) {
          return true;
        }
      }
      return false;
    } else {
      // Check for auto-discoverable profile
      const extensions = ['.yml', '.yaml', '.json', ''];
      for (const ext of extensions) {
        const filePath = path.join(this.cwd, `.copytree${ext}`);
        if (await fs.pathExists(filePath)) {
          return true;
        }
      }
      return false;
    }
  }
}

/**
 * @typedef {Object} FolderProfile
 * @property {string} [name] - Optional profile name
 * @property {string[]} include - Include patterns (globs)
 * @property {string[]} exclude - Exclude patterns (globs)
 */

export default FolderProfileLoader;
