// Tests for UnitTestSummaryTransformer behavior

let UnitTestSummaryTransformer;

// Mock Gemini client (auto-mock, configure in beforeEach)
jest.mock('@google/generative-ai');
import { GoogleGenerativeAI } from '@google/generative-ai';

const makeFile = (p, content) => ({
  path: p,
  content: Buffer.from(content, 'utf8'),
  stats: { size: Buffer.byteLength(content) },
});

describe('UnitTestSummaryTransformer', () => {
  let mockModel;
  let mockGenAI;

  beforeAll(async () => {
    ({ default: UnitTestSummaryTransformer } = await import(
      '../../../src/transforms/transformers/UnitTestSummaryTransformer.js'
    ));
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockModel = {
      model: 'fake-model',
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'This is a concise summary.' },
      }),
    };
    mockGenAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel),
    };
    GoogleGenerativeAI.mockImplementation(() => mockGenAI);
  });

  test('canTransform returns false without API key', () => {
    delete process.env.GEMINI_API_KEY;
    const t = new UnitTestSummaryTransformer({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    expect(t.canTransform(makeFile('sample.test.js', 'it("a",()=>{})'))).toBe(false);
  });

  test('canTransform returns true for test files with API key and within size', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const t = new UnitTestSummaryTransformer({
      maxFileSize: 1024,
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    expect(t.canTransform(makeFile('feature.spec.js', 'describe("x",()=>{})'))).toBe(true);
  });

  test('doTransform produces AI summary output and metadata', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const t = new UnitTestSummaryTransformer({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    const out = await t.doTransform(
      makeFile('calc.test.js', 'describe("calc",()=>{ it("adds",()=>expect(1+1).toBe(2)) })'),
    );
    expect(out.transformed).toBe(true);
    expect(String(out.content)).toMatch(/AI-generated test summary/i);
    expect(out.metadata).toBeDefined();
    expect(out.metadata.originalSize).toBeGreaterThan(0);
  });

  test('doTransform falls back to basic summary on API error', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    // Re-import with a model mock that throws on generateContent
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        model: 'fake-model',
        generateContent: jest.fn().mockRejectedValue(new Error('API failure')),
      }),
    }));

    const t = new UnitTestSummaryTransformer({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    const out = await t.doTransform(
      makeFile('calc.test.js', 'describe("calc",()=>{ it("adds",()=>{}) })'),
    );
    expect(out.transformed).toBe(true);
    expect(String(out.content)).toMatch(/AI summary generation failed/i);
    expect(out.metadata.error).toMatch(/API failure/);
  });
});
