import {
  extensionForFormat,
  normalizeFormat,
  referenceFilePath,
  resolveDestination,
} from '../../../src/utils/outputDestination.js';

describe('resolveDestination', () => {
  // Writing a file reference is the default. Copying the output text itself is
  // still available, but has to be asked for.
  test('defaults to a file reference', () => {
    expect(resolveDestination({})).toBe('reference');
  });

  test('copies text only when asked', () => {
    expect(resolveDestination({ clipboard: true })).toBe('clipboard');
  });

  test.each([
    [{ output: 'out.xml' }, 'file'],
    [{ display: true }, 'display'],
    [{ stream: true }, 'stream'],
  ])('%j resolves to %s', (options, expected) => {
    expect(resolveDestination(options)).toBe(expected);
  });

  test('an explicit destination wins over --clipboard', () => {
    // Both were passed, so the more specific one is what the caller meant.
    expect(resolveDestination({ output: 'out.xml', clipboard: true })).toBe('file');
    expect(resolveDestination({ display: true, clipboard: true })).toBe('display');
  });
});

describe('extensionForFormat', () => {
  // This mapping was written out twice as a nested ternary, and the two copies
  // had drifted: the Ink UI knew nothing about ndjson or sarif, so a reference
  // to NDJSON output was written to a file named `.xml`.
  test.each([
    ['xml', 'xml'],
    ['json', 'json'],
    ['markdown', 'md'],
    ['md', 'md'],
    ['tree', 'txt'],
    ['ndjson', 'ndjson'],
    ['sarif', 'sarif'],
  ])('%s maps to .%s', (format, expected) => {
    expect(extensionForFormat(format)).toBe(expected);
  });

  test('falls back to xml for an unknown or missing format', () => {
    expect(extensionForFormat(undefined)).toBe('xml');
    expect(extensionForFormat('nonsense')).toBe('xml');
  });

  test('resolves the md alias', () => {
    expect(normalizeFormat('MD')).toBe('markdown');
  });
});

describe('referenceFilePath', () => {
  test('names the file after the directory being copied', () => {
    // These accumulate in the system temp directory, and
    // `copytree-1738xxxxxxx.xml` says nothing about where it came from.
    expect(referenceFilePath('/repo/my-project', 'markdown')).toMatch(/my-project-\d+\.md$/);
  });

  test('sanitises characters that are awkward in a filename', () => {
    expect(referenceFilePath('/repo/My Project (v2)', 'xml')).toMatch(/my-project--v2--\d+\.xml$/);
  });

  test('falls back to a generic name when there is no base path', () => {
    expect(referenceFilePath(undefined, 'json')).toMatch(/copytree-\d+\.json$/);
  });
});
