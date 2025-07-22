// Test that verifies AIService mock is working correctly
// The mock is defined in setup-mocks.js and provides static methods
// that are used by transformer tests

// Note: We need to require this AFTER jest has set up the mocks
const AIService = require('../../../src/services/AIService');

describe('AIService Mock', () => {
  it('should be properly mocked', () => {
    // The AIService should be mocked by setup-mocks.js
    expect(AIService).toBeDefined();
  });

  it('should provide mocked static methods', () => {
    // These methods are added by the mock in setup-mocks.js
    expect(AIService.summarizeFile).toBeDefined();
    expect(AIService.describeImage).toBeDefined();
    expect(AIService.summarizeText).toBeDefined();
    expect(AIService.summarizeUnitTests).toBeDefined();
    expect(AIService.describeSVG).toBeDefined();
    expect(AIService.isAvailable).toBeDefined();
    expect(AIService.getProvider).toBeDefined();
    expect(AIService.getModel).toBeDefined();
  });

  it('should have callable mock methods', () => {
    // Verify the mocked methods can be called without errors
    expect(() => {
      AIService.summarizeFile('test.js', 'content');
      AIService.describeImage(Buffer.from('test'), 'image/png');
      AIService.summarizeText('test text');
      AIService.summarizeUnitTests('test code');
      AIService.describeSVG('<svg></svg>');
      AIService.isAvailable();
      AIService.getProvider();
      AIService.getModel();
    }).not.toThrow();
  });
});

// Note: This test file verifies that the AIService mock is working correctly.
// The mock is necessary because:
// 1. The real AIService requires API keys and external services
// 2. Many transformer tests depend on these mocked methods
// 3. Unit tests should not make actual API calls
//
// The actual AIService implementation would be tested in integration tests
// where the external dependencies can be properly controlled.