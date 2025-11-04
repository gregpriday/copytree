// Mock for ProfileLoader to avoid import.meta.dirname issues in Jest

class ProfileLoader {
  constructor(options = {}) {
    this.options = options;
    this.profileCache = new Map();
  }

  async load(profileNameOrPath, overrides = {}) {
    // Return a basic mock profile, respecting filter/include overrides
    return {
      name: profileNameOrPath,
      include: overrides.include || overrides.filter || ['**/*'],
      exclude: overrides.exclude || ['node_modules/**'],
      filter: overrides.filter || [],
      transforms: [],
      options: overrides.options || {},
      ...overrides,
    };
  }

  async list() {
    return ['default', 'web', 'node', 'python'];
  }

  async validate(profile) {
    return { valid: true, errors: [] };
  }

  async exists(profileName) {
    return ['default', 'web', 'node', 'python'].includes(profileName);
  }

  clearCache() {
    this.profileCache.clear();
  }
}

export default ProfileLoader;
