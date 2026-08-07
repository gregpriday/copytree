// The registry logs through a child logger, which the global mocks do not
// provide; this is the same shim `TransformerRegistry.test.js` uses.
jest.mock('../../../src/utils/logger.js', () => {
  const sink = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { logger: { ...sink, child: () => sink } };
});

import TransformerRegistry, {
  CANDIDATE_EXTENSIONS,
} from '../../../src/transforms/TransformerRegistry.js';
import TransformStage from '../../../src/pipeline/stages/TransformStage.js';

/**
 * `TransformStage` decides whether to build a registry at all by consulting
 * `CANDIDATE_EXTENSIONS`, a hand-maintained list. That is
 * the price of not importing every transformer module on every run, and the
 * risk it buys is drift: register a transformer for `.pdf`, forget the list,
 * and the stage silently never runs for PDFs. Nothing else would fail.
 *
 * This makes that drift a test failure instead.
 */
describe('transform candidate extensions', () => {
  it('covers every extension a non-default transformer claims', async () => {
    const registry = await TransformerRegistry.createDefault();

    const claimed = new Set();
    for (const [ext, names] of registry.extensionMap.entries()) {
      // The default transformer claims every file and returns loaded content
      // unchanged, so its presence is not a reason to run the stage.
      const nonDefault = names.filter((name) => name !== registry.defaultTransformer);
      if (nonDefault.length > 0) claimed.add(ext.toLowerCase());
    }

    const missing = [...claimed].filter((ext) => !CANDIDATE_EXTENSIONS.has(ext));
    expect(missing).toEqual([]);
  });

  it('lists nothing that no transformer claims', async () => {
    const registry = await TransformerRegistry.createDefault();
    const stale = [...CANDIDATE_EXTENSIONS].filter((ext) => !registry.extensionMap.has(ext));

    expect(stale).toEqual([]);
  });
});

/**
 * The decision that lets an ordinary copy skip the transformation subsystem
 * entirely. Its companion in `tests/real/transforms/` checks that the
 * extension list this consults has not drifted from what `createDefault()`
 * registers.
 */
describe('TransformStage.hasWorkToDo', () => {
  const stage = (options = {}) =>
    new TransformStage({ registryFactory: async () => null, ...options });

  it('skips a selection of ordinary loaded source files', () => {
    expect(
      stage().hasWorkToDo([
        { path: 'src/index.js', content: 'x' },
        { path: 'README.md', content: '# hi' },
        { path: 'Makefile', content: 'all:' },
      ]),
    ).toBe(false);
  });

  it('runs for a file the loader flagged as convertible', () => {
    expect(
      stage().hasWorkToDo([
        { path: 'a.js', content: 'x' },
        { path: 'doc.pdf', content: Buffer.from('%PDF'), needsTransform: true },
      ]),
    ).toBe(true);
  });

  it('runs for an extension a transformer claims', () => {
    expect(stage().hasWorkToDo([{ path: 'archive.zip', content: '[binary]' }])).toBe(true);
  });

  it('runs when content was never loaded', () => {
    expect(stage().hasWorkToDo([{ path: 'src/index.js' }])).toBe(true);
  });

  it('runs when a profile configures transformers', () => {
    expect(
      stage({ transformers: { markdown: { enabled: true } } }).hasWorkToDo([
        { path: 'src/index.js', content: 'x' },
      ]),
    ).toBe(true);
  });

  it('does not run for transformers a profile explicitly disabled', () => {
    expect(
      stage({ transformers: { markdown: { enabled: false } } }).hasWorkToDo([
        { path: 'src/index.js', content: 'x' },
      ]),
    ).toBe(false);
  });

  it('matches extensions case-insensitively', () => {
    expect(stage().hasWorkToDo([{ path: 'Report.DOCX', content: 'x' }])).toBe(true);
  });
});
