import {
  describeDestination,
  extensionForFormat,
  normalizeFormat,
  referenceFilePath,
  resolveDestination,
  validateDestinationOptions,
} from '../../../src/utils/outputDestination.js';
import { ERROR_CODES } from '../../../src/utils/errors.js';

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

describe('validateDestinationOptions', () => {
  test('accepts a single destination, or none at all', () => {
    expect(validateDestinationOptions({})).toBe(true);
    expect(validateDestinationOptions({ output: 'out.xml' })).toBe(true);
    expect(validateDestinationOptions({ display: true })).toBe(true);
    expect(validateDestinationOptions({ clipboard: true })).toBe(true);
  });

  // `--stream --output file` is not a contradiction: streaming is how the file
  // gets written, not a second place to put it.
  test('treats --stream as a delivery mode, not a competing destination', () => {
    expect(validateDestinationOptions({ stream: true, output: 'out.xml' })).toBe(true);
  });

  // Silent precedence quietly did one of the two things asked for and never
  // mentioned the other. Only the caller can say which one they meant.
  test('rejects two destinations, naming both', () => {
    expect(() => validateDestinationOptions({ display: true, clipboard: true })).toThrow(
      /--display and --clipboard/,
    );
  });

  test('raises a typed error a caller can switch on', () => {
    try {
      validateDestinationOptions({ output: 'a.xml', display: true });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.code).toBe(ERROR_CODES.INVALID_OPTION);
      expect(error.details.suggestion).toContain('Use only one of');
    }
  });
});

describe('describeDestination', () => {
  test('says which destinations put the payload on stdout', () => {
    expect(describeDestination('display').writesPayloadToStdout).toBe(true);
    expect(describeDestination('stream').writesPayloadToStdout).toBe(true);
    expect(describeDestination('reference').writesPayloadToStdout).toBe(false);
    expect(describeDestination('file').writesPayloadToStdout).toBe(false);
  });

  test('falls back to the default destination for an unknown value', () => {
    expect(describeDestination('nonsense').label).toBe('file reference');
  });
});
