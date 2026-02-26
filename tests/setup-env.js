/**
 * Environment setup for Jest tests
 * This file contains only environment configuration and is used by all Jest projects
 */

// Set up import.meta for tests (required for ESM modules)
// Note: In Jest, import.meta is not available in test context by default
// This provides a fallback for code that accesses import.meta.url
global.importMeta = {
  url: 'file:///test',
};

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Suppress console output in tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Mock import.meta.url for modules that use fileURLToPath(import.meta.url)
// This is needed because Jest's ESM support doesn't fully support import.meta
if (typeof globalThis !== 'undefined' && !globalThis.import) {
  globalThis.import = {};
}
if (typeof globalThis !== 'undefined' && globalThis.import && !globalThis.import.meta) {
  globalThis.import.meta = { url: 'file://' + __dirname + '/test.js' };
}
