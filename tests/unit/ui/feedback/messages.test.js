import {
  PHASES,
  completionHeadline,
  exclusionLabel,
  formatCount,
  formatTokens,
  formatName,
  phaseLabel,
  plural,
  truncatePath,
} from '../../../../src/ui/feedback/messages.js';
import {
  detectCapabilities,
  glyph,
  supportsColor,
  supportsUnicode,
} from '../../../../src/ui/feedback/glyphs.js';

describe('phase labels', () => {
  it('names what is happening, not which class is doing it', () => {
    expect(phaseLabel(PHASES.DISCOVER)).toBe('Scanning project');
    expect(phaseLabel(PHASES.LOAD)).toBe('Reading files');
    expect(phaseLabel(PHASES.SECRETS)).toBe('Checking for secrets');
  });

  it('names the format it is formatting', () => {
    expect(phaseLabel(PHASES.FORMAT, { format: 'markdown' })).toBe('Formatting Markdown');
    expect(phaseLabel(PHASES.FORMAT, { format: 'xml' })).toBe('Formatting XML');
  });

  it('names the destination it is delivering to', () => {
    expect(phaseLabel(PHASES.DELIVER, { destination: 'reference' })).toBe('Copying file reference');
    expect(phaseLabel(PHASES.DELIVER, { destination: 'file' })).toBe('Saving output');
  });

  it('falls back rather than rendering an unknown phase id', () => {
    expect(phaseLabel('not-a-phase')).toBe('Preparing');
    expect(phaseLabel(PHASES.DELIVER, { destination: 'nonsense' })).toBe('Writing output');
  });
});

describe('formatting', () => {
  it('pluralizes on the count, not on the presence of one', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(0, 'file')).toBe('0 files');
    expect(plural(2, 'file')).toBe('2 files');
  });

  it('abbreviates large counts and keeps small ones exact', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(4102)).toBe('4,102');
    expect(formatCount(78000)).toBe('78k');
    expect(formatCount(2_500_000)).toBe('2.5M');
  });

  // The tilde is load-bearing: this is an estimate and must never read as an
  // exact figure.
  it('marks token counts as estimates', () => {
    expect(formatTokens(374)).toBe('~374 tokens');
    expect(formatTokens(78000)).toBe('~78k tokens');
    expect(formatTokens(1_500_000)).toBe('~1.5M tokens');
  });

  it('writes format names the way prose does', () => {
    expect(formatName('markdown')).toBe('Markdown');
    expect(formatName('ndjson')).toBe('NDJSON');
    expect(formatName('tree')).toBe('tree');
  });

  // The head says which project, the tail says which file; truncating from the
  // right throws away the half that identifies it.
  it('elides a long path from the middle', () => {
    const elided = truncatePath('/home/greg/projects/copytree/src/exports/context.xml', 24);

    expect(elided).toHaveLength(24);
    expect(elided).toContain('…');
    expect(elided.startsWith('/home/greg')).toBe(true);
    expect(elided.endsWith('.xml')).toBe(true);
  });

  it('leaves a path that already fits alone', () => {
    expect(truncatePath('src/index.js', 40)).toBe('src/index.js');
    expect(truncatePath('src/index.js', Infinity)).toBe('src/index.js');
  });
});

describe('exclusion labels', () => {
  it('translates stable reason keys into sentences', () => {
    expect(exclusionLabel('gitignore')).toBe('ignored by Git rules');
    expect(exclusionLabel('totalSizeBudget')).toBe('omitted by the total size budget');
  });

  it('passes an unknown key through rather than dropping it', () => {
    expect(exclusionLabel('somethingNew')).toBe('somethingNew');
  });
});

describe('completion headlines', () => {
  it('falls back to a generic result for an unknown destination', () => {
    expect(completionHeadline({ actual: 'carrier-pigeon' })).toBe('Copy complete');
  });

  it('uses the basename, not the full path, on success', () => {
    expect(completionHeadline({ actual: 'file', path: '/a/b/c/context.xml' })).toBe(
      'Saved context.xml',
    );
  });
});

describe('terminal capabilities', () => {
  const tty = { isTTY: true, columns: 100 };
  const pipe = { isTTY: false };

  it('uses Unicode on a UTF-8 terminal and ASCII on a pipe', () => {
    expect(supportsUnicode(tty, { LANG: 'en_US.UTF-8' })).toBe(true);
    expect(supportsUnicode(pipe, { LANG: 'en_US.UTF-8' })).toBe(false);
  });

  it('declines Unicode on a terminal with no capability negotiation', () => {
    expect(supportsUnicode(tty, { TERM: 'dumb', LANG: 'en_US.UTF-8' })).toBe(false);
    expect(supportsUnicode(tty, { LANG: 'C' })).toBe(false);
  });

  // NO_COLOR and FORCE_COLOR are conventions users already have set.
  it('honours the colour conventions, and the explicit mode above them', () => {
    expect(supportsColor(tty, 'auto', {})).toBe(true);
    expect(supportsColor(tty, 'auto', { NO_COLOR: '1' })).toBe(false);
    expect(supportsColor(pipe, 'auto', { FORCE_COLOR: '1' })).toBe(true);
    expect(supportsColor(tty, 'never', { FORCE_COLOR: '1' })).toBe(false);
    expect(supportsColor(pipe, 'always', { NO_COLOR: '1' })).toBe(true);
  });

  // A redirected stream has no columns to overflow, and eliding a message
  // about to be read by grep loses information for no gain.
  it('imposes no width limit on a redirected stream', () => {
    expect(detectCapabilities(pipe, { env: {} }).width).toBe(Infinity);
    expect(detectCapabilities(tty, { env: {} }).width).toBe(100);
  });

  it('falls back to ASCII glyphs without Unicode', () => {
    expect(glyph('success', { unicode: true })).toBe('✓');
    expect(glyph('success', { unicode: false })).toBe('[ok]');
    expect(glyph('not-a-glyph', { unicode: true })).toBe('•');
  });
});
