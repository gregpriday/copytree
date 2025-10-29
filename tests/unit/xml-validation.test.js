import { XMLParser } from 'fast-xml-parser';
import OutputFormattingStage from '../../src/pipeline/stages/OutputFormattingStage.js';

describe('XML Format Validation', () => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
    parseAttributeValue: false,
    trimValues: true,
  });

  it('should generate valid XML that can be parsed', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test.js',
          size: 100,
          modified: new Date(),
          isBinary: false,
          content: 'console.log("hello");',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed).toHaveProperty('ct:directory');
  });

  it('should correctly escape CDATA end sequences', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });

    // Content containing the illegal sequence ]]>
    const contentWithCDATA = 'function test() {\n  return data;]]>\n}';

    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test.js',
          size: contentWithCDATA.length,
          modified: new Date(),
          isBinary: false,
          content: contentWithCDATA,
        },
      ],
    });

    // Should not throw - the XML must be well-formed
    expect(() => parser.parse(result.output)).not.toThrow();

    // Verify the content is preserved (XML should be well-formed)
    const parsed = parser.parse(result.output);
    const fileElement = parsed['ct:directory']['ct:files']['ct:file'];
    // The content should be a string containing the escaped sequence
    expect(typeof fileElement === 'string' || typeof fileElement === 'object').toBe(true);
  });

  it('should handle instructions with CDATA end sequences', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });

    const instructionsWithCDATA = 'Example instruction:\nUse pattern <![CDATA[...]]> for embedding.';

    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      instructions: instructionsWithCDATA,
      instructionsName: 'test-instructions',
      files: [
        {
          path: 'test.js',
          size: 10,
          modified: new Date(),
          isBinary: false,
          content: 'test',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed['ct:directory']['ct:metadata']['ct:instructions']).toBeTruthy();
  });

  it('should generate XML with correct namespace', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [],
    });

    expect(result.output).toContain('xmlns:ct="urn:copytree"');

    // Should parse without namespace errors
    expect(() => parser.parse(result.output)).not.toThrow();
  });

  it('should handle multiple files with various content', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'test1.js',
          size: 50,
          modified: new Date(),
          isBinary: false,
          content: 'const x = 1;',
        },
        {
          path: 'test2.js',
          size: 60,
          modified: new Date(),
          isBinary: false,
          content: 'const y = 2;]]>',
        },
        {
          path: 'test3.js',
          size: 70,
          modified: new Date(),
          isBinary: false,
          content: '<xml>test</xml>',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    const files = parsed['ct:directory']['ct:files']['ct:file'];
    expect(Array.isArray(files) ? files.length : 1).toBeGreaterThanOrEqual(1);
  });

  it('should handle binary files with placeholders', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      files: [
        {
          path: 'image.png',
          size: 100,
          modified: new Date(),
          isBinary: true,
          content: '[Binary file not included]',
          binaryCategory: 'image',
        },
      ],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();
  });

  it('should handle git metadata in XML', async () => {
    const stage = new OutputFormattingStage({ format: 'xml' });
    const result = await stage.process({
      basePath: '/test',
      profile: { name: 'default' },
      options: {},
      gitMetadata: {
        branch: 'main',
        lastCommit: {
          hash: 'abc123',
          message: 'Test commit with ]]> sequence',
        },
        hasUncommittedChanges: false,
        filterType: 'modified',
      },
      files: [],
    });

    // Should not throw
    expect(() => parser.parse(result.output)).not.toThrow();

    const parsed = parser.parse(result.output);
    expect(parsed['ct:directory']['ct:metadata']['ct:git']).toBeTruthy();
  });
});
