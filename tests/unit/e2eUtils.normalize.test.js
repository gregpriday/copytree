import { normalize } from '../e2e/_utils.js';

/**
 * The golden normalizer is test infrastructure, and it was silently wrong: the
 * tree sort ran from the first tree glyph to the last non-empty line, so in XML
 * output it swept up the closing tags and every `<ct:file>` element and
 * reordered them. The goldens it produced were not valid XML, which meant they
 * could not detect a structural regression — the one thing they exist for.
 */
describe('golden normalization of tree output', () => {
  const xmlWithTree = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ct:directory xmlns:ct="urn:copytree" path="/p">',
    '  <ct:metadata>',
    '    <ct:directoryStructure>├── src/',
    '│   └── test.js',
    '├── index.js',
    '└── README.md</ct:directoryStructure>',
    '  </ct:metadata>',
    '  <ct:files>',
    '    <ct:file path="@index.js"></ct:file>',
    '    <ct:file path="@README.md"></ct:file>',
    '  </ct:files>',
    '</ct:directory>',
  ].join('\n');

  it('sorts the tree entries', () => {
    const out = normalize(xmlWithTree, { sortTreeLines: true });
    const entries = out
      .split('\n')
      .filter((line) => /[├└│]/.test(line))
      // Same cleaning the normalizer sorts on: every leading tree character,
      // so a nested entry sorts by its own name rather than its indentation.
      .map((line) =>
        line
          .replace(/^.*?<ct:directoryStructure>/, '')
          .replace(/<\/ct:.*$/, '')
          .replace(/^[├└│─\s]+/, '')
          .trim(),
      );

    expect(entries).toEqual([...entries].sort((a, b) => a.localeCompare(b)));
  });

  it('leaves everything outside the tree block where it was', () => {
    const out = normalize(xmlWithTree, { sortTreeLines: true });
    const lines = out.split('\n');

    // Structure, in document order, is untouched.
    expect(lines[0]).toContain('<?xml');
    expect(lines[1]).toContain('<ct:directory ');
    expect(lines[lines.length - 1]).toBe('</ct:directory>');

    expect(out.indexOf('<ct:files>')).toBeLessThan(out.indexOf('</ct:files>'));
    expect(out.indexOf('<ct:metadata>')).toBeLessThan(out.indexOf('</ct:metadata>'));
    expect(out.indexOf('</ct:metadata>')).toBeLessThan(out.indexOf('<ct:files>'));
    expect(out.indexOf('@index.js')).toBeLessThan(out.indexOf('@README.md'));
  });

  it('keeps the opening and closing tags on the tree block boundaries', () => {
    const out = normalize(xmlWithTree, { sortTreeLines: true });

    // The tags belong to the container's line position, not to whichever entry
    // sorted into it.
    expect(out).toMatch(/<ct:directoryStructure>[├└│]/);
    expect(out).toMatch(/<\/ct:directoryStructure>$/m);
    expect(out.match(/<ct:directoryStructure>/g)).toHaveLength(1);
    expect(out.match(/<\/ct:directoryStructure>/g)).toHaveLength(1);
  });

  it('is a no-op on output with no tree at all', () => {
    const plain = '<ct:directory>\n  <ct:files />\n</ct:directory>';
    expect(normalize(plain, { sortTreeLines: true })).toBe(normalize(plain, {}));
  });
});
