import { XMLValidator, XMLParser } from 'fast-xml-parser';
import XMLFormatter from '../../../../src/pipeline/formatters/XMLFormatter.js';
import { formatStream } from '../../../../src/api/formatStream.js';

/**
 * Minimal `stage` shim matching what the formatters expect.
 * @returns {Object} Stage shim
 */
function stubStage() {
  return {
    config: { get: (_key, fallback) => fallback },
    calculateTotalSize: (files) => files.reduce((sum, f) => sum + (f?.size || 0), 0),
    generateDirectoryStructure: () => 'src/\n  a&b/',
    addLineNumbersToContent: (content) => content,
    buildTreeStructure: () => ({}),
    renderTree: () => {},
    formatBytes: (n) => `${n} B`,
  };
}

// Filenames are attacker-adjacent input: they come from the repository, not
// from CopyTree. Every one of these is legal on disk, and each one produces a
// document no strict parser will accept if attributes are interpolated raw.
const HOSTILE_FILES = [
  {
    path: 'src/a&b.js',
    absolutePath: '/repo/src/a&b.js',
    size: 4,
    content: 'let x;',
  },
  {
    path: 'src/quote".js',
    absolutePath: '/repo/src/quote".js',
    size: 4,
    content: 'let y;',
  },
  {
    path: 'src/<angle>.js',
    absolutePath: '/repo/src/<angle>.js',
    size: 4,
    content: 'let z;',
  },
  {
    path: "src/it's.js",
    absolutePath: "/repo/src/it's.js",
    size: 4,
    content: 'ok',
  },
  {
    path: 'src/emoji-😀.js',
    absolutePath: '/repo/src/emoji-😀.js',
    size: 4,
    content: 'nested ]]> sequence',
  },
];

const HOSTILE_INPUT = {
  basePath: '/repo/with & ampersand',
  files: HOSTILE_FILES,
  profile: { name: 'profile<with>markup' },
  gitMetadata: {
    branch: 'feature/a&b<c>',
    lastCommit: { hash: 'abc"123', message: 'fix: handle <tags> & "quotes"' },
    filterType: 'modified & staged',
  },
  options: {},
};

/**
 * Assert a document parses under a strict XML parser.
 * @param {string} xml - Document text
 * @returns {Object} Parsed document
 */
function parseStrict(xml) {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`Invalid XML: ${JSON.stringify(validation.err)}`);
  }
  return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
}

describe('XML escaping', () => {
  test('the buffered formatter emits a parseable document for hostile metadata', async () => {
    const formatter = new XMLFormatter({ stage: stubStage() });

    const xml = await formatter.format(HOSTILE_INPUT);

    expect(() => parseStrict(xml)).not.toThrow();
  });

  test('attribute values round-trip through a parser unchanged', async () => {
    const formatter = new XMLFormatter({ stage: stubStage() });

    const parsed = parseStrict(await formatter.format(HOSTILE_INPUT));
    const files = parsed['ct:directory']['ct:files']['ct:file'];
    const paths = files.map((entry) => entry['@path']);

    // The `@` prefix is CopyTree's own reference marker, not part of the path.
    expect(paths).toEqual(HOSTILE_FILES.map((f) => `@${f.path}`));
    expect(parsed['ct:directory']['@path']).toBe('/repo/with & ampersand');
  });

  test('text nodes survive markup characters', async () => {
    const formatter = new XMLFormatter({ stage: stubStage() });

    const parsed = parseStrict(await formatter.format(HOSTILE_INPUT));
    const metadata = parsed['ct:directory']['ct:metadata'];

    expect(metadata['ct:profile']).toBe('profile<with>markup');
    expect(metadata['ct:git']['ct:branch']).toBe('feature/a&b<c>');
  });

  test('the streaming formatter emits a parseable document for the same input', async () => {
    let xml = '';
    for await (const chunk of formatStream(HOSTILE_FILES, {
      format: 'xml',
      basePath: HOSTILE_INPUT.basePath,
    })) {
      xml += chunk;
    }

    expect(() => parseStrict(xml)).not.toThrow();
  });

  test('buffered and streaming agree on the file paths they emit', async () => {
    const formatter = new XMLFormatter({ stage: stubStage() });
    const buffered = parseStrict(
      await formatter.format({ ...HOSTILE_INPUT, profile: null, gitMetadata: null }),
    );

    let streamText = '';
    for await (const chunk of formatStream(HOSTILE_FILES, {
      format: 'xml',
      basePath: HOSTILE_INPUT.basePath,
    })) {
      streamText += chunk;
    }
    const streamed = parseStrict(streamText);

    const pathsOf = (doc) =>
      doc['ct:directory']['ct:files']['ct:file'].map((entry) => entry['@path']);

    expect(pathsOf(streamed)).toEqual(pathsOf(buffered));
  });

  test('a CDATA terminator inside content does not break the document', async () => {
    const formatter = new XMLFormatter({ stage: stubStage() });

    const xml = await formatter.format({
      basePath: '/repo',
      files: [
        {
          path: 'a.js',
          absolutePath: '/repo/a.js',
          size: 3,
          content: 'before ]]> after',
        },
      ],
      options: {},
    });

    expect(() => parseStrict(xml)).not.toThrow();
    expect(xml).toContain(']]]]><![CDATA[>');
  });
});
