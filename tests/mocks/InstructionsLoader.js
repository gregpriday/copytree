// Mock InstructionsLoader for tests
import path from 'path';
import os from 'os';

class InstructionsLoader {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
    this.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Instructions directories (mocked paths)
    this.userDir = path.join(os.homedir(), '.copytree/instructions');
    this.appDir = path.join(process.cwd(), 'src', 'templates', 'instructions');

    // Cache for loaded instructions
    this.instructionsCache = new Map();
  }

  async loadInstructions(name = 'default') {
    return 'Mock instructions content';
  }

  async load(name = 'default') {
    // Check cache first
    const cacheKey = name;
    if (this.instructionsCache.has(cacheKey)) {
      return this.instructionsCache.get(cacheKey);
    }

    // Return mock content that matches what fs.readFile should return
    let content;
    if (name === 'nonexistent') {
      const { InstructionsError } = await import('../../src/utils/errors.js');
      throw new InstructionsError(`Instructions '${name}' not found`, name);
    } else {
      // Use global __MOCK_FS_CONTENT__ if set by tests, otherwise default
      content = global.__MOCK_FS_CONTENT__ || `Mock instructions for ${name}`;
    }

    // Cache the result
    this.instructionsCache.set(cacheKey, content);
    return content;
  }

  async exists(name = 'default') {
    // Always return true for the default instructions and common test cases
    return name === 'default' || name === 'custom';
  }

  async getInstructionsPath(name = 'default') {
    return path.join(this.appDir, `${name}.md`);
  }

  async list() {
    // Use global __MOCK_FS_READDIR__ if set by tests
    return global.__MOCK_FS_LIST__ || ['default'];
  }

  async listAvailableInstructions() {
    return this.list();
  }

  async validateInstructions(content) {
    return { valid: true, errors: [] };
  }

  clearCache() {
    this.instructionsCache.clear();
  }

  getCacheStats() {
    return {
      size: this.instructionsCache.size,
      keys: Array.from(this.instructionsCache.keys()),
    };
  }
}

export default InstructionsLoader;
