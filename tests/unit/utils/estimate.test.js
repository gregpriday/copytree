import {
  estimateTokens,
  estimateOutputChars,
  buildEstimates,
  CHARS_PER_TOKEN,
} from '../../../src/utils/estimate.js';

describe('estimateTokens', () => {
  it('divides characters by the working chars-per-token ratio', () => {
    expect(estimateTokens(4000)).toBe(4000 / CHARS_PER_TOKEN);
  });

  it('rounds up so a partial token is never reported as zero', () => {
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
  });

  it('returns 0 for empty, negative, and non-finite input', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(-10)).toBe(0);
    expect(estimateTokens(NaN)).toBe(0);
    expect(estimateTokens(Infinity)).toBe(0);
  });
});

describe('estimateOutputChars', () => {
  const files = [
    { path: 'src/index.js', size: 1000 },
    { path: 'README.md', size: 500 },
  ];

  it('returns only document overhead for an empty set', () => {
    const chars = estimateOutputChars([], { format: 'xml' });
    expect(chars).toBeGreaterThan(0);
    expect(chars).toBeLessThan(1000);
  });

  it('includes content size plus per-file overhead', () => {
    const chars = estimateOutputChars(files, { format: 'xml' });
    // At minimum the raw bytes of both files
    expect(chars).toBeGreaterThan(1500);
  });

  it('uses measured content length when content is present', () => {
    const withContent = [{ path: 'a.js', size: 10, content: 'x'.repeat(5000) }];
    expect(estimateOutputChars(withContent, { format: 'xml' })).toBeGreaterThan(5000);
  });

  it('excludes content entirely for tree output', () => {
    const tree = estimateOutputChars(files, { format: 'tree' });
    const xml = estimateOutputChars(files, { format: 'xml' });
    expect(tree).toBeLessThan(xml);
    expect(tree).toBeLessThan(1000);
  });

  it('honours onlyTree for a content-bearing format', () => {
    const full = estimateOutputChars(files, { format: 'xml' });
    const treeOnly = estimateOutputChars(files, { format: 'xml', onlyTree: true });
    expect(treeOnly).toBeLessThan(full);
  });

  it('adds room for line numbers when requested', () => {
    const plain = estimateOutputChars(files, { format: 'xml' });
    const numbered = estimateOutputChars(files, { format: 'xml', addLineNumbers: true });
    expect(numbered).toBeGreaterThan(plain);
  });

  it('does not count content for binaries, whose content is a placeholder', () => {
    const binary = [{ path: 'movie.mp4', size: 400_000_000, isBinary: true }];
    expect(estimateOutputChars(binary, { format: 'xml' })).toBeLessThan(2000);
  });

  it('normalizes md to markdown and falls back to xml for unknown formats', () => {
    expect(estimateOutputChars(files, { format: 'md' })).toBe(
      estimateOutputChars(files, { format: 'markdown' }),
    );
    expect(estimateOutputChars(files, { format: 'nonsense' })).toBe(
      estimateOutputChars(files, { format: 'xml' }),
    );
  });

  it('tolerates null entries and a non-array input', () => {
    expect(estimateOutputChars([null, ...files])).toBeGreaterThan(0);
    expect(estimateOutputChars(undefined)).toBeGreaterThan(0);
  });
});

describe('buildEstimates', () => {
  it('prefers a measured character count over an estimate', () => {
    const result = buildEstimates([{ path: 'a.js', size: 999999 }], { actualChars: 400 });
    expect(result.estimatedOutputChars).toBe(400);
    expect(result.estimatedTokens).toBe(100);
  });

  it('estimates when no measurement is available', () => {
    const result = buildEstimates([{ path: 'a.js', size: 4000 }], { format: 'xml' });
    expect(result.estimatedOutputChars).toBeGreaterThan(4000);
    expect(result.estimatedTokens).toBe(Math.ceil(result.estimatedOutputChars / CHARS_PER_TOKEN));
  });
});
