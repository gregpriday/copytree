// Mock for ProfileLoader to avoid import.meta.dirname issues in Jest

class ProfileLoader {
  constructor(options = {}) {
    this.options = options;
    this.profileCache = new Map();
  }

  async load(profileNameOrPath, overrides = {}) {
    // Return a basic mock profile
    return {
      name: profileNameOrPath,
      include: ['**/*'],
      exclude: ['node_modules/**'],
      transforms: [],
      options: overrides,
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
