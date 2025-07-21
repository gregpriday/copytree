// Basic test to verify AIService mock is loaded
// The actual AI functionality would be tested in integration tests

const AIService = require('../../../src/services/AIService');

describe('AIService', () => {
  test('should be mocked', () => {
    expect(AIService).toBeDefined();
  });

  test('should have required methods', () => {
    // Just verify the methods exist
    expect(typeof AIService.summarizeFile).toBe('function');
    expect(typeof AIService.describeImage).toBe('function');
    expect(typeof AIService.filterFiles).toBe('function');
    expect(typeof AIService.isAvailable).toBe('function');
  });

  test('should be callable without errors', () => {
    // Just verify the mocks can be called
    expect(() => {
      AIService.summarizeFile('test.js', 'code');
      AIService.describeImage(Buffer.from('test'), 'image/png');
      AIService.filterFiles([]);
      AIService.isAvailable();
    }).not.toThrow();
  });
});