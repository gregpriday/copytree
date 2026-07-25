import { buildManifest, classifyOutcome, MANIFEST_OUTCOMES } from '../../../src/utils/manifest.js';

describe('classifyOutcome', () => {
  it('reports a loaded text file as included', () => {
    expect(classifyOutcome({ path: 'a.js', content: 'const a = 1;', isBinary: false })).toBe(
      MANIFEST_OUTCOMES.INCLUDED,
    );
  });

  it('distinguishes a structure-only file from an included one', () => {
    expect(
      classifyOutcome({
        path: 'package-lock.json',
        isBinary: true,
        binaryCategory: 'structure-only',
      }),
    ).toBe(MANIFEST_OUTCOMES.STRUCTURE_ONLY);
  });

  it('reports a binary as a placeholder, not as included', () => {
    expect(classifyOutcome({ path: 'logo.webp', isBinary: true, binaryCategory: 'image' })).toBe(
      MANIFEST_OUTCOMES.BINARY_PLACEHOLDER,
    );
  });

  it('reports a truncated file distinctly', () => {
    expect(classifyOutcome({ path: 'big.js', content: 'x', truncated: true })).toBe(
      MANIFEST_OUTCOMES.TRUNCATED,
    );
  });

  it('surfaces an explicit exclusion reason', () => {
    expect(
      classifyOutcome({
        path: 'a.js',
        excluded: true,
        excludedReason: 'sizeGate',
        isBinary: false,
      }),
    ).toBe('excluded:sizeGate');
  });

  describe('dry run, where content has not been loaded', () => {
    it('predicts structure-only from the configured patterns', () => {
      const outcome = classifyOutcome(
        { path: 'yarn.lock', size: 100 },
        { structureOnlyPatterns: ['yarn.lock', '*.svg'] },
      );
      expect(outcome).toBe(MANIFEST_OUTCOMES.STRUCTURE_ONLY);
    });

    it('predicts a binary placeholder from the extension', () => {
      expect(classifyOutcome({ path: 'assets/demo.mp4', size: 400_000 })).toBe(
        MANIFEST_OUTCOMES.BINARY_PLACEHOLDER,
      );
    });

    it('does not mistake source code for a binary', () => {
      // .ts is TypeScript, not MPEG transport stream — the failure mode here is
      // silent, so it is worth asserting directly.
      expect(classifyOutcome({ path: 'src/app.ts', size: 100 })).toBe(MANIFEST_OUTCOMES.INCLUDED);
      expect(classifyOutcome({ path: 'index.html', size: 100 })).toBe(MANIFEST_OUTCOMES.INCLUDED);
    });
  });

  it('defaults to included for a null file', () => {
    expect(classifyOutcome(null)).toBe(MANIFEST_OUTCOMES.INCLUDED);
  });
});

describe('buildManifest', () => {
  it('never carries content', () => {
    const manifest = buildManifest([
      { path: 'a.js', size: 12, content: 'const a = 1;', isBinary: false },
    ]);

    expect(manifest).toHaveLength(1);
    expect(manifest[0]).not.toHaveProperty('content');
    expect(manifest[0]).toEqual({ path: 'a.js', size: 12, outcome: 'included' });
  });

  it('serializes the modified timestamp as ISO', () => {
    const modified = new Date('2026-01-02T03:04:05.000Z');
    const [entry] = buildManifest([{ path: 'a.js', size: 1, modified }]);
    expect(entry.modified).toBe('2026-01-02T03:04:05.000Z');
  });

  it('passes through a pre-formatted modified string', () => {
    const [entry] = buildManifest([{ path: 'a.js', size: 1, modified: '2026-01-02' }]);
    expect(entry.modified).toBe('2026-01-02');
  });

  it('defaults a missing size to zero', () => {
    const [entry] = buildManifest([{ path: 'a.js' }]);
    expect(entry.size).toBe(0);
  });

  it('drops null entries and tolerates a non-array input', () => {
    expect(buildManifest([null, { path: 'a.js', size: 1 }])).toHaveLength(1);
    expect(buildManifest(undefined)).toEqual([]);
  });
});
