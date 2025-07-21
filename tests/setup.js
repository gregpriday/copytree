// Jest setup file
// Load environment variables for testing
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console output during tests (unless debugging)
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging failed tests
    error: console.error,
  };
}

// Global test utilities
global.testUtils = {
  // Create a temporary test directory
  async createTempDir() {
    const fs = require('fs-extra');
    const path = require('path');
    const os = require('os');
    
    const tempDir = path.join(os.tmpdir(), `copytree-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    return tempDir;
  },
  
  // Clean up temporary test directory
  async cleanupTempDir(dir) {
    const fs = require('fs-extra');
    await fs.remove(dir);
  },
  
  // Create test files in a directory
  async createTestFiles(dir, files) {
    const fs = require('fs-extra');
    const path = require('path');
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(dir, filePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content);
    }
  },
};

// Increase timeout for CI environments
if (process.env.CI) {
  jest.setTimeout(30000);
}